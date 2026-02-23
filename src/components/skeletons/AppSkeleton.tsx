import { Skeleton } from '../ui'
import { YearViewSkeleton } from '../calendar/YearViewSkeleton'
import { SidebarSkeleton } from './SidebarSkeleton'

export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50" data-testid="app-skeleton">
      {/* Header skeleton */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-3">
                {/* App name */}
                <Skeleton className="h-6 sm:h-7 w-16 rounded" />
                {/* Subtitle (hidden on mobile) */}
                <Skeleton className="hidden md:block h-4 w-40 rounded" />
              </div>
              {/* Mobile menu button */}
              <Skeleton className="sm:hidden w-10 h-10 rounded-lg" />
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3">
              {/* View toggle */}
              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <Skeleton className="w-14 h-8 sm:h-7 rounded-md" />
                <Skeleton className="w-16 h-8 sm:h-7 rounded-md" />
              </div>
              {/* Desktop menu button */}
              <Skeleton className="hidden sm:block w-9 h-9 rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content skeleton */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200">
            <YearViewSkeleton />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <SidebarSkeleton />
          </div>
        </div>
      </main>
    </div>
  )
}
