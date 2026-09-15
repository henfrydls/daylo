import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCheckinFields } from './useCheckinFields'

const checkinFields = vi.hoisted(() => vi.fn())
vi.mock('../lib/checkin', () => ({ checkinFields }))

beforeEach(() => {
  checkinFields.mockReset()
})

describe('asking whether there is a check-in here', () => {
  // Null until the answer arrives, and null forever where there is none. Everything about
  // the check-in hangs off this, so a first render that guessed yes would put a menu entry
  // on the web for one frame and take it away again.
  it('starts with no answer', () => {
    checkinFields.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCheckinFields())

    expect(result.current).toBeNull()
  })

  it('reports the two values once they arrive', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android' })

    const { result } = renderHook(() => useCheckinFields())

    await waitFor(() => expect(result.current).toEqual({ version: '1.3.0', os: 'android' }))
  })

  it('stays with no answer where there is no check-in', async () => {
    checkinFields.mockResolvedValue(null)

    const { result } = renderHook(() => useCheckinFields())

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
