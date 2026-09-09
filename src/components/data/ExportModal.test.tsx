import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportModal } from './ExportModal'
import type { Activity, ActivityLog } from '../../types'

const saveTextFile = vi.hoisted(() => vi.fn())
vi.mock('../../lib/fileSave', () => ({
  saveTextFile,
  formatSavedMessage: (path: string) => `Saved ${path}`,
}))

const showToast = vi.hoisted(() => vi.fn())
vi.mock('../ui', async () => ({
  ...(await vi.importActual<typeof import('../ui')>('../ui')),
  useToast: () => ({ showToast }),
}))

vi.mock('../../store', () => ({
  useCalendarStore: () => ({
    activities: [
      {
        id: 'a1',
        name: 'Read',
        color: '#10B981',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } satisfies Activity,
    ],
    logs: [
      {
        id: 'l1',
        activityId: 'a1',
        date: '2026-01-02',
        completed: true,
        createdAt: '2026-01-02T00:00:00.000Z',
      } as ActivityLog,
    ],
  }),
}))

function renderModal() {
  const onClose = vi.fn()
  render(<ExportModal isOpen onClose={onClose} />)
  return { onClose }
}

beforeEach(() => {
  saveTextFile.mockReset()
  showToast.mockReset()
})

describe('ExportModal', () => {
  it('hands the export to saveTextFile with the right name and type', async () => {
    saveTextFile.mockResolvedValue({ saved: true, viaDialog: false })
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /export json/i }))

    await waitFor(() => expect(saveTextFile).toHaveBeenCalled())
    const [content, filename, mimeType] = saveTextFile.mock.calls[0]
    expect(JSON.parse(content).activities).toHaveLength(1)
    expect(filename).toMatch(/^daylo-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(mimeType).toBe('application/json')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('exports CSV with the export name and the csv type', async () => {
    saveTextFile.mockResolvedValue({ saved: true, viaDialog: false })
    renderModal()

    await userEvent.click(screen.getByRole('radio', { name: /csv/i }))
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() => expect(saveTextFile).toHaveBeenCalled())
    const [, filename, mimeType] = saveTextFile.mock.calls[0]
    expect(filename).toMatch(/^daylo-export-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(mimeType).toBe('text/csv')
  })

  // On the web the browser decides the location, so there is nothing truthful to tell the
  // user about where the file went. Saying nothing beats naming a folder we did not pick.
  it('says nothing about a location when the browser chose it', async () => {
    saveTextFile.mockResolvedValue({ saved: true, viaDialog: false })
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: /export json/i }))

    await waitFor(() => expect(saveTextFile).toHaveBeenCalled())
    expect(showToast).not.toHaveBeenCalled()
  })

  it('tells the user where the file went when a dialog chose it', async () => {
    saveTextFile.mockResolvedValue({
      saved: true,
      viaDialog: true,
      path: '/home/misael/Documents/daylo-backup.json',
    })
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /export json/i }))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Saved /home/misael/Documents/daylo-backup.json',
        'success'
      )
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // Cancelling is not a failure. Nothing is announced and the modal stays open so the
  // user can pick again instead of having to reopen it.
  it('stays open and quiet when the user cancels the dialog', async () => {
    saveTextFile.mockResolvedValue({ saved: false, viaDialog: true })
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /export json/i }))

    await waitFor(() => expect(saveTextFile).toHaveBeenCalled())
    expect(showToast).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled()
  })

  it('shows the failure and keeps the modal open when saving fails', async () => {
    saveTextFile.mockRejectedValue(new Error('Could not open the save dialog: no portal'))
    const { onClose } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: /export json/i }))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Could not open the save dialog: no portal', 'error')
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled()
  })
})
