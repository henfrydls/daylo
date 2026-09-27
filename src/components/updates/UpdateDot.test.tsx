import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpdateDot } from './UpdateDot'

describe('the dot', () => {
  // The words are the sr-only line beside it, in the menu and in the trigger's label. A
  // dot that announced itself as well would say the same thing twice to anybody listening.
  it('says nothing to a screen reader', () => {
    render(<UpdateDot />)

    expect(screen.getByTestId('update-dot')).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes a place from whoever puts it somewhere', () => {
    render(<UpdateDot className="absolute right-1.5 top-1.5" />)

    expect(screen.getByTestId('update-dot')).toHaveClass('absolute', 'right-1.5', 'top-1.5')
  })
})
