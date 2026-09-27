import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateSettings, type UpdateStatus } from './UpdateSettings'
import { useCalendarStore } from '../../store'

const onClose = vi.fn()
const onAct = vi.fn()

beforeEach(() => {
  onClose.mockReset()
  onAct.mockReset()
  useCalendarStore.setState({ updatesEnabled: true })
})

const show = (status: UpdateStatus = { kind: 'idle' }) =>
  render(<UpdateSettings isOpen onClose={onClose} status={status} onAct={onAct} />)

const status = () => screen.getByTestId('update-status')
const action = () => screen.queryByTestId('update-settings-action')

describe('what the sheet says', () => {
  it('says what the switch is doing when there is nothing else to say', () => {
    show()
    expect(status()).toHaveTextContent('Checking is on.')

    useCalendarStore.setState({ updatesEnabled: false })
    show()
    expect(screen.getAllByTestId('update-status')[1]).toHaveTextContent('Checking is off.')
  })

  it('answers a check that found nothing', () => {
    show({ kind: 'up-to-date' })

    expect(status()).toHaveTextContent('Daylo is up to date.')
  })

  // Opened from the dot, it already says what the dot was about. Making somebody press
  // "Check now" to be told what the dot already announced would be asking them to fetch
  // something we have.
  it('names the version when one is waiting', () => {
    show({ kind: 'available', version: '1.5.0', canInstall: true })

    expect(status()).toHaveTextContent('Daylo 1.5.0 is out.')
  })

  // In the sentence, not in a toast. A toast raised over this sheet would be painted
  // under it: the dialog renders through a portal that covers the toast layer.
  it('says a failed check in the same place as everything else', () => {
    show({ kind: 'failed' })

    expect(status()).toHaveTextContent('Could not check just now.')
  })

  it('explains what leaves the machine, without being asked', () => {
    show()

    expect(screen.getByTestId('update-settings')).toHaveTextContent(
      'Daylo asks GitHub whether a newer version exists. It sends nothing about you.'
    )
  })
})

// One action, never two. Its words say what there is to do, so nobody has to work out
// which of two buttons is the one they want.
describe('the one action', () => {
  it('offers a check when nothing is known', () => {
    show()
    expect(action()).toHaveTextContent('Check now')
  })

  it('offers the update when there is one this copy can take', () => {
    show({ kind: 'available', version: '1.5.0', canInstall: true })

    expect(action()).toHaveTextContent('Update')
  })

  // A .deb updates by running dpkg through pkexec, which asks for the administrator's
  // password. The words change; the offer to install disappears.
  it('sends somebody to the downloads page when it will not install', () => {
    show({ kind: 'available', version: '1.5.0', canInstall: false })

    expect(action()).toHaveTextContent('Get it from the downloads page')
    expect(action()).not.toHaveTextContent(/^Update$/)
  })

  it('offers nothing while it is looking', () => {
    show({ kind: 'checking' })

    expect(status()).toHaveTextContent('Checking…')
    expect(action()).toBeNull()
  })

  it('reports the press', async () => {
    show()

    await userEvent.click(screen.getByTestId('update-settings-action'))

    expect(onAct).toHaveBeenCalledOnce()
  })
})

// The sheet can be opened while the update is already happening, and the card behind it
// is the one telling the story. What the sheet may not do is offer "Update" again there,
// as if nothing were going on.
describe('while it is already happening', () => {
  it('says so and offers nothing', () => {
    show({ kind: 'working' })

    expect(status()).toHaveTextContent('Daylo is updating itself.')
    expect(action()).toBeNull()
  })

  it('offers the restart that did not happen by itself', () => {
    show({ kind: 'restart' })

    expect(status()).toHaveTextContent('Done. Restart Daylo to finish.')
    expect(action()).toHaveTextContent('Restart')
  })
})

describe('the switch', () => {
  it('turns it off and says so', async () => {
    show()

    await userEvent.click(screen.getByTestId('update-toggle'))

    expect(useCalendarStore.getState().updatesEnabled).toBe(false)
  })

  it('turns it back on', async () => {
    useCalendarStore.setState({ updatesEnabled: false })
    show()

    await userEvent.click(screen.getByTestId('update-toggle'))

    expect(useCalendarStore.getState().updatesEnabled).toBe(true)
  })
})
