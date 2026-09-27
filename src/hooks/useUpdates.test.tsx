import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUpdates } from './useUpdates'
import { useCalendarStore } from '../store'

// Mocked at the plugin boundary rather than at our own door, so every test here runs the
// real deciding: whatWeMayDo, checkForUpdate and takeUpdate are the code under test too.
const check = vi.fn()
const relaunch = vi.fn()
const invoked = vi.fn()
let format: string | null = 'appimage'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => {
    invoked(command, args)
    if (command === 'install_format') return Promise.resolve(format)
    return Promise.resolve()
  },
  isTauri: () => true,
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunch() }))

const anUpdate = (version = '1.5.0') => ({
  version,
  download: vi.fn(async (onEvent: (p: unknown) => void) => {
    onEvent({ event: 'Started', data: { contentLength: 100 } })
    onEvent({ event: 'Progress', data: { chunkLength: 50 } })
  }),
  install: vi.fn().mockResolvedValue(undefined),
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  check.mockReset().mockResolvedValue(null)
  relaunch.mockReset().mockResolvedValue(undefined)
  invoked.mockReset()
  format = 'appimage'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useCalendarStore.setState({
    _hasHydrated: true,
    updatesEnabled: true,
    updateNoticeSeenFor: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const settle = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('whether it looks at all', () => {
  it('does not ask when the switch is off', async () => {
    useCalendarStore.setState({ updatesEnabled: false })

    renderHook(() => useUpdates())
    await settle()

    expect(check).not.toHaveBeenCalled()
  })

  // A copy from the Microsoft Store is updated by the Store. Asking GitHub would be a
  // request whose answer we could do nothing with, and telling somebody would be telling
  // them to do a job their machine has already done.
  it('asks nothing and offers nothing inside the Store', async () => {
    format = 'store'
    check.mockResolvedValue(anUpdate())

    const { result } = renderHook(() => useUpdates())
    await settle()

    expect(check).not.toHaveBeenCalled()
    expect(result.current.notice).toBeNull()
    expect(result.current.waiting).toBeNull()
    expect(result.current.supported).toBe(false)
  })

  // Nothing patched this copy, so we do not know what it is. The menu entry goes with it:
  // a setting that cannot act on anything is a setting that lies about what it does.
  it('says nothing where nothing packaged this copy', async () => {
    format = null

    const { result } = renderHook(() => useUpdates())
    await settle()

    expect(check).not.toHaveBeenCalled()
    expect(result.current.supported).toBe(false)
  })
})

describe('what a check turns into', () => {
  it('puts the card up when there is a version this copy can install', async () => {
    check.mockResolvedValue(anUpdate())

    const { result } = renderHook(() => useUpdates())

    await waitFor(() =>
      expect(result.current.notice).toEqual({ kind: 'available', version: '1.5.0' })
    )
    expect(result.current.status).toEqual({
      kind: 'available',
      version: '1.5.0',
      canInstall: true,
    })
  })

  it('points at the downloads page for a format it will not install', async () => {
    format = 'deb'
    check.mockResolvedValue(anUpdate())

    const { result } = renderHook(() => useUpdates())

    await waitFor(() =>
      expect(result.current.notice).toEqual({ kind: 'elsewhere', version: '1.5.0' })
    )
    expect(result.current.status).toEqual({
      kind: 'available',
      version: '1.5.0',
      canInstall: false,
    })
  })

  // Nothing on screen, because nobody asked for anything to appear. The answer is kept
  // all the same: it is what the sheet says when somebody opens it, and without it a sheet
  // opened out of the blue would have nothing to show but its own buttons.
  it('shows nothing, and keeps what it found out for the sheet', async () => {
    const { result } = renderHook(() => useUpdates())
    await settle()

    expect(result.current.notice).toBeNull()
    expect(result.current.status).toEqual({ kind: 'up-to-date' })
  })

  // A failure is the other half of this, and it is not kept. An automatic check that went
  // wrong has nothing to tell anybody: nobody asked it a question.
  it('keeps nothing from an automatic check that failed', async () => {
    check.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useUpdates())
    await settle()

    expect(result.current.status).toEqual({ kind: 'idle' })
  })

  // The card is shown once per version and the dot keeps the offer afterwards. Read when
  // the answer arrives rather than while rendering: showing the card is what marks the
  // version seen, so a live condition would take the card away on the frame after it
  // appeared. The check-in's line learned this the hard way.
  it('leaves the card to the dot for a version already shown', async () => {
    useCalendarStore.setState({ updateNoticeSeenFor: '1.5.0' })
    check.mockResolvedValue(anUpdate())

    const { result } = renderHook(() => useUpdates())
    await settle()

    expect(result.current.notice).toBeNull()
    expect(result.current.waiting).toBe('1.5.0')
  })

  it('gives the next version its own turn', async () => {
    useCalendarStore.setState({ updateNoticeSeenFor: '1.5.0' })
    check.mockResolvedValue(anUpdate('1.5.1'))

    const { result } = renderHook(() => useUpdates())

    await waitFor(() =>
      expect(result.current.notice).toEqual({ kind: 'available', version: '1.5.1' })
    )
  })
})

describe('the cross and the dot', () => {
  it('moves the offer to the dot', async () => {
    check.mockResolvedValue(anUpdate())
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())
    expect(result.current.waiting).toBeNull()

    act(() => result.current.later())

    expect(result.current.notice).toBeNull()
    expect(result.current.waiting).toBe('1.5.0')
    // Still there to be taken: the cross means later, not no.
    expect(result.current.status).toEqual({
      kind: 'available',
      version: '1.5.0',
      canInstall: true,
    })
  })
})

describe('taking it', () => {
  it('walks the card through the steps', async () => {
    const update = anUpdate()
    check.mockResolvedValue(update)
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => result.current.act())

    expect(update.install).toHaveBeenCalledOnce()
    await waitFor(() => expect(relaunch).toHaveBeenCalledOnce())
  })

  it('asks for a restart only when the app did not come back by itself', async () => {
    check.mockResolvedValue(anUpdate())
    relaunch.mockRejectedValue(new Error('no'))
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => result.current.act())

    expect(result.current.notice).toEqual({ kind: 'restart' })
  })

  // The button under that sentence is a second try at the one thing that did not happen.
  // Not a second install: the new version is already on disk.
  it('tries the restart again, and downloads nothing more', async () => {
    const update = anUpdate()
    check.mockResolvedValue(update)
    relaunch.mockRejectedValueOnce(new Error('no'))
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())
    await act(async () => result.current.act())
    await waitFor(() => expect(result.current.notice).toEqual({ kind: 'restart' }))

    await act(async () => result.current.act())

    await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(2))
    expect(update.download).toHaveBeenCalledOnce()
  })

  // Opened mid-flight, the sheet may not offer an update that is already being taken.
  it('tells the sheet the work is under way', async () => {
    let arrived: (value: unknown) => void = () => {}
    const update = {
      ...anUpdate(),
      install: vi.fn(() => new Promise((resolve) => (arrived = resolve))),
    }
    check.mockResolvedValue(update)
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    act(() => result.current.act())

    await waitFor(() => expect(result.current.status).toEqual({ kind: 'working' }))
    await act(async () => arrived(undefined))
  })

  it('leaves the restart in the sheet too', async () => {
    check.mockResolvedValue(anUpdate())
    relaunch.mockRejectedValue(new Error('no'))
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => result.current.act())

    await waitFor(() => expect(result.current.status).toEqual({ kind: 'restart' }))
  })

  // A download that failed leaves the offer standing, because trying again is the whole
  // of what there is to do about it.
  it('offers the update again after a failure', async () => {
    const update = { ...anUpdate(), download: vi.fn().mockRejectedValue(new Error('offline')) }
    check.mockResolvedValue(update)
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => result.current.act())

    expect(result.current.notice).toEqual({ kind: 'download-failed' })
    expect(result.current.status).toEqual({
      kind: 'available',
      version: '1.5.0',
      canInstall: true,
    })
  })

  it('opens the downloads page instead of installing what it cannot', async () => {
    format = 'deb'
    check.mockResolvedValue(anUpdate())
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => result.current.act())

    expect(invoked).toHaveBeenCalledWith('plugin:opener|open_url', {
      url: 'https://daylo.henfrydls.com/#download',
    })
  })

  it('does not take the same update twice while it is working', async () => {
    const update = anUpdate()
    check.mockResolvedValue(update)
    const { result } = renderHook(() => useUpdates())
    await waitFor(() => expect(result.current.notice).not.toBeNull())

    await act(async () => {
      result.current.act()
      result.current.act()
    })

    expect(update.download).toHaveBeenCalledOnce()
  })
})

