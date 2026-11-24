import type { RealtimeConfig } from './types'

interface Frame {
  event: string
  channel?: string
  data?: unknown
}

export interface RealtimeHandlers {
  authorize(socketId: string): Promise<string>
  onEvent(data: unknown): void
  onStatus(connected: boolean): void
}

/**
 * A minimal Pusher protocol client, which is what Reverb speaks. It holds one
 * private channel and reconnects with backoff until closed.
 */
export class RealtimeConnection {
  private socket: WebSocket | null = null
  private closed = false
  private attempts = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly config: RealtimeConfig,
    private readonly handlers: RealtimeHandlers,
    private readonly WebSocketImpl: typeof WebSocket,
  ) {}

  get url(): string {
    const secure = this.config.scheme === 'https'
    const port = this.config.port || (secure ? 443 : 80)
    return `${secure ? 'wss' : 'ws'}://${this.config.host}:${port}/app/${this.config.key}?protocol=7&client=pingsquare-chat&version=0.1.0&flash=false`
  }

  connect(): void {
    if (!this.config.key || !this.config.host) return
    this.closed = false
    const socket = new this.WebSocketImpl(this.url)
    this.socket = socket
    socket.onmessage = (event) => this.receive(String(event.data))
    socket.onclose = () => this.dropped()
    socket.onerror = () => socket.close()
  }

  close(): void {
    this.closed = true
    this.stopPing()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.socket?.close()
    this.socket = null
  }

  private async receive(raw: string): Promise<void> {
    let frame: Frame
    try {
      frame = JSON.parse(raw) as Frame
    } catch {
      return
    }
    const data = typeof frame.data === 'string' ? safeParse(frame.data) : frame.data

    if (frame.event === 'pusher:connection_established') {
      const { socket_id, activity_timeout } = data as { socket_id: string; activity_timeout?: number }
      this.startPing((activity_timeout ?? 30) * 1000)
      try {
        const auth = await this.handlers.authorize(socket_id)
        this.send({ event: 'pusher:subscribe', data: { channel: this.config.channel, auth } })
      } catch {
        this.socket?.close()
      }
      return
    }
    if (frame.event === 'pusher_internal:subscription_succeeded' && frame.channel === this.config.channel) {
      this.attempts = 0
      this.handlers.onStatus(true)
      return
    }
    if (frame.event === 'pusher:ping') {
      this.send({ event: 'pusher:pong', data: {} })
      return
    }
    if (frame.event === this.config.event && frame.channel === this.config.channel) {
      this.handlers.onEvent(data)
    }
  }

  private send(frame: Frame): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(frame))
  }

  private startPing(interval: number): void {
    this.stopPing()
    this.pingTimer = setInterval(() => this.send({ event: 'pusher:ping', data: {} }), interval)
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private dropped(): void {
    this.stopPing()
    this.handlers.onStatus(false)
    if (this.closed) return
    const delay = Math.min(30000, 1000 * 2 ** this.attempts)
    this.attempts += 1
    this.retryTimer = setTimeout(() => this.connect(), delay)
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
