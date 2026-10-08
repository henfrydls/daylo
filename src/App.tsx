import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import {
  BottomSheet,
  BroadcastIcon,
  RefreshIcon,
  DropdownMenu,
  ErrorBoundary,
  ToastContainer,
  useToast,
} from './components/ui'
import type { DropdownMenuItem } from './components/ui'
import { AppSkeleton } from './components/skeletons'
import {
  CheckinNotice,
  CheckinSettings,
  DailyReminder,
  ReminderSettings,
} from './components/settings'
import { useCalendarStore } from './store'
import {
  useAppVersion,
  useCheckinFields,
  useMediaQuery,
  useRemindersAvailable,
  useUpdates,
  useViewCarousel,
} from './hooks'
import { TravelContext, useTravel } from './lib/travel'
import { UpdateDot } from './components/updates/UpdateDot'
import { UpdateNotice } from './components/updates/UpdateNotice'
import { UpdateSettings } from './components/updates/UpdateSettings'
import { sendComment, sendRating, sendShown } from './lib/feedback'
import { FEEDBACK_MAILTO, openMailto, shouldInviteFeedback } from './lib/feedbackInvite'
import { formatDate } from './lib/dates'
import { sendCheckinIfDue, startCheckinOnNewInstall } from './lib/checkin'

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

// Asked for once, after a week, and never again. Loading it with everything else meant
// every session paid for a dialog almost none of them open, which is what the export and
// import modals are already lazy for.
const FeedbackRating = lazy(() =>
  import('./components/feedback/FeedbackRating').then((module) => ({
    default: module.FeedbackRating,
  }))
)

