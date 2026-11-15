// Reload Daylo's page and list every command it sends to the native side while it starts.
// Usage: node cdp-record-commands.mjs <port> <seconds>
// Needs Node 22 or later for the global WebSocket. Prints a JSON array of command names, in
// the order they were sent; an entry starting with ! says the recording did not take.
//
// Why: the Google Play build must never look for an update (#200), and the look starts in
// the page, as the `latest_version` command, before Rust fetches anything. With the radio
// off nothing reaches the network card whatever the app does, so the packet capture alone
// cannot tell an app that did not ask from one that asked and failed. This list can.
//
// How: on Android, Tauri hands every command to `window.ipc.postMessage`, the object wry
// adds to the page, as a JSON string that starts with the command's name. A script set to
// run before anything else on the next document puts a wrapper in its place, and the page
// is reloaded so the app starts again with the wrapper there. The session stays open for
// the whole wait, because a script added that way is dropped when the session closes.
const [port, seconds] = process.argv.slice(2)
if (!port || !seconds) {
  console.error('usage: node cdp-record-commands.mjs <port> <seconds>')
  process.exit(2)
}

const hook = `(() => {
  const sent = []
  Object.defineProperty(window, '__dayloCommands', { value: sent })
  const real = window.ipc
  if (!real) { sent.push('!no window.ipc when the document started'); return }
  const wrapper = {
    postMessage(message) {
      const name = /"cmd":"([^"]*)"/.exec(String(message))
      sent.push(name ? name[1] : '?')
      return real.postMessage(message)
    },
  }
  try { window.ipc = wrapper } catch (e) {}
  if (window.ipc !== wrapper) {
    try {
      Object.defineProperty(window, 'ipc', { value: wrapper, configurable: true, writable: true })
    } catch (e) {}
  }
  if (window.ipc !== wrapper) sent.push('!window.ipc could not be wrapped')
})()`

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page') ?? targets[0]
if (!page?.webSocketDebuggerUrl) {
  console.error('no inspectable page:', JSON.stringify(targets))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
const timer = setTimeout(
  () => {
    console.error('no answer in time')
    process.exit(1)
  },
  (Number(seconds) + 30) * 1000
)
let next = 0
const waiting = new Map()
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next
    waiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  const pending = waiting.get(msg.id)
  if (!pending) return
  waiting.delete(msg.id)
  if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)))
  else pending.resolve(msg.result)
}
ws.onerror = (e) => {
  console.error('WebSocket error:', e.message ?? e)
  process.exit(1)
}
ws.onopen = async () => {
  try {
    await send('Page.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: hook })
    await send('Page.reload', { ignoreCache: true })
    await new Promise((resolve) => setTimeout(resolve, Number(seconds) * 1000))
    const answer = await send('Runtime.evaluate', {
      expression: "Array.from(window.__dayloCommands || ['!the recording is not on the page'])",
      returnByValue: true,
    })
    clearTimeout(timer)
    console.log(JSON.stringify(answer?.result?.value ?? null))
    ws.close()
    process.exit(0)
  } catch (error) {
    console.error(String(error))
    process.exit(1)
  }
}
