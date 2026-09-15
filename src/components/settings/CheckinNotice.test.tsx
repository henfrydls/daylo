import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckinNotice } from './CheckinNotice'
import { useCalendarStore } from '../../store'

const onOpen = vi.fn()

beforeEach(() => {
  onOpen.mockReset()
  useCalendarStore.setState({ checkinNoticeSeen: false, _checkinNoticeShown: false })
})

const line = () => screen.queryByTestId('checkin-notice')

describe('what it says', () => {
  // Both halves are in the markup and the width chooses, the way the rest of the app does
  // responsive. A phone gets the name and the way in; the sentence in the middle is the
  // first thing a narrow screen can afford to lose.
  it('names the state, and carries both widths', () => {
    render(<CheckinNotice on onOpen={onOpen} />)

    expect(line()).toHaveTextContent(
      'Anonymous check-in is on. It tells us the app is still in use, nothing about what you track.'
    )
    expect(screen.getByText('See')).toHaveClass('sm:hidden')
    expect(screen.getByText('See or turn off')).toHaveClass('hidden')
  })

  it('invites instead, for somebody updating', () => {
    render(<CheckinNotice on={false} onOpen={onOpen} />)

    expect(line()).toHaveTextContent(
      'Anonymous check-in. It would tell us the app is still in use, nothing about what you track.'
    )
    expect(screen.getByTestId('checkin-notice-open')).toHaveTextContent('See and turn on')
  })
})

describe('once, and only once', () => {
  // Seen because it was shown. Somebody who reads it and carries on has been told, and
  // being told again tomorrow would be the app repeating itself at somebody who did
  // nothing wrong.
  it('is marked as seen the moment it is drawn', async () => {
    render(<CheckinNotice on onOpen={onOpen} />)

    await waitFor(() => expect(useCalendarStore.getState().checkinNoticeSeen).toBe(true))
  })

  // The persisted flag is what stops it coming back tomorrow; this one is what keeps it
  // on screen today, because the condition that put it there reads the persisted one.
  it('says so for the rest of this session too', async () => {
    render(<CheckinNotice on onOpen={onOpen} />)

    await waitFor(() => expect(useCalendarStore.getState()._checkinNoticeShown).toBe(true))
  })

  it('goes when the cross is pressed, and changes nothing else', async () => {
    useCalendarStore.setState({ checkinEnabled: true })
    render(<CheckinNotice on onOpen={onOpen} />)

    await userEvent.click(screen.getByTestId('checkin-notice-dismiss'))

    expect(line()).not.toBeInTheDocument()
    expect(useCalendarStore.getState().checkinEnabled).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens the sheet from the link', async () => {
    render(<CheckinNotice on onOpen={onOpen} />)

    await userEvent.click(screen.getByTestId('checkin-notice-open'))

    expect(onOpen).toHaveBeenCalledOnce()
  })
})
