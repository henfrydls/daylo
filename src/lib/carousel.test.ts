import { describe, it, expect } from 'vitest'
import {
  axisOf,
  confirms,
  finishIn,
  rubberBand,
  velocityOf,
  AXIS_AT,
  FINISH_AT_LEAST,
  FINISH_AT_MOST,
  GO_BACK_IN,
  FINISH_HOLDS_BACK,
  finishCurve,
  MOST_IT_GIVES,
} from './carousel'

describe('which way the gesture is going', () => {
  // The first pixels of every gesture are noise. Deciding there turns a scroll that starts
  // with a wobble into a page change.
  it('decides nothing until the finger has gone somewhere', () => {
    expect(axisOf(0, 0)).toBe('undecided')
    expect(axisOf(AXIS_AT - 1, AXIS_AT - 1)).toBe('undecided')
  })

  it('calls it by whichever has gone further', () => {
    expect(axisOf(20, 4)).toBe('horizontal')
    expect(axisOf(4, 20)).toBe('vertical')
    expect(axisOf(-20, 4)).toBe('horizontal')
  })

  // The design says vertical when |dy| is greater, so an exact tie is horizontal. Pinned
  // because it is the one input where the rule has to pick a side and the words do not say
  // it out loud. A real finger lands on an exact tie about never.
  it('calls an exact tie horizontal, as the rule is written', () => {
    expect(axisOf(20, 20)).toBe('horizontal')
    expect(axisOf(20, 21)).toBe('vertical')
  })
})

describe('the end of the rail', () => {
  it('keeps moving, less and less', () => {
    const at40 = rubberBand(40, 364)
    const at80 = rubberBand(80, 364)

    expect(at40).toBeGreaterThan(0)
    expect(at80).toBeGreaterThan(at40)
    // Less than the finger: that is the whole message.
    expect(at80).toBeLessThan(80)
  })

  // 64 px of white was a gap to look at; then 24 with a hard stop at about 85 px of finger,
  // which on a phone reads as a jump and not as rubber. Forty now, and never quite reached.
  it('never gives the whole of it', () => {
    expect(MOST_IT_GIVES).toBe(40)
    expect(rubberBand(10000, 364)).toBeLessThan(MOST_IT_GIVES)
    expect(rubberBand(-10000, 364)).toBeGreaterThan(-MOST_IT_GIVES)
  })

  // The one the old shape failed. It capped, so from about 85 px on, the finger moved and
  // the view did not: that is a wall somebody is still pushing, which is what made it look
  // like a jump. It has to keep moving however far the finger goes.
  it('keeps moving however far the finger goes', () => {
    const far = [100, 200, 400, 800, 1600].map((x) => rubberBand(x, 364))

    for (let i = 1; i < far.length; i++) {
      expect(far[i]).toBeGreaterThan(far[i - 1])
    }
  })

  // And it has to get most of the way there within a drag somebody would actually do,
  // or the ceiling is a number nobody can feel.
  it('is most of the way there within a drag somebody would do', () => {
    expect(rubberBand(200, 364)).toBeGreaterThan(MOST_IT_GIVES * 0.6)
  })

  it('goes the way the finger goes', () => {
    expect(rubberBand(-100, 364)).toBeLessThan(0)
    expect(rubberBand(100, 364)).toBeGreaterThan(0)
  })

  it('does nothing without a width to work from', () => {
    expect(rubberBand(100, 0)).toBe(0)
  })
})

describe('whether letting go changes the view', () => {
  const W = 364

  it('yes once most of the next view is on screen', () => {
    expect(confirms({ dx: 0.4 * W, width: W, velocity: 0 })).toBe(true)
    expect(confirms({ dx: 0.39 * W, width: W, velocity: 0 })).toBe(false)
  })

  it('yes for a throw, even a short one', () => {
    expect(confirms({ dx: 40, width: W, velocity: 0.5 })).toBe(true)
  })

  // A tap that slipped. Fast, and nowhere.
  it('no for speed with no distance behind it', () => {
    expect(confirms({ dx: 10, width: W, velocity: 2 })).toBe(false)
  })

  // The finger went left and the hand pulled right at the last moment: that is somebody
  // changing their mind, and the view they are looking at is the one they chose.
  it('no when the throw contradicts the drag', () => {
    expect(confirms({ dx: -40, width: W, velocity: 0.5 })).toBe(false)
  })

  it('no when there is no width to compare against', () => {
    expect(confirms({ dx: 400, width: 0, velocity: 1 })).toBe(false)
  })
})

describe('how fast it was going when it was let go', () => {
  it('measures the last moment, not the whole drag', () => {
    // Slow for half a second, then a flick: the flick is what the hand did.
    const samples = [
      { x: 0, t: 0 },
      { x: 10, t: 400 },
      { x: 60, t: 460 },
      { x: 110, t: 500 },
    ]

    expect(velocityOf(samples, 500)).toBeCloseTo(1, 1)
  })

  // Held still, then released. Nothing was thrown.
  it('is nothing when the finger has stopped', () => {
    const samples = [
      { x: 0, t: 0 },
      { x: 200, t: 300 },
    ]

    expect(velocityOf(samples, 500)).toBe(0)
  })

  it('is nothing from a single touch', () => {
    expect(velocityOf([{ x: 0, t: 0 }], 0)).toBe(0)
  })
})

