import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCalendarStore, STORAGE_KEY, WHERE_SOMEBODY_IS } from './index'
import { useRescueStore } from './rescue'

/**
 * Two windows of Daylo over the same storage.
 *
 * Somebody who thinks Daylo has not refreshed opens it again and gets a second window.
 * They tick today in the new one and close it, go back to the old one and tap anything.
 * The old window wrote everything it held in memory, which did not include today, and the
 * tick was gone without a word. These tests play the second window by writing to
 * localStorage directly, which is exactly what the other window does.
 */

const settle = () => new Promise((done) => setTimeout(done, 20))

const READ = {
  id: 'a1',
  name: 'Read',
  color: '#10B981',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const TICKED_IN_THE_OTHER_WINDOW = {
  id: 'l-other',
  activityId: 'a1',
  date: '2026-11-13',
  completed: true,
  createdAt: '2026-11-13T20:00:00.000Z',
}

function saved(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 0 })
}

/** This window's launch: one activity on disk, read the way a launch reads it. */
async function launch() {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true)
  await settle()
  localStorage.clear()
  useRescueStore.setState({ failure: null })
  localStorage.setItem(
    STORAGE_KEY,
    saved({ activities: [READ], logs: [], checkinEnabled: true, firstOpenedAt: '2026-01-01' })
  )
  await useCalendarStore.persist.rehydrate()
  // Hydrating schedules a write of its own; let it land so the disk is what this window
  // last wrote, the way it is a second after any launch.
  await settle()
}

/** What the other window leaves on the disk: the same activity, with today ticked. */
function otherWindowState() {
  return {
    activities: [READ],
    logs: [TICKED_IN_THE_OTHER_WINDOW],
    checkinEnabled: true,
    firstOpenedAt: '2026-01-01',
  }
}

/** The other window writes, and the browser tells this one, the way it does between tabs. */
function anotherWindowWrites(raw: string | null, key = STORAGE_KEY) {
  if (raw === null) localStorage.removeItem(key)
  else localStorage.setItem(key, raw)
  window.dispatchEvent(
    new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage })
  )
}

/** The other window writes, and nobody tells this one: a web view without the event. */
function anotherWindowWritesQuietly(raw: string) {
  localStorage.setItem(STORAGE_KEY, raw)
}

function comeBackWithFocus() {
  window.dispatchEvent(new Event('focus'))
}

function comeBackFromTheBackground() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** This tab is the one somebody is looking at and typing into. */
function thisTabInFront() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
}

/** A disk that refuses every write from now on; the other tab keeps the real one. */
function refuseThisTabsWrites() {
  const realSetItem = Storage.prototype.setItem
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota exceeded', 'QuotaExceededError')
  })
  return {
    setItem,
    anotherTabWrites(raw: string) {
      realSetItem.call(localStorage, STORAGE_KEY, raw)
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw, storageArea: localStorage })
      )
    },
  }
}

const logsOnDisk = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"state":{"logs":[]}}').state.logs as {
    id: string
  }[]

