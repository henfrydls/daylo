import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import { BottomSheet, DropdownMenu, ErrorBoundary, ToastContainer, useToast } from './components/ui'
import type { DropdownMenuItem } from './components/ui'
import { AppSkeleton } from './components/skeletons'
import { DailyReminder, ReminderSettings } from './components/settings'
import { useCalendarStore } from './store'
import { useAppVersion, useRemindersAvailable, useSwipeGesture } from './hooks'
import { FeedbackInvite } from './components/feedback/FeedbackInvite'
import { FEEDBACK_MAILTO, openMailto, shouldInviteFeedback } from './lib/feedbackInvite'
import { formatDate } from './lib/dates'

// Lazy load modals - they are rarely used
const ExportModal = lazy(() =>
  import('./components/data/ExportModal').then((module) => ({
    default: module.ExportModal,
  }))
)
const ImportModal = lazy(() =>
  import('./components/data/ImportModal').then((module) => ({
    default: module.ImportModal,
  }))
)

function ViewToggle() {
  const { currentView, setCurrentView } = useCalendarStore()

  return (
    <div
      className="inline-flex rounded-lg bg-gray-100 p-1"
      role="group"
      aria-label="Calendar view toggle"
    >
      <button
        onClick={() => setCurrentView('year', 'drill-up')}
        className={`
          px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-all duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1
          min-h-[44px] sm:min-h-0 min-w-[44px]
          ${
            currentView === 'year'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }
        `}
        aria-pressed={currentView === 'year'}
      >
        Year
      </button>
      <button
        onClick={() => setCurrentView('month', 'drill-down')}
        className={`
          px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-all duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1
          min-h-[44px] sm:min-h-0 min-w-[44px]
          ${
            currentView === 'month'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }
        `}
        aria-pressed={currentView === 'month'}
      >
        Month
      </button>
    </div>
  )
}