// Henfry felt the first numbers on a phone and said the view arrived too abruptly. These
// are the second ones, and they are the sort only a hand can choose.
describe('how long the finish takes', () => {
  it('never snaps, and never dawdles', () => {
    // Thrown hard with little left to go, and crawling with a screen still to cross.
    expect(finishIn(300, 10)).toBe(FINISH_AT_LEAST)
    expect(finishIn(600, 0.1)).toBe(FINISH_AT_MOST)
    expect(FINISH_AT_LEAST).toBe(320)
    expect(FINISH_AT_MOST).toBe(450)
  })

  it('follows the speed in between', () => {
    const at = finishIn(480, 1.2)

    expect(at).toBeGreaterThan(FINISH_AT_LEAST)
    expect(at).toBeLessThan(FINISH_AT_MOST)
  })

  // The floor does most of the work now, and that is the point of raising it: an ordinary
  // drag across an ordinary phone lands on it rather than finishing in whatever time the
  // arithmetic happens to give.
  it('puts an ordinary gesture on the floor', () => {
    expect(finishIn(200, 1)).toBe(FINISH_AT_LEAST)
  })

  // Going back is one length whatever the finger did, because nothing was decided: it is
  // the view putting itself back where it was.
  it('takes one length to go back', () => {
    expect(GO_BACK_IN).toBe(260)
  })
})

/**
 * The speed the landing leaves at.
 *
 * Henfry: "al soltar rápido se nota que de inmediato se pone más lento." Growth measured
 * it off a video of the 1.4.7 lab build, frame by frame: the finger crosses at 34 to 80
 * video pixels a frame, and the first frame after letting go moves 4. Then 16, 34, 56, 84,
 * and only then does it brake. The view stops dead for a frame and sets off again.
 *
 * That is the curve, not a bug anywhere else: cubic-bezier(0.4, 0, 0.2, 1) leaves at a
 * slope of zero, by construction. Whatever speed the finger had is thrown away and built
 * back up from nothing.
 */
describe('the curve the landing leaves on', () => {
  const X1 = FINISH_HOLDS_BACK
  /** The first number after the comma: the only one that moves. */
  const y1Of = (curve: string) => Number(curve.split(',')[1])
  /** Pixels per millisecond at the very start, which is the whole point of the curve. */
  const leavesAt = (curve: string, remaining: number, ms: number) =>
    (y1Of(curve) / X1) * (remaining / ms)

  // To three places, because the handle is rounded to four when it is written into a CSS
  // string and there is no reason to carry more: the error that leaves is under a
  // thousandth of a pixel per millisecond, and a frame is sixteen of those.
  it('leaves at the speed the finger had', () => {
    for (const velocity of [0.2, 0.5, 0.8]) {
      const curve = finishCurve(240, velocity, 400)

      expect(leavesAt(curve, 240, 400)).toBeCloseTo(velocity, 3)
    }
  })

  // The one that must not change: a drag that crawled to a stop, or was held still before
  // letting go, still gets the curve the design asked for on 2026-10-05.
  it('is the gentle one when the finger had stopped', () => {
    expect(finishCurve(240, 0, 400)).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  // A finger can go faster than a curve can be drawn: y1 may not pass 1, so there is a
  // speed above which the landing leaves as fast as it can and no faster. Being a little
  // slower than the finger at that point is nothing like stopping dead.
  it('goes as fast as it can be drawn and no faster', () => {
    const curve = finishCurve(60, 20, 320)

    expect(y1Of(curve)).toBe(1)
    expect(leavesAt(curve, 60, 320)).toBeLessThan(20)
    expect(leavesAt(curve, 60, 320)).toBeGreaterThan(0)
  })

  // The gesture Henfry actually makes, in the numbers growth read off the video: about 60
  // video pixels a frame at 60 fps on a screen of 1080, which is 1.37 CSS pixels per
  // millisecond, let go around half way across a card 388 wide. The point is that the cap
  // does not bite there, and how little room is left before it does.
  it('carries the speed of the drag that found this', () => {
    const left = 194
    const curve = finishCurve(left, 1.37, FINISH_AT_LEAST)

    expect(y1Of(curve)).toBeLessThan(1)
    expect(leavesAt(curve, left, FINISH_AT_LEAST)).toBeCloseTo(1.37, 2)
    // Where it would start being drawn as fast as it can and no faster: 1.52 px/ms, eleven
    // per cent above the hand that found this. Not much, and it does not need to be. The
    // cap is 1/x1 times the average speed of the landing, whatever the distance, so being
    // capped still means leaving at two and a half times the pace of the journey: a
    // landing that sets off briskly, not one that stalls.
    const fastest = left / FINISH_AT_LEAST / X1
    expect(fastest).toBeGreaterThan(1.37)
    expect(y1Of(finishCurve(left, fastest * 1.01, FINISH_AT_LEAST))).toBe(1)
  })

  // Letting go while the hand is already coming back the other way. The distance alone
  // confirms this one, so it does happen; a curve that left backwards would be a view
  // walking away from where it is going.
  it('treats a finger going the other way as one that stopped', () => {
    expect(finishCurve(240, -0.8, 400)).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('has nothing to continue when there is nowhere to go', () => {
    expect(finishCurve(0, 2, 400)).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
    expect(finishCurve(240, 2, 0)).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  // The sign of the journey is in the distance the rail travels, never in the curve: a
  // cubic-bezier with a negative number in it is not a curve the browser will take.
  it('is the same curve whichever way the rail is going', () => {
    expect(finishCurve(-240, -0.5, 400)).toBe(finishCurve(240, 0.5, 400))
  })
})
