import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AXIS_AT,
  axisOf,
  confirms,
  FINISH_CURVE,
  finishIn,
  GO_BACK_IN,
  RETURN_CURVE,
  rubberBand,
  velocityOf,
} from '../lib/carousel'

/**
 * Year and Month on one rail, following the finger.
 *
 * Both views are mounted and side by side, Year first, in the order the toggle shows them.
 * Dragging moves the rail under the finger; letting go either finishes the journey or
 * takes it back, and the store is told once, at the end. Nothing here re-renders per
 * frame: a gesture is one transform written straight to the node, which is the only way
 * this stays smooth on the phones Daylo is for.
 *
 * The design and its numbers were approved on 2026-10-05 and the arithmetic lives in
 * `lib/carousel.ts`, where it can be read without the event handling around it.
 */

/** Which way the rail can still go from here. The other direction is a wall that gives. */
export type CarouselView = 'year' | 'month'

interface Options {
  view: CarouselView
  /** Told once, when the journey finishes. */
  onChange: (view: CarouselView) => void
  /** Off on desktop, where there is no finger and a window manager instead. */
  enabled: boolean
  /** Measured so the incoming view arrives under it rather than behind it. */
  headerRef: React.RefObject<HTMLElement | null>
}

interface Carousel {
  /**
   * Clips the rail and carries the pointer handlers. A callback and not a ref object,
   * because the calendar is not on the page for the first render: the app shows a
   * skeleton until the store has hydrated. An effect that read a ref would have found
   * nothing there and never looked again, which is exactly what happened the first time,
   * and what the gesture test in e2e caught.
   */
  containerRef: (node: HTMLDivElement | null) => void
  /** Moves. One transform per frame, nothing else. */
  railRef: React.RefObject<HTMLDivElement | null>
  /** The one that is not in flow, placed beside it. */
  otherRef: React.RefObject<HTMLDivElement | null>
  /** True from the moment the gesture is horizontal until the rail is at rest. */
  moving: boolean
  /** Walk the same rail without a finger: the toggle, and a tap on a month card. */
  travelTo: (view: CarouselView) => void
}

/** How long the toggle takes to walk the rail, with no finger involved. */
const TOGGLE_TAKES = 240

/** Where the other view sits: Month to the right of Year, Year to the left of Month. */
function otherSideOf(view: CarouselView): CarouselView {
  return view === 'year' ? 'month' : 'year'
}

/** The direction that has a view in it. The opposite is the wall. */
function towards(view: CarouselView): -1 | 1 {
  return view === 'year' ? -1 : 1
}

