import { memo } from 'react'
import { Tooltip } from '../ui'
import { formatDisplayDate, checkIsToday } from '../../lib/dates'
import { getHeatmapColor } from '../../lib/colors'
import type { HeatmapLevel } from '../../types'

interface DayCellProps {
  date: Date
  level: HeatmapLevel
  completedCount: number
  totalActivities: number
  isSelected?: boolean
  onClick: () => void
}

export const DayCell = memo(function DayCell({
  date,
  level,
  completedCount,
  totalActivities,
  isSelected,
  onClick,
}: DayCellProps) {
  const isCurrentDay = checkIsToday(date)
  const heatmapClass = getHeatmapColor(level)
  const dayOfMonth = date.getDate()

  const tooltipContent = (
    <div className="text-center py-1">
      <div className="font-semibold text-white">{formatDisplayDate(date)}</div>
      {totalActivities > 0 ? (
        <div className="text-gray-300 text-xs mt-1">
          {completedCount}/{totalActivities} completed
        </div>
      ) : (
        <div className="text-gray-300 text-xs mt-1">No activities tracked</div>
      )}
    </div>
  )

  return (
    <Tooltip content={tooltipContent}>
      <button
        onClick={onClick}
        className={`
          relative
          w-full h-full min-w-[10px] min-h-[10px] aspect-square
          rounded-sm
          transition-all duration-150 ease-in-out
          hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 hover:scale-110 hover:z-20
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-500 focus-visible:z-20
          active:scale-95
          ${heatmapClass}
          ${
            isSelected
              ? 'ring-2 ring-offset-1 ring-emerald-500 z-20'
              : isCurrentDay
                ? 'ring-2 ring-offset-1 ring-blue-500 shadow-md shadow-blue-500/30 z-10'
                : 'border border-transparent hover:border-gray-300'
          }
          ${level === 0 ? 'border border-gray-200' : ''}
        `}
        aria-label={`${formatDisplayDate(date)}: ${completedCount} of ${totalActivities} activities completed`}
        data-testid="day-cell"
        data-day={dayOfMonth}
      />
    </Tooltip>
  )
})
