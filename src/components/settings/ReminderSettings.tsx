import { useState } from 'react'
import { Button, Modal, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { disableReminder, enableReminder, formatReminderTime } from '../../lib/reminders'

interface ReminderSettingsProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * The daily reminder, as one decision and one number.
 *
 * There is no checkbox and no Done. Somebody told us why: "I set the time and press Done,
 * and only then notice I also have to tick the box." Three controls for one decision, and
 * the one that looked like the commit was only a close button. So the button that commits
 * says what committing does, with the time in it, and the state is stated in words rather
 * than left to be read off a control's position.
 *
 * It borrows the rest from the Export dialog rather than inventing a look: the same
 * padding, the same 14px medium button in the modal's own footer, nothing larger than the
 * title, and no filled panels. The first attempt used its own sizes and weights and was
 * told, correctly, that it did not feel like the app. The only colour is one dot, and it
 * moves: on the button while the reminder is off, and up to the status once it is on, so
 * there is exactly one green thing on screen at a time.
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily reminder"
      data-testid="reminder-settings"
      footer={
        <div className="flex justify-end">
          {enabled ? (
            <Button
              variant="secondary"
              onClick={() => void turnOff()}
              disabled={busy}
              data-testid="reminder-stop"
            >
              Stop reminders
            </Button>
          ) : (
            // The button says what pressing it does, with the time in it: the two halves of
            // the question somebody had to guess at before.
            <Button
              onClick={() => void turnOn(hour, minute)}
              disabled={busy}
              data-testid="reminder-start"
            >
              Remind me at {at}
            </Button>
          )}
        </div>
      }
    >
      <div>
        {/* Said in words, with one dot for the colour. A person should not have to work out
            whether it is on from the position of a control. */}
        <div className="flex items-start gap-2" data-testid="reminder-status">
          <span
            className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
              enabled ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-gray-900">{enabled ? 'Reminder is on' : 'Reminder is off'}</p>

            {enabled ? (
              <p className="mt-0.5 text-sm text-gray-500" data-testid="reminder-time-note">
                Around {at}. Android picks the exact moment and may deliver it an hour or more
                later.
              </p>
            ) : null}

            {/* The phone's own words, untranslated. A release build writes nothing to any
                log that leaves the device, so if this is not on screen it is nowhere. */}
            {failure ? (
              <p className="mt-0.5 text-sm break-words text-red-600" data-testid="reminder-failure">
                Could not set the reminder: {failure}
              </p>
            ) : null}
          </div>
        </div>

        {/* The native picker does the work; this is what it looks like from outside. The
            input covers the row so a tap anywhere in it opens the picker, and the row
            carries the focus ring because the input itself has nothing to show. */}
        <div className="relative mt-4 rounded-lg border border-gray-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500">
          <div
            className="flex min-h-[44px] items-center justify-between px-4 py-3"
            aria-hidden="true"
          >
            <span className="text-gray-900">{at}</span>
            <span className="flex items-center gap-1 text-sm text-gray-500">
              Change
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m9 5 7 7-7 7"
                />
              </svg>
            </span>
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
      </div>
    </Modal>
  )
}
