import { memo } from 'react'

export const HeatmapLegend = memo(function HeatmapLegend() {
  return (
    <div
      className="flex items-center gap-3 text-sm text-gray-500"
      role="group"
      aria-label="Activity level legend"
    >
      <span className="font-medium" id="legend-less">
        Less
      </span>
      <div className="flex gap-1" role="list" aria-labelledby="legend-less legend-more">
        <div
          className="w-[14px] h-[14px] rounded-sm bg-gray-100 border border-gray-200"
          role="listitem"
          aria-label="No activity: 0%"
        />
        <div
          className="w-[14px] h-[14px] rounded-sm bg-emerald-100"
          role="listitem"
          aria-label="Low activity: 1-25%"
        />
        <div
          className="w-[14px] h-[14px] rounded-sm bg-emerald-300"
          role="listitem"
          aria-label="Medium activity: 26-50%"
        />
        <div
          className="w-[14px] h-[14px] rounded-sm bg-emerald-400"
          role="listitem"
          aria-label="High activity: 51-75%"
        />
        <div
          className="w-[14px] h-[14px] rounded-sm bg-emerald-500"
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
