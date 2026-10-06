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

  // 64 px of white was wide enough to look at instead of feel. A thumb's drag reaches the
  // end of the give now and stays there.
  it('gives no more than a sliver', () => {
    expect(MOST_IT_GIVES).toBe(24)
    expect(rubberBand(200, 364)).toBe(MOST_IT_GIVES)
  })

  it('stops giving', () => {
    expect(rubberBand(10000, 364)).toBeLessThanOrEqual(MOST_IT_GIVES)
    expect(rubberBand(-10000, 364)).toBeGreaterThanOrEqual(-MOST_IT_GIVES)
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
