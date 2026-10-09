import { useRef, type ReactNode } from 'react'
import { useCalendarStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import {
  useAnimatedPresence,
  useArrival,
  useCheckinFields,
  useDailyReminder,
  useFocusTrap,
  useKeyboardRing,
} from '../../hooks'
import { ChevronLeftIcon, ChevronRightIcon, Switch, XIcon } from '../ui'
import { WhatGetsSent } from './WhatGetsSent'
import { turnOffCheckin, turnOnCheckin } from '../../lib/checkin'
import { isTauri } from '@tauri-apps/api/core'
import { openLink } from '../../lib/openLink'
import type { UpdateStatus } from '../../hooks/useUpdates'

/** How long the panel takes to arrive and to leave. */
const TAKES = 250

const WEBSITE = 'https://daylo.henfrydls.com'
const SOURCE = 'https://github.com/henfrydls/daylo'
const LICENSE = 'https://github.com/henfrydls/daylo/blob/main/LICENSE'
const PRIVACY = 'https://daylo.henfrydls.com/privacy/'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  onExport: () => void
  onImport: () => void
  /** The same thing the menu entry did, kept whole: in the app it spends the question. */
  onFeedback: () => void
  /** Only Android has them, and the section is not there otherwise. */
  hasReminders: boolean
  /** False on the web and wherever the check-in was compiled out. */
  canCheckIn: boolean
  updates: {
    supported: boolean
    status: UpdateStatus
    /** The version waiting, for the small word beside the number. */
    waiting: string | null
    /** Ask. Never installs, whatever has been found. */
    check: () => void
    /** Install, which closes Daylo and opens it again. */
    install: () => void
  }
  version: string
}

/** A heading with, sometimes, a quiet fact on its right. */
function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: ReactNode
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {aside === undefined ? null : <p className="text-sm text-gray-500">{aside}</p>}
      </div>
      <div className="mt-2 divide-y divide-gray-200">{children}</div>
    </section>
  )
}

/** A row that goes somewhere, or does something, with a chevron to say so. */
function GoRow({
  label,
  onClick,
  testId,
}: {
  label: string
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-left text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span>{label}</span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  )
}

