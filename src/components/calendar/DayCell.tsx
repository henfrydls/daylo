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
  onClick: () => void
}

export const DayCell = memo(function DayCell({
  date,
  level,
  completedCount,
  totalActivities,
  onClick,
}: DayCellProps) {
  const isCurrentDay = checkIsToday(date)
  const heatmapClass = getHeatmapColor(level)

  const tooltipContent = (
    <div className="text-center">
      <div className="font-medium">{formatDisplayDate(date)}</div>
      {totalActivities > 0 && (
        <div className="text-gray-300 text-xs">
          {completedCount}/{totalActivities} completed
        </div>
      )}
    </div>
  )

  return (
    <Tooltip content={tooltipContent}>
      <button
        onClick={onClick}
        className={`
          w-3 h-3 rounded-sm transition-all duration-150
          hover:ring-2 hover:ring-offset-1 hover:ring-gray-400
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500
          ${heatmapClass}
          ${isCurrentDay ? 'ring-2 ring-offset-1 ring-emerald-500' : ''}
        `}
        aria-label={`${formatDisplayDate(date)}: ${completedCount} of ${totalActivities} activities completed`}
      />
    </Tooltip>
  )
})