export function useViewCarousel({ view, onChange, enabled, headerRef }: Options): Carousel {
  // The node in a ref, because it gets written to; a flag in state, because the effect has
  // to run again when it appears. The calendar is not on the page for the first render:
  // the app shows a skeleton until the store has hydrated.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [attached, setAttached] = useState(false)
  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setAttached(node !== null)
  }, [])
  const railRef = useRef<HTMLDivElement>(null)
  const otherRef = useRef<HTMLDivElement>(null)
  const [moving, setMoving] = useState(false)

  const gesture = useRef<{
    id: number
    startX: number
    startY: number
    width: number
    axis: 'undecided' | 'horizontal' | 'vertical'
    samples: { x: number; t: number }[]
    moved: boolean
  } | null>(null)

  /** The callback as it is now, so the listeners below never hold yesterday's. */
  const announce = useRef(onChange)
  useEffect(() => {
    announce.current = onChange
  })

  /**
   * Which view the rail is on, kept here rather than read from the store.
   *
   * The store's answer arrives a render later, and a second gesture can start before that
   * render has happened: React batches an update made from a listener like these into a
   * task of its own, and the next pointer event does not wait for it. A gesture that read
   * the stale view sent the rail the wrong way and put the panel on the wrong side, which
   * is half of what Henfry saw. `arrive` moves this the instant the journey is over, and
   * `told` keeps the render that follows from putting the old answer back: between saying
   * the journey is over and the store agreeing, every render still carries the old view.
   *
   * The view does change from elsewhere too, from the toggle where there is no finger and
   * from the store being reset, so the prop still wins whenever we are not waiting.
   */
  const viewNow = useRef(view)
  const told = useRef(false)
  useEffect(() => {
    if (view === viewNow.current) told.current = false
    else if (!told.current) viewNow.current = view
  })

  /** The landing in flight, so that a finger coming down can end it rather than race it. */
  const landing = useRef<(() => void) | null>(null)

  /** Set when a gesture travelled far enough to be a gesture, read by the click it ends. */
  const swallow = useRef(false)

  const reduced = useRef(false)
  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  /** Put the other view beside this one and make it visible, for the length of a gesture. */
  const reveal = useCallback(() => {
    const other = otherRef.current
    const container = containerRef.current
    if (!other || !container) return

    // Its title has to arrive under the header, not behind it, and the container has to be
    // tall enough to hold it or it would be clipped at the bottom.
    const header = headerRef.current?.getBoundingClientRect().height ?? 0
    const top = Math.max(
      0,
      window.scrollY + header - (container.getBoundingClientRect().top + window.scrollY)
    )
    other.style.top = `${top}px`
    other.style.visibility = 'visible'
    other.removeAttribute('inert')
    other.removeAttribute('aria-hidden')
    container.style.minHeight = `${top + other.getBoundingClientRect().height}px`
  }, [headerRef])

  const hide = useCallback(() => {
    const other = otherRef.current
    if (other) {
      other.style.visibility = 'hidden'
      other.setAttribute('inert', '')
      other.setAttribute('aria-hidden', 'true')
    }
    if (containerRef.current) containerRef.current.style.minHeight = ''
  }, [])

  const moveTo = useCallback((x: number, ms: number | null, curve = RETURN_CURVE) => {
    const rail = railRef.current
    if (!rail) return
    rail.style.transition = ms === null ? 'none' : `transform ${ms}ms ${curve}`
    rail.style.transform = `translate3d(${x}px, 0, 0)`
  }, [])

  /** The end of every journey, however it was made. */
  const arrive = useCallback(
    (changed: boolean) => {
      const rail = railRef.current
      if (rail) {
        rail.style.transition = 'none'
        rail.style.transform = ''
        rail.style.willChange = ''
      }
      if (changed) {
        // The new view keeps the place the old one had on screen instead of jumping to
        // wherever its own scroll position was.
        const header = headerRef.current?.getBoundingClientRect().height ?? 0
        const container = containerRef.current
        const top = container ? container.getBoundingClientRect().top + window.scrollY : 0
        window.scrollTo(0, Math.min(window.scrollY, Math.max(0, top - header)))
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        const next = otherSideOf(viewNow.current)
        viewNow.current = next
        told.current = true
        announce.current(next)
      }
      hide()
      setMoving(false)
    },
    [headerRef, hide]
  )

  /** Finish, or go back, and then land. */
  const settle = useCallback(
    (to: number, ms: number, changed: boolean, curve = RETURN_CURVE) => {
      const rail = railRef.current
      if (!rail || reduced.current) {
        landing.current = null
        arrive(changed)
        return
      }
      // Once, whichever gets there first. Both of these do fire: the transition ends, and
      // the net below is still pending. Letting it run twice called the change twice and
      // the view went to Month and straight back to Year, which looked exactly like a
      // gesture that had not been noticed. It is what the gesture test caught.
      let landed = false
      let net = 0
      const done = () => {
        if (landed) return
        landed = true
        landing.current = null
        window.clearTimeout(net)
        rail.removeEventListener('transitionend', done)
        arrive(changed)
      }
      landing.current = done
      rail.addEventListener('transitionend', done)
      moveTo(to, ms, curve)
      // A transition that never starts, because the distance was zero or the view was
      // hidden mid-gesture, would otherwise leave the rail stuck with the other one
      // showing.
      net = window.setTimeout(done, ms + 80)
    },
    [arrive, moveTo]
  )

  const travelTo = useCallback(
    (to: CarouselView) => {
      if (!enabled || to === viewNow.current) return
      const container = containerRef.current
      const rail = railRef.current
      if (!container || !rail) {
        announce.current(to)
        return
      }
      setMoving(true)
      reveal()
      moveTo(0, null)
      // Two frames, so the browser has the rail at rest before it is asked to move.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // Still 240: a tap is not a drag, and nobody has held this one in a hand since
          // the other two moved. It is now quicker than a confirmed drag, which is the
          // opposite of how the design had it, and that is a thing to feel rather than to
          // argue about.
          settle(
            towards(viewNow.current) * container.getBoundingClientRect().width,
            TOGGLE_TAKES,
            true
          )
        })
      )
    },
    [enabled, moveTo, reveal, settle]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!enabled || !attached || !container) return

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || gesture.current !== null) return
      // Whatever was still landing is over now. Letting it finish on its own meant it
      // arrived in the middle of this gesture: it changed the view under a finger that was
      // already dragging the old one, and it hid the panel beside it, which is the white
      // gap where the other view should have been. Ending it here costs the few pixels it
      // had left to travel and leaves everything after this reading one answer.
      landing.current?.()
      // Something that scrolls sideways under the finger owns this gesture. There is
      // nothing like that in Daylo today; the rule is here for the day there is.
      let node = event.target as HTMLElement | null
      while (node && node !== container) {
        const style = window.getComputedStyle(node)
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth
        ) {
          return
        }
        node = node.parentElement
      }

      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: container.getBoundingClientRect().width,
        axis: 'undecided',
        samples: [{ x: event.clientX, t: event.timeStamp }],
        moved: false,
      }
    }

    const move = (event: PointerEvent) => {
      const g = gesture.current
      if (!g || event.pointerId !== g.id) return

      const dx = event.clientX - g.startX
      const dy = event.clientY - g.startY
      g.samples.push({ x: event.clientX, t: event.timeStamp })
      if (g.samples.length > 12) g.samples.shift()

      if (g.axis === 'undecided') {
        g.axis = axisOf(dx, dy)
        if (g.axis === 'vertical') {
          // The browser is already scrolling. Let it.
          gesture.current = null
          return
        }
        if (g.axis === 'undecided') return

        container.setPointerCapture(event.pointerId)
        setMoving(true)
        reveal()
        if (railRef.current) railRef.current.style.willChange = 'transform'
      }

      g.moved = true
      if (reduced.current) return

      // Towards the other view it follows exactly; against it, the wall gives a little.
      const open = Math.sign(dx) === towards(viewNow.current)
      moveTo(open ? dx : rubberBand(dx, g.width), null)
    }

    const up = (event: PointerEvent) => {
      const g = gesture.current
      if (!g || event.pointerId !== g.id) return
      gesture.current = null
      if (g.axis !== 'horizontal') return

      const dx = event.clientX - g.startX
      // Anything that travelled is a gesture, not a tap, whichever way it ends.
      if (Math.abs(dx) > AXIS_AT) swallow.current = true
      const velocity = velocityOf(g.samples, event.timeStamp)
      const open = Math.sign(dx) === towards(viewNow.current)
      const changing = open && confirms({ dx, width: g.width, velocity })

      if (changing) {
        const to = towards(viewNow.current) * g.width
        settle(to, finishIn(to - dx, velocity), true, FINISH_CURVE)
      } else {
        settle(0, GO_BACK_IN, false)
      }
    }

    const cancel = (event: PointerEvent) => {
      const g = gesture.current
      if (!g || event.pointerId !== g.id) return
      gesture.current = null
      if (g.axis === 'horizontal') settle(0, GO_BACK_IN, false)
    }

    // A tap that ends a drag is not a tap. Without this, letting go over a month card
    // opens that month on top of the view that just arrived.
    const click = (event: MouseEvent) => {
      if (!swallow.current) return
      swallow.current = false
      event.stopPropagation()
      event.preventDefault()
    }

    container.addEventListener('pointerdown', down)
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerup', up)
    container.addEventListener('pointercancel', cancel)
    container.addEventListener('click', click, true)
    return () => {
      container.removeEventListener('pointerdown', down)
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerup', up)
      container.removeEventListener('pointercancel', cancel)
      container.removeEventListener('click', click, true)
    }
  }, [attached, enabled, moveTo, reveal, settle])

  return { containerRef: setContainer, railRef, otherRef, moving, travelTo }
}
