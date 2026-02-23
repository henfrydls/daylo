import { Skeleton } from '../ui'

const WEEKS_PER_MONTH = 6
const DAYS_PER_WEEK = 7

function MonthSkeleton() {
  return (
    <div className="flex flex-col min-h-0">
      {/* Month Label placeholder */}
      <Skeleton className="mb-2 h-5 w-10 rounded" />

      {/* Month Grid Container */}
      <div className="flex flex-1 bg-white rounded-lg border border-gray-100 p-3 shadow-sm min-h-0">
        {/* Day Labels column */}
        <div className="grid grid-rows-7 gap-1 mr-2 pr-2 border-r border-gray-100">
          {Array.from({ length: DAYS_PER_WEEK }).map((_, i) => (
            <div
              key={i}
              className="min-h-[10px] flex items-center justify-end"
            >
              {i % 2 === 1 ? (
                <Skeleton className="w-[8px] h-[10px] rounded-sm" />
              ) : null}
            </div>
          ))}
        </div>

        {/* Weeks Grid */}
        <div className="grid grid-cols-6 gap-x-2 gap-y-1 flex-1">
          {Array.from({ length: WEEKS_PER_MONTH }).map((_, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {Array.from({ length: DAYS_PER_WEEK }).map((_, dayIndex) => (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className="min-w-[10px] min-h-[10px] aspect-square bg-gray-200 rounded-sm animate-pulse"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function YearViewSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full" data-testid="year-view-skeleton">
      {/* Year Navigation skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {/* Year number */}
          <Skeleton className="h-8 sm:h-9 w-20 rounded" />
          {/* Nav buttons */}
          <div className="flex items-center gap-1">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <Skeleton className="w-9 h-9 rounded-lg" />
            <Skeleton className="ml-2 w-16 h-8 rounded-lg" />
          </div>
        </div>

        {/* Legend skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-4 rounded" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-[14px] h-[14px] rounded-sm bg-gray-200 animate-pulse"
              />
            ))}
          </div>
          <Skeleton className="w-10 h-4 rounded" />
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="w-full">
        {/* Activity Calendar label */}
        <div className="flex mb-4">
          <Skeleton className="h-4 w-28 rounded" />
        </div>

        {/* Months Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <MonthSkeleton key={i} />
          ))}
        </div>

        {/* Bottom Summary skeleton */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-5 w-40 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
