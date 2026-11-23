import { RealtimeConnection } from './realtime'
import type { ChatEvents, ChatMessage, ChatOptions, ChatSession, ChatSettings, ChatStatus, ChatUser } from './types'

type Listener<K extends keyof ChatEvents> = (payload: ChatEvents[K]) => void

export class ChatError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ChatError'
  }
}

/**
 * Headless chat client. It owns the session, the message list and the live
 * connection; render it with the bundled widget or your own UI.
 */
export class ChatClient {
  messages: ChatMessage[] = []
  session: ChatSession | null = null
  status: ChatStatus = 'idle'

  private readonly chatUrl: string
  private user: ChatUser | undefined
  private readonly storage: ChatOptions['storage']
  private readonly fetchImpl: typeof fetch
  private readonly WebSocketImpl: typeof WebSocket | undefined
  private realtime: RealtimeConnection | null = null
  private listeners = new Map<keyof ChatEvents, Set<(payload: never) => void>>()
  private connectedBefore = false

  constructor(options: ChatOptions) {
    this.chatUrl = options.chatUrl.replace(/\/+$/, '')
    this.user = options.user
    this.storage = options.storage === undefined ? defaultStorage() : options.storage
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.WebSocketImpl = options.WebSocket ?? globalThis.WebSocket
  }

  get settings(): ChatSettings | null {
    return this.session?.settings ?? null
  }

  on<K extends keyof ChatEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(listener as (payload: never) => void)
    return () => set.delete(listener as (payload: never) => void)
  }

  async boot(): Promise<ChatSession> {
    const body: Record<string, string> = {}
    const stored = this.read()
    if (stored) body.visitor_token = stored
    if (this.user) {
      body.user_id = this.user.id
      body.user_hash = this.user.hash
      if (this.user.name) body.name = this.user.name
      if (this.user.email) body.email = this.user.email
    }

    const session = await this.request<ChatSession>('POST', '/sessions', body, false)
    this.session = session
    this.write(session.visitor_token)
    await this.refresh()
    this.connect()
    return session
  }

  async identify(user: ChatUser | undefined): Promise<ChatSession> {
    this.disconnect()
    this.user = user
    this.messages = []
    this.emit('messages', this.messages)
    return this.boot()
  }

  async refresh(): Promise<ChatMessage[]> {
    const { messages } = await this.request<{ messages: ChatMessage[] }>('GET', '/messages')
    const pending = this.messages.filter((m) => m.pending || m.failed)
    this.messages = mergeMessages(messages, pending)
    this.emit('messages', this.messages)
    return this.messages
  }

  async send(body: string, pageUrl?: string): Promise<ChatMessage> {
    const text = body.trim()
    if (!text) throw new ChatError('A message cannot be empty', 422)

    const clientId = newClientId()
    const draft: ChatMessage = {
      id: clientId,
      direction: 'inbound',
      body: text,
      client_id: clientId,
      author: null,
      created_at: new Date().toISOString(),
      pending: true,
    }
    this.upsert(draft)

    return this.deliver(draft, pageUrl)
  }

  async retry(message: ChatMessage): Promise<ChatMessage> {
    this.upsert({ ...message, failed: false, pending: true })
    return this.deliver(message)
  }

  shutdown(): void {
    this.disconnect()
    this.storage?.removeItem(this.storageKey)
    this.session = null
    this.messages = []
    this.emit('messages', this.messages)
  }

  private async deliver(draft: ChatMessage, pageUrl?: string): Promise<ChatMessage> {
    try {
      const saved = await this.request<ChatMessage>('POST', '/messages', {
        body: draft.body,
        client_id: draft.client_id as string,
        ...(pageUrl ? { page_url: pageUrl } : {}),
      })
      this.upsert(saved)
      return saved
    } catch (error) {
      this.upsert({ ...draft, pending: false, failed: true })
      this.emit('error', error as Error)
      throw error
    }
  }

  private connect(): void {
    if (!this.session || !this.WebSocketImpl) return
    this.setStatus('connecting')
    this.realtime = new RealtimeConnection(
      this.session.realtime,
      {
        authorize: (socketId) => this.authorize(socketId),
        onEvent: (data) => this.upsert(data as ChatMessage, true),
        onStatus: (connected) => {
          this.setStatus(connected ? 'connected' : 'offline')
          if (connected && this.connectedBefore) void this.refresh().catch(() => undefined)
          if (connected) this.connectedBefore = true
        },
      },
      this.WebSocketImpl,
    )
    this.realtime.connect()
  }

  private disconnect(): void {
    this.realtime?.close()
    this.realtime = null
    this.connectedBefore = false
    this.setStatus('idle')
  }

  private async authorize(socketId: string): Promise<string> {
    const response = await this.fetchImpl(this.session!.realtime.auth_endpoint, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ socket_id: socketId, channel_name: this.session!.realtime.channel }),
    })
    if (!response.ok) throw new ChatError('Realtime authorization failed', response.status)
    const { auth } = (await response.json()) as { auth: string }
    return auth
  }

  private upsert(message: ChatMessage, fromServer = false): void {
    const index = this.messages.findIndex(
      (m) => m.id === message.id || (message.client_id !== null && m.client_id === message.client_id),
    )
    if (index === -1) {
      this.messages = [...this.messages, message]
    } else {
      this.messages = this.messages.map((m, i) => (i === index ? message : m))
    }
    this.emit('messages', this.messages)
    if (fromServer && index === -1) this.emit('message', message)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: object, auth = true): Promise<T> {
    const response = await this.fetchImpl(this.chatUrl + path, {
      method,
      headers: this.headers(auth),
      body: body ? JSON.stringify(body) : undefined,
    })
    const payload = (await response.json().catch(() => ({}))) as { data?: T; message?: string }
    if (!response.ok) {
      if (response.status === 401 && auth) this.storage?.removeItem(this.storageKey)
      throw new ChatError(payload.message ?? 'The chat request failed', response.status)
    }
    return payload.data as T
  }

  private headers(auth: boolean): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
    if (auth && this.session) headers.Authorization = `Bearer ${this.session.visitor_token}`
    return headers
  }

  private setStatus(status: ChatStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', status)
  }

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as Listener<K>)(payload))
  }

  private get storageKey(): string {
    return `pingsquare-chat:${this.chatUrl}`
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(this.storageKey) ?? null
    } catch {
      return null
    }
  }

  private write(token: string): void {
    try {
      this.storage?.setItem(this.storageKey, token)
    } catch {
      return
    }
  }
}

function mergeMessages(server: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const known = new Set(server.map((m) => m.client_id).filter(Boolean))
  return [...server, ...local.filter((m) => !known.has(m.client_id))]
}

function newClientId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? random.replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

function defaultStorage(): ChatOptions['storage'] {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
