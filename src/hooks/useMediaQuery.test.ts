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

  it('should return isMobile=false when viewport is >= 640px (desktop)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) =>
        createMockMediaQueryList(true, query)
      ),
    })

    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isMobile).toBe(false)
  })

  it('should return isMobile=true when viewport is < 640px (mobile)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) =>
        createMockMediaQueryList(false, query)
      ),
    })

    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isMobile).toBe(true)
  })

  it('should update isMobile when viewport changes from desktop to mobile', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) =>
        createMockMediaQueryList(true, query) // starts as desktop
      ),
    })

    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isMobile).toBe(false)

    // Simulate viewport shrinking below 640px
    act(() => {
      listeners.forEach((handler) =>
        handler({ matches: false } as MediaQueryListEvent)
      )
    })

    expect(result.current.isMobile).toBe(true)
  })

  it('should update isMobile when viewport changes from mobile to desktop', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) =>
        createMockMediaQueryList(false, query) // starts as mobile
      ),
    })

    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isMobile).toBe(true)

    // Simulate viewport growing to >= 640px
    act(() => {
      listeners.forEach((handler) =>
        handler({ matches: true } as MediaQueryListEvent)
      )
    })

    expect(result.current.isMobile).toBe(false)
  })

  it('should call addEventListener on mount and removeEventListener on unmount', () => {
    const mockMql = createMockMediaQueryList(true, '(min-width: 640px)')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMql),
    })

    const { unmount } = renderHook(() => useMediaQuery())

    expect(mockMql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    unmount()

    expect(mockMql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('should accept a custom media query string', () => {
    const mockMatchMedia = vi.fn().mockImplementation((query: string) =>
      createMockMediaQueryList(query === '(min-width: 1024px)', query)
    )
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: mockMatchMedia,
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(result.current.isMobile).toBe(false) // matches true → not mobile
  })

  it('should use default query (min-width: 640px) when no argument given', () => {
    const mockMatchMedia = vi.fn().mockImplementation((query: string) =>
      createMockMediaQueryList(true, query)
    )
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: mockMatchMedia,
    })

    renderHook(() => useMediaQuery())

    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 640px)')
  })
})
