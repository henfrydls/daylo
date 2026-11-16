import { describe, it, expect, afterEach } from 'vitest'
import { followSystemBars } from './systemBars'

/**
 * #198. On Android 15 the bars lie over the page, and an older WebView says nothing about
 * them through env(). MainActivity hands their sizes over as DayloSystemBars, and this puts
 * them where the CSS can read them.
 */
describe('following the system bars', () => {
  const root = document.documentElement
  const read = (name: string) => root.style.getPropertyValue(name)

  afterEach(() => {
    for (const side of ['status-top', 'navigation-bottom', 'navigation-left', 'navigation-right']) {
      root.style.removeProperty(`--android-${side}`)
    }
    delete (window as { DayloSystemBars?: unknown }).DayloSystemBars
  })

  it('does nothing where there is no bridge, which is everywhere but Android', () => {
    const stop = followSystemBars(window)

    expect(read('--android-status-top')).toBe('')
    expect(read('--android-navigation-bottom')).toBe('')
    stop()
  })

  it('writes the four sizes as CSS pixels', () => {
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => 24,
      navigationBottom: () => 0,
      navigationLeft: () => 0,
      navigationRight: () => 48,
    }

    const stop = followSystemBars(window)

    expect(read('--android-status-top')).toBe('24px')
    expect(read('--android-navigation-bottom')).toBe('0px')
    expect(read('--android-navigation-left')).toBe('0px')
    // Landscape with three buttons: the bar is on a side.
    expect(read('--android-navigation-right')).toBe('48px')
    stop()
  })

  // An APK built before left and right existed in the bridge is not something the page
  // meets, but the page must not break on a bridge that lacks them.
  it('writes 0px for a side the bridge does not know', () => {
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => 24,
      navigationBottom: () => 48,
    }

    const stop = followSystemBars(window)

    expect(read('--android-navigation-left')).toBe('0px')
    expect(read('--android-navigation-right')).toBe('0px')
    stop()
  })

  it('reads them again when Android says they changed', () => {
    let bottom = 48
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => 24,
      navigationBottom: () => bottom,
    }
    const stop = followSystemBars(window)

    bottom = 16
    window.dispatchEvent(new Event('daylo-insets'))

    expect(read('--android-navigation-bottom')).toBe('16px')
    stop()
  })

  // The keyboard resizes the page on every frame it moves. Each read is a synchronous call
  // across the bridge, so a resize reads nothing: only MainActivity's announcement does.
  it('does not read the bridge on resize', () => {
    let reads = 0
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => {
        reads++
        return 24
      },
      navigationBottom: () => 48,
    }
    const stop = followSystemBars(window)
    reads = 0

    window.dispatchEvent(new Event('resize'))

    expect(reads).toBe(0)
    stop()
  })

  it('does not write a value that did not change', () => {
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => 24,
      navigationBottom: () => 48,
    }
    const stop = followSystemBars(window)
    const writes: string[] = []
    const original = root.style.setProperty.bind(root.style)
    root.style.setProperty = (name: string, value: string | null) => {
      writes.push(name)
      original(name, value)
    }
    try {
      window.dispatchEvent(new Event('daylo-insets'))
    } finally {
      root.style.setProperty = original
    }

    expect(writes).toEqual([])
    stop()
  })

  // A bridge that answers with something that is not a size must not leave a broken value
  // in a calc(): the whole declaration would be dropped and the padding with it.
  it('writes 0px for an answer that is not a size', () => {
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => Number.NaN,
      navigationBottom: () => {
        throw new Error('gone')
      },
    }

    const stop = followSystemBars(window)

    expect(read('--android-status-top')).toBe('0px')
    expect(read('--android-navigation-bottom')).toBe('0px')
    stop()
  })
})