/** A row that is a switch, with its own line of explanation under the name. */
function SwitchRow({
  label,
  under,
  note,
  checked,
  onChange,
  busy = false,
  testId,
}: {
  label: string
  under?: string
  /** What it costs, under what it is. Read out with the switch, not left to be found. */
  note?: string
  checked: boolean
  onChange: (next: boolean) => void
  busy?: boolean
  testId?: string
}) {
  const id = `settings-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-gray-900">{label}</p>
        {under === undefined ? null : (
          <p id={id} className="mt-0.5 text-sm text-gray-500">
            {under}
          </p>
        )}
        {note === undefined ? null : (
          <p id={`${id}-note`} className="mt-0.5 text-sm text-gray-500">
            {note}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        label={label}
        describedBy={[under === undefined ? null : id, note === undefined ? null : `${id}-note`]
          .filter(Boolean)
          .join(' ')}
        disabled={busy}
        data-testid={testId}
      />
    </div>
  )
}

/**
 * Everything there is to decide, on one surface.
 *
 * A panel on the right where there is room for one, and the whole screen where there is
 * not, which is a width and not a platform: a narrow browser window gets the same thing a
 * phone does. One surface either way, with nothing opening on top of it except the two
 * things that were already their own dialogs, Export and Import.
 */
export function Settings({
  isOpen,
  onClose,
  onExport,
  onImport,
  onFeedback,
  hasReminders,
  canCheckIn,
  updates,
  version,
}: SettingsProps): ReactNode {
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, TAKES)
  const arrived = useArrival(isVisible)
  const surfaceRef = useRef<HTMLDivElement>(null)
  useFocusTrap(surfaceRef, isOpen, { onEscape: onClose, autoFocus: false })

  const counts = useCalendarStore(
    useShallow((s) => ({ activities: s.activities.length, logs: s.logs.length }))
  )
  const checkinEnabled = useCalendarStore((s) => s.checkinEnabled)
  const checkinId = useCalendarStore((s) => s.checkinId)
  const checkinFields = useCheckinFields()
  const updatesEnabled = useCalendarStore((s) => s.updatesEnabled)
  const setUpdatesEnabled = useCalendarStore((s) => s.setUpdatesEnabled)
  const reminder = useDailyReminder()
  // The time field decides its own ring: see useKeyboardRing for why the browser cannot.
  const ring = useKeyboardRing(isOpen)

  if (!shouldRender) return null

  const say = (plural: number, one: string, many: string) => (plural === 1 ? one : many)
  const held = `${counts.activities} ${say(counts.activities, 'activity', 'activities')}, ${counts.logs} ${say(counts.logs, 'entry', 'entries')}`

  return (
    <div className="fixed inset-0 z-50" data-testid="settings">
      {/* The page behind, dimmed only where it is still visible. */}
      <div
        className={`absolute inset-0 hidden transition-opacity duration-[250ms] sm:block ${
          arrived ? 'bg-black/10 opacity-100' : 'bg-black/10 opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        data-testid="settings-surface"
        className={`absolute inset-0 overflow-y-auto bg-white motion-safe:transition-[translate,transform,opacity] motion-safe:duration-[250ms] motion-safe:ease-[var(--ease-emphasized-decel)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[25rem] sm:border-l sm:border-gray-200 sm:shadow-xl ${
          arrived ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
        }`}
      >
        {/* Clear of the notch at the top and of the system's gesture strip at the bottom:
            this surface is fixed to the viewport, so it is outside the wrapper that keeps
            the rest of the app clear of both. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 sm:pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            data-testid="settings-close"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:order-last sm:-mr-2 sm:ml-auto"
          >
            <ChevronLeftIcon className="h-5 w-5 sm:hidden" aria-hidden="true" />
            <XIcon className="hidden h-5 w-5 sm:block" aria-hidden="true" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        </div>

        <div
          data-testid="settings-scroller"
          className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5 sm:px-5"
        >
          {hasReminders ? (
            <Section title="Reminders">
              <SwitchRow
                label="Daily reminder"
                under={reminder.enabled ? `At ${reminder.at}` : 'Off'}
                checked={reminder.enabled}
                busy={reminder.busy}
                testId="reminder-switch"
                onChange={(next) => {
                  if (next) void reminder.turnOn(reminder.hour, reminder.minute)
                  else void reminder.turnOff()
                }}
              />
              {/* Only once there is a reminder to have a time. A row asking when to send
                  something that is not being sent is a question about nothing, and the
                  line about Android's timing is advice nobody needs yet.

                  Folded with grid rows rather than a height, because the height of this is
                  whatever the time field and a line of text come to, and a number written
                  here would be wrong the first time either of them changed. It is inert
                  while it is away, so a collapsed field is not something Tab finds. */}
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-[var(--ease-emphasized-decel)] motion-reduce:transition-none ${
                  reminder.enabled ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
                data-testid="reminder-details"
              >
                <div
                  className="overflow-hidden"
                  inert={!reminder.enabled}
                  aria-hidden={reminder.enabled ? undefined : 'true'}
                >
                  <div className="flex min-h-[48px] items-center justify-between gap-3 border-t border-gray-200 py-3">
                    <label htmlFor="reminder-time" className="text-gray-900">
                      Time
                    </label>
                    <input
                      id="reminder-time"
                      type="time"
                      value={`${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number)
                        if (Number.isFinite(h) && Number.isFinite(m)) reminder.changeTime(h, m)
                      }}
                      onFocus={ring.onFocus}
                      onBlur={ring.onBlur}
                      data-testid="reminder-time"
                      className={`rounded-lg bg-transparent px-2 py-1 text-right text-gray-500 focus:outline-none ${
                        ring.visible ? 'ring-2 ring-emerald-500' : ''
                      }`}
                    />
                  </div>
                  <p className="pb-3 text-sm text-gray-500">
                    Android may deliver it a few minutes late.
                  </p>
                </div>
              </div>
              {reminder.failure === null ? null : (
                <p className="py-3 text-sm text-gray-500">{`The phone would not set it: ${reminder.failure}`}</p>
              )}
            </Section>
          ) : null}

          <Section title="Data" aside={held}>
            <GoRow label="Export" onClick={onExport} testId="settings-export" />
            <GoRow label="Import" onClick={onImport} testId="settings-import" />
          </Section>

          <Section title="Privacy">
            {canCheckIn ? (
              <>
                <SwitchRow
                  label="Anonymous check-in"
                  under="Says the app is still in use. Nothing about what you track."
                  note="Turning it off deletes the random number."
                  checked={checkinEnabled}
                  testId="checkin-switch"
                  onChange={(next) => {
                    if (next) void turnOnCheckin()
                    else void turnOffCheckin()
                  }}
                />
                <div className="py-1">
                  <WhatGetsSent fields={checkinFields} id={checkinId} />
                </div>
              </>
            ) : null}
            {updates.supported ? (
              <SwitchRow
                label="Check for new versions"
                under="Asks GitHub. Nothing about you."
                checked={updatesEnabled}
                testId="updates-switch"
                onChange={setUpdatesEnabled}
              />
            ) : null}
            <div className="py-3">
              <p className="text-gray-900">Feedback</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Only what you type, and only when you press Send.
              </p>
            </div>
            {/* The long version, at the end of the short one. It was only in the footer
                among the other links, where somebody reading this section to decide
                something would not have looked for it. */}
            <AwayRow href={PRIVACY} label="Privacy policy" testId="settings-privacy" />
          </Section>

          <Section title="About">
            <div className="flex min-h-[48px] items-center justify-between gap-3 py-3">
              {updates.supported ? (
                // The whole row asks and never installs: it is wide, it is in a list
                // somebody scrolls with a thumb, and installing closes Daylo and opens it
                // again. Only the word beside the number does that.
                <button
                  type="button"
                  onClick={updates.check}
                  data-testid="settings-check"
                  className="-mx-1 flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-lg px-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span className="text-gray-900">Version</span>
                  <span className="flex items-center gap-3">
                    <span className="text-gray-500">{version}</span>
                  </span>
                </button>
              ) : (
                <>
                  <span className="text-gray-900">Version</span>
                  <span className="text-gray-500">{version}</span>
                </>
              )}
              {updates.waiting === null ? null : (
                <button
                  type="button"
                  onClick={updates.install}
                  data-testid="settings-update"
                  className="min-h-[44px] rounded-lg px-2 text-sm font-medium text-emerald-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Update
                </button>
              )}
            </div>
            {/* Under the version rather than beside it, and taking no room when there is
                nothing to say: a row of its own left an empty band with a line above and
                below it, which reads as something missing. The element stays in the page
                either way, because a live region that arrives at the same moment as its
                text is one most screen readers do not read. */}
            <div className="py-3" hidden={said(updates.status) === ''}>
              <p
                className="text-sm text-gray-500"
                aria-live="polite"
                data-testid="settings-update-status"
              >
                {said(updates.status)}
              </p>
            </div>
            <div className="py-3">
              <p className="text-gray-900">Made by DLSLabs</p>
              <p className="mt-0.5 text-sm text-gray-500">Henfry De Los Santos</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 py-3 text-sm">
              <Away href={WEBSITE}>Website</Away>
              <Away href={SOURCE}>Source code</Away>
              <Away href={LICENSE}>License</Away>
              <button
                type="button"
                onClick={onFeedback}
                data-testid="settings-feedback"
                className="font-medium text-emerald-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Send feedback
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

/** Nothing at all when nothing is known: a screen that opens knowing nothing claims nothing. */
function said(status: UpdateStatus): string {
  switch (status.kind) {
    case 'checking':
      return 'Checking…'
    case 'up-to-date':
      return 'Daylo is up to date.'
    case 'available':
      return `Daylo ${status.version} is out.`
    case 'working':
      return 'Daylo is updating itself.'
    case 'restart':
      return 'Done. Restart Daylo to finish.'
    case 'failed':
      return 'Could not check just now.'
    case 'idle':
      return ''
  }
}

/** A row that leaves Daylo, shaped like the rows it sits among. */
function AwayRow({ href, label, testId }: { href: string; label: string; testId?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      onClick={(event) => {
        if (!isTauri()) return
        event.preventDefault()
        void openLink(href)
      }}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span>{label}</span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </a>
  )
}

/** A link that leaves Daylo, which inside the application must not happen in the window. */
function Away({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        // Decided now, not when the opening finishes: by then the webview has already
        // followed the link, and preventing a default that has happened prevents nothing.
        if (!isTauri()) return
        event.preventDefault()
        void openLink(href)
      }}
      className="font-medium text-emerald-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      {children}
    </a>
  )
}