describe('a second window', () => {
  beforeEach(async () => {
    await launch()
    // Somewhere else unless a test says otherwise: the other tab is the one in front, which
    // is when somebody ticks in it.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('takes in what the other window ticked', () => {
    anotherWindowWrites(saved(otherWindowState()))

    expect(useCalendarStore.getState().logs.map((l) => l.id)).toEqual(['l-other'])
  })

  // The bug itself: the next write from this window used to put back the logs it had in
  // memory, and the tick from the other window went with them.
  it('keeps what the other window ticked when this one writes next', async () => {
    anotherWindowWrites(saved(otherWindowState()))

    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()

    expect(logsOnDisk().map((l) => l.id)).toContain('l-other')
    expect(logsOnDisk()).toHaveLength(2)
  })

  it('takes it in on coming back with the focus, when nobody said anything', async () => {
    anotherWindowWritesQuietly(saved(otherWindowState()))

    comeBackWithFocus()
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()

    expect(logsOnDisk().map((l) => l.id)).toContain('l-other')
  })

  it('takes it in on coming back from the background, when nobody said anything', async () => {
    anotherWindowWritesQuietly(saved(otherWindowState()))

    comeBackFromTheBackground()
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()

    expect(logsOnDisk().map((l) => l.id)).toContain('l-other')
  })

  it('pays no attention to another key', () => {
    const changes = vi.fn()
    const stop = useCalendarStore.subscribe(changes)

    anotherWindowWrites(saved(otherWindowState()), 'something-else')
    stop()

    expect(changes).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().logs).toEqual([])
  })

  // Coming back to the front happens all day long. With nothing new on the disk it must
  // not read, merge and redraw everything each time.
  it('does nothing on coming back when the disk holds what this window last wrote', () => {
    const changes = vi.fn()
    const stop = useCalendarStore.subscribe(changes)

    comeBackWithFocus()
    comeBackFromTheBackground()
    stop()

    expect(changes).not.toHaveBeenCalled()
  })

  // Two windows that answered every change with a write of their own would answer each
  // other for ever.
  it('takes it in without writing anything back', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    anotherWindowWrites(saved(otherWindowState()))
    setItem.mockClear()
    await settle()

    expect(setItem).not.toHaveBeenCalled()
  })

  it('leaves alone everything that belongs to this session, and where somebody is', async () => {
    useCalendarStore.setState({
      selectedDate: '2026-11-02',
      selectedMonth: 10,
      selectedYear: 2026,
      currentView: 'year',
      // A state the stored data would never produce: merging as a launch does would put
      // 'decided' here, since checkinEnabled is on the disk.
      _checkinStart: 'new',
      _feedbackAsked: true,
      _checkinNoticeShown: true,
      _loggedThisSession: true,
      _offerThisSession: 'reminder',
    })
    // Let that write go out, or this window still has a change waiting and keeps its own.
    await settle()
    const before = useCalendarStore.getState()
    const sessionKeys = Object.keys(before).filter((key) => key.startsWith('_'))
    // Every session flag and every place, written on the disk with a value nobody would
    // pick, so a flag added later is covered without anybody remembering to add it here.
    const fromTheOtherWindow: Record<string, unknown> = { ...otherWindowState() }
    for (const key of [...sessionKeys, ...WHERE_SOMEBODY_IS]) {
      fromTheOtherWindow[key] = 'from-the-other-window'
    }

    anotherWindowWrites(saved(fromTheOtherWindow))

    const after = useCalendarStore.getState()
    expect(after.logs.map((l) => l.id)).toEqual(['l-other'])
    expect(sessionKeys.length).toBeGreaterThan(5)
    for (const key of [...sessionKeys, ...WHERE_SOMEBODY_IS]) {
      expect({ key, value: after[key as keyof typeof after] }).toEqual({
        key,
        value: before[key as keyof typeof before],
      })
    }
  })

  // The other window may have been cut off mid-write. What this window holds is good, and
  // the rescue screen is for a launch that has nothing else to show.
  it('ignores what it cannot read, without the rescue screen and without writing', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    anotherWindowWrites('{"state":{"logs":[trunc')
    setItem.mockClear()
    comeBackWithFocus()
    await settle()

    expect(useCalendarStore.getState().activities.map((a) => a.id)).toEqual(['a1'])
    expect(useCalendarStore.getState()._hasHydrated).toBe(true)
    // zustand's own idea of it as well: a failed rehydrate leaves this false for good.
    expect(useCalendarStore.persist.hasHydrated()).toBe(true)
    expect(useRescueStore.getState().failure).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('does not take in an empty disk over what it holds', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const changes = vi.fn()
    const stop = useCalendarStore.subscribe(changes)

    anotherWindowWrites(null)
    comeBackWithFocus()
    await settle()
    stop()

    expect(changes).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().activities.map((a) => a.id)).toEqual(['a1'])
    expect(useRescueStore.getState().failure).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })

  // It parses as JSON and still is not Daylo's: taken in, every list on the screen would
  // break on the first record it tried to read.
  it('ignores a value whose records are not lists, without the rescue screen and without writing', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    anotherWindowWrites(saved({ ...otherWindowState(), logs: { 'l-other': true } }))
    anotherWindowWrites(saved({ ...otherWindowState(), activities: { a1: READ } }))
    setItem.mockClear()
    comeBackWithFocus()
    await settle()

    expect(useCalendarStore.getState().activities.map((a) => a.id)).toEqual(['a1'])
    expect(useCalendarStore.getState().logs).toEqual([])
    expect(useRescueStore.getState().failure).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })

  // The order that made taking in a regression. The other tab had a change of its own on
  // its way when this one ticked, so it never took the tick in, and then it wrote its old
  // copy. Taking that in would wipe the tick off the screen of the person who just made
  // it. Before any of this, this tab kept it and wrote it back with its next change.
  it('keeps what it shows when the other tab writes an older copy while this one is in front', async () => {
    thisTabInFront()
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()

    anotherWindowWrites(
      saved({ activities: [READ], logs: [], checkinEnabled: true, firstOpenedAt: '2026-01-01' })
    )
    comeBackWithFocus()

    expect(useCalendarStore.getState().logs.map((l) => l.date)).toEqual(['2026-11-12'])
    useCalendarStore.getState().addActivity('Walk')
    await settle()
    expect(logsOnDisk().map((l) => (l as unknown as { date: string }).date)).toEqual(['2026-11-12'])
  })

  // The notice says to export so that nothing is lost. What the disk refused is only in
  // memory, and taking in the other tab's copy would put the export's last copy of it
  // out of reach.
  it('keeps a change the disk refused instead of taking in the other tab', async () => {
    const disk = refuseThisTabsWrites()
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()

    disk.anotherTabWrites(saved(otherWindowState()))
    comeBackWithFocus()

    expect(useCalendarStore.getState().logs.map((l) => l.date)).toEqual(['2026-11-12'])
  })

  // Not for ever, though: once the disk takes a write again, the next one from the other
  // tab is taken in as usual.
  it('takes in the other tab again once the disk has taken a write', async () => {
    const disk = refuseThisTabsWrites()
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    await settle()
    disk.setItem.mockRestore()
    useCalendarStore.getState().addActivity('Walk')
    await settle()

    disk.anotherTabWrites(saved(otherWindowState()))

    expect(useCalendarStore.getState().logs.map((l) => l.id)).toEqual(['l-other'])
  })

  // Documented rather than fixed: with a change of its own still waiting to be written,
  // this window wins, as it always did. It takes ticking in two windows within a second or
  // two of each other, and merging record by record is a different piece of work.
  it('keeps its own change when one is still waiting to be written', async () => {
    useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    const changes = vi.fn()
    const stop = useCalendarStore.subscribe(changes)
    anotherWindowWrites(saved(otherWindowState()))
    stop()

    expect(changes).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().logs.map((l) => l.date)).toEqual(['2026-11-12'])
    await settle()
    expect(logsOnDisk().map((l) => l.id)).not.toContain('l-other')
  })
})
