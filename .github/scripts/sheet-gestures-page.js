// Installed in Daylo's WebView by android-measure-sheet-gestures.sh, over the DevTools
// protocol, once the page has its seeded state. One expression, evaluated as it is.
//
// It only listens. Every listener is passive and on window, in the bubbling phase, so it
// hears each touch after the sheet's own listeners have had it: `defaultPrevented` is then
// what the sheet decided, and nothing here can change what the browser does with it.
//
// window.__gesture holds, for the gesture in progress:
//   reset()     forget the last gesture and start recording the next
//   state()     where the sheet and its list are now
//   summary()   what the touches recorded since reset() add up to
//   log         every event recorded since reset(), for the artifact
//   ensureOpen()  the Activities sheet open, every activity shown, the list at the top
;(() => {
  const SHEET = '[data-testid="bottom-sheet"]'
  const LIST = '[data-testid="bottom-sheet-list"]'
  const q = (selector) => document.querySelector(selector)
  const round = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n)
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /** The sheet's own offset, from its inline transform; null when it is not there. */
  const translateY = () => {
    const sheet = q(SHEET)
    if (!sheet) return null
    const match = /translateY\((-?[\d.]+)px\)/.exec(sheet.style.transform)
    return match ? Number(match[1]) : 0
  }

  const g = { log: [], maxTranslateY: 0 }

  const record = (e) => {
    const point = e.changedTouches ? e.changedTouches[0] : e
    const tagged = e.target && e.target.closest ? e.target.closest('[data-testid]') : null
    g.log.push({
      type: e.type,
      t: Math.round(performance.now()),
      x: round(point ? point.clientX : null),
      y: round(point ? point.clientY : null),
      touches: e.touches ? e.touches.length : undefined,
      cancelable: e.cancelable,
      prevented: e.defaultPrevented,
      target: tagged ? tagged.dataset.testid : e.target && e.target.tagName,
    })
  }
  for (const type of [
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
    'pointerdown',
    'pointerup',
    'pointercancel',
    'contextmenu',
  ]) {
    window.addEventListener(type, record, { passive: true })
  }

  // The furthest down the sheet has been drawn since reset(), read every frame. A sheet
  // that moved and came back reads 0 before and after; this is what says it moved.
  const sample = () => {
    const y = translateY()
    if (y !== null && y > g.maxTranslateY) g.maxTranslateY = y
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)

  const state = () => {
    const sheet = q(SHEET)
    const list = q(LIST)
    const box = sheet ? sheet.getBoundingClientRect() : null
    const listBox = list ? list.getBoundingClientRect() : null
    const items = Array.from(document.querySelectorAll(`${SHEET} [data-testid="activity-item"]`))
    return {
      open: !!sheet,
      translateY: translateY(),
      maxTranslateY: round(g.maxTranslateY),
      sheetTop: round(box && box.top),
      sheetHeight: round(box && box.height),
      listTop: round(listBox && listBox.top),
      listHeight: round(listBox && listBox.height),
      scrollTop: list ? round(list.scrollTop) : null,
      scrollHeight: list ? list.scrollHeight : null,
      clientHeight: list ? list.clientHeight : null,
      activities: items.length,
      rows: items.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: round(r.top), height: round(r.height) }
      }),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      selectedText: String(window.getSelection ? window.getSelection() : ''),
    }
  }

  const summary = () => {
    const of = (type) => g.log.filter((e) => e.type === type)
    const start = of('touchstart')[0]
    const moves = of('touchmove')
    const first = moves[0]
    const down = of('pointerdown')[0]
    return {
      touchstart: of('touchstart').length,
      touchmove: moves.length,
      cancelable: moves.filter((e) => e.cancelable).length,
      prevented: moves.filter((e) => e.prevented).length,
      firstMoveDx: start && first ? round(first.x - start.x) : null,
      firstMoveDy: start && first ? round(first.y - start.y) : null,
      touchend: of('touchend').length,
      touchcancel: of('touchcancel').length,
      pointercancel: of('pointercancel').length,
      pressedOn: down ? down.target : null,
      contextmenu: of('contextmenu').length,
    }
  }

  const reset = () => {
    g.log = []
    g.maxTranslateY = translateY() || 0
    return true
  }

  const ensureOpen = async () => {
    if (!q(SHEET)) {
      const fab = q('[data-testid="fab-button"]')
      if (fab) fab.click()
      await wait(1000)
    }
    const more = q(`${SHEET} [data-testid="show-more-button"]`)
    if (more && /^Show all/.test(more.textContent.trim())) {
      more.click()
      await wait(800)
    }
    const list = q(LIST)
    if (list) list.scrollTop = 0
    await wait(400)
    reset()
    return state()
  }

  window.__gesture = {
    reset,
    state,
    summary,
    ensureOpen,
    get log() {
      return g.log
    },
  }
  return true
})()