function App() {
  const hasHydrated = useCalendarStore((state) => state._hasHydrated)
  const { selectedDate, currentView, setCurrentView, _viewTransitionDirection } = useCalendarStore()
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  const [isReminderOpen, setIsReminderOpen] = useState(false)
  const appVersion = useAppVersion()
  // Android only: nowhere else can a notification arrive with the app closed, so nowhere
  // else is there a setting to show.
  const hasReminders = useRemindersAvailable()
  const logs = useCalendarStore((state) => state.logs)
  const firstOpenedAt = useCalendarStore((state) => state.firstOpenedAt)
  const feedbackInviteSeen = useCalendarStore((state) => state.feedbackInviteSeen)
  const loggedThisSession = useCalendarStore((state) => state._loggedThisSession)
  const offerThisSession = useCalendarStore((state) => state._offerThisSession)
  const reminderOffered = useCalendarStore((state) => state.reminderOffered)
  const markOpened = useCalendarStore((state) => state.markOpened)
  const { showToast } = useToast()
  // The slot stays open once the band has thanked, so the line can outlive the condition
  // that put the band there. Set from the click, not from an effect.
  const [inviteThanked, setInviteThanked] = useState(false)

  // The first day this installation was opened, written once, as soon as there is a store
  // to write it to. Everything that asks how long somebody has been here reads it.
  useEffect(() => {
    if (hasHydrated) markOpened()
  }, [hasHydrated, markOpened])

  const shouldInvite = useMemo(
    () =>
      shouldInviteFeedback({
        today: formatDate(new Date()),
        firstOpenedAt,
        logs,
        feedbackInviteSeen,
        loggedThisSession,
        offerThisSession,
        reminderOfferPending: hasReminders && !reminderOffered,
        // Nothing offers the check-in yet; it arrives with its own piece.
        checkinOfferPending: false,
      }),
    [
      firstOpenedAt,
      logs,
      feedbackInviteSeen,
      loggedThisSession,
      offerThisSession,
      hasReminders,
      reminderOffered,
    ]
  )

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: () =>
      setCurrentView(
        currentView === 'year' ? 'month' : 'year',
        currentView === 'year' ? 'drill-down' : 'drill-up'
      ),
    onSwipeRight: () =>
      setCurrentView(
        currentView === 'month' ? 'year' : 'month',
        currentView === 'month' ? 'drill-up' : 'drill-down'
      ),
  })

  if (!hasHydrated) {
    return <AppSkeleton />
  }

  const menuItems: DropdownMenuItem[] = [
    {
      label: 'Export Data',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
      ),
      onClick: () => setIsExportOpen(true),
    },
    {
      label: 'Import Data',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      ),
      onClick: () => setIsImportOpen(true),
    },
    ...(hasReminders
      ? [
          {
            label: 'Daily reminder',
            icon: (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            ),
            onClick: () => setIsReminderOpen(true),
          } satisfies DropdownMenuItem,
        ]
      : []),
    {
      label: 'Send feedback',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      ),
      // Here on every platform and from the first day, so that somebody with something to
      // say on day three does not have to wait to be asked on day fourteen.
      onClick: () => {
        void openMailto(FEEDBACK_MAILTO).then((result) => {
          if (result === 'opened') {
            // Whoever has already written is not asked again on day fourteen.
            useCalendarStore.getState().markFeedbackInviteSeen()
            return
          }
          showToast('Could not open an email app. You can write to daylo@henfrydls.com.', 'error')
        })
      },
    },
    { type: 'divider' },
    {
      type: 'info',
      label: `v${appVersion}`,
    },
  ]

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Skip Link for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-white focus:rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Skip to main content
        </a>

        {/* Header */}
        <header className="sticky top-0 z-30 bg-white pt-[env(safe-area-inset-top)]">
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div
                  className="flex items-center justify-between sm:justify-start gap-3"
                  data-testid="app-header"
                >
                  <div className="flex items-center gap-3">
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
                      Daylo
                      <span className="hidden md:inline text-sm font-normal text-gray-400 ml-2">
                        · Simple Activity Tracking
                      </span>
                    </h1>
                  </div>
                  {/* Menu button visible on mobile next to title */}
                  <div className="sm:hidden">
                    <DropdownMenu
                      trigger={
                        <span
                          className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label="More options"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                            />
                          </svg>
                        </span>
                      }
                      items={menuItems}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <ViewToggle />
                  {/* Menu button hidden on mobile, visible on larger screens */}
                  <div className="hidden sm:block">
                    <DropdownMenu
                      trigger={
                        <span
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label="More options"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                            />
                          </svg>
                        </span>
                      }
                      items={menuItems}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main
          id="main-content"
          className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6"
          tabIndex={-1}
        >
          {/* Under the header and above the calendar: the only place visible on every
              screen without scrolling, and the same place on a phone and on a desktop. */}
          {shouldInvite || inviteThanked ? (
            <FeedbackInvite onThanked={() => setInviteThanked(true)} />
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Calendar Section */}
            <div
              ref={swipeRef}
              className="lg:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div
                key={currentView}
                style={{
                  animation:
                    _viewTransitionDirection === 'drill-down'
                      ? 'view-drill-down 250ms var(--ease-emphasized-decel) both'
                      : _viewTransitionDirection === 'drill-up'
                        ? 'view-drill-up 200ms var(--ease-emphasized-decel) both'
                        : 'view-fade 200ms ease both',
                }}
              >
                {currentView === 'year' ? <YearView /> : <MonthView />}
              </div>
            </div>

            {/* Sidebar - Hidden on mobile, visible on large screens */}
            <div className="hidden lg:block space-y-6">
              <ActivityList />
              <StatsPanel />
            </div>
          </div>
        </main>

        {/* FAB Button - Visible only on mobile (< lg) */}
        <button
          onClick={() => setIsBottomSheetOpen(true)}
          className="fixed bottom-6 right-6 z-20 lg:hidden w-14 h-14 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          aria-label="Open activities panel"
          data-testid="fab-button"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </button>

        {/* Bottom Sheet - Activities + Stats for mobile */}
        <BottomSheet
          isOpen={isBottomSheetOpen}
          onClose={() => setIsBottomSheetOpen(false)}
          aria-label="Activities and statistics"
        >
          <div className="space-y-6">
            <ActivityList />
            <StatsPanel />
          </div>
        </BottomSheet>

        {/* Quick Log Modal */}
        {selectedDate && <QuickLog />}

        {/* Export/Import Modals - Lazy loaded */}
        <Suspense fallback={null}>
          {isExportOpen && (
            <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
          )}
        </Suspense>
        <Suspense fallback={null}>
          {isImportOpen && (
            <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
          )}
        </Suspense>

        {/* Daily reminder: the one-time offer, and the setting behind the menu */}
        <DailyReminder />
        {isReminderOpen && (
          <ReminderSettings isOpen={isReminderOpen} onClose={() => setIsReminderOpen(false)} />
        )}

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}

export default App
