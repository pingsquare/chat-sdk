# PingSquare chat

Add PingSquare chat to a website or app. Visitors chat from a small window on your site, and your team answers from the PingSquare inbox.

- **Embed script**: one snippet, no build step, about 5 KB gzipped.
- **npm package** (`@pingsquare/chat`): the same widget for bundled apps, plus a headless client for your own chat UI.

## Before you start

In PingSquare, create a chat (an ingestion workflow with the source type `web_chat`). You get two values:

- **Chat URL**, for example `https://api.pingsquare.app/api/chat/website-chat-x1y2z3`. It is public and goes in your page.
- **Identity secret**, shown once when the chat is created. It stays on your server and signs your signed-in users.

You can also set allowed domains, a greeting, a colour and the side of the screen. With an empty domain list, any website can load the chat.

## Embed script

Paste this before `</body>`:

```html
<script>
  window.PingSquare = window.PingSquare || function () { (PingSquare.q = PingSquare.q || []).push(arguments) }
  PingSquare('boot', { chatUrl: 'https://api.pingsquare.app/api/chat/your-chat-slug' })
</script>
<script async src="https://cdn.jsdelivr.net/npm/@pingsquare/chat@0.1.0/dist/embed.js"></script>
```

Commands can run before the script loads; they are queued.

| Command | What it does |
| --- | --- |
| `PingSquare('boot', options)` | Starts the chat. Options: `chatUrl`, `user`, `color`, `position` (`left` or `right`), `title`, `greeting`, `launcher` (`false` hides the button so you can open the chat from your own) |
| `PingSquare('identify', user)` | Switches to a signed-in user, or back to an anonymous visitor with `undefined` |
| `PingSquare('open')`, `('close')`, `('toggle')` | Shows or hides the chat window |
| `PingSquare('shutdown')` | Removes the widget and forgets the visitor. Call it when a user signs out |
| `PingSquare('on', event, listener)` | Events: `ready`, `message` (a reply arrived), `unread` (count), `error` |

### Single-page apps

Boot once when the app starts. The widget lives outside your app's DOM, so route changes don't affect it. On sign-in call `identify`, and on sign-out call `shutdown`, then `boot` again.

### Content Security Policy

If your site sends a CSP header, allow:

```
script-src  https://cdn.jsdelivr.net
connect-src https://api.pingsquare.app wss://<realtime host>
```

The realtime host is `realtime.host` in the chat's session response.

## Signed-in users

Anonymous visitors only ever see the chat they started in that browser. To show the same conversation to a signed-in user on every device, sign their user id on your server with HMAC-SHA256 and your identity secret, then pass it to `boot`:

```js
PingSquare('boot', {
  chatUrl: 'https://api.pingsquare.app/api/chat/your-chat-slug',
  user: { id: 'user-42', hash: '<signed on your server>', name: 'Ada Obi', email: 'ada@example.com' },
})
```

Never put the secret in browser code. A wrong hash is refused.

**Node**

```js
import { createHmac } from 'node:crypto'

const hash = createHmac('sha256', process.env.PINGSQUARE_CHAT_SECRET).update(user.id).digest('hex')
```

**PHP / Laravel**

```php
$hash = hash_hmac('sha256', (string) $user->id, config('services.pingsquare.chat_secret'));
```

**Python**

```python
import hashlib, hmac, os

hash = hmac.new(os.environ["PINGSQUARE_CHAT_SECRET"].encode(), str(user.id).encode(), hashlib.sha256).hexdigest()
```

## npm package

```sh
npm install @pingsquare/chat
```

```ts
import { ChatClient, mountWidget } from '@pingsquare/chat'

const client = new ChatClient({ chatUrl: 'https://api.pingsquare.app/api/chat/your-chat-slug' })
const widget = mountWidget(client, { position: 'right' })
await client.boot()
```

### React

```tsx
import { useEffect } from 'react'
import { ChatClient, mountWidget } from '@pingsquare/chat'

export function SupportChat({ user }: { user?: { id: string; hash: string } }) {
  useEffect(() => {
    const client = new ChatClient({ chatUrl: import.meta.env.VITE_PINGSQUARE_CHAT_URL, user })
    const widget = mountWidget(client)
    client.boot()
    return () => {
      widget.destroy()
      client.shutdown()
    }
  }, [user?.id])

  return null
}
```

### Vue

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { ChatClient, mountWidget, type ChatWidget } from '@pingsquare/chat'

const client = new ChatClient({ chatUrl: import.meta.env.VITE_PINGSQUARE_CHAT_URL })
let widget: ChatWidget | undefined

onMounted(() => {
  widget = mountWidget(client)
  client.boot()
})
onBeforeUnmount(() => {
  widget?.destroy()
  client.shutdown()
})
</script>
```

In Nuxt, wrap the component in `<ClientOnly>`.

## Headless

Use `ChatClient` without `mountWidget` to draw your own chat window:

```ts
const client = new ChatClient({ chatUrl })
client.on('messages', (messages) => render(messages))
client.on('status', (status) => showConnection(status))
await client.boot()
await client.send('Where is my order?')
```

`messages` holds the whole thread, including messages still sending (`pending`) or failed (`failed`, retry with `client.retry(message)`). Agent replies arrive live over a WebSocket and reconnect on their own.

### HTTP API

The client uses these endpoints, so you can call them from any language. Send `Authorization: Bearer <visitor_token>` on every call except the first.

| Method and path | Purpose |
| --- | --- |
| `POST {chatUrl}/sessions` | Start or resume a visitor. Body: `visitor_token`, or `user_id` and `user_hash`, plus `name` and `email` |
| `GET {chatUrl}/messages` | The visitor's current thread, oldest first |
| `POST {chatUrl}/messages` | Send `body` with a `client_id` you generate. Repeating a `client_id` does not send it twice |
| `POST {chatUrl}/realtime/auth` | Authorize the visitor's realtime channel (Pusher protocol) |

Replies come as the `message` event on the private channel named in the session's `realtime.channel`. Any Pusher protocol client works, `pusher-js` included.

## Mobile apps

Load a page with the embed script in a WebView, and pass the signed user to `boot` from your app. Native iOS and Android SDKs come later.

## Development

```sh
npm install
npm run check
```

`check` runs the type checker, the tests, the build and the size limit.