describe('being asked out loud', () => {
  // The automatic check says nothing when it fails; the one somebody pressed owes an
  // answer either way.
  it('reports a failure the automatic check swallowed', async () => {
    check.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useUpdates())
    await settle()
    expect(result.current.status).toEqual({ kind: 'idle' })

    await act(async () => result.current.act())

    expect(result.current.status).toEqual({ kind: 'failed' })
  })

  it('answers a check that found nothing', async () => {
    const { result } = renderHook(() => useUpdates())
    await settle()

    await act(async () => result.current.act())

    expect(result.current.status).toEqual({ kind: 'up-to-date' })
  })

  it('says it is looking while it looks', async () => {
    const { result } = renderHook(() => useUpdates())
    await settle()

    let answer: (value: unknown) => void = () => {}
    check.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    act(() => result.current.act())
    expect(result.current.status).toEqual({ kind: 'checking' })

    await act(async () => answer(null))
    expect(result.current.status).toEqual({ kind: 'up-to-date' })
  })
})

describe('coming back to the window', () => {
  // A desktop is left running for days, and the window coming back is the only thing that
  // says time has passed. Once an hour, because the other reading of "every time the
  // window comes back" is a request to GitHub every time somebody alt-tabs.
  it('does not ask again within the hour', async () => {
    const { unmount } = renderHook(() => useUpdates())
    await settle()
    expect(check).toHaveBeenCalledOnce()

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await settle()

    expect(check).toHaveBeenCalledOnce()
    unmount()
  })

  it('asks again once an hour has passed', async () => {
    renderHook(() => useUpdates())
    await settle()

    vi.setSystemTime(new Date('2026-09-27T11:00:01Z'))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await settle()

    expect(check).toHaveBeenCalledTimes(2)
  })
})
