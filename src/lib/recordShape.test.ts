import { describe, it, expect } from 'vitest'
import { logFault } from './recordShape'

const log = {
  id: 'l',
  activityId: 'a',
  date: '2026-11-01',
  completed: true,
  createdAt: '2026-11-01T10:00:00.000Z',
}

/**
 * A log's createdAt is read with parseISO (feedbackInvite), so it has to be something
 * parseISO reads. `new Date` reads far more than that, and what it let through threw a
 * RangeError the moment somebody ticked a day.
 */
describe('when a log was created', () => {
  it.each(['2026/11/01', 'Sun Nov 01 2026', 'November 1, 2026', 'garbage', ''])(
    'is refused when it is %j',
    (createdAt) => {
      expect(logFault({ ...log, createdAt })).toBe('createdAt')
    }
  )

  it('is refused when it is not a string', () => {
    expect(logFault({ ...log, createdAt: 1762000000000 })).toBe('createdAt')
    expect(logFault({ ...log, createdAt: undefined })).toBe('createdAt')
  })

  it('takes what the app writes, which is toISOString', () => {
    expect(logFault({ ...log, createdAt: new Date().toISOString() })).toBeNull()
    expect(logFault({ ...log, createdAt: '2024-11-12T21:14:05.123Z' })).toBeNull()
  })

  // Older fixtures and hand-made backups carry a bare day, which parseISO reads.
  it('takes a bare ISO day', () => {
    expect(logFault({ ...log, createdAt: '2026-11-01' })).toBeNull()
  })
})
