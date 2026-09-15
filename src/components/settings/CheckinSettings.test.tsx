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
    checkinEnabled: false,
    checkinId: null,
    checkinLastAttempt: null,
  })
})

describe('with the check-in off', () => {
  it('says so, and offers to turn it on', async () => {
    open()

    expect(status()).toHaveTextContent('Check-in is off.')
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
    expect(screen.getByTestId('checkin-settings').textContent ?? '').toContain(
      'Made on this device, tied to nothing'
    )
  })
})

describe('with the check-in on', () => {
  // What it does not say any more. The time was a number nobody had a use for, and it
  // invited the question "why does it know that?" about the one screen whose job is to
  // make what is known obvious. It is still recorded: it is what keeps "once a day" true.
  it('does not say when the last one went', async () => {
    const when = new Date(at(today())).toISOString()
    isOn({ date: today(), at: when, ok: true })
    open()

    expect(status()).toHaveTextContent('Checking in once a day.')
    const sheet = screen.getByTestId('checkin-settings').textContent ?? ''
    expect(sheet).not.toContain('Last sent')
    expect(sheet).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('says plainly when the last one did not arrive', async () => {
    isOn({ date: today(), at: new Date().toISOString(), ok: false })
    open()

    const line = screen.getByText('The last one did not go through.')
    expect(line).toBeInTheDocument()
    expect(line.className).not.toContain('text-red')
  })

  // Nothing is said in the seconds before the first one lands: the state is the whole
  // message, and a sentence that exists for two seconds is one more thing to read.
  it('says only that it is checking in while the first one is in the air', async () => {
    isOn(null)
    open()

    expect(status()).toHaveTextContent('Checking in once a day.')
    expect(screen.getByTestId('checkin-settings').textContent ?? '').not.toContain('Sending')
  })

  it('shows the real number, and warns before the switch is touched', async () => {
    isOn({ date: today(), at: new Date().toISOString(), ok: true })
    open()
    await waitFor(() => expect(checkinFields).toHaveBeenCalled())

    await userEvent.click(screen.getByTestId('checkin-what-gets-sent'))

    expect(screen.getByText(ID)).toBeInTheDocument()
    expect(screen.queryByText(/An example/, { exact: false })).not.toBeInTheDocument()
    expect(screen.getByTestId('checkin-off-warning')).toHaveTextContent(
      'Turning this off sends one last note, and then nothing.'
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

    await waitFor(() => expect(status()).toHaveTextContent('Check-in is off.'))
    expect(screen.getByText('The random number is deleted.')).toBeInTheDocument()
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
      expect(screen.getByText('The last note did not go through.')).toBeInTheDocument()
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
