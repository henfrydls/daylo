import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from './Switch'

describe('Switch', () => {
  it('says what it turns on and whether it is on', () => {
    render(<Switch checked onChange={vi.fn()} label="Daily reminder" />)

    const control = screen.getByRole('switch', { name: 'Daily reminder' })
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('asks for the other state when pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Daily reminder" />)

    await user.click(screen.getByRole('switch'))

    // The other state and not a toggle: whoever owns the value decides what to do with it,
    // and a switch that only said "I was pressed" would make every caller work it out.
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does nothing while it is switched off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Daily reminder" disabled />)

    await user.click(screen.getByRole('switch'))

    expect(onChange).not.toHaveBeenCalled()
  })

  // A thumb needs the whole of it. The part you look at is smaller than the part you hit,
  // which is the only way to have a control this size that is still reachable.
  it('is as big as a thumb', () => {
    render(<Switch checked onChange={vi.fn()} label="Daily reminder" />)

    expect(screen.getByRole('switch').className).toContain('h-11')
  })
})