function ViewToggle() {
  const { currentView, setCurrentView } = useCalendarStore()
  // On the phone this walks the same rail a finger would, so that pressing the toggle and
  // dragging are visibly one journey. Elsewhere it is the plain change it always was.
  const travel = useTravel()
  const go = (view: 'year' | 'month') => {
    if (travel) {
      if (view === 'year') travel.toYear()
      else travel.toMonth()
      return
    }
    setCurrentView(view, view === 'year' ? 'drill-up' : 'drill-down')
  }

  return (
    <div
      className="inline-flex rounded-lg bg-gray-100 p-1"
      role="group"
      aria-label="Calendar view toggle"
    >
      <button
        onClick={() => go('year')}
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
        onClick={() => go('month')}
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
  const [isCheckinOpen, setIsCheckinOpen] = useState(false)
  const [isUpdatesOpen, setIsUpdatesOpen] = useState(false)
  // Whether somebody went looking for the question, and whether they have closed it. The
  // question's own number lives in the dialog, because it lives exactly as long as the
  // dialog does.
  const [askedFromMenu, setAskedFromMenu] = useState(false)
  const [questionClosed, setQuestionClosed] = useState(false)
  const appVersion = useAppVersion()
  // Android only: nowhere else can a notification arrive with the app closed, so nowhere
  // else is there a setting to show.
  const hasReminders = useRemindersAvailable()
  // Desktop and Android: everywhere else there is no command to call, and the page's own
  // CSP forbids reaching any host, so there is nothing to show a setting for.
  const checkinFields = useCheckinFields()
  const canCheckIn = checkinFields !== null
  const logs = useCalendarStore((state) => state.logs)
  const firstOpenedAt = useCalendarStore((state) => state.firstOpenedAt)
  const feedbackInviteSeen = useCalendarStore((state) => state.feedbackInviteSeen)
  const loggedThisSession = useCalendarStore((state) => state._loggedThisSession)
  const offerThisSession = useCalendarStore((state) => state._offerThisSession)
  const reminderOffered = useCalendarStore((state) => state.reminderOffered)
  const checkinNoticeSeen = useCalendarStore((state) => state.checkinNoticeSeen)
  const checkinNoticeShown = useCalendarStore((state) => state._checkinNoticeShown)
  const checkinEnabled = useCalendarStore((state) => state.checkinEnabled)
  const checkinStart = useCalendarStore((state) => state._checkinStart)
  const markOpened = useCalendarStore((state) => state.markOpened)
  const checkinId = useCalendarStore((state) => state.checkinId)
  const markFeedbackAsked = useCalendarStore((state) => state.markFeedbackAsked)
  // Everything about a newer version: whether this copy can be told about one at all,
  // what the card says, what the sheet says, and the one action behind both.
  const updates = useUpdates()
  // The version still waiting once the card is no longer the one saying it, or null. The
  // cross means later, and this is where later lives.
  const updateWaiting = updates.waiting
  const feedbackAsked = useCalendarStore((state) => state._feedbackAsked)
  const { showToast } = useToast()

  const reminderOfferOwed = hasReminders && !reminderOffered

  // The first day this installation was opened, written once, as soon as there is a store
  // to write it to. Everything that asks how long somebody has been here reads it.
  useEffect(() => {
    if (hasHydrated) markOpened()
  }, [hasHydrated, markOpened])

  // The line about the check-in. Not for somebody who already decided in an earlier
  // build, and not once it has been closed. It needs nothing to have been tapped first:
  // a new installation is already sending by the time this renders, so being told is the
  // only thing that makes that honest, and it cannot wait for a habit to be ticked.
  const shouldTellAboutCheckin = canCheckIn && !checkinNoticeSeen && checkinStart !== 'decided'

  // Showing the line is what marks it seen, so the condition that put it there answers no
  // a moment later. The session flag is what keeps it on screen until this window is
  // closed; the persisted one is what stops it coming back tomorrow.
  //
  // It waits for nothing and claims nothing, because it is not a question. The reminder's
  // offer is a question and goes first among questions; this says what the app is already
  // doing, and the one launch where it must appear is the first one, which on Android is
  // exactly the launch where the reminder is owed and cannot be put yet, because there are
  // no habits to be reminded about. Queuing there meant a new installation sent its first
  // check-in and said nothing, which is the one thing this default may not do. The
  // reminder's modal opens over it, and when that closes the line is still there.
  const noticeIsOpen = shouldTellAboutCheckin || checkinNoticeShown

  const shouldInvite = useMemo(
    () =>
      shouldInviteFeedback({
        today: formatDate(new Date()),
        firstOpenedAt,
        logs,
        feedbackInviteSeen,
        loggedThisSession,
        offerThisSession,
        reminderOfferPending: reminderOfferOwed,
        // The invitation waits for the line the way it waits for the reminder, and it
        // keeps waiting for the rest of the session once the line has been shown: an
        // installation that updates today could be due both, and two bands at once is two
        // too many. Reading only the persisted flag would not do it, because that one is
        // false again a moment after the line appears.
        checkinNoticePending: shouldTellAboutCheckin || checkinNoticeShown,
      }),
    [
      firstOpenedAt,
      logs,
      feedbackInviteSeen,
      loggedThisSession,
      offerThisSession,
      reminderOfferOwed,
      shouldTellAboutCheckin,
      checkinNoticeShown,
    ]
  )

  // Where there is a platform, the question opens itself. Derived and not set from an
  // effect, and the session flag is why it can be: putting the question spends it, so
  // `shouldInvite` answers no a moment later, and reading only that would close the dialog
  // on the frame after it opened. The check-in's line learned this the hard way.
  // Not while the day sheet is up. The gate opens on the tick, and the tick happens inside
  // that sheet, so without this the question arrives on top of it: two modals stacked, two
  // focus traps, and Escape closing both, in the one gesture the whole app is for.
  //
  // This defers rather than cancels, which is the part worth being sure about. The sheet
  // exists only while `selectedDate` is set, closing it clears that, and
  // `_loggedThisSession` stays true for the rest of the session. So the question appears
  // the moment the sheet is out of the way, and somebody who only ever ticks from the
  // sheet is still asked. Losing those people would undo #79, which lowered this gate
  // precisely because almost nobody reached it.
  // It also covers the way in from the menu, which is deliberate. Today it cannot be
  // reached with the sheet up, because the sheet covers the header, so nothing is lost.
  // If that ever changes, "Send feedback" would do nothing and say nothing, and this is
  // the line to come back to.
  const questionIsOpen =
    canCheckIn &&
    !questionClosed &&
    selectedDate === null &&
    (askedFromMenu || shouldInvite || feedbackAsked)

  // Today's check-in, if the switch is on and today has not been tried. Twice, because
  // there are two kinds of device: a phone is closed and opened again, which remounts
  // this; a desktop is left running for days, and the window coming back is the only
  // thing that says a new day has started. Whichever arrives second does nothing.
  useEffect(() => {
    if (!hasHydrated || !canCheckIn) return

    if (checkinStart === 'new') {
      void startCheckinOnNewInstall()
    } else {
      void sendCheckinIfDue()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sendCheckinIfDue()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hasHydrated, canCheckIn, checkinStart])

  // The carousel is the phone's. On a wide screen there is no finger to follow and the
  // sidebar is there instead, so the views keep changing the way they always did.
  const onPhone = !useMediaQuery('(min-width: 1024px)')
  const headerRef = useRef<HTMLElement>(null)
  const { containerRef, railRef, otherRef, travelTo } = useViewCarousel({
    view: currentView,
    onChange: (view) => setCurrentView(view, view === 'year' ? 'drill-up' : 'drill-down'),
    enabled: onPhone,
    headerRef,
  })

  // Null on the desktop, where every caller falls back to what it did before.
  const travel = useMemo(
    () =>
      onPhone
        ? {
            toYear: () => travelTo('year'),
            toMonth: (pick?: { year: number; month: number }) => {
              if (pick) {
                useCalendarStore.getState().setSelectedYear(pick.year)
                useCalendarStore.getState().setSelectedMonth(pick.month)
              }
              travelTo('month')
            },
          }
        : null,
    [onPhone, travelTo]
  )

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
      // say on day three does not have to wait for the app to ask.
      //
      // In the app it spends the question, because here pressing it *is* being asked: the
      // dialog opens, the fact that it was put is reported, and asking again later would
      // be asking a favour twice. On the web it spends nothing, and that difference is
      // not an inconsistency: opening a letter is not writing one, and this entry is easy
      // to press out of curiosity, so somebody who backed out of the chooser would lose
      // an invitation they never saw.
      onClick: () => {
        // In the app the question is the way in, and somebody who came looking for it is
        // not the same as somebody the app interrupted, which is why the origin travels.
        // In a browser there is no command to send through, and a browser is the one
        // place a mailto: actually opens something, so there the letter stays.
        if (canCheckIn) {
          setAskedFromMenu(true)
          setQuestionClosed(false)
          return
        }
        void openMailto(FEEDBACK_MAILTO).then((result) => {
          if (result === 'failed') {
            showToast('Could not open an email app. You can write to daylo@henfrydls.com.', 'error')
          }
        })
      },
    },
    ...(canCheckIn
      ? [
          {
            label: 'Anonymous check-in',
            icon: <BroadcastIcon className="w-4 h-4" aria-hidden="true" />,
            onClick: () => setIsCheckinOpen(true),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(updates.supported
      ? [
          {
            label: 'Check for new versions',
            icon: <RefreshIcon className="w-4 h-4" aria-hidden="true" />,
            // The dot is repeated here, and the words beside it are what a screen reader
            // gets: a dot on its own says nothing to anybody not looking at it.
            trailing:
              updateWaiting === null ? undefined : (
                <span className="ml-auto flex items-center gap-2">
                  <span className="sr-only">{`${updateWaiting} is out`}</span>
                  <UpdateDot />
                </span>
              ),
            onClick: () => setIsUpdatesOpen(true),
          } satisfies DropdownMenuItem,
        ]
      : []),
    { type: 'divider' },
    {
      type: 'info',
      label: `v${appVersion}`,
    },
  ]

  return (
    <ErrorBoundary>
      <TravelContext.Provider value={travel}>
        {/* A column the height of the screen, so the calendar can be told to take what
            is left of it. 100dvh and not 100vh: on a phone the browser's own bars come and
            go, and vh would measure the screen as if they were never there. min-h and not
            h, so a view taller than the screen still makes the page longer and still
            scrolls. The bottom inset is padding here, which keeps the card clear of the
            gesture bar on a phone that has one. */}
        <div className="flex min-h-[100dvh] flex-col bg-gray-50 pb-[env(safe-area-inset-bottom)]">
          {/* Skip Link for keyboard users */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-white focus:rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Skip to main content
          </a>

          {/* Header */}
          <header
            ref={headerRef}
            className="sticky top-0 z-30 bg-white pt-[env(safe-area-inset-top)]"
          >
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
                            className="relative p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={
                              updateWaiting === null
                                ? 'More options'
                                : 'More options, update available'
                            }
                          >
                            {updateWaiting === null ? null : (
                              <UpdateDot className="absolute right-1.5 top-1.5" />
                            )}
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
                            className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={
                              updateWaiting === null
                                ? 'More options'
                                : 'More options, update available'
                            }
                          >
                            {updateWaiting === null ? null : (
                              <UpdateDot className="absolute right-1.5 top-1.5" />
                            )}
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
            className="flex w-full max-w-7xl flex-1 flex-col self-center px-3 sm:px-4 py-4 sm:py-6"
            tabIndex={-1}
          >
            {/* Under the header and above the calendar: the only place visible on every
              screen without scrolling, and the same place on a phone and on a desktop. */}
            {/* A new installation is on by the time anybody can read this: the effect that
              turns it on runs in the same tick, but effects run after the first paint, and
              a line that said "Anonymous check-in is off." for one frame and then
              corrected itself would be the app contradicting itself in public. */}
            {noticeIsOpen ? (
              <CheckinNotice
                on={checkinEnabled || checkinStart === 'new'}
                onOpen={() => setIsCheckinOpen(true)}
              />
            ) : null}

            {/* Under the check-in's line on the rare launch that has both, because that one
              is about what the app is already doing and this one is about something it
              could do. Neither waits for the other: they are lines to be read past, not
              questions, and the rule against two at once is the invitation's, which does
              ask something. */}
            {updates.notice === null ? null : (
              <UpdateNotice state={updates.notice} onAct={updates.act} onLater={updates.later} />
            )}

            {/* flex-1 so the grid takes the rest of the column, and the card inside it
                fills that on a phone. Before this, a short view left grey below the card:
                the gesture does not live there, so dragging in it did nothing, and the
                card jumped to the other view's height the moment a drag revealed it.
                On a wide screen the sidebar sets the height and none of this applies. */}
            <div className="grid flex-1 grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Calendar Section */}
              <div
                ref={containerRef}
                className="min-h-full lg:min-h-0 lg:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden touch-pan-y"
              >
                {onPhone ? (
                  // Both views, side by side, in the order the toggle shows them: Year on the
                  // left, Month on the right. The one that is not in flow sits beside it and
                  // is hidden from everything, eyes and screen readers alike, until a gesture
                  // reveals it. No key here on purpose: nothing remounts, because a view that
                  // remounts cannot be dragged.
                  <div ref={railRef} className="relative">
                    <div>{currentView === 'year' ? <YearView /> : <MonthView />}</div>
                    <div
                      ref={otherRef}
                      className="absolute w-full"
                      style={{
                        left: currentView === 'year' ? '100%' : '-100%',
                        visibility: 'hidden',
                      }}
                      aria-hidden="true"
                      inert
                    >
                      {currentView === 'year' ? <MonthView /> : <YearView />}
                    </div>
                  </div>
                ) : (
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
                )}
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
          {/* Always mounted: it has to be on the page before the day is chosen, or there
              is no frame for it to come up from, and it has to stay there after the day is
              cleared, or it has nowhere to go back to. It renders nothing when closed. */}
          <QuickLog />

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

          {/* The question, wherever it came from. Unmounted when it closes, so the number
            it carries goes with it rather than being cleared by anybody. Behind a Suspense
            with no fallback: it is asked for by a gate that has already waited a week, so
            a few milliseconds more while it loads are nothing, and a spinner in its place
            would announce a question nobody asked for yet. */}
          <Suspense fallback={null}>
            {questionIsOpen && (
              <FeedbackRating
                isOpen
                onShown={(answer) => {
                  markFeedbackAsked()
                  void sendShown(answer, askedFromMenu ? 'menu' : 'automatic')
                }}
                onClose={() => {
                  setQuestionClosed(true)
                  setAskedFromMenu(false)
                }}
                onRate={(answer, stars) => void sendRating(answer, stars)}
                // The star left the moment it was pressed and needs no receipt. This one was
                // asked for, by somebody who wrote something and pressed a button, and the
                // reason this dialog exists at all is a channel that failed without saying so.
                // The dialog waits on this and says so itself. It used to raise a toast, which
                // the dialog's own portal draws over, so the one message that mattered
                // appeared behind the thing covering it.
                onComment={sendComment}
                withCheckinId={checkinEnabled && checkinId !== null}
              />
            )}
          </Suspense>

          {isUpdatesOpen && (
            <UpdateSettings
              isOpen={isUpdatesOpen}
              onClose={() => setIsUpdatesOpen(false)}
              status={updates.status}
              // Closing first, because the answer to "Update" is the card's progress and
              // this sheet is drawn over it. Nothing is lost: the card is where it happens.
              onAct={() => {
                if (updates.status.kind === 'available') setIsUpdatesOpen(false)
                updates.act()
              }}
            />
          )}

          {/* The check-in: the switch behind the menu, and nothing else. It never asks. */}
          {isCheckinOpen && (
            <CheckinSettings isOpen={isCheckinOpen} onClose={() => setIsCheckinOpen(false)} />
          )}

          {/* Toast Notifications */}
          <ToastContainer />
        </div>
      </TravelContext.Provider>
    </ErrorBoundary>
  )
}

export default App
