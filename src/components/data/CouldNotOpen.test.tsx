import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CouldNotOpen } from './CouldNotOpen'
import { useRescueStore } from '../../store/rescue'

const saveTextFile = vi.hoisted(() => vi.fn())
vi.mock('../../lib/fileSave', () => ({
  saveTextFile,
  formatSavedMessage: (path: string) => `Saved to ${path}`,
}))

const STORED = '{"state":{"activities":[{"id":"a","name":"Run"}],"logs":[truncated'

beforeEach(() => {
  saveTextFile.mockReset().mockResolvedValue({ saved: true, viaDialog: false })
  useRescueStore.setState({ failure: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * The screen somebody sees when Daylo cannot open what it saved.
 *
 * Everything here has to work while the calendar store is the thing that failed, so this
 * component reads nothing from it. The bytes it offers come off the disk, through the
 * rescue store, exactly as they were found.
 */
describe('when the data will not open', () => {
  it('says what happened without blaming the person', () => {
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    expect(screen.getByTestId('could-not-open')).toBeInTheDocument()
    expect(screen.getByText(/could not open/i)).toBeInTheDocument()
    // The one fact that matters to somebody reading this: it is not gone.
    expect(screen.getByText(/still on this device/i)).toBeInTheDocument()
  })

  /**
   * The point of the whole screen.
   *
   * Before this, a device whose stored data would not parse showed the loading skeleton
   * for ever: no menu, so no Settings, so no Export. The data was on the disk and there
   * was no way to reach it. What goes out here is the raw text, never anything parsed,
   * because parsing it is the thing that did not work.
   */
  it('hands back exactly the bytes that are on the disk', async () => {
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    await userEvent.click(screen.getByTestId('could-not-open-save'))

    expect(saveTextFile).toHaveBeenCalledOnce()
    expect(saveTextFile.mock.calls[0][0]).toBe(STORED)
  })

  it('names the file so it is recognisable a week later', async () => {
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    await userEvent.click(screen.getByTestId('could-not-open-save'))

    expect(saveTextFile.mock.calls[0][1]).toMatch(/^daylo-unopened-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('says so when the copy has been made', async () => {
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    await userEvent.click(screen.getByTestId('could-not-open-save'))

    expect(await screen.findByTestId('could-not-open-saved')).toHaveTextContent(/a copy was saved/i)
  })

  // Nothing may throw on this screen. It is the last one left.
  it('says so when the copy could not be made, instead of breaking', async () => {
    saveTextFile.mockRejectedValue(new Error('Could not open the save window.'))
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    await userEvent.click(screen.getByTestId('could-not-open-save'))

    expect(await screen.findByTestId('could-not-open-failed')).toBeInTheDocument()
  })

  /**
   * The other failure, which is not a damaged file and must not be described as one.
   * Storage blocked by the browser means there is nothing to hand back and nothing wrong.
   */
  it('offers no copy when there is nothing on the disk to copy', () => {
    useRescueStore.setState({ failure: { reason: 'unreachable', raw: null } })
    render(<CouldNotOpen />)

    expect(screen.queryByTestId('could-not-open-save')).not.toBeInTheDocument()
    expect(screen.getByText(/storage/i)).toBeInTheDocument()
  })

  it('draws nothing at all when nothing went wrong', () => {
    render(<CouldNotOpen />)

    expect(screen.queryByTestId('could-not-open')).not.toBeInTheDocument()
  })
})
