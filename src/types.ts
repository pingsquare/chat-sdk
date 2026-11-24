export interface ChatUser {
  id: string
  hash: string
  name?: string
  email?: string
}

export interface ChatOptions {
  chatUrl: string
  user?: ChatUser
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  fetch?: typeof fetch
  WebSocket?: typeof WebSocket
}

export interface ChatMessage {
  id: number | string
  direction: 'inbound' | 'outbound'
  body: string
  client_id: string | null
  author: { name: string | null } | null
  created_at: string
  pending?: boolean
  failed?: boolean
}

export interface RealtimeConfig {
  key: string | null
  host: string | null
  port: number
  scheme: string | null
  channel: string
  event: string
  auth_endpoint: string
}

export interface ChatSettings {
  name: string
  greeting: string | null
  color: string | null
  position: 'left' | 'right'
}

export interface ChatSession {
  visitor_token: string
  visitor: { id: string; name: string | null; email: string | null; identified: boolean }
  realtime: RealtimeConfig
  settings: ChatSettings
}

export type ChatStatus = 'idle' | 'connecting' | 'connected' | 'offline'

export interface ChatEvents {
  message: ChatMessage
  messages: ChatMessage[]
  status: ChatStatus
  error: Error
}
