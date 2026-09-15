import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '../ui'
import { useCalendarStore } from '../../store'
import { useCheckinFields } from '../../hooks'
import { today, turnOnCheckin } from '../../lib/checkin'
import { WhatGetsSent } from './WhatGetsSent'

/**
 * The one question Daylo asks about data, put once and answerable in two words.
 *
 * It waits for the day sheet to close on a day that is not the first. The first day
 * somebody is setting the app up, and a question about what leaves the device in the
 * middle of that is a question asked badly; a session where nothing was written down is
 * somebody passing through. Closing the day sheet is the moment the screen is theirs
 * again and nothing is half-done.
 *
 * Either answer ends it for good. The one that changes nothing leaves nothing: no number
 * is made, nothing is sent, and all that is written down is that the question was put.
 */
export function CheckinOffer() {
  const fields = useCheckinFields()
  const available = fields !== null
  const [momentCame, setMomentCame] = useState(false)
  const isOpen = momentCame && available

  // The answer that changes nothing is where the focus starts, so the keyboard's first
  // Enter is the one that turns nothing on.
  //
  // On the node arriving rather than in an effect, and that is not a style choice: the
  // modal keeps its own presence state for the animation, so the footer does not exist
  // yet on the render where isOpen turns true. An effect there finds a null ref, and
  // never runs again because isOpen does not change twice. The dialog opened with the
  // focus on the body, which a test caught and a keyboard would have caught later.
  const focusLeaveOff = useCallback((node: HTMLButtonElement | null) => node?.focus(), [])

  // Watched rather than derived, because the question is about a moment and not about a
  // state. Ticking a day from the bar on the home screen leaves the sheet closed the
  // whole time, and a dialog that opened under the thumb that ticked it would be the
  // interruption this is written to avoid.
  //
  // The watch is not waited on: whether there is a check-in here is an answer that
  // arrives a few milliseconds after the app starts, and the day sheet is open when the
  // app starts if it was open when it was last closed. Somebody who closes it in that
  // gap would otherwise never be asked at all.
  useEffect(() => {
    return useCalendarStore.subscribe((state, previous) => {
      if (previous.selectedDate === null || state.selectedDate !== null) return
      if (state.checkinOffered) return
      if (state.activities.length === 0) return
      if (state.firstOpenedAt === null || state.firstOpenedAt === today()) return
      if (!state._loggedThisSession) return
      // Three things want this moment. Whoever asks first has it, and the other two say
      // nothing for the rest of the session.
      if (state._offerThisSession !== null) return

      setMomentCame(true)
    })
  }, [])

  // Claimed when the dialog is actually on screen, not when the moment passed: a session
  // slot spent on a question that turned out not to exist here would silence the other
  // two for nothing.
  useEffect(() => {
    if (isOpen) useCalendarStore.getState().claimOffer('checkin')
  }, [isOpen])

  const leaveOff = () => {
    useCalendarStore.getState().markCheckinOffered()
    setMomentCame(false)
  }

  const turnOn = () => {
    useCalendarStore.getState().markCheckinOffered()
    void turnOnCheckin()
    setMomentCame(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={leaveOff}
      title="Send an anonymous check-in?"
      data-testid="checkin-offer"
      footer={
        // Neither is the recommended answer, so neither is the green one: the app allows
        // one green thing at a time and this is not the place to spend it. Equal widths,
        // side by side at every width, for the same reason.
        <div className="flex gap-3">
          <Button
            ref={focusLeaveOff}
            variant="secondary"
            className="flex-1"
            onClick={leaveOff}
            data-testid="checkin-leave-off"
          >
            Leave it off
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={turnOn}
            data-testid="checkin-turn-on"
          >
            Turn on
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-gray-600">
        <p>
          Daylo does not send anything anywhere. If you turn this on, once a day it sends four
          things: a random number made on this device, the app version, your operating system, and
          the date. Nothing else.
        </p>
        <p>
          Your habits and the days you marked stay on this device whatever you choose. If you turn
          it off later, Daylo sends one last note saying so, and then nothing at all. We ask because
          we have no way of knowing how many people keep using Daylo.
        </p>
      </div>

      <WhatGetsSent fields={fields} id={null} />
    </Modal>
  )
}
