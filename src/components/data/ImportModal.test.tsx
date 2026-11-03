import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportModal } from './ImportModal'
import { useCalendarStore } from '../../store'

const NOW = '2026-09-14T12:00:00.000Z'

const backup = () =>
  new File(
    [
      JSON.stringify({
        version: '1.0',
        exportedAt: NOW,
        activities: [{ id: 'b1', name: 'Walk', color: '#3B82F6', createdAt: NOW, updatedAt: NOW }],
        logs: [
          { id: 'bl1', activityId: 'b1', date: '2026-09-10', completed: true, createdAt: NOW },
        ],
      }),
    ],
    'daylo-backup.json',
    { type: 'application/json' }
  )

/** What a device that has been here a while and said yes to the check-in looks like. */
const settled = {
  activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
  logs: [{ id: 'l1', activityId: 'a1', date: '2026-09-01', completed: true, createdAt: NOW }],
  firstOpenedAt: '2026-08-01',
  feedbackInviteSeen: true,
  checkinEnabled: true,
  checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
  checkinLastAttempt: { date: '2026-09-14', at: NOW, ok: true },
}

const load = async (file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  // The title says "Import Data" as well, so the button is found by its role.
  await waitFor(() => expect(screen.getByRole('button', { name: /Import Data/ })).toBeEnabled())
}

beforeEach(() => {
  useCalendarStore.setState(settled)
})

// A backup carries what somebody made and nothing about how long they have been here or
// what they agreed to. Restoring one onto a device must not answer questions that device
// was never asked, and must not hand it a random number that belongs to another install.
describe('what restoring a backup does not touch', () => {
  it('leaves the six preferences exactly as they were', async () => {
    render(<ImportModal isOpen onClose={vi.fn()} />)
    await load(backup())

    await userEvent.click(screen.getByRole('button', { name: /Import Data/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))

    await waitFor(() => expect(useCalendarStore.getState().activities).toHaveLength(2))
    const state = useCalendarStore.getState()
    expect(state.firstOpenedAt).toBe('2026-08-01')
    expect(state.feedbackInviteSeen).toBe(true)
    expect(state.checkinEnabled).toBe(true)
    expect(state.checkinId).toBe('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
    expect(state.checkinLastAttempt).toEqual({ date: '2026-09-14', at: NOW, ok: true })
  })
})

/**
 * Restoring a backup without a mouse.
 *
 * The drop zone was a div with an onClick, carrying no role, no tabIndex and no key
 * handler, and the file input beside it was `hidden`, which is display:none: not focusable
 * and not in the accessibility tree at all. So somebody using a keyboard or a screen reader
 * opened Import and found nothing to activate. The only enabled control was Cancel. The
 * whole point of a backup is the day you need it, and on that day they could not reach it.
 *
 * The fix is the plain HTML one rather than a widget: the zone is a label, the input lives
 * inside it, and the input is visually hidden instead of removed. Tab reaches it, a screen
 * reader reads the zone's own words as its name, and Enter opens the picker because that is
 * what a focused file input does.
 */
describe('restoring a backup without a mouse', () => {
  const theInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

  // Tabbed to rather than focused by hand: calling .focus() would pass on a control the
  // browser skips, which is precisely what display:none produced. Where it sits in the
  // order is not the point; that the order contains it at all is.
  it('puts the file control where a keyboard can reach it', async () => {
    render(<ImportModal isOpen onClose={vi.fn()} />)

    let reached = false
    for (let press = 0; press < 10 && !reached; press++) {
      await userEvent.tab()
      reached = document.activeElement === theInput()
    }

    expect(reached).toBe(true)
  })

  // display:none is the thing that made it unreachable, and it is the thing a later tidy
  // would put back while meaning well.
  it('does not take the control out of the page to hide it', () => {
    render(<ImportModal isOpen onClose={vi.fn()} />)

    expect(theInput()).not.toHaveClass('hidden')
  })

  it('gives it a name a screen reader can read out', () => {
    render(<ImportModal isOpen onClose={vi.fn()} />)

    expect(theInput()).toHaveAccessibleName(/backup/i)
  })

  it('still restores the file once one is chosen', async () => {
    render(<ImportModal isOpen onClose={vi.fn()} />)
    await load(backup())

    await userEvent.click(screen.getByRole('button', { name: /Import Data/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))

    await waitFor(() => expect(useCalendarStore.getState().activities).toHaveLength(2))
  })
})
