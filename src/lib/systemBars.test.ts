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
    root.style.removeProperty('--android-status-top')
    root.style.removeProperty('--android-navigation-bottom')
    delete (window as { DayloSystemBars?: unknown }).DayloSystemBars
  })

  it('does nothing where there is no bridge, which is everywhere but Android', () => {
    const stop = followSystemBars(window)

    expect(read('--android-status-top')).toBe('')
    expect(read('--android-navigation-bottom')).toBe('')
    stop()
  })

  it('writes the two sizes as CSS pixels', () => {
    ;(window as { DayloSystemBars?: unknown }).DayloSystemBars = {
      statusTop: () => 24,
      navigationBottom: () => 48,
    }

    const stop = followSystemBars(window)

    expect(read('--android-status-top')).toBe('24px')
    expect(read('--android-navigation-bottom')).toBe('48px')
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
