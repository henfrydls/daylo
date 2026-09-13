import { useEffect, useRef, useState } from 'react'
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
 * There is no checkbox. Somebody told us why: "I set the time and press Done, and only
 * then notice I also have to tick the box." Three controls for one decision, and the one
 * that looked like the commit was only a close button. So the button that commits says
 * what committing does, with the time in it.
 *
 * There is a Done, but only where one is true. Somebody else opened this with the
 * reminder already on, moved the time, and found nothing but "Stop reminders" underneath:
 * "no había como un aceptar, qué sé yo". So the finish appears exactly when something has
 * been finished — the reminder is on and its time was moved in this sitting — and never
 * otherwise, because a Done in a sheet where nothing has happened is the close button
 * wearing a costume, which is what was removed in the first place.
 *
 * It does not save. The new time is already scheduled by the time the button exists; the
 * picker's own OK did that. Nothing can be lost by closing any other way, and every way
 * of closing calls the same thing.
 *
 * The status line carries the whole state, and the same person is why it is a sentence
 * about what is happening rather than a label: he did not notice "Reminder is on". On and
 * off now differ in shape as well as in words, two lines against one, which is read before
 * anything is parsed.
 *
 * It borrows the rest from the Export dialog rather than inventing a look: the same
 * padding, the same 14px medium buttons in the modal's own footer, nothing larger than the
 * title, and no filled panels. The first attempt used its own sizes and weights and was
 * told, correctly, that it did not feel like the app. The only colour is one dot, and it
 * moves: on the button while the reminder is off, and up to the status once it is on. The
 * one place two green things meet is the moment after the time is changed, where Done is
 * green because the owner of the app asked for the button that finishes to read as the
 * main one. Stop steps back to a ghost to let it lead.
 */
export function ReminderSettings({ isOpen, onClose }: ReminderSettingsProps) {
  const enabled = useCalendarStore((s) => s.reminderEnabled)
  const hour = useCalendarStore((s) => s.reminderHour)
  const minute = useCalendarStore((s) => s.reminderMinute)
  const setReminder = useCalendarStore((s) => s.setReminder)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Whether to draw the focus ring on the time row, which the browser cannot be left to
  // decide here. Chromium treats any control you could type into as always focus-visible,
  // tap or not: measured side by side, an input[type=time] matches :focus-visible after a
  // touch tap and a button does not. So `has-[:focus-visible]` lit the row up on every
  // tap and left it lit, which is the same green ring a phone already complained about
  // once on the Year and Month buttons.
  //
  // The rule is the one the rest of the app follows: rings are for keyboards. What decides
  // it is the last thing the person did, not how this particular focus arrived, and that
  // distinction is the whole reason it is written this way: the native time picker takes
  // over the screen and hands focus back when it closes, and a focus handed back by the
  // platform is not a pointer event. Reading the last interaction instead means the ring
  // stays off through the entire tap-pick-close round, and comes on for a Tab.
  const [ringVisible, setRingVisible] = useState(false)
  const lastInteraction = useRef<'pointer' | 'keyboard'>('pointer')

  useEffect(() => {
    if (!isOpen) return
    const pointer = () => {
      lastInteraction.current = 'pointer'
    }
    const keyboard = () => {
      lastInteraction.current = 'keyboard'
    }
    // Capture, so this hears the interaction whatever else stops it on the way down.
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [isOpen])

  // Whether a reschedule has happened since this sheet was opened, which is the only thing
  // Done is there to conclude. Not "the time differs from the one it had": moving the time
  // and moving it back is still two reschedules, and the sheet should not pretend nothing
  // occurred. Reset on opening, so a Done never survives from a previous sitting.
  const [timeMoved, setTimeMoved] = useState(false)

  useEffect(() => {
    if (isOpen) setTimeMoved(false)
  }, [isOpen])

  const at = formatReminderTime(hour, minute)

  // Changes take effect as they are made, the way a phone's own settings behave. The store
  // is only written once the platform has agreed, so a refusal cannot leave this claiming
  // a reminder that was never scheduled.
  const turnOn = async (nextHour: number, nextMinute: number, fromPicker = false) => {
    setBusy(true)
    try {
      const { outcome, reason } = await enableReminder(nextHour, nextMinute)
      if (outcome === 'on') {
        setFailure(null)
        setReminder(true, nextHour, nextMinute)
        // Only a reschedule the platform accepted, and only one the picker asked for.
        // A refusal falls through to the branches below and leaves this alone: a finish
        // offered over a reminder that is not running would be a lie.
        if (fromPicker) setTimeMoved(true)
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
      void turnOn(nextHour, nextMinute, true)
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
        // Right-aligned and at their own width, not the half-and-half of the Export
        // dialog: there the two options are a harmless choice between each other, here one
        // of them stops the reminder. It also puts Done at the edge and Stop to its left,
        // so a thumb going where Stop used to be lands on the button that only closes.
        <div className="flex justify-end gap-3">
          {enabled ? (
            <>
              <Button
                variant={timeMoved ? 'ghost' : 'secondary'}
                onClick={() => void turnOff()}
                disabled={busy}
                data-testid="reminder-stop"
              >
                Stop reminders
              </Button>
              {timeMoved ? (
                // Never disabled, because it has nothing to wait for: the reschedule it
                // concludes has already happened.
                //
                // Green, at the owner's word. The design had it grey, on the grounds that
                // while the reminder is on the green is already spoken for by the status
                // dot and the app allows one green thing at a time. He looked at it and
                // wanted the button that finishes to read as the main one, which is his
                // call to make about his own app.
                <Button onClick={onClose} data-testid="reminder-done">
                  Done
                </Button>
              ) : null}
            </>
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
            whether it is on from the position of a control — and one did not work it out
            from a three letter word and an 8px dot, which is why the first line is now a
            sentence about what is happening, carries the time, and is the only medium
            weight text in the body. */}
        <div className="flex items-start gap-2" data-testid="reminder-status">
          <span
            className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
              enabled ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          {/* Spoken after the picker closes, because the sentence rewriting itself is the
              whole acknowledgement that the time moved. Focus stays where it is. */}
          <div className="min-w-0" aria-live="polite">
            <p className="font-medium text-gray-900">
              {enabled ? `Reminding you daily at ${at}` : 'Reminder is off'}
            </p>

            {enabled ? (
              <p className="mt-0.5 text-sm text-gray-500" data-testid="reminder-time-note">
                Android picks the exact moment: usually close, later if the phone has been asleep.
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
        <div
          className={`relative mt-4 rounded-lg border border-gray-200 ${
            ringVisible ? 'ring-2 ring-emerald-500' : ''
          }`}
          data-testid="reminder-time-row"
        >
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
            onFocus={() => setRingVisible(lastInteraction.current === 'keyboard')}
            onBlur={() => setRingVisible(false)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:outline-none"
            data-testid="reminder-time"
          />
        </div>
      </div>
    </Modal>
  )
}
