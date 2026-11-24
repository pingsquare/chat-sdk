import { afterEach, describe, expect, it } from 'vitest'
import { ChatClient, type ChatMessage } from '../src'
import { agentReply, chatUrl, established, fakeFetch, FakeSocket, flush, lastSocket, session, subscribed } from './helpers'

function client(fetch = fakeFetch(), options: Partial<ConstructorParameters<typeof ChatClient>[0]> = {}) {
  const instance = new ChatClient({
    chatUrl,
    storage: null,
    fetch: fetch.impl,
    WebSocket: FakeSocket as unknown as typeof WebSocket,
    ...options,
  })
  return { instance, fetch }
}

async function connected(instance: ChatClient) {
  await instance.boot()
  const socket = lastSocket()
  socket.receive(established)
  await flush()
  await flush()
  socket.receive(subscribed)
  return socket
}

afterEach(() => {
  FakeSocket.instances = []
})

describe('ChatClient', () => {
  it('starts a session, loads history and subscribes to the visitor channel', async () => {
    const { instance, fetch } = client()
    const statuses: string[] = []
    instance.on('status', (status) => statuses.push(status))

    const socket = await connected(instance)

    expect(fetch.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /sessions', 'GET /messages', 'POST /realtime/auth'])
    expect(fetch.calls[1]!.headers.Authorization).toBe(`Bearer ${session.visitor_token}`)
    expect(socket.url).toBe('ws://localhost:18401/app/localchatkey?protocol=7&client=pingsquare-chat&version=0.1.0&flash=false')
    expect(fetch.calls[2]!.body).toEqual({ socket_id: JSON.parse(established.data).socket_id, channel_name: session.realtime.channel })
    expect(socket.sent[0]).toEqual({
      event: 'pusher:subscribe',
      data: { channel: session.realtime.channel, auth: expect.stringMatching(/^localchatkey:[0-9a-f]{64}$/) },
    })
    expect(statuses).toEqual(['connecting', 'connected'])
    expect(instance.settings?.greeting).toBe('Hi, how can we help?')
  })

  it('emits agent replies that arrive over the socket', async () => {
    const { instance } = client()
    const received: ChatMessage[] = []
    instance.on('message', (message) => received.push(message))
    const socket = await connected(instance)

    socket.receive(agentReply)

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ direction: 'outbound', body: 'Yes, in 3 to 5 days.', author: { name: 'Maya' } })
    expect(instance.messages.map((m) => m.body)).toEqual(['Yes, in 3 to 5 days.'])
  })

  it('answers server pings', async () => {
    const { instance } = client()
    const socket = await connected(instance)

    socket.receive({ event: 'pusher:ping', data: {} })

    expect(socket.sent[socket.sent.length - 1]).toEqual({ event: 'pusher:pong', data: {} })
  })

  it('shows a sent message at once and replaces it with the saved one', async () => {
    const { instance, fetch } = client()
    await instance.boot()
    const snapshots: ChatMessage[][] = []
    instance.on('messages', (messages) => snapshots.push(messages))

    const saved = await instance.send('  Do you ship to Lagos?  ')

    expect(snapshots[0]![0]).toMatchObject({ body: 'Do you ship to Lagos?', pending: true })
    const posted = fetch.calls.find((c) => c.method === 'POST' && c.path === '/messages')!
    expect(posted.body).toEqual({ body: 'Do you ship to Lagos?', client_id: snapshots[0]![0]!.client_id })
    expect(saved.id).toBe(1)
    expect(instance.messages).toHaveLength(1)
    expect(instance.messages[0]!.pending).toBeUndefined()
  })

  it('marks a message that fails to send and sends it again on retry', async () => {
    let fail = true
    const fetch = fakeFetch({
      'POST /messages': () =>
        fail
          ? new Response(JSON.stringify({ success: false, message: 'Too Many Attempts.' }), { status: 429 })
          : new Response(JSON.stringify({ data: { id: 9, direction: 'inbound', body: 'Hello', client_id: failedId, author: null, created_at: '2026-11-23T03:02:36.000000Z' } }), { status: 201 }),
    })
    let failedId = ''
    const { instance } = client(fetch)
    await instance.boot()

    await expect(instance.send('Hello')).rejects.toMatchObject({ status: 429, message: 'Too Many Attempts.' })
    const failed = instance.messages[0]!
    failedId = failed.client_id!
    expect(failed.failed).toBe(true)

    fail = false
    await instance.retry(failed)

    expect(instance.messages).toHaveLength(1)
    expect(instance.messages[0]).toMatchObject({ id: 9, client_id: failedId })
  })

  it('sends the signed user when identified', async () => {
    const { instance, fetch } = client(undefined, { user: { id: 'user-42', hash: 'abc', name: 'Ada', email: 'ada@example.com' } })

    await instance.boot()

    expect(fetch.calls[0]!.body).toEqual({ user_id: 'user-42', user_hash: 'abc', name: 'Ada', email: 'ada@example.com' })
  })

  it('resumes the stored visitor and forgets it on shutdown', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const first = client(undefined, { storage })
    await first.instance.boot()
    first.instance.shutdown()
    expect(store.size).toBe(0)

    store.set(`pingsquare-chat:${chatUrl}`, session.visitor_token)
    const second = client(undefined, { storage })
    await second.instance.boot()
    expect(second.fetch.calls[0]!.body).toEqual({ visitor_token: session.visitor_token })
  })
})
