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

/** How far the end of the rail gives before it stops giving. */
export const MOST_IT_GIVES = 24

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
 * It keeps moving, less and less, and never past `MOST_IT_GIVES`. A wall that does not
 * move at all reads as a broken screen; one that moves freely promises a view that is not
 * there. It was 64, which left a white gap wide enough to look at rather than feel.
 */
export function rubberBand(dx: number, width: number): number {
  if (width <= 0) return 0
  const give = width * (1 - 1 / (1 + (0.3 * Math.abs(dx)) / width))
  return Math.sign(dx) * Math.min(MOST_IT_GIVES, give)
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
 * The curve the landing follows, and the curve everything else keeps.
 *
 * The emphasized one leaves at speed and brakes hard, which is right for something
 * appearing and wrong for something being put down: on a phone it reads as the view being
 * thrown out of the way. The finish has its own token now; going back and the toggle still
 * use the old one, because nobody has complained about those and changing three things at
 * once makes the next round unreadable.
 */
export const FINISH_CURVE = 'var(--ease-carousel-finish)'
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
