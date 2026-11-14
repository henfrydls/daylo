// Evaluate an expression in Daylo's WebView, which a debug build exposes over the Chrome
// DevTools protocol. Usage: node cdp-eval.mjs <port> '<expression>'
// Needs Node 22 or later for the global WebSocket. Prints the value returned, as JSON.
const [port, expression] = process.argv.slice(2)
if (!port || !expression) {
  console.error('usage: node cdp-eval.mjs <port> <expression>')
  process.exit(2)
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page') ?? targets[0]
if (!page?.webSocketDebuggerUrl) {
  console.error('no inspectable page:', JSON.stringify(targets))
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
const timer = setTimeout(() => {
  console.error('no answer in 15 s')
  process.exit(1)
}, 15000)
ws.onopen = () =>
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    })
  )
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== 1) return
  clearTimeout(timer)
  if (msg.result?.exceptionDetails) {
    console.error('exception:', JSON.stringify(msg.result.exceptionDetails))
    process.exit(1)
  }
  console.log(JSON.stringify(msg.result?.result?.value ?? null))
  ws.close()
  process.exit(0)
}
ws.onerror = (e) => {
  console.error('WebSocket error:', e.message ?? e)
  process.exit(1)
}
