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

const sentence = () => screen.queryByTestId('update-status')
const action = () => screen.queryByTestId('update-settings-action')
const toggle = () => screen.getByTestId('update-toggle')

describe('what the sheet says', () => {
  it('answers a check that found nothing', () => {
    show({ kind: 'up-to-date' })

    expect(sentence()).toHaveTextContent('Daylo is up to date.')
  })

  // Opened from the dot, it already says what the dot was about. Making somebody press
  // "Check now" to be told what the dot already announced would be asking them to fetch
  // something we have.
  it('names the version when one is waiting', () => {
    show({ kind: 'available', version: '1.5.0', canInstall: true })

    expect(sentence()).toHaveTextContent('Daylo 1.5.0 is out.')
  })

  // In the sentence, not in a toast. A toast raised over this sheet would be painted
  // under it: the dialog renders through a portal that covers the toast layer.
  it('says a failed check in the same place as everything else', () => {
    show({ kind: 'failed' })

    expect(sentence()).toHaveTextContent('Could not check just now.')
  })

  it('says what is happening while it happens', () => {
    const { unmount } = show({ kind: 'working' })
    expect(sentence()).toHaveTextContent('Daylo is updating itself.')
    unmount()

    show({ kind: 'restart' })
    expect(sentence()).toHaveTextContent('Done. Restart Daylo to finish.')
  })

  // Nothing known yet, so nothing is claimed. The hook keeps what the automatic check
  // found out, which is why a sheet opened out of the blue almost never looks like this.
  it('says nothing at all when nothing is known', () => {
    show()

    expect(sentence()).toBeNull()
  })

  // What leaves the machine, in one line, without being asked. It is the only thing here
  // that answers "what does pressing this send about me".
  it('says what it asks and what it sends, always', () => {
    show({ kind: 'working' })

    expect(screen.getByTestId('update-settings')).toHaveTextContent(
      'Daylo asks GitHub and sends nothing about you.'
    )
  })
})

// One action at a time, never two, and its words say what there is to do so nobody has to
// work out which button is the one they want.
describe('the one action', () => {
  it('offers a check when nothing is known, and after one that found nothing', () => {
    const { unmount } = show()
    expect(action()).toHaveTextContent('Check now')
    unmount()

    show({ kind: 'up-to-date' })
    expect(action()).toHaveTextContent('Check now')
  })

  it('offers a check again after one that failed', () => {
    show({ kind: 'failed' })

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

  it('offers the restart that did not happen by itself', () => {
    show({ kind: 'restart' })

    expect(action()).toHaveTextContent('Restart')
  })

  // Gone, not greyed out. A disabled primary is white on emerald at half opacity, which
  // measures 1.6:1, and taking it out costs no height because the row keeps the other one.
  it('takes the action away while it is working, rather than dimming it', () => {
    const { unmount } = show({ kind: 'checking' })
    expect(action()).toBeNull()
    expect(toggle()).toBeInTheDocument()
    unmount()

    show({ kind: 'working' })
    expect(action()).toBeNull()
    expect(toggle()).toBeInTheDocument()
  })

  it('reports the press', async () => {
    show()

    await userEvent.click(screen.getByTestId('update-settings-action'))

    expect(onAct).toHaveBeenCalledOnce()
  })
})

// The switch says what it does rather than what it is, and the words changing is the
// acknowledgement: there is no sentence about it any more, no toast and no confirmation.
describe('the switch', () => {
  it('offers to stop, and stops', async () => {
    show()
    expect(toggle()).toHaveTextContent('Stop checking automatically')

    await userEvent.click(toggle())

    expect(useCalendarStore.getState().updatesEnabled).toBe(false)
  })

  it('offers to start again, and starts', async () => {
    useCalendarStore.setState({ updatesEnabled: false })
    show()
    expect(toggle()).toHaveTextContent('Start checking automatically')

    await userEvent.click(toggle())

    expect(useCalendarStore.getState().updatesEnabled).toBe(true)
  })

  // Said out loud, because the button's own words are the whole reply now.
  it('is in a row that says itself', () => {
    show()

    expect(toggle().closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
  })
})
