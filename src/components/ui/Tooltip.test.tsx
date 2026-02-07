import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('should render children', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    )
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('should not show tooltip content initially', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('should show tooltip on mouse enter', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByText('Hover me').parentElement!)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Tooltip content')).toBeInTheDocument()
  })

  it('should hide tooltip on mouse leave', () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    )

    const container = screen.getByText('Hover me').parentElement!
    fireEvent.mouseEnter(container)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(container)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('should render ReactNode content', () => {
    render(
      <Tooltip content={<div data-testid="custom-content">Custom</div>}>
        <button>Hover me</button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByText('Hover me').parentElement!)
    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
  })
})
