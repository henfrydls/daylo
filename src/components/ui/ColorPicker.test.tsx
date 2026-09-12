import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorPicker } from './ColorPicker'

const COLORS = [
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
] as const

function renderPicker(props: Partial<React.ComponentProps<typeof ColorPicker>> = {}) {
  const onChange = vi.fn()
  render(
    <ColorPicker
      value="#10B981"
      onChange={onChange}
      colors={COLORS}
      collapsedCount={0}
      {...props}
    />
  )
  return { onChange }
}

describe('ColorPicker and the colors other activities already wear', () => {
  it('marks a color another activity is using', () => {
    renderPicker({ colorsInUse: ['#3B82F6'] })

    expect(screen.getByRole('radio', { name: /blue color, already in use/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^purple color$/i })).toBeInTheDocument()
  })

  // Editing an activity passes the other activities' colors, not its own, but the picker
  // guards the case anyway: the color you are wearing is never reported back to you as
  // taken.
  it('does not mark the color that is currently selected', () => {
    renderPicker({ value: '#10B981', colorsInUse: ['#10B981', '#3B82F6'] })

    expect(screen.getByRole('radio', { name: /^green color$/i })).toBeInTheDocument()
  })

  // Sixteen colors and a seventeenth activity: if every color dimmed, the palette would
  // look broken and say nothing. Repeating is allowed, so at that point the marking stops
  // carrying information and goes away.
  it('marks nothing when every color is already taken', () => {
    renderPicker({ value: '#10B981', colorsInUse: COLORS.map((c) => c.value) })

    expect(screen.queryByRole('radio', { name: /already in use/i })).toBeNull()
  })

  it('still lets a color in use be chosen', async () => {
    const { onChange } = renderPicker({ colorsInUse: ['#3B82F6'] })

    await userEvent.click(screen.getByRole('radio', { name: /blue color, already in use/i }))

    expect(onChange).toHaveBeenCalledWith('#3B82F6')
  })

  it('marks nothing when no list is given', () => {
    renderPicker()

    expect(screen.queryByRole('radio', { name: /already in use/i })).toBeNull()
  })
})
