import { forwardRef, useEffect, useRef, useState } from 'react'
import { FLAME_LEVELS, flameLevelFor } from './flameLevels'
import { StreakFlame } from './StreakFlame'

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
  /** Whether today is already in it, which is what the flame says without words. */
  todayDone: boolean
  /** Opens (or closes again) the streak sheet. */
  onOpen: () => void
  /** Whether the sheet is open, for whoever is listening rather than looking. */
  expanded: boolean
}

/**
 * The run, in the header, where it cannot be scrolled away from, and the way into the
 * streak sheet.
 *
 * It is a button since the streak sheet: pressing it shows the run, the best there has
 * been and the last two weeks. The drawing is the one Henfry picked from the R-09 round
 * (look D): the soft green it always had, no border, a pill, a flame for the mark, and the
 * words a step heavier. The soft green with no border is still what keeps it from reading
 * as a second gear; the pointer, a step darker under it, and a ring for the keyboard are
 * what say it can be pressed.
 *
 * The flame grows with the run (flameLevels.ts) and takes the colour of its step, from the
 * house green to fire at 30 days and blue at a year. Only the flame changes: the pill keeps
 * its soft green and its width at every step, so a long run is never a louder button.
 *
 * Nothing at all with no run. A chip reading "0 days" tells somebody who has just missed a
 * day that they have nothing, in the one place on the screen they cannot look away from,
 * and it would be the first thing they see every morning until they started again.
 *
 * The desktop is the reason this exists at both widths rather than only on the phone: 107
 * of the 115 copies are desktop, and the Statistics tile that used to carry this number is
 * gone.
 */
export const StreakChip = forwardRef<HTMLButtonElement, StreakChipProps>(function StreakChip(
  { streak, todayDone, onOpen, expanded },
  ref
) {
  const shown = useWalkingNumber(streak)
  // The flame follows the number on screen, not the one it is walking to, so the two change
  // in the same frame and never disagree during the walk. The first step stands in for the
  // moment the digits leave 0 on their way up.
  const level = flameLevelFor(shown) ?? FLAME_LEVELS[0]

  if (streak === 0) return null

  const said = `${streak} ${streak === 1 ? 'day' : 'days'} in a row, ${
    todayDone ? 'today included' : 'today not logged yet'
  }`

  return (
    <button
      ref={ref}
      type="button"
      data-testid="streak-chip"
      onClick={onOpen}
      // The visible words come first in the name, so somebody who says what they see
      // ("4 days") reaches it.
      aria-label={`${said}. Show your streak`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      // 44px tall, the gear's height, so the header keeps the height it has without a run:
      // a 48px button made the row 4px taller the moment a run began. The 48px Henfry asked
      // for, around a drawing of 36, is the ::before, which reaches 2px above and below and
      // answers a press as the button does, without taking any room in the row.
      className="group relative inline-flex h-11 cursor-pointer items-center focus:outline-none before:absolute before:inset-x-0 before:-inset-y-0.5"
    >
      {/* The ring goes on the drawing and not on the button, so it goes round what is
          seen. emerald-700 and not the emerald-500 the rest of the app uses: 5.36:1 on
          white against 2.47, and a focus indicator needs 3. gray-900 on emerald-50 is
          16.85:1. */}
      <span
        data-testid="streak-pill"
        className={`inline-flex h-9 items-center gap-1 rounded-full pr-3.5 pl-2.5 text-sm font-semibold whitespace-nowrap text-gray-900 tabular-nums transition-colors group-focus-visible:ring-2 group-focus-visible:ring-emerald-700 group-focus-visible:ring-offset-2 ${
          expanded ? 'bg-emerald-100' : 'bg-emerald-50 group-hover:bg-emerald-100'
        }`}
      >
        <StreakFlame level={level} lit={todayDone} />
        <span aria-hidden="true">
          {shown} {shown === 1 ? 'day' : 'days'}
        </span>
      </span>
    </button>
  )
})

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
