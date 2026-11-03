import { useEffect, useRef, useState } from 'react'

/** How long one digit waits before the next, when the number walks. */
const A_DIGIT_AT_A_TIME = 100

/**
 * The furthest the number will walk rather than jump.
 *
 * A digit at a time is a nice touch over a step or two and a hostage situation over a
 * hundred. Importing a backup takes the run from 0 to whatever it was, and at a tenth of a
 * second a digit, 128 days would be twelve and a half seconds of a number ticking in the
 * header while somebody waits to find out what they have. The same the other way: deleting
 * one old log can break a run of 30 into 3, and counting that loss out loud is the last
 * thing anybody needs.
 *
 * Three, because what this is for is the ordinary day where the number goes up by one.
 */
const AS_FAR_AS_IT_WALKS = 3

interface StreakChipProps {
  /** Days in a row, ending today or yesterday. Zero means there is no run to speak of. */
  streak: number
  /** Whether today is already in it, which is what the mark says without words. */
  todayDone: boolean
}

/**
 * The run, in the header, where it cannot be scrolled away from.
 *
 * It reads as state rather than as a control: a soft green, a pill, and no border. That is
 * deliberate and it is the whole argument for the shape. A bordered rectangle beside the
 * gear reads as a second gear, and somebody who presses it expecting a setting has been
 * told a small lie by the drawing.
 *
 * Nothing at all with no run. A chip reading "0 days" tells somebody who has just missed a
 * day that they have nothing, in the one place on the screen they cannot look away from,
 * and it would be the first thing they see every morning until they started again.
 *
 * The desktop is the reason this exists at both widths rather than only on the phone: 107
 * of the 115 copies are desktop, and the Statistics tile that used to carry this number is
 * going away in the same version.
 */
export function StreakChip({ streak, todayDone }: StreakChipProps) {
  const shown = useWalkingNumber(streak)

  if (streak === 0) return null

  const said = `${streak} ${streak === 1 ? 'day' : 'days'} in a row, ${
    todayDone ? 'today included' : 'today not logged yet'
  }`

  return (
    <span
      data-testid="streak-chip"
      role="img"
      aria-label={said}
      // gray-900 on emerald-50 is 16.85:1. min-h-12 is the 48px Henfry asked for, which is
      // also what keeps it from crowding the gear once it becomes pressable.
      className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-sm font-medium tabular-nums text-gray-900"
    >
      <Mark filled={todayDone} />
      <span aria-hidden="true">
        {shown} {shown === 1 ? 'day' : 'days'}
      </span>
    </span>
  )
}

/**
 * The number walks to its new value instead of being replaced.
 *
 * It is the whole of the movement in this version: no slide, no bounce, nothing that moves
 * on its own while somebody is reading. A digit at a time is enough to be noticed and
 * little enough to be ignored.
 *
 * The walking number is for the eye only. What a screen reader is told is the real number
 * from the first frame, because somebody listening should not have to wait out an animation
 * to hear what their streak is.
 */
function useWalkingNumber(target: number): number {
  const [shown, setShown] = useState(target)
  const previous = useRef(target)

  useEffect(() => {
    if (previous.current === target) return
    const from = previous.current
    previous.current = target

    // The movement is JavaScript, so the CSS rule that turns animation off never reaches
    // it and it has to ask for itself.
    const tooFar = Math.abs(target - from) > AS_FAR_AS_IT_WALKS
    if (tooFar || prefersLessMovement()) {
      setShown(target)
      return
    }

    let value = shown
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      value += Math.sign(target - value)
      setShown(value)
      // Stop at the target. A counter that walks past it is one that was written with a
      // timer and never watched.
      if (value !== target) timer = setTimeout(step, A_DIGIT_AT_A_TIME)
    }
    timer = setTimeout(step, A_DIGIT_AT_A_TIME)
    return () => clearTimeout(timer)
    // `shown` is read once to start from wherever the digits are, and is deliberately not
    // a dependency: listing it would restart the walk on every step it takes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return shown
}

/**
 * Whether somebody has asked their system for less movement.
 *
 * Read when the number changes rather than once at mount: the setting can be turned on
 * while the app is open, and a component that only asked at startup would keep moving for
 * the rest of the session.
 */
function prefersLessMovement(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Filled when today is in the run, hollow when it is not.
 *
 * The same shape the month grid uses for a day that exists and has not happened yet, so
 * the chip and the calendar say the same thing in the same way. emerald-700 on emerald-50
 * is 5.09:1, and a shape needs 3.
 */
function Mark({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0 text-emerald-700"
      fill="none"
      aria-hidden="true"
    >
      {filled ? (
        <circle cx="6" cy="6" r="5" fill="currentColor" />
      ) : (
        <circle
          cx="6"
          cy="6"
          r="4"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="2.5 2.5"
        />
      )}
    </svg>
  )
}
