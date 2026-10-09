import { useState, useEffect, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react'
import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import {
  BottomSheet,
  BellIcon,
  GearIcon,
  MoreIcon,
  DropdownMenu,
  ErrorBoundary,
  ToastContainer,
  useToast,
} from './components/ui'
import type { DropdownMenuItem } from './components/ui'
import { AppSkeleton } from './components/skeletons'
import { CheckinNotice, DailyReminder, Settings } from './components/settings'
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
  // Whether each one has ever been asked for, which is what decides if it is in the page
  // at all. See where they are rendered for why it is not simply whether it is open.
  const [exportAsked, setExportAsked] = useState(false)
  const [importAsked, setImportAsked] = useState(false)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  // One surface for everything there is to decide, and one flag for it. Reminders first
  // when that is what was asked for, which is the only thing the menu still chooses.
  const [settings, setSettings] = useState<'closed' | 'open'>('closed')
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

  /**
   * The question, asked because somebody went looking for it.
   *
   * Kept whole from the menu entry this replaced, including the difference between the
   * application and the web. In the application pressing it **spends** the question: the
   * dialog opening *is* being asked, and asking again later would be asking a favour
   * twice. On the web it spends nothing, and that is not an inconsistency: opening a
   * letter is not writing one, and somebody who backed out of the chooser would otherwise
   * lose an invitation they never saw.
   */
  const askForFeedback = () => {
    // In the app the question is the way in, and somebody who came looking for it is not
    // the same as somebody the app interrupted, which is why the origin travels. In a
    // browser there is no command to send through, and a browser is the one place a
    // mailto: actually opens something, so there the letter stays.
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
  }

  /**
   * Two entries, and only where the reminder exists.
   *
   * Everything else that used to be here is in Settings now. Where there is no reminder
   * this list would have one item, and a menu with one item is a button wearing a hat: the
   * header puts the gear there instead and Settings opens with one press.
   */
  /**
   * What sits in the corner of the header: a gear, or the menu where there are two things.
   *
   * Not a width: the reminder is the only entry Settings does not swallow, and it exists
   * on Android alone. So wherever there is no reminder the menu would be a list of one,
   * which is a button with extra steps, and the gear opens Settings in a single press. The
   * dot for a waiting version rides on whichever of the two is there.
   */
  const headerControl = (pad: string) => {
    const label = updateWaiting === null ? 'Settings' : 'Settings, update available'
    // The gear is the control itself where it opens Settings in one press; where it opens a
    // menu it is three dots, because the thing behind it is a choice and not a destination.
    const inside = (icon: ReactNode) => (
      <>
        {updateWaiting === null ? null : <UpdateDot className="absolute right-1.5 top-1.5" />}
        {icon}
      </>
    )
    const shape = `relative ${pad} rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center`

    if (!hasReminders) {
      return (
        <button
          type="button"
          onClick={() => setSettings('open')}
          className={`${shape} focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
          aria-label={label}
          data-testid="settings-button"
        >
          {inside(<GearIcon className="w-5 h-5" aria-hidden="true" />)}
        </button>
      )
    }
    return (
      <DropdownMenu
        trigger={
          <span
            className={shape}
            aria-label={updateWaiting === null ? 'More options' : 'More options, update available'}
          >
            {inside(<MoreIcon className="w-5 h-5" aria-hidden="true" />)}
          </span>
        }
        items={menuItems}
      />
    )
  }

  const menuItems: DropdownMenuItem[] = [
    {
      label: 'Daily reminder',
      icon: <BellIcon className="w-4 h-4" aria-hidden="true" />,
      onClick: () => setSettings('open'),
    },
    {
      label: 'Settings',
      icon: <GearIcon className="w-4 h-4" aria-hidden="true" />,
      onClick: () => setSettings('open'),
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
                    <div className="sm:hidden">{headerControl('p-2.5')}</div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <ViewToggle />
                    {/* Menu button hidden on mobile, visible on larger screens */}
                    <div className="hidden sm:block">{headerControl('p-2')}</div>
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
                onOpen={() => setSettings('open')}
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

          {/* Export and Import, which are loaded the first time they are asked for and
              then stay. Not `{isExportOpen && ...}`: with that, the prop can never be
              false while the component exists, so the dialog is born open and has no frame
              to come up from, and it is taken out of the page the instant it closes, so
              the frames where it goes down never happen. Measured before and after, frame
              by frame, in e2e/dialog.spec.ts.

              Staying costs a dialog that renders null, and keeps the lazy chunk off the
              first paint, which is why it is "has been asked for" and not "always". */}
          <Suspense fallback={null}>
            {exportAsked && (
              <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
            )}
          </Suspense>
          <Suspense fallback={null}>
            {importAsked && (
              <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
            )}
          </Suspense>

          {/* Daily reminder: the one-time offer. The setting itself is in Settings now. */}
          <DailyReminder />

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

          {/* Everything there is to decide. Export and Import still open their own dialogs
              over it, because they were dialogs before this existed and still ask a
              question of their own. */}
          <Settings
            isOpen={settings === 'open'}
            onClose={() => setSettings('closed')}
            onExport={() => {
              setExportAsked(true)
              setIsExportOpen(true)
            }}
            onImport={() => {
              setImportAsked(true)
              setIsImportOpen(true)
            }}
            onFeedback={askForFeedback}
            hasReminders={hasReminders}
            canCheckIn={canCheckIn}
            version={appVersion}
            updates={{
              supported: updates.supported,
              status: updates.status,
              waiting: updateWaiting,
              check: updates.check,
              // Closing first, because the answer to "Update" is the card's progress and
              // this panel is drawn over it. Nothing is lost: the card is where it happens.
              install: () => {
                setSettings('closed')
                updates.act()
              },
            }}
          />

          {/* Toast Notifications */}
          <ToastContainer />
        </div>
      </TravelContext.Provider>
    </ErrorBoundary>
  )
}

export default App
