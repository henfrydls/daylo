import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

describe('useMediaQuery', () => {
  let listeners: Array<(e: MediaQueryListEvent) => void> = []

  const createMockMediaQueryList = (matches: boolean, query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        listeners.push(handler)
      }
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        listeners = listeners.filter((l) => l !== handler)
      }
    }),
    dispatchEvent: vi.fn(),
  })

  beforeEach(() => {
    listeners = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return true when media query matches', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => createMockMediaQueryList(true, query)),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(true)
  })

  it('should return false when media query does not match', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => createMockMediaQueryList(false, query)),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)
  })

  it('should update when media query changes from match to no-match', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => createMockMediaQueryList(true, query)),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(true)

    act(() => {
      listeners.forEach((handler) => handler({ matches: false } as MediaQueryListEvent))
    })

    expect(result.current).toBe(false)
  })

  it('should update when media query changes from no-match to match', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => createMockMediaQueryList(false, query)),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)

    act(() => {
      listeners.forEach((handler) => handler({ matches: true } as MediaQueryListEvent))
    })

    expect(result.current).toBe(true)
  })

  it('should clean up event listener on unmount', () => {
    const mockMql = createMockMediaQueryList(true, '(min-width: 1024px)')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMql),
    })

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(mockMql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    unmount()
    expect(mockMql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
