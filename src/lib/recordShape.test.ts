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
 * What a log's createdAt has to be to open: what `new Date` reads, as in every version
 * before. Stricter would send somebody whose app works today to the rescue screen, and
 * refuse a backup that came out of Daylo itself. Whatever reads the field with parseISO
 * copes with what it cannot read (feedbackInvite).
 */
describe('when a log was created', () => {
  it.each(['2026/11/01', 'Sun Nov 01 2026', '1', '12', '2026-02-30'])(
    'takes %j, which new Date reads, as it always has',
    (createdAt) => {
      expect(logFault({ ...log, createdAt })).toBeNull()
    }
  )

  it.each(['garbage', ''])('is refused when it is %j', (createdAt) => {
    expect(logFault({ ...log, createdAt })).toBe('createdAt')
  })

  it('is refused when it is not a string', () => {
    expect(logFault({ ...log, createdAt: 1762000000000 })).toBe('createdAt')
    expect(logFault({ ...log, createdAt: undefined })).toBe('createdAt')
  })

  it('takes what the app writes, which is toISOString', () => {
    expect(logFault({ ...log, createdAt: new Date().toISOString() })).toBeNull()
    expect(logFault({ ...log, createdAt: '2024-11-12T21:14:05.123Z' })).toBeNull()
  })
})
