import api from './fixtures/chat-api.json'
import frames from './fixtures/reverb-frames.json'

export const session = api['POST /sessions'].body.data
export const sentMessage = api['POST /messages'].body.data
type Frame = { event: string; data: string; channel?: string }
export const [established, subscribed, agentReply] = frames as [Frame, Frame, Frame]
export const chatUrl = session.realtime.auth_endpoint.replace(/\/realtime\/auth$/, '')

export interface Call {
  method: string
  path: string
  body: Record<string, string> | null
  headers: Record<string, string>
}

export function fakeFetch(overrides: Record<string, () => Response> = {}) {
  const calls: Call[] = []
  const impl = async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace(chatUrl, '')
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : null
    calls.push({ method, path, body, headers: (init?.headers ?? {}) as Record<string, string> })
    const key = `${method} ${path}`
    if (overrides[key]) return overrides[key]()
    const fixture = (api as Record<string, { status: number; body: unknown }>)[key]
    if (!fixture) return new Response('{}', { status: 404 })
    let payload = fixture.body as { data?: Record<string, unknown> }
    if (key === 'POST /messages' && body) payload = { ...payload, data: { ...payload.data, body: body.body, client_id: body.client_id } }
    return new Response(JSON.stringify(payload), { status: fixture.status })
  }
  return { impl: impl as typeof fetch, calls }
}

export class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 1
  sent: Array<{ event: string; data: Record<string, unknown> }> = []
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw))
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  receive(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

export const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1]!

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
