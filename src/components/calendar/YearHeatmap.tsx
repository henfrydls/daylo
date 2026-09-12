import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, FocusEvent } from 'react'
import { buildYearGrid } from '../../lib/yearGrid'
import { formatDate, formatDisplayDate, checkIsToday } from '../../lib/dates'
import { getHeatmapColor } from '../../lib/colors'
import type { HeatmapLevel } from '../../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Sunday at the top; only three are written, or the column becomes a wall of letters. */
const WEEKDAY_LABELS = ['', 'M', '', 'W', '', 'F', '']

interface YearHeatmapProps {
  year: number
  dayData: Map<string, { completedCount: number; level: HeatmapLevel }>
  totalActivities: number
  selectedDate: string | null
  onSelectDate: (date: string) => void
  /**
   * One activity's own row rather than the whole year's total: its colour on the days it
   * happened, and labels that say done or not done. A single activity on a day has no
   * degrees, so the five heatmap levels have nothing to say about it.
   */
  activity?: { name: string; color: string; done: ReadonlySet<string> }
  /**
   * Off for every row but the first when several grids are stacked: the columns line up,
   * so one set of month names speaks for all of them and repeating it is noise.
   */
  showMonthLabels?: boolean
}

function describe(date: Date, completedCount: number, totalActivities: number): string {
  const what =
    totalActivities > 0 ? `${completedCount} of ${totalActivities} completed` : 'No activities yet'
  return `${formatDisplayDate(date)} — ${what}`
}

/**
 * The year as one continuous heatmap: a column per week, seven rows, Sunday at the top.
 *
 * Three things here are deliberate, and all three come from what WebKitGTK did to the old
 * year view in 1.1.3, measured again in this engine before any of this was written:
 *
 *  - Cells are a fixed number of pixels and the grid flows down the column. Nothing here
 *    can be sized from its content, so a cell cannot resize the row it sits in.
 *  - Hover and focus draw a box-shadow ring, never a transform. A scaled box feeds back
 *    into grid sizing in WebKit; a shadow only paints.
 *  - One listener on the wrapper and one tooltip node answer for every cell. At a row per
 *    activity this is four thousand cells, and a tooltip each would be four thousand
 *    subscriptions to keep in step.
 */
export const YearHeatmap = memo(function YearHeatmap({
  year,
  dayData,
  totalActivities,
  selectedDate,
  onSelectDate,
  activity,
  showMonthLabels = true,
}: YearHeatmapProps) {
  const { weeks, monthLabels } = useMemo(() => buildYearGrid(year), [year])
  const gridRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  // The one cell that answers to Tab. The arrows move it, so the grid is a single stop on
  // the way through the page rather than three hundred and seventy-one.
  const [tabStop, setTabStop] = useState<string | null>(null)

  const show = useCallback((cell: HTMLElement) => {
    const text = cell.dataset.label
    if (!text) return
    const box = cell.getBoundingClientRect()
    setTip({ text, x: box.left + box.width / 2, y: box.top })
  }, [])

  const handlePointerOver = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-label]')
      if (cell) show(cell)
    },
    [show]
  )

  const handlePointerLeave = useCallback(() => setTip(null), [])

  // focusin, not focus: focus does not bubble, and the whole point is to hear about cells
  // without subscribing to each one. A keyboard reader gets the same tooltip the pointer
  // does, which is the only reason the grid says anything at all to them.
  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-label]')
      if (cell) show(cell)
    },
    [show]
  )

  const handleBlur = useCallback(() => setTip(null), [])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-date]')
    if (!cell || !gridRef.current) return

    // Down and up move a day, left and right move a week, because that is what the
    // columns are. Arrowing right along a row would jump seven days a press otherwise.
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key]
    if (step === undefined) return
    event.preventDefault()

    const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-date]'))
    const next = cells[cells.indexOf(cell) + step]
    if (!next) return
    setTabStop(next.dataset.date ?? null)
    next.focus()
  }, [])

  const firstDate = useMemo(() => weeks.flat().find((date): date is Date => date !== null), [weeks])
  const currentTabStop = tabStop ?? (firstDate ? formatDate(firstDate) : null)

  return (
    <div className="w-full">
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="year-heatmap">
        {/* The weekday column sits outside the scrolling grid so it does not slide away */}
        <div
          className={`grid shrink-0 text-[10px] leading-[11px] text-gray-400 ${
            showMonthLabels ? 'pt-[18px]' : ''
          }`}
          style={{ gridTemplateRows: 'repeat(7, 11px)', rowGap: '3px' }}
          aria-hidden="true"
        >
          {WEEKDAY_LABELS.map((label, row) => (
            <div key={row}>{label}</div>
          ))}
        </div>

        <div>
          {showMonthLabels ? (
            <div
              className="grid text-[10px] leading-[14px] text-gray-500"
              style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)`, columnGap: '3px' }}
              aria-hidden="true"
            >
              {monthLabels.map(({ month, column }) => (
                <div
                  key={month}
                  className="whitespace-nowrap"
                  style={{ gridColumnStart: column + 1, gridColumnEnd: 'span 4' }}
                >
                  {MONTHS[month]}
                </div>
              ))}
            </div>
          ) : null}

          <div
            ref={gridRef}
            className="grid"
            style={{
              gridTemplateRows: 'repeat(7, 11px)',
              gridAutoColumns: '11px',
              gridAutoFlow: 'column',
              gap: '3px',
            }}
            role="group"
            aria-label={activity ? `${activity.name} in ${year}` : `Activity calendar for ${year}`}
            onPointerOver={handlePointerOver}
            onPointerLeave={handlePointerLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          >
            {weeks.map((week, column) =>
              week.map((date, row) => {
                if (!date) {
                  return <div key={`pad-${column}-${row}`} aria-hidden="true" />
                }

                const key = formatDate(date)
                const { completedCount = 0, level = 0 } = dayData.get(key) ?? {}
                const wasDone = activity?.done.has(key) ?? false
                const label = activity
                  ? `${formatDisplayDate(date)} — ${activity.name}${wasDone ? '' : ' not'} done`
                  : describe(date, completedCount, totalActivities)
                const isSelected = selectedDate === key

                return (
                  <button
                    key={key}
                    type="button"
                    tabIndex={key === currentTabStop ? 0 : -1}
                    onClick={() => {
                      setTabStop(key)
                      onSelectDate(key)
                    }}
                    style={activity && wasDone ? { backgroundColor: activity.color } : undefined}
                    className={`h-[11px] w-[11px] rounded-[2px] ${
                      activity ? getHeatmapColor(0) : getHeatmapColor(level)
                    } ${
                      isSelected
                        ? 'shadow-[0_0_0_1px_#fff,0_0_0_2px_var(--color-emerald-600)]'
                        : checkIsToday(date)
                          ? 'shadow-[0_0_0_1px_#fff,0_0_0_2px_var(--color-blue-500)]'
                          : ''
                    } hover:shadow-[0_0_0_1px_#fff,0_0_0_2px_var(--color-gray-500)] focus-visible:shadow-[0_0_0_1px_#fff,0_0_0_2px_var(--color-emerald-600)] focus:outline-none`}
                    aria-label={label}
                    data-label={label}
                    data-date={key}
                    data-level={level}
                    data-testid="day-cell"
                  />
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Fixed, so showing it cannot move a single cell, and pointer-events off so it
          cannot steal the hover that is keeping it open. */}
      {tip && (
        <div
          role="tooltip"
          data-testid="heatmap-tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
})
