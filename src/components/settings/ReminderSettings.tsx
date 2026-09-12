import { useState } from 'react'
import { Modal, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { disableReminder, enableReminder, formatReminderTime } from '../../lib/reminders'

interface ReminderSettingsProps {
  isOpen: boolean
  onClose: () => void
}

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
      <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7-5.2v-5.3c0-3.2-1.8-5.9-4.8-6.6v-.7a1.7 1.7 0 0 0-3.4 0v.7C7.8 5.6 6 8.3 6 11.5v5.3l-1.6 1.6v.8h15.2v-.8L19 16.8Z" />
      {on ? null : <path d="M3.4 2 22 20.6l-1.4 1.4L2 3.4 3.4 2Z" />}
    </svg>
  )
}

/**
 * The daily reminder, as one decision and one number.
 *
 * There is no checkbox and no Done. Somebody told us why: "I set the time and press Done,
 * and only then notice I also have to tick the box." Three controls for one decision, and
 * the one that looked like the commit was only a close button. So the button that commits
 * says what committing does, with the time in it, and the state is stated in words above
 * rather than left to be read off a control's position.
 */
export function ReminderSettings({ isOpen, onClose }: ReminderSettingsProps) {
  const enabled = useCalendarStore((s) => s.reminderEnabled)
  const hour = useCalendarStore((s) => s.reminderHour)
  const minute = useCalendarStore((s) => s.reminderMinute)
  const setReminder = useCalendarStore((s) => s.setReminder)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const at = formatReminderTime(hour, minute)

  // Changes take effect as they are made, the way a phone's own settings behave. The store
  // is only written once the platform has agreed, so a refusal cannot leave this claiming
  // a reminder that was never scheduled.
  const turnOn = async (nextHour: number, nextMinute: number) => {
    setBusy(true)
    try {
      const { outcome, reason } = await enableReminder(nextHour, nextMinute)
      if (outcome === 'on') {
        setFailure(null)
        setReminder(true, nextHour, nextMinute)
        return
      }
      if (outcome === 'permission-denied') {
        showToast('Daylo needs permission to send notifications', 'error')
      }
      if (outcome === 'failed') {
        showToast('Daylo could not set the reminder on this phone', 'error')
        setFailure(reason ?? 'the phone did not say why')
      }
      setReminder(false, nextHour, nextMinute)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await disableReminder()
      setFailure(null)
      setReminder(false, hour, minute)
    } finally {
      setBusy(false)
    }
  }

  // While it is on, a new time is scheduled the moment it is picked: the time picker's own
  // OK is the confirmation, and there is nothing left to press. While it is off, the time
  // is only remembered, because there is nothing to reschedule.
  const changeTime = (nextHour: number, nextMinute: number) => {
    if (enabled) {
      void turnOn(nextHour, nextMinute)
      return
    }
    setReminder(false, nextHour, nextMinute)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Daily reminder" data-testid="reminder-settings">
      <div className="space-y-4">
        {/* Said in words. A person should not have to work out whether it is on from the
            position of a switch. */}
        <div
          className={`rounded-lg border p-3 ${
            enabled ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
          }`}
          data-testid="reminder-status"
        >
          <div
            className={`flex items-center gap-2 font-semibold ${
              enabled ? 'text-emerald-700' : 'text-gray-500'
            }`}
          >
            <BellIcon on={enabled} />
            <span>{enabled ? 'Reminder is on' : 'Reminder is off'}</span>
          </div>

          {enabled ? (
            <p className="mt-1 text-sm text-gray-600" data-testid="reminder-time-note">
              Around {at}. Android picks the exact moment and may deliver it an hour or more later.
            </p>
          ) : null}

          {/* The phone's own words, untranslated. A release build writes nothing to any log
              that leaves the device, so if this is not on screen it is nowhere. */}
          {failure ? (
            <p className="mt-1 text-xs break-words text-red-600" data-testid="reminder-failure">
              Could not set the reminder: {failure}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Time</span>
          {/* The native picker does the work; this is what it looks like from outside. The
              input covers the row so a tap anywhere in it opens the picker, and the row
              carries the focus ring because the input itself has nothing to show. */}
          <div className="relative rounded-lg border border-gray-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500">
            <div
              className="flex min-h-[44px] items-center justify-between px-3 py-2"
              aria-hidden="true"
            >
              <span className="text-lg font-semibold text-gray-900">{at}</span>
              <span className="text-sm font-medium text-emerald-700">Change</span>
            </div>
            <input
              id="reminder-time"
              type="time"
              aria-label="Reminder time"
              value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
              disabled={busy}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                if (Number.isNaN(h) || Number.isNaN(m)) return
                changeTime(h, m)
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:outline-none"
              data-testid="reminder-time"
            />
          </div>
          {enabled ? (
            <p className="mt-1 text-xs text-gray-500">
              A new time takes effect as soon as you pick it.
            </p>
          ) : null}
        </div>

        {enabled ? (
          <button
            type="button"
            onClick={() => void turnOff()}
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus:outline-none disabled:opacity-50"
            data-testid="reminder-stop"
          >
            Stop reminders
          </button>
        ) : (
          // The button says what pressing it does, with the time in it: the two halves of
          // the question somebody had to guess at before.
          <button
            type="button"
            onClick={() => void turnOn(hour, minute)}
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus:outline-none disabled:opacity-50"
            data-testid="reminder-start"
          >
            Remind me at {at}
          </button>
        )}
      </div>
    </Modal>
  )
}
