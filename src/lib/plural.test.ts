import { describe, it, expect } from 'vitest'
import { count, plural } from './plural'

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

describe('count', () => {
  it('puts the number in front of the right word', () => {
    expect(count(0, 'log', 'logs')).toBe('0 logs')
    expect(count(1, 'log', 'logs')).toBe('1 log')
    expect(count(2, 'log', 'logs')).toBe('2 logs')
  })
})
