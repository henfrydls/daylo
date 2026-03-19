import { Skeleton } from '../ui'

function ActivityListSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      {/* Header: title + Add button */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 sm:h-6 w-24 rounded" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>

      {/* 3 activity item placeholders */}
      <ul className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg">
            {/* Color dot */}
            <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
            {/* Activity name */}
            <Skeleton
              className={`h-4 rounded flex-1 ${i === 0 ? 'max-w-[120px]' : i === 1 ? 'max-w-[90px]' : 'max-w-[140px]'}`}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatsPanelSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      {/* Title */}
      <Skeleton className="h-5 sm:h-6 w-20 rounded mb-3 sm:mb-4" />

      {/* 2x2 stat cards grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-2 sm:p-3 rounded-lg bg-gray-50">
            {/* Value */}
            <Skeleton className="h-6 sm:h-7 w-12 rounded mb-1" />
            {/* Label */}
            <Skeleton className="h-3 sm:h-4 w-20 rounded mb-1" />
            {/* Subtitle */}
            <Skeleton className="h-3 w-14 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SidebarSkeleton() {
  return (
    <>
      <ActivityListSkeleton />
      <StatsPanelSkeleton />
    </>
  )
}
