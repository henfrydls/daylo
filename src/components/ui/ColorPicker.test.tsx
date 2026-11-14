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

  // A backup can carry the same color written another way. It is still the color in use.
  it('marks a color in use however its hex is written', () => {
    renderPicker({
      colors: [...COLORS, { name: 'Sea', value: '#11BB99' }],
      colorsInUse: ['#3b82f6', '#1b9'],
    })

    expect(screen.getByRole('radio', { name: /blue color, already in use/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sea color, already in use/i })).toBeInTheDocument()
  })
})

// On a 360px phone with seven colors in use, the color a new activity starts on is the
// eighth, past the row the picker shows collapsed. It used to give up on collapsing and
// show all sixteen with no way to fold them away.
describe('a collapsed picker whose color is past the visible row', () => {
  const SIXTEEN = Array.from({ length: 16 }, (_, i) => ({
    name: `C${i}`,
    value: `#0000${i.toString(16).padStart(2, '0').toUpperCase()}`,
  }))

  const paint = (value: string) =>
    render(<ColorPicker value={value} onChange={vi.fn()} colors={SIXTEEN} collapsedCount={5} />)

  it('keeps to one row and puts the chosen color in it', () => {
    paint(SIXTEEN[7].value)

    const shown = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))
    expect(shown).toEqual(['C0 color', 'C1 color', 'C2 color', 'C3 color', 'C7 color'])
    expect(screen.getByRole('radio', { name: 'C7 color' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Show more colors' })).toBeInTheDocument()
  })

  it('still opens to all of them, in their order, and folds back', async () => {
    paint(SIXTEEN[7].value)

    await userEvent.click(screen.getByRole('button', { name: 'Show more colors' }))
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(
      SIXTEEN.map((c) => `${c.name} color`)
    )

    await userEvent.click(screen.getByRole('button', { name: 'Show fewer colors' }))
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('leaves the row alone when the chosen color is already in it', () => {
    paint(SIXTEEN[2].value)

    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'C0 color',
      'C1 color',
      'C2 color',
      'C3 color',
      'C4 color',
    ])
  })
})
