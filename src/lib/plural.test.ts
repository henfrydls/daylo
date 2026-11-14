import { describe, it, expect } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the plural for nothing', () => {
    expect(plural(0, 'activity', 'activities')).toBe('activities')
  })

  it('uses the singular for exactly one', () => {
    expect(plural(1, 'activity', 'activities')).toBe('activity')
  })

  it('uses the plural for more than one', () => {
    expect(plural(2, 'activity', 'activities')).toBe('activities')
  })
})
