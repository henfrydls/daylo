import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef } from 'react'
import { render, screen, act } from '@testing-library/react'
import { useViewCarousel } from './useViewCarousel'

/**
 * The gesture, in a layoutless browser.
 *
 * jsdom lays nothing out, so the width is stubbed and nothing here can say whether the
 * thing looks right; what it can say is which way each decision went. The branches below
 * are the ones that were wrong in the real browser and that no amount of reading caught:
 * landing twice, and listeners that were never attached.
 */

const WIDTH = 300
let reduce = false

function Harness({
  enabled = true,
  view = 'year' as 'year' | 'month',
  onChange,
}: {
  enabled?: boolean
  view?: 'year' | 'month'
  onChange: (view: 'year' | 'month') => void
}) {
  const headerRef = useRef<HTMLElement>(null)
  const { containerRef, railRef, otherRef, travelTo } = useViewCarousel({
    view,
    onChange,
    enabled,
    headerRef,
  })
  return (
    <div>
      <header ref={headerRef} />
      <div data-testid="container" ref={containerRef}>
        <div data-testid="rail" ref={railRef}>
          <div>the one in use</div>
          <div data-testid="other" ref={otherRef} style={{ visibility: 'hidden' }} aria-hidden>
            the one beside it
          </div>
        </div>
      </div>
      <button onClick={() => travelTo('month')}>travel</button>
    </div>
  )
}

const container = () => screen.getByTestId('container')
const rail = () => screen.getByTestId('rail')

/** A pointer event with the handful of fields the hook reads. */
function pointer(type: string, { x = 0, y = 0, t = 0, id = 1, kind = 'touch' } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: kind },
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: t },
  })
  return event
}

const send = (type: string, options?: Parameters<typeof pointer>[1]) =>
  act(() => {
    container().dispatchEvent(pointer(type, options))
  })

/**
 * Everything the finger does to cross the rail, in one go.
 *
 * `holdFor` is the pause before letting go. It matters: a short drag released straight
 * away is a flick and changes the view on speed alone, while the same distance held still
 * for longer than the speed window is somebody who thought better of it.
 */
function dragBy(dx: number, { steps = 5, ms = 16, holdFor = 0 } = {}) {
  send('pointerdown', { x: 0, t: 0 })
  for (let i = 1; i <= steps; i++) {
    send('pointermove', { x: (dx * i) / steps, t: ms * i })
  }
  send('pointerup', { x: dx, t: ms * steps + holdFor })
}

const finish = () =>
  act(() => {
    rail().dispatchEvent(new Event('transitionend', { bubbles: true }))
  })

beforeEach(() => {
  reduce = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.getBoundingClientRect = vi.fn(
    () => ({ width: WIDTH, height: 400, top: 0, left: 0, right: WIDTH, bottom: 400 }) as DOMRect
  )
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('crossing the rail', () => {
  it('changes the view once the drag is far enough', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.6)
    finish()

    expect(onChange).toHaveBeenCalledWith('month')
  })

  // Both of these fire: the transition ends, and the net that catches a transition which
  // never starts is still pending. Running the landing twice changed the view and changed
  // it straight back, which on screen is a gesture that looks ignored.
  it('lands once, however many times it is told it has arrived', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.6)
    finish()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    finish()

    expect(onChange).toHaveBeenCalledOnce()
  })

  // The net itself: a transition that never starts must not leave the rail stuck with the
  // other view showing.
  it('lands anyway when the transition never happens', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.6)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByTestId('other')).toHaveStyle({ visibility: 'hidden' })
  })

  it('goes back when the drag stops short and the finger is still', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.2, { holdFor: 200 })
    finish()

    expect(onChange).not.toHaveBeenCalled()
  })

  // The same short distance, let go while still moving, is a throw and does change it.
  it('changes it for a flick, short as it is', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.2)
    finish()

    expect(onChange).toHaveBeenCalledWith('month')
  })

  // The wall. It gives a little so it does not read as a broken screen, and it never
  // promises a view that is not there.
  it('does not change the view against the rail', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(WIDTH * 0.9)
    finish()

    expect(onChange).not.toHaveBeenCalled()
    // Back at rest, with nothing of the gesture left on the node.
    expect(rail().style.transform).toBe('')
  })
})

describe('what is not a gesture', () => {
  it('leaves a vertical drag to the page', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    send('pointerdown', { x: 0, y: 0, t: 0 })
    send('pointermove', { x: 2, y: 40, t: 16 })
    send('pointermove', { x: 2, y: 200, t: 32 })
    send('pointerup', { x: 2, y: 200, t: 48 })

    expect(container().setPointerCapture).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a mouse', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    send('pointerdown', { x: 0, t: 0, kind: 'mouse' })
    send('pointermove', { x: -200, t: 16, kind: 'mouse' })
    send('pointerup', { x: -200, t: 32, kind: 'mouse' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('gives up when the gesture is taken away', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    send('pointerdown', { x: 0, t: 0 })
    send('pointermove', { x: -200, t: 16 })
    send('pointercancel', { x: -200, t: 32 })
    finish()

    expect(onChange).not.toHaveBeenCalled()
  })

  // Something that scrolls sideways under the finger owns the gesture. Nothing in Daylo
  // does today; the rule is here for the day something does.
  it('leaves the gesture to anything that scrolls sideways', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const strip = screen.getByText('the one in use')
    strip.style.overflowX = 'auto'
    Object.defineProperty(strip, 'scrollWidth', { value: 900, configurable: true })
    Object.defineProperty(strip, 'clientWidth', { value: 300, configurable: true })

    act(() => {
      strip.dispatchEvent(pointer('pointerdown', { x: 0, t: 0 }))
    })
    send('pointermove', { x: -200, t: 16 })
    send('pointerup', { x: -200, t: 32 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing at all where it is switched off', () => {
    const onChange = vi.fn()
    render(<Harness enabled={false} onChange={onChange} />)

    dragBy(-WIDTH * 0.9)
    finish()

    expect(onChange).not.toHaveBeenCalled()
    expect(container().setPointerCapture).not.toHaveBeenCalled()
  })
})

describe('with motion turned down', () => {
  it('changes the view without anything following the finger', () => {
    reduce = true
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    dragBy(-WIDTH * 0.6)

    // No transition to wait for: it is already there.
    expect(onChange).toHaveBeenCalledWith('month')
    expect(rail().style.transform).toBe('')
  })
})

describe('the same journey without a finger', () => {
  it('travels when the toggle asks it to', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await act(async () => {
      screen.getByText('travel').click()
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onChange).toHaveBeenCalledWith('month')
  })

  it('does not travel to where it already is', () => {
    const onChange = vi.fn()
    render(<Harness view="month" onChange={onChange} />)

    act(() => {
      screen.getByText('travel').click()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})
