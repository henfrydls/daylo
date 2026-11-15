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
// Where it records, read in tauri 2.10.2 and wry 0.54.1 (the versions in Cargo.lock):
// every command, from @tauri-apps/api and from the plugins alike, goes through
// `window.__TAURI_INTERNALS__.invoke`, defined by tauri's scripts/core.js. What invoke does
// next depends on the platform (window.ipc.postMessage on Android, a fetch to the ipc
// protocol on the desktop and for channel data), so invoke is the one place everything
// passes. It cannot be wrapped once it is there: core.js defines it with
// Object.defineProperty, neither writable nor configurable. But the first of tauri's own
// scripts (src/manager/webview.rs) only creates `window.__TAURI_INTERNALS__` when it is not
// there yet. So a script run before tauri's puts its own object there, a proxy that wraps
// `invoke` at the moment core.js defines it, and tauri builds on that object.
//
// The first version of this wrapped window.ipc, the object wry adds to the page, and it
// recorded nothing in either run of 43726315398: on API 34 the object was not on the page
// yet when the script ran, and on API 30 it was wrapped and then, as far as can be told,
// put back by the WebView after the script ran, so the wrapper was gone without a word.
// Which is why the recording is checked when it is read, not only when it is installed: if
// `invoke` on the page at the end is not the recorder's, the list says so with an entry
// starting with !, whatever was recorded.
//
// How: the script is added with Page.addScriptToEvaluateOnNewDocument and the page is
// reloaded, so the app starts again with it there. The DevTools session stays open for
// the whole wait, because a script added that way is dropped when the session closes.
const [port, seconds] = process.argv.slice(2)
if (!port || !seconds) {
  console.error('usage: node cdp-record-commands.mjs <port> <seconds>')
  process.exit(2)
}

const hook = `(() => {
  const sent = []
  Object.defineProperty(window, '__dayloRecorder', { value: { sent } })
  if (window.__TAURI_INTERNALS__) {
    sent.push('!__TAURI_INTERNALS__ was on the page before the recorder')
    return
  }
  const internals = new Proxy({ plugins: {} }, {
    defineProperty(target, key, descriptor) {
      if (key === 'invoke' && typeof descriptor.value === 'function') {
        const real = descriptor.value
        const recorder = function (cmd, ...rest) {
          sent.push(String(cmd))
          return real.call(this, cmd, ...rest)
        }
        Object.defineProperty(recorder, 'dayloRecords', { value: true })
        // Configurable on the target, though core.js asks for the default, which is not:
        // a proxy may only hand back a value other than the one asked for on a property
        // the target can still change, or the defineProperty invariant throws.
        descriptor = { value: recorder, writable: false, enumerable: false, configurable: true }
      }
      return Reflect.defineProperty(target, key, descriptor)
    },
  })
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: internals, configurable: true })
})()`

// Read after the wait: what was recorded, and whether the recorder was still the invoke
// the page was using.
const reading = `(() => {
  const recorder = window.__dayloRecorder
  if (!recorder) return ['!the recorder never ran on this page']
  const out = Array.from(recorder.sent)
  const invoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke
  if (typeof invoke !== 'function') out.push('!there is no invoke on the page')
  else if (invoke.dayloRecords !== true) out.push('!invoke on the page is not the recorder')
  return out
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
      expression: reading,
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
