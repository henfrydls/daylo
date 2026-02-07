import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('should render children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('should handle click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    fireEvent.click(screen.getByText('Click me'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>)
    expect(screen.getByText('Click me')).toBeDisabled()
  })

  it('should apply primary variant by default', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByText('Click me')
    expect(button.className).toContain('bg-emerald')
  })

  it('should apply secondary variant', () => {
    render(<Button variant="secondary">Click me</Button>)
    const button = screen.getByText('Click me')
    expect(button.className).toContain('bg-gray')
  })

  it('should apply ghost variant', () => {
    render(<Button variant="ghost">Click me</Button>)
    const button = screen.getByText('Click me')
    expect(button.className).toContain('bg-transparent')
  })

  it('should apply danger variant', () => {
    render(<Button variant="danger">Click me</Button>)
    const button = screen.getByText('Click me')
    expect(button.className).toContain('bg-red')
  })

  it('should apply different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>)
    expect(screen.getByText('Small').className).toContain('text-sm')

    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByText('Large').className).toContain('text-base')
  })

  it('should accept additional className', () => {
    render(<Button className="custom-class">Click me</Button>)
    expect(screen.getByText('Click me').className).toContain('custom-class')
  })

  it('should forward ref', () => {
    const ref = vi.fn()
    render(<Button ref={ref}>Click me</Button>)
    expect(ref).toHaveBeenCalled()
  })
})
