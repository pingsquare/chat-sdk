import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatUrl, fakeFetch, FakeSocket, flush } from './helpers'

afterEach(() => {
  FakeSocket.instances = []
  document.body.replaceChildren()
  delete window.PingSquare
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('embed snippet', () => {
  it('runs commands queued before the script loaded', async () => {
    vi.stubGlobal('fetch', fakeFetch().impl)
    vi.stubGlobal('WebSocket', FakeSocket)
    new Function("window.PingSquare = window.PingSquare || function () { (PingSquare.q = PingSquare.q || []).push(arguments) }")()

    const ready = vi.fn()
    window.PingSquare!('on', 'ready', ready)
    window.PingSquare!('boot', { chatUrl })

    await import('../src/embed')
    await flush()
    await flush()

    expect(document.querySelector('[data-pingsquare-chat]')).not.toBeNull()
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ identified: false }))

    window.PingSquare!('shutdown')
    expect(document.querySelector('[data-pingsquare-chat]')).toBeNull()
  })
})
