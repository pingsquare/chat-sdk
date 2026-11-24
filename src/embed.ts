import { ChatClient } from './client'
import type { ChatUser } from './types'
import { mountWidget, type ChatWidget, type WidgetOptions } from './widget'

interface BootOptions extends WidgetOptions {
  chatUrl: string
  user?: ChatUser
}

type Command = ArrayLike<unknown>
type Listener = (payload: unknown) => void

interface QueuedApi {
  (...command: unknown[]): void
  q?: Command[]
}

declare global {
  interface Window {
    PingSquare?: QueuedApi
  }
}

let client: ChatClient | null = null
let widget: ChatWidget | null = null
let bootOptions: BootOptions | null = null
const listeners = new Map<string, Set<Listener>>()

function emit(event: string, payload: unknown): void {
  listeners.get(event)?.forEach((listener) => listener(payload))
}

function shutdown(): void {
  widget?.destroy()
  client?.shutdown()
  widget = null
  client = null
}

async function boot(options: BootOptions): Promise<void> {
  shutdown()
  bootOptions = options
  client = new ChatClient({ chatUrl: options.chatUrl, user: options.user })
  widget = mountWidget(client, options)
  widget.onUnread((count) => emit('unread', count))
  client.on('message', (message) => emit('message', message))
  try {
    await client.boot()
    emit('ready', client.session?.visitor)
  } catch (error) {
    emit('error', error)
  }
}

function run(name: string, args: unknown[]): void {
  switch (name) {
    case 'boot':
      void boot(args[0] as BootOptions)
      break
    case 'identify':
      if (client) void client.identify(args[0] as ChatUser | undefined).catch((error) => emit('error', error))
      else if (bootOptions) void boot({ ...bootOptions, user: args[0] as ChatUser })
      break
    case 'open':
      widget?.open()
      break
    case 'close':
      widget?.close()
      break
    case 'toggle':
      widget?.toggle()
      break
    case 'shutdown':
      shutdown()
      break
    case 'on': {
      const [event, listener] = args as [string, Listener]
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
      break
    }
    default:
      console.warn(`[PingSquare] Unknown command "${name}"`)
  }
}

function dispatch(command: Command): void {
  const [name, ...args] = Array.from(command)
  run(String(name), args)
}

const queued = window.PingSquare?.q ?? []
const api: QueuedApi = (...command: unknown[]) => dispatch(command)
window.PingSquare = api
Array.from(queued).forEach(dispatch)
