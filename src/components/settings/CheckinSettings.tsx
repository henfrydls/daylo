import { useState } from 'react'
import { Button, Modal } from '../ui'
import { useCalendarStore } from '../../store'
import { useCheckinFields } from '../../hooks'
import { turnOffCheckin, turnOnCheckin } from '../../lib/checkin'
import { WhatGetsSent } from './WhatGetsSent'

interface CheckinSettingsProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * The switch, and everything that can honestly be said about it.
 *
 * Built like the reminder sheet — a dot, a sentence about what is happening, the detail
 * underneath — because a person who has seen one of these has seen both. What is
 * different is that this one shows the message itself: the same row as the consent
 * dialog, with the real number in it, so that what was agreed to and what is being sent
 * can be compared without taking anyone's word for it.
 *
 * Turning it off has no confirmation and no toast. The acknowledgement is the sentence
 * rewriting itself, which is also what a screen reader is told.
 */
export function CheckinSettings({ isOpen, onClose }: CheckinSettingsProps) {
  const fields = useCheckinFields()
  const enabled = useCalendarStore((state) => state.checkinEnabled)
  const id = useCalendarStore((state) => state.checkinId)
  const lastAttempt = useCalendarStore((state) => state.checkinLastAttempt)
  const [busy, setBusy] = useState(false)

  // Only true for the sitting in which it happened. Nothing about a season that has ended
  // is kept, so this cannot come from the store: it is here to finish a sentence on
  // screen and it leaves with the sheet.
  const [justStopped, setJustStopped] = useState<'sent' | 'lost' | null>(null)

  const turnOn = async () => {
    setBusy(true)
    try {
      setJustStopped(null)
      await turnOnCheckin()
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      setJustStopped(await turnOffCheckin())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Anonymous check-in"
      data-testid="checkin-settings"
      footer={
        <div className="flex justify-end">
          {enabled ? (
            <Button
              variant="secondary"
              onClick={() => void turnOff()}
              disabled={busy}
              data-testid="checkin-stop"
            >
              Turn it off
            </Button>
          ) : (
            <Button onClick={() => void turnOn()} disabled={busy} data-testid="checkin-start">
              Turn it on
            </Button>
          )}
        </div>
      }
    >
      <div>
        <div className="flex items-start gap-2" data-testid="checkin-status">
          <span
            className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
              enabled ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          {/* Spoken, because the switch has no other acknowledgement: there is no toast
              and no confirmation, and the sentence rewriting itself is the whole reply. */}
          <div className="min-w-0" aria-live="polite">
            <p className="font-medium text-gray-900">
              {enabled ? 'Checking in once a day.' : 'Check-in is off.'}
            </p>

            {/* When the last one went is not said at all. It was a number the person had
                no use for, and the sheet is about what is happening, not about a history.
                The time is still recorded: it is what keeps "once a day" true. */}
            {enabled
              ? lastAttempt?.ok === false && (
                  <p className="mt-0.5 text-sm text-gray-500">The last one did not go through.</p>
                )
              : justStopped && (
                  <>
                    <p className="mt-0.5 text-sm text-gray-500">The random number is deleted.</p>
                    {justStopped === 'lost' ? (
                      <p className="mt-0.5 text-sm text-gray-500">
                        The last note did not go through.
                      </p>
                    ) : null}
                  </>
                )}
          </div>
        </div>

        <WhatGetsSent fields={fields} id={enabled ? id : null} />

        {enabled ? (
          // Said before the button and not after it: a warning that arrives in a
          // confirmation dialog is a warning that arrives once the decision is made.
          <p className="mt-4 text-sm text-gray-600" data-testid="checkin-off-warning">
            Turning this off sends one last note, and then nothing.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
