/**
 * The arithmetic of dragging one view onto another, with no DOM in it.
 *
 * Here rather than inside the gesture so that the decisions can be read and tested: what
 * counts as horizontal, when a drag has gone far enough, how far the end of the rail gives
 * before it stops, and how long the finish should take. Every number comes from the design
 * approved on 2026-10-05 and each one is a judgement somebody can argue with, which is a
 * reason to keep them where they can be seen rather than spread through an event handler.
 */

/** Where the finger has to go before anybody decides what the gesture is. */
export const AXIS_AT = 8

/** The fraction of the width that confirms on its own, with no speed at all. */
export const CONFIRM_AT = 0.4

/** A flick: fast enough, and far enough that it was not a tap that slipped. */
export const FLICK_SPEED = 0.4
export const FLICK_AT = 24

/** How far the end of the rail gives. It approaches this and never arrives. */
export const MOST_IT_GIVES = 40

/** How freely it gives at the start, before the rubber starts pulling back. */
export const GIVES_AT_FIRST = 0.5

export type Axis = 'horizontal' | 'vertical' | 'undecided'

/**
 * Which way this is going, once it has gone far enough to tell.
 *
 * Undecided until `AXIS_AT`, because the first two or three pixels of any gesture are
 * noise: deciding there means a scroll that starts with a wobble becomes a page change.
 */
export function axisOf(dx: number, dy: number): Axis {
  if (Math.abs(dx) < AXIS_AT && Math.abs(dy) < AXIS_AT) return 'undecided'
  return Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal'
}

/**
 * How far the rail actually moves when there is nothing on the other side.
 *
 * A wall that does not move at all reads as a broken screen; one that moves freely
 * promises a view that is not there. What it must never do is stop while the finger is
 * still going, and that is what the shape before this one did: it took the give of the
 * whole width and then cut it off at a flat maximum, so from about 85 px of finger
 * onwards the screen was simply still. Henfry read that as a jump, which is exactly what
 * it is: a wall somebody is still pushing.
 *
 * So the maximum is where it tends rather than where it stops. It gives `GIVES_AT_FIRST`
 * of the first pixels and less of every pixel after, approaching `MOST_IT_GIVES` and never
 * reaching it, which is the whole of what rubber is.
 */
export function rubberBand(dx: number, width: number): number {
  if (width <= 0) return 0
  const pull = GIVES_AT_FIRST * Math.abs(dx)
  return Math.sign(dx) * ((MOST_IT_GIVES * pull) / (MOST_IT_GIVES + pull))
}

/**
 * Whether letting go here changes the view.
 *
 * Two ways to say yes: far enough that the next view is most of the screen, or fast enough
 * that the finger was clearly throwing it. The second needs a distance as well, so that a
 * quick tap with a pixel of travel is never a page change.
 */
export function confirms({
  dx,
  width,
  velocity,
}: {
  dx: number
  width: number
  velocity: number
}): boolean {
  if (width <= 0) return false
  if (Math.abs(dx) >= CONFIRM_AT * width) return true
  return (
    Math.abs(velocity) >= FLICK_SPEED &&
    Math.abs(dx) >= FLICK_AT &&
    Math.sign(velocity) === Math.sign(dx)
  )
}

/**
 * The speed of the last moment of the gesture, in pixels per millisecond.
 *
 * Over a window rather than over the whole drag, because what matters is what the hand was
 * doing when it let go. A finger that has been still for longer than the window is not
 * moving at all, which is what makes a slow drag let go at 35% come back.
 */
export function velocityOf(samples: { x: number; t: number }[], now: number, window = 100): number {
  const recent = samples.filter((s) => now - s.t <= window)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return (last.x - first.x) / dt
}

/**
 * How long the rail takes, and the two numbers that bound it.
 *
 * 140 and 260 in the first build, then 280 and 400, and 320 and 450 after the second time
 * Henfry held it. Arriving is not the same as being put down. These are the sort of number
 * only a hand can choose, which is why they move after a phone and not after an argument.
 */
export const FINISH_AT_LEAST = 320
export const FINISH_AT_MOST = 450

/**
 * How much of the landing is spent leaving, as the first handle of its curve.
 *
 * Fixed, so that the only thing that moves with the finger is the handle's height, and so
 * that a finger which had stopped gets exactly the curve the design asked for on
 * 2026-10-05: `cubic-bezier(0.4, 0, 0.2, 1)`.
 */
export const FINISH_HOLDS_BACK = 0.4

/** Where the curve is going: all the way there, braking into it. */
const FINISH_EASES_INTO = '0.2, 1'

/**
 * The curve the landing follows, drawn to leave at the speed the finger let go at.
 *
 * The emphasized curve this replaced left at speed and braked hard, which is right for
 * something appearing and wrong for something being put down: it read as the view being
 * thrown out of the way. The gentle one that replaced it leaves at a slope of **zero**,
 * which is worse in the other direction, and measurable: on the 1.4.7 lab build the finger
 * crossed at 34 to 80 video pixels a frame and the first frame after letting go moved 4.
 * The view stopped dead and set off again. "Al soltar rápido se nota que de inmediato se
 * pone más lento."
 *
 * So the curve leaves at whatever speed the hand had. For a cubic-bezier the slope at the
 * start is `y1 / x1`, and the rail covers `remaining` pixels in `ms`, so the speed it
 * leaves at is `(y1 / x1) * remaining / ms`. Fix `x1` and `y1` is what the finger decides.
 *
 * It is capped at 1, because a handle above that is not a curve a browser will take: past
 * that speed the landing leaves as fast as it can be drawn. A little slower than the finger
 * is nothing like stopping. A finger that was still, or already coming back the other way,
 * gets a slope of zero, which is the gentle curve unchanged.
 */
export function finishCurve(remaining: number, velocity: number, ms: number): string {
  const d = Math.abs(remaining)
  const v = Math.sign(remaining) === Math.sign(velocity) ? Math.abs(velocity) : 0
  const slope = d === 0 || ms <= 0 ? 0 : (v * ms) / d
  const y1 = Math.min(1, FINISH_HOLDS_BACK * slope)
  return `cubic-bezier(${FINISH_HOLDS_BACK}, ${Number(y1.toFixed(4))}, ${FINISH_EASES_INTO})`
}
export const RETURN_CURVE = 'var(--ease-emphasized-decel)'

/**
 * And the way back, which is one length whatever the finger did.
 *
 * Nothing was decided, so there is nothing to hurry: this is the view putting itself back
 * where it was. Named and in one place, because it was two 180s in two handlers, and two
 * copies of a number is a number that gets changed once.
 */
export const GO_BACK_IN = 260

/** How long the rail takes to finish what the finger started. */
export function finishIn(remaining: number, velocity: number): number {
  const at = Math.abs(remaining) / Math.max(Math.abs(velocity), 1)
  return Math.min(FINISH_AT_MOST, Math.max(FINISH_AT_LEAST, at))
}
