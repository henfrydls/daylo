import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAppVersion } from './useAppVersion'

describe('useAppVersion', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return the package.json version initially', () => {
    const { result } = renderHook(() => useAppVersion())

    // The __APP_VERSION__ is defined in vite.config.ts and injected at build time
    // In tests, it should be the version from package.json (1.0.0)
    expect(result.current).toBe('1.0.0')
  })

  it('should use Tauri version when available', async () => {
    // Mock the Tauri API
    vi.doMock('@tauri-apps/api/app', () => ({
      getVersion: vi.fn().mockResolvedValue('2.0.0'),
    }))

    // Re-import the hook after mocking
    const { useAppVersion: useAppVersionMocked } = await import('./useAppVersion')
    const { result } = renderHook(() => useAppVersionMocked())

    // Wait for the async Tauri version to be fetched
    await waitFor(() => {
      expect(result.current).toBe('2.0.0')
    })
  })

  it('should fall back to package.json version when Tauri is not available', async () => {
    // Mock the Tauri API to throw an error (simulating web mode)
    vi.doMock('@tauri-apps/api/app', () => ({
      getVersion: vi.fn().mockRejectedValue(new Error('Not in Tauri environment')),
    }))

    // Re-import the hook after mocking
    const { useAppVersion: useAppVersionMocked } = await import('./useAppVersion')
    const { result } = renderHook(() => useAppVersionMocked())

    // The version should remain the package.json version
    expect(result.current).toBe('1.0.0')

    // Wait a bit to ensure async operation completes
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should still be the fallback version
    expect(result.current).toBe('1.0.0')
  })
})
