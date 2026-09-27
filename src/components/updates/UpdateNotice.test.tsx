import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateNotice, type UpdateState } from './UpdateNotice'
import { useCalendarStore } from '../../store'

const onAct = vi.fn()
const onLater = vi.fn()

beforeEach(() => {
  onAct.mockReset()
  onLater.mockReset()
  useCalendarStore.setState({ updateNoticeSeenFor: null })
})

const show = (state: UpdateState) =>
  render(<UpdateNotice state={state} onAct={onAct} onLater={onLater} />)

const card = () => screen.getByTestId('update-notice')
const action = () => screen.queryByTestId('update-notice-action')
const later = () => screen.queryByTestId('update-notice-later')

describe('what each state says', () => {
  it('offers the update when one can be installed', () => {
    show({ kind: 'available', version: '1.5.0' })

    expect(card()).toHaveTextContent('Daylo 1.5.0 is out.')
    expect(action()).toHaveTextContent('Update')
  })

  // Not "install it yourself": that would imply the app could have and chose not to. A
  // .deb updates by running dpkg through pkexec, which asks for the administrator's
  // password, and Daylo does not ask people for that.
  it('points at the downloads page for a format it will not install', () => {
    show({ kind: 'elsewhere', version: '1.5.0' })

    expect(card()).toHaveTextContent('Daylo 1.5.0 is out.')
    expect(action()).toHaveTextContent('Get it from the downloads page')
    expect(card()).not.toHaveTextContent(/install/i)
  })

  it('counts while it can and says nothing more when it cannot', () => {
    const { unmount } = show({ kind: 'downloading', percent: 42 })
    expect(card()).toHaveTextContent('Downloading… 42%')
    unmount()

    show({ kind: 'downloading', percent: null })
    expect(card()).toHaveTextContent('Downloading…')
  })

  // One sentence for the three systems. On Windows the installer closes the app and opens
  // it again; on macOS and the AppImage the app relaunches itself. Saying it only on
  // Windows would be true and would leave the other two closing with no warning.
  it('warns that the app will close, on every system', () => {
    show({ kind: 'installing' })

    expect(card()).toHaveTextContent('Installing. Daylo will close and open again.')
  })

  // Only reached when the relaunch did not happen. A net, not a step.
  it('offers a restart only as the thing that did not happen by itself', () => {
    show({ kind: 'restart' })

    expect(card()).toHaveTextContent('Done. Restart Daylo to finish.')
    expect(action()).toHaveTextContent('Restart')
  })

  // The second sentence is the one that matters: "could not be verified" on its own
  // leaves somebody wondering whether their app is now half replaced.
  it('says what did not happen when a download was not signed by our key', () => {
    show({ kind: 'unverified' })

    expect(card()).toHaveTextContent('That update could not be verified, so nothing was installed.')
    expect(action()).toBeNull()
  })

  it('tells the two failures apart', () => {
    const { unmount } = show({ kind: 'download-failed' })
    expect(card()).toHaveTextContent('That did not download. You can try again later.')
    unmount()

    show({ kind: 'install-failed' })
    expect(card()).toHaveTextContent('That did not install. Daylo is still on the version you had.')
  })
})

describe('the cross', () => {
  it('is there while there is something to come back to', async () => {
    show({ kind: 'available', version: '1.5.0' })

    await userEvent.click(screen.getByLabelText('Later'))

    expect(onLater).toHaveBeenCalledOnce()
    expect(onAct).not.toHaveBeenCalled()
  })

  // Nothing to dismiss in the middle of a download or an install: the work carries on
  // either way, and a cross there would suggest it can be called off.
  it('is not there while something is happening', () => {
    const { unmount } = show({ kind: 'downloading', percent: 10 })
    expect(later()).toBeNull()
    unmount()

    show({ kind: 'installing' })
    expect(later()).toBeNull()
  })
})

// Showing it is what spends it, and by version rather than as a flag: dismissing 1.5.0
// must not also dismiss 1.5.1.
describe('being put once per version', () => {
  it('is marked as seen for that version the moment it is drawn', async () => {
    show({ kind: 'available', version: '1.5.0' })

    await waitFor(() => expect(useCalendarStore.getState().updateNoticeSeenFor).toBe('1.5.0'))
  })

  it('marks the version it points elsewhere for too', async () => {
    show({ kind: 'elsewhere', version: '1.5.0' })

    await waitFor(() => expect(useCalendarStore.getState().updateNoticeSeenFor).toBe('1.5.0'))
  })

  // Progress and failures are not a version being offered. If these marked anything, a
  // download that failed would count as having offered the update and it would never be
  // offered again.
  it('marks nothing while working, and nothing when it went wrong', async () => {
    for (const state of [
      { kind: 'downloading', percent: 1 },
      { kind: 'installing' },
      { kind: 'restart' },
      { kind: 'unverified' },
      { kind: 'download-failed' },
      { kind: 'install-failed' },
    ] as UpdateState[]) {
      const { unmount } = show(state)
      await waitFor(() => expect(screen.getByTestId('update-notice')).toBeInTheDocument())
      expect(useCalendarStore.getState().updateNoticeSeenFor, state.kind).toBeNull()
      unmount()
    }
  })
})
