import { Skeleton } from '../ui'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_OF_WEEK_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const TOTAL_CELLS = 42

export function MonthViewSkeleton() {
  return (
    <div className="p-3 sm:p-4 md:p-6" data-testid="month-view-skeleton">
      {/* Month Navigation skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        {/* Month year title */}
        <Skeleton className="h-7 sm:h-8 w-40 rounded" />
        {/* Nav buttons */}
        <div className="flex items-center gap-1">
          <Skeleton className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg" />
          <Skeleton className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg" />
          <Skeleton className="ml-2 w-16 h-9 sm:h-7 rounded-lg" />
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAYS_OF_WEEK.map((day, index) => (
            <div
              key={day}
              className="px-1 sm:px-2 py-2 sm:py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              <span className="sm:hidden">{DAYS_OF_WEEK_SHORT[index]}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>

        {/* Days Grid skeleton */}
        <div className="grid grid-cols-7">
          {Array.from({ length: TOTAL_CELLS }).map((_, index) => {
            const isLastRow = index >= 35
            const isLastColumn = (index + 1) % 7 === 0

            return (
              <div
                key={index}
                className={`
                  relative min-h-[60px] sm:min-h-[80px] p-1.5 sm:p-2
                  ${!isLastRow ? 'border-b border-gray-200' : ''}
                  ${!isLastColumn ? 'border-r border-gray-200' : ''}
                  bg-white
                `}
              >
                {/* Day number placeholder */}
                <Skeleton className="w-6 h-6 sm:w-7 sm:h-7 rounded-full" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
