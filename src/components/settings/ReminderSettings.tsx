import { useState } from 'react'
import { Button, Checkbox, Modal, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { disableReminder, enableReminder, formatReminderTime } from '../../lib/reminders'

interface ReminderSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function ReminderSettings({ isOpen, onClose }: ReminderSettingsProps) {
  const enabled = useCalendarStore((s) => s.reminderEnabled)
  const hour = useCalendarStore((s) => s.reminderHour)
  const minute = useCalendarStore((s) => s.reminderMinute)
  const setReminder = useCalendarStore((s) => s.setReminder)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  // Changes take effect as they are made, the way a phone's own settings behave. The
  // store is only written once the platform has agreed, so a refused permission cannot
  // leave a switch showing on with nothing scheduled.
  const apply = async (nextEnabled: boolean, nextHour: number, nextMinute: number) => {
    setBusy(true)
    try {
      if (!nextEnabled) {
        await disableReminder()
        setReminder(false, nextHour, nextMinute)
        return
      }

      const outcome = await enableReminder(nextHour, nextMinute)
      if (outcome === 'on') {
        setReminder(true, nextHour, nextMinute)
        return
      }
      if (outcome === 'permission-denied') {
        showToast('Daylo needs permission to send notifications', 'error')
      }
      setReminder(false, nextHour, nextMinute)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Daily reminder" data-testid="reminder-settings">
      <div className="space-y-4">
        <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer min-h-[48px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500">
          <Checkbox
            checked={enabled}
            disabled={busy}
            onChange={(e) => void apply(e.target.checked, hour, minute)}
            aria-label="Daily reminder"
            data-testid="reminder-toggle"
          />
          <span className="font-medium text-sm text-gray-900">Daily reminder</span>
        </label>

        <div className="px-3">
          <label htmlFor="reminder-time" className="block text-sm font-medium text-gray-700 mb-1">
            Time
          </label>
          <input
            id="reminder-time"
            type="time"
            value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
            disabled={busy}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number)
              if (Number.isNaN(h) || Number.isNaN(m)) return
              void apply(enabled, h, m)
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
            data-testid="reminder-time"
          />
          <p className="text-sm text-gray-500 mt-2">
            Around {formatReminderTime(hour, minute)}. Android may shift it a few minutes.
          </p>
        </div>

        {/* In the body rather than the modal's pinned footer: this dialog holds a switch
            and a time, it has nothing to scroll, and using the footer would tie this to a
            change that has not landed yet. */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
