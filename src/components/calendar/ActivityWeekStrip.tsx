import { memo, useMemo } from 'react'
import { buildWeekBlocks } from '../../lib/weekBlocks'
import { formatDate } from '../../lib/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * How solid a week looks, by the days done in it. Taken from the approved design rather
 * than invented: seven steps, and a week with nothing is not a faint version of the colour
 * but plain grey, so an empty run reads as empty at a glance.
 */
const OPACITY_BY_DAYS = [0, 0.3, 0.45, 0.6, 0.72, 0.84, 0.92, 1] as const

interface ActivityWeekStripProps {
  name: string
  color: string
  done: ReadonlySet<string>
  /** The week this ends on: today, or the last week of a year already over. */
  end: Date
  days: number
  streak: number
}

/**
 * One activity's half year, a block per week.
 *
 * A phone cannot show three hundred and sixty five squares and mean anything by them.
 * Twenty six blocks fit across a 360 pixel screen at a size a thumb can aim at, and the
 * week is the unit somebody thinks in anyway: "I went four times last week".
 */
export const ActivityWeekStrip = memo(function ActivityWeekStrip({
  name,
  color,
  done,
  end,
  days,
  streak,
}: ActivityWeekStripProps) {
  const blocks = useMemo(() => buildWeekBlocks(done, end), [done, end])
  const first = blocks[0].start
  const last = blocks[blocks.length - 1].start

  return (
    <div className="border-b border-gray-100 py-3.5 last:border-b-0" data-testid={`strip-${name}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
          <i
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {name}
        </span>
        <span className="text-xs whitespace-nowrap text-gray-500">
          {days} {days === 1 ? 'day' : 'days'} · {streak} streak
        </span>
      </div>

      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${blocks.length}, 1fr)` }}
        role="group"
        aria-label={`${name}, the last ${blocks.length} weeks`}
      >
        {blocks.map((block) => (
          <i
            key={formatDate(block.start)}
            className="h-[22px] rounded-[3px]"
            style={
              block.days === 0
                ? { backgroundColor: 'var(--color-gray-100)' }
                : { backgroundColor: color, opacity: OPACITY_BY_DAYS[block.days] }
            }
            role="img"
            aria-label={`Week of ${MONTHS[block.start.getMonth()]} ${block.start.getDate()}: ${block.days} of 7 days`}
            data-testid="week-block"
            data-days={block.days}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-gray-400" aria-hidden="true">
        <span>{MONTHS[first.getMonth()]}</span>
        <span>each block is one week</span>
        <span>{MONTHS[last.getMonth()]}</span>
      </div>
    </div>
  )
})
