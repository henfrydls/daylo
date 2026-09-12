import { memo } from 'react'

interface HeatmapLegendProps {
  /** Beside a row heading rather than in the page header: smaller type, smaller swatches. */
  compact?: boolean
}

export const HeatmapLegend = memo(function HeatmapLegend({ compact = false }: HeatmapLegendProps) {
  const swatch = compact ? 'w-[11px] h-[11px]' : 'w-[14px] h-[14px]'

  return (
    <div
      className={`flex items-center text-gray-500 ${compact ? 'gap-2 text-xs' : 'gap-3 text-sm'}`}
      role="group"
      aria-label="Activity level legend"
    >
      <span className="font-medium" id="legend-less">
        Less
      </span>
      <div className="flex gap-1" role="list" aria-labelledby="legend-less legend-more">
        <div
          className={`${swatch} rounded-sm border border-gray-200 bg-gray-100`}
          role="listitem"
          aria-label="No activity: 0%"
        />
        <div
          className={`${swatch} rounded-sm bg-emerald-100`}
          role="listitem"
          aria-label="Low activity: 1-25%"
        />
        <div
          className={`${swatch} rounded-sm bg-emerald-300`}
          role="listitem"
          aria-label="Medium activity: 26-50%"
        />
        <div
          className={`${swatch} rounded-sm bg-emerald-400`}
          role="listitem"
          aria-label="High activity: 51-75%"
        />
        <div
          className={`${swatch} rounded-sm bg-emerald-500`}
          role="listitem"
          aria-label="Very high activity: 76-100%"
        />
      </div>
      <span className="font-medium" id="legend-more">
        More
      </span>
    </div>
  )
})
