import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CouldNotOpen } from './CouldNotOpen'
import source from './CouldNotOpen.tsx?raw'
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
    expect(screen.getByText(/still on this device, unchanged/i)).toBeInTheDocument()
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

    // Awaited because the saving half is loaded on demand now, so the call lands a tick
    // after the press rather than inside it.
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledOnce())
    expect(saveTextFile.mock.calls[0][0]).toBe(STORED)
  })

  it('names the file so it is recognisable a week later', async () => {
    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)

    await userEvent.click(screen.getByTestId('could-not-open-save'))

    await waitFor(() => expect(saveTextFile).toHaveBeenCalledOnce())
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
    expect(screen.getByText(/cannot reach its storage/i)).toBeInTheDocument()
  })

  /**
   * The address is only worth having where there is something to attach to it.
   *
   * It used to sit at the foot of the screen, under both failures, and under the one where
   * storage cannot be reached there is no copy to send and nothing wrong with the file: it
   * was asking somebody to write to us about a problem they do not have, and to send a
   * thing that does not exist. It belongs with the copy, so it lives on that branch.
   */
  it('asks for the copy to be sent only where there is a copy', () => {
    useRescueStore.setState({ failure: { reason: 'unreachable', raw: null } })
    const { unmount } = render(<CouldNotOpen />)
    expect(screen.queryByText(/daylo@henfrydls\.com/)).not.toBeInTheDocument()
    unmount()

    useRescueStore.setState({ failure: { reason: 'unreadable', raw: STORED } })
    render(<CouldNotOpen />)
    expect(screen.getByText(/daylo@henfrydls\.com/)).toBeInTheDocument()
  })

  it('draws nothing at all when nothing went wrong', () => {
    render(<CouldNotOpen />)

    expect(screen.queryByTestId('could-not-open')).not.toBeInTheDocument()
  })
})

/**
 * What this screen costs when it never appears, which is almost always.
 *
 * App imports it directly, because it has to draw when the store it would otherwise read
 * has failed. That static import used to carry fileSave with it, and fileSave imports
 * downloadFile from dataExport, six hundred lines of export and import machinery that is
 * otherwise reached only from two lazy dialogs. So every launch on every device paid about
 * nine kilobytes for a screen almost nobody will ever meet. Measured on 2026-11-02: the
 * main chunk went from 354.16 kB to 363.56 kB when this screen landed, and dataExport
 * stopped being a chunk of its own.
 *
 * The screen stays static. Only the saving waits, and by the time it is wanted somebody has
 * pressed a button and the chunk is on the same disk the app was loaded from.
 */
describe('what it costs when nothing has gone wrong', () => {
  /**
   * This reads the source rather than the bundle, and it is worth being plain about what
   * that does and does not prove.
   *
   * What it proves: this file has no top level import of fileSave, which is the exact
   * shape of the regression. What it does not prove: that the built main chunk is smaller,
   * which only a build can say, and which was measured by hand instead (354.16 kB against
   * 363.56 kB, with dataExport back as a chunk of its own).
   *
   * A behavioural version was tried first and was worse than useless: a mock factory runs
   * once per file, not once per test, so after any earlier test had touched fileSave the
   * flag read the same whether the import was static or not. It would have passed on the
   * defect.
   */
  it('does not import the saving half at the top of the file', () => {
    const topLevelImports = source
      .split('\n')
      .filter((line: string) => line.startsWith('import '))
      .join('\n')

    expect(topLevelImports).not.toContain('fileSave')
    // And it is reached, just later: pressing the button is what loads it.
    expect(source).toContain("await import('../../lib/fileSave')")
  })
})
