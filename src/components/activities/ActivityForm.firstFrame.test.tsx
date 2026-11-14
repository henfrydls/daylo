import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { ActivityForm } from './ActivityForm'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'

/**
 * The first frame of an open form.
 *
 * Its starting color used to be set in an effect, so the form was first put on the page
 * green and then turned blue. The real dialog hid that by putting its content in one pass
 * late, after the effect had run, but reopening it during its own exit is enough to show
 * the jump. This stands the dialog in with one that shows its content in the same pass it
 * is opened, so the only thing that can keep the first frame right is the form itself.
 */
vi.mock('../ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../ui')>()
  return {
    ...ui,
    Modal: ({
      isOpen,
      children,
      footer,
    }: {
      isOpen: boolean
      children: ReactNode
      footer?: ReactNode
    }) =>
      isOpen ? (
        <div>
          {children}
          {footer}
        </div>
      ) : null,
  }
})

const green: Activity = {
  id: 'green-id',
  name: 'Run',
  color: '#10B981',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('the first frame of the form', () => {
  it('is already on the free color, with nothing changing after it is drawn', () => {
    useCalendarStore.setState({ activities: [green] })
    const { rerender } = render(<ActivityForm isOpen={false} onClose={() => {}} />)

    const observer = new MutationObserver(() => {})
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-checked'],
    })
    rerender(<ActivityForm isOpen={true} onClose={() => {}} />)
    const changed = observer
      .takeRecords()
      .map((r) => (r.target as Element).getAttribute('aria-label'))
    observer.disconnect()

    expect(changed).toEqual([])
    expect(screen.getByLabelText('Blue color')).toHaveAttribute('aria-checked', 'true')
  })

  // With the real store: what is saved is the color that was painted, though the form
  // does not hand it over.
  it('saves the color it showed', async () => {
    useCalendarStore.setState({ activities: [green] })
    render(<ActivityForm isOpen={true} onClose={() => {}} />)

    await userEvent.type(screen.getByTestId('activity-name-input'), 'Read')
    await userEvent.click(screen.getByTestId('activity-form-submit'))

    const saved = useCalendarStore.getState().activities.find((a) => a.name === 'Read')
    expect(saved?.color).toBe('#3B82F6')
  })
})
