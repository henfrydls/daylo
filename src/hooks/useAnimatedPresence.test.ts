import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnimatedPresence } from './useAnimatedPresence'

describe('useAnimatedPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render and be visible when isOpen is true', () => {
    const { result } = renderHook(() => useAnimatedPresence(true, 200))
    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })

  it('should not render when isOpen is false initially', () => {
    const { result } = renderHook(() => useAnimatedPresence(false, 200))
    expect(result.current.shouldRender).toBe(false)
    expect(result.current.isVisible).toBe(false)
  })

  it('should keep rendering during exit animation', () => {
    const { result, rerender } = renderHook(({ isOpen }) => useAnimatedPresence(isOpen, 200), {
      initialProps: { isOpen: true },
    })
    rerender({ isOpen: false })
    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(false)
  })

  it('should stop rendering after exit animation duration', () => {
    const { result, rerender } = renderHook(({ isOpen }) => useAnimatedPresence(isOpen, 200), {
      initialProps: { isOpen: true },
    })
    rerender({ isOpen: false })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.shouldRender).toBe(false)
  })

  it('should cancel exit animation if reopened before duration', () => {
    const { result, rerender } = renderHook(({ isOpen }) => useAnimatedPresence(isOpen, 200), {
      initialProps: { isOpen: true },
    })
    rerender({ isOpen: false })
    expect(result.current.isVisible).toBe(false)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ isOpen: true })
    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })
})
