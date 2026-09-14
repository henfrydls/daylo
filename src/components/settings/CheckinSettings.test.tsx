import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckinSettings } from './CheckinSettings'
import { useCalendarStore } from '../../store'
import { today } from '../../lib/checkin'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  isTauri: () => true,
}))

const checkinFields = vi.hoisted(() => vi.fn())
vi.mock('../../lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/checkin')>()),
  checkinFields,
}))

const onClose = vi.fn()
const open = () => render(<CheckinSettings isOpen onClose={onClose} />)

const status = () => screen.getByTestId('checkin-status')
const start = () => screen.getByTestId('checkin-start')
const stop = () => screen.getByTestId('checkin-stop')

const ID = '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e'
const at = (date: string, hour = 21, minute = 12) =>
  new Date(`${date}T00:00:00`).setHours(hour, minute, 0, 0)

const isOn = (lastAttempt: { date: string; at: string; ok: boolean } | null) =>
  useCalendarStore.setState({
    checkinEnabled: true,
    checkinId: ID,
    checkinLastAttempt: lastAttempt,
  })

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined)
  checkinFields.mockReset().mockResolvedValue({ version: '1.3.0', os: 'android' })
  onClose.mockReset()
  useCalendarStore.setState({
    checkinOffered: true,
    checkinEnabled: false,
    checkinId: null,
    checkinLastAttempt: null,
  })
})

describe('with the check-in off', () => {
  it('says so, and offers to turn it on', async () => {
    open()

    expect(status()).toHaveTextContent('Check-in is off')
    expect(screen.getByText('Daylo is not sending anything.')).toBeInTheDocument()
    expect(start()).toHaveTextContent('Turn it on')
    // The one green thing on the sheet: the action somebody came here to take.
    expect(start().className).toContain('bg-emerald')
    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
  })

  it('shows an example, not a number it does not have', async () => {
    open()
    await waitFor(() => expect(checkinFields).toHaveBeenCalled())

    await userEvent.click(screen.getByTestId('checkin-what-gets-sent'))

    expect(screen.getByText('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')).toBeInTheDocument()
    expect(screen.getByText('1.3.0')).toBeInTheDocument()
    expect(
      screen.getByText(/the random number is not made until you turn this on/, { exact: false })
    ).toBeInTheDocument()
  })

  // Somebody who found the menu before the second day answers the question by using it.
  it('counts turning it on here as an answer to the question', async () => {
    useCalendarStore.setState({ checkinOffered: false })
    open()

    await userEvent.click(start())

    await waitFor(() => expect(useCalendarStore.getState().checkinEnabled).toBe(true))
    expect(useCalendarStore.getState().checkinOffered).toBe(true)
    expect(useCalendarStore.getState().checkinId).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('with the check-in on', () => {
  it('says when the last one went, in this device s own clock', async () => {
    const when = new Date(at(today())).toISOString()
    isOn({ date: today(), at: when, ok: true })
    open()

    const hour = new Date(when).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(status()).toHaveTextContent('Checking in once a day')
    expect(screen.getByText(`Last sent today at ${hour}.`)).toBeInTheDocument()
  })

  it('says the day when the last one was another day', async () => {
    isOn({ date: '2026-09-11', at: '2026-09-11T21:12:00.000Z', ok: true })
    open()

    expect(screen.getByText('Last sent on 11 September.')).toBeInTheDocument()
  })

  // Grey and not red: no connection is the ordinary case, not a fault to alarm anyone
  // about, and the sentence says what happens next rather than asking for anything.
  it('says plainly when the last one did not arrive', async () => {
    isOn({ date: today(), at: new Date().toISOString(), ok: false })
    open()

    const line = screen.getByText(
      'The last one did not go through. Daylo will try again on the next day you open it.'
    )
    expect(line).toBeInTheDocument()
    expect(line.className).not.toContain('text-red')
  })

  it('says it is sending while there is nothing to report yet', async () => {
    isOn(null)
    open()

    expect(screen.getByText("Sending today's check-in.")).toBeInTheDocument()
  })

  it('shows the real number, and warns before the switch is touched', async () => {
    isOn({ date: today(), at: new Date().toISOString(), ok: true })
    open()
    await waitFor(() => expect(checkinFields).toHaveBeenCalled())

    await userEvent.click(screen.getByTestId('checkin-what-gets-sent'))

    expect(screen.getByText(ID)).toBeInTheDocument()
    expect(screen.queryByText(/An example/, { exact: false })).not.toBeInTheDocument()
    expect(screen.getByTestId('checkin-off-warning')).toHaveTextContent(
      'Turning this off sends one last note saying so, and then nothing at all.'
    )
    expect(stop().className).not.toContain('bg-emerald')
  })
})

describe('turning it off', () => {
  beforeEach(() => {
    isOn({ date: today(), at: new Date().toISOString(), ok: true })
  })

  it('says it is off, and that the number is gone', async () => {
    open()

    await userEvent.click(stop())

    await waitFor(() => expect(status()).toHaveTextContent('Check-in is off'))
    expect(screen.getByText('Daylo is not sending anything.')).toBeInTheDocument()
    expect(
      screen.getByText('The random number this device was using is deleted.')
    ).toBeInTheDocument()
    expect(useCalendarStore.getState().checkinId).toBeNull()
    expect(invoke).toHaveBeenCalledWith('send_checkin', { id: ID, date: today(), last: true })
  })

  // The promise was one last note. If it did not arrive, saying so is the only way the
  // sentence stays true, and there is no retry to offer.
  it('says when the last note did not go through', async () => {
    invoke.mockRejectedValue(new Error('offline'))
    open()

    await userEvent.click(stop())

    await waitFor(() =>
      expect(
        screen.getByText('The last note did not go through. Daylo will not try again.')
      ).toBeInTheDocument()
    )
  })

  it('makes a new number if it is turned on again', async () => {
    open()
    await userEvent.click(stop())
    await waitFor(() => expect(start()).toBeInTheDocument())

    await userEvent.click(start())

    await waitFor(() => expect(useCalendarStore.getState().checkinEnabled).toBe(true))
    expect(useCalendarStore.getState().checkinId).not.toBe(ID)
  })
})
