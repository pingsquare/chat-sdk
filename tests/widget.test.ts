import { afterEach, describe, expect, it } from 'vitest'
import { ChatClient, mountWidget } from '../src'
import { agentReply, chatUrl, established, fakeFetch, FakeSocket, flush, lastSocket, subscribed } from './helpers'

async function setup() {
  const client = new ChatClient({ chatUrl, storage: null, fetch: fakeFetch().impl, WebSocket: FakeSocket as unknown as typeof WebSocket })
  const widget = mountWidget(client)
  await client.boot()
  const socket = lastSocket()
  socket.receive(established)
  await flush()
  await flush()
  socket.receive(subscribed)
  const root = document.querySelector('[data-pingsquare-chat]')!.shadowRoot!
  return { client, widget, socket, root }
}

afterEach(() => {
  FakeSocket.instances = []
  document.body.replaceChildren()
})

describe('mountWidget', () => {
  it('opens a panel named after the chat with its greeting', async () => {
    const { widget, root } = await setup()
    const panel = root.querySelector('.panel') as HTMLElement
    expect(panel.hidden).toBe(true)

    widget.open()

    expect(panel.hidden).toBe(false)
    expect(root.querySelector('.header h2')!.textContent).toBe('Website chat')
    expect(root.querySelector('.list')!.textContent).toContain('Hi, how can we help?')
    expect(root.querySelector('.launcher')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('counts replies that arrive while closed and clears them on open', async () => {
    const { widget, socket, root } = await setup()
    const counts: number[] = []
    widget.onUnread((count) => counts.push(count))

    socket.receive(agentReply)

    expect(widget.unread).toBe(1)
    expect((root.querySelector('.badge') as HTMLElement).textContent).toBe('1')
    widget.open()
    expect(widget.unread).toBe(0)
    expect(counts).toEqual([1, 0])
    expect(root.querySelector('.list')!.textContent).toContain('Yes, in 3 to 5 days.')
  })

  it('sends with Enter and keeps Shift+Enter for new lines', async () => {
    const { widget, client, root } = await setup()
    widget.open()
    const input = root.querySelector('textarea')!

    input.value = 'Line one'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
    expect(client.messages).toHaveLength(0)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flush()

    expect(input.value).toBe('')
    expect(client.messages[0]!.body).toBe('Line one')
  })
})
