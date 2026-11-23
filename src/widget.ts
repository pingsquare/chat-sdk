import type { ChatClient } from './client'
import type { ChatMessage } from './types'

export interface WidgetOptions {
  container?: HTMLElement
  color?: string
  position?: 'left' | 'right'
  title?: string
  greeting?: string
  launcher?: boolean
}

export interface ChatWidget {
  open(): void
  close(): void
  toggle(): void
  destroy(): void
  readonly unread: number
  onUnread(listener: (count: number) => void): () => void
}

const DEFAULT_COLOR = 'oklch(0.392 0.136 272)'

const ICON_CHAT =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h1v2l2.5-2H19V6H5Z"/></svg>'
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z"/></svg>'
const ICON_SEND =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 20.5v-17L22 12 3 20.5Zm2-3.1L16.8 12 5 6.6v4l6 1.4-6 1.4v4Z"/></svg>'

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { --ps-color: ${DEFAULT_COLOR}; --ps-on-color: #fff; --ps-bg: #fff; --ps-text: #1b1f2a; --ps-muted: #5b6275; --ps-border: #dfe2ea; --ps-soft: #f3f4f8;
  font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ps-text);
  position: fixed; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; gap: 12px; }
@media (prefers-color-scheme: dark) { .root { --ps-bg: #161922; --ps-text: #e8eaf0; --ps-muted: #a2a8b8; --ps-border: #2c3140; --ps-soft: #1f2330; } }
.root.right { right: 20px; align-items: flex-end; }
.root.left { left: 20px; align-items: flex-start; }
.launcher { width: 56px; height: 56px; border: 0; background: var(--ps-color); color: var(--ps-on-color); cursor: pointer; display: grid; place-items: center; position: relative; box-shadow: 0 6px 20px rgb(0 0 0 / .18); }
.launcher:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid var(--ps-color); outline-offset: 2px; }
.badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; background: #d92d20; color: #fff; font-size: 12px; font-weight: 600; display: grid; place-items: center; }
.panel { width: 370px; height: min(600px, calc(100vh - 110px)); background: var(--ps-bg); border: 1px solid var(--ps-border); box-shadow: 0 12px 40px rgb(0 0 0 / .2); display: flex; flex-direction: column; overflow: hidden; }
.panel[hidden], .badge[hidden], .launcher[hidden] { display: none; }
.header { background: var(--ps-color); color: var(--ps-on-color); padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.header h2 { margin: 0; font-size: 16px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header .status { font-size: 12px; opacity: .85; }
.header button { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 4px; display: grid; place-items: center; }
.list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: var(--ps-soft); }
.bubble { max-width: 80%; padding: 9px 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.inbound { align-self: flex-end; background: var(--ps-color); color: var(--ps-on-color); }
.outbound { align-self: flex-start; background: var(--ps-bg); border: 1px solid var(--ps-border); }
.author { display: block; font-size: 12px; color: var(--ps-muted); margin-bottom: 2px; }
.meta { align-self: flex-end; font-size: 12px; color: var(--ps-muted); }
.meta button { background: none; border: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
.empty { color: var(--ps-muted); text-align: center; margin: auto 0; }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--ps-border); background: var(--ps-bg); }
.composer textarea { flex: 1; resize: none; border: 1px solid var(--ps-border); background: var(--ps-bg); color: var(--ps-text); font: inherit; padding: 9px 10px; min-height: 40px; max-height: 120px; }
.composer button { width: 44px; border: 0; background: var(--ps-color); color: var(--ps-on-color); cursor: pointer; display: grid; place-items: center; }
.composer button:disabled { opacity: .5; cursor: default; }
@media (max-width: 480px) {
  .root.open { inset: 0; bottom: 0; }
  .root.open .panel { width: 100vw; height: 100dvh; border: 0; }
  .root.open .launcher { display: none; }
}
`

export function mountWidget(client: ChatClient, options: WidgetOptions = {}): ChatWidget {
  const host = document.createElement('div')
  host.setAttribute('data-pingsquare-chat', '')
  ;(options.container ?? document.body).appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = STYLES
  shadow.appendChild(style)

  const root = el('div', 'root')
  const panel = el('section', 'panel')
  panel.hidden = true
  panel.setAttribute('role', 'dialog')

  const header = el('header', 'header')
  const title = el('h2')
  const status = el('span', 'status')
  const closeButton = el('button')
  closeButton.innerHTML = ICON_CLOSE
  closeButton.setAttribute('aria-label', 'Close chat')
  header.append(title, status, closeButton)

  const list = el('div', 'list')
  list.setAttribute('aria-live', 'polite')

  const form = el('form', 'composer')
  const input = el('textarea')
  input.rows = 1
  input.placeholder = 'Write a message'
  input.setAttribute('aria-label', 'Message')
  const sendButton = el('button')
  sendButton.type = 'submit'
  sendButton.innerHTML = ICON_SEND
  sendButton.setAttribute('aria-label', 'Send message')
  form.append(input, sendButton)

  panel.append(header, list, form)

  const launcher = el('button', 'launcher')
  launcher.innerHTML = ICON_CHAT
  launcher.setAttribute('aria-label', 'Open chat')
  launcher.setAttribute('aria-expanded', 'false')
  launcher.hidden = options.launcher === false
  const badge = el('span', 'badge')
  badge.hidden = true
  launcher.appendChild(badge)

  root.append(panel, launcher)
  shadow.appendChild(root)

  let isOpen = false
  let unread = 0
  const unreadListeners = new Set<(count: number) => void>()

  const applySettings = () => {
    const settings = client.settings
    const color = options.color ?? settings?.color ?? null
    if (color) root.style.setProperty('--ps-color', color)
    root.classList.remove('left', 'right')
    root.classList.add(options.position ?? settings?.position ?? 'right')
    title.textContent = options.title ?? settings?.name ?? 'Chat'
    panel.setAttribute('aria-label', title.textContent)
  }

  const setUnread = (count: number) => {
    unread = count
    badge.hidden = count === 0
    badge.textContent = count > 9 ? '9+' : String(count)
    unreadListeners.forEach((listener) => listener(count))
  }

  const render = (messages: ChatMessage[]) => {
    list.replaceChildren()
    const greeting = options.greeting ?? client.settings?.greeting
    if (greeting) list.appendChild(bubble({ direction: 'outbound', body: greeting, author: null }))
    if (!greeting && messages.length === 0) {
      const empty = el('p', 'empty')
      empty.textContent = 'Send us a message and we will reply here.'
      list.appendChild(empty)
    }
    for (const message of messages) {
      list.appendChild(bubble(message))
      if (message.pending || message.failed) list.appendChild(meta(message))
    }
    list.scrollTop = list.scrollHeight
  }

  const meta = (message: ChatMessage) => {
    const line = el('div', 'meta')
    if (message.failed) {
      line.append('Not sent. ')
      const retry = el('button')
      retry.type = 'button'
      retry.textContent = 'Try again'
      retry.addEventListener('click', () => void client.retry(message).catch(() => undefined))
      line.appendChild(retry)
    } else {
      line.textContent = 'Sending'
    }
    return line
  }

  const open = () => {
    isOpen = true
    panel.hidden = false
    root.classList.add('open')
    launcher.setAttribute('aria-expanded', 'true')
    setUnread(0)
    input.focus()
  }
  const close = () => {
    isOpen = false
    panel.hidden = true
    root.classList.remove('open')
    launcher.setAttribute('aria-expanded', 'false')
    launcher.focus()
  }
  const toggle = () => (isOpen ? close() : open())

  const submit = () => {
    const text = input.value
    if (!text.trim()) return
    input.value = ''
    void client.send(text, location.href).catch(() => undefined)
  }

  launcher.addEventListener('click', toggle)
  closeButton.addEventListener('click', close)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    submit()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  const offs = [
    client.on('messages', (messages) => {
      applySettings()
      render(messages)
    }),
    client.on('message', (message) => {
      if (!isOpen && message.direction === 'outbound') setUnread(unread + 1)
    }),
    client.on('status', (value) => {
      status.textContent = value === 'offline' ? 'Reconnecting' : ''
    }),
  ]

  applySettings()
  render(client.messages)

  return {
    open,
    close,
    toggle,
    get unread() {
      return unread
    },
    onUnread(listener) {
      unreadListeners.add(listener)
      return () => unreadListeners.delete(listener)
    },
    destroy() {
      offs.forEach((off) => off())
      host.remove()
    },
  }
}

function bubble(message: Pick<ChatMessage, 'direction' | 'body' | 'author'>): HTMLElement {
  const node = el('div', `bubble ${message.direction}`)
  if (message.direction === 'outbound' && message.author?.name) {
    const author = el('span', 'author')
    author.textContent = message.author.name
    node.appendChild(author)
  }
  node.append(message.body)
  return node
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}
