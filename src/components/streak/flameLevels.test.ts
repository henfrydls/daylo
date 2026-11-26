import { describe, it, expect } from 'vitest'
import { FLAME_LEVELS, flameLevelFor } from './flameLevels'

describe('the flame for a run', () => {
  it('has the eleven steps Henfry picked, from these days', () => {
    expect(FLAME_LEVELS.map((level) => level.from)).toEqual([
      1, 3, 7, 14, 30, 60, 100, 180, 270, 365, 730,
    ])
  })

  // Below one day there is no pill (the chip says nothing with no run), but the function
  // still answers with a step rather than nothing, so whoever asks never has to make one up.
  it.each([0, -1, -365])('gives the first step for %i days', (days) => {
    expect(flameLevelFor(days)).toBe(FLAME_LEVELS[0])
  })

  it('starts as an ember on the first day', () => {
    expect(flameLevelFor(1)?.name).toBe('ember')
  })

  // Each step begins on its own day and not the day before, which still has the last one.
  it.each([
    [2, 'ember', 3, 'flame'],
    [6, 'flame', 7, 'heart'],
    [13, 'heart', 14, 'big-heart'],
    [29, 'big-heart', 30, 'fire'],
    [59, 'fire', 60, 'two-flames'],
    [99, 'two-flames', 100, 'three-flames'],
    [179, 'three-flames', 180, 'bonfire'],
    [269, 'bonfire', 270, 'bonfire-embers'],
    [364, 'bonfire-embers', 365, 'blue-bonfire'],
    [729, 'blue-bonfire', 730, 'double-bonfire'],
  ])('is still %i days of %s, and %i days of %s', (before, was, on, is) => {
    expect(flameLevelFor(before)?.name).toBe(was)
    expect(flameLevelFor(on)?.name).toBe(is)
  })

  // 730 is "730 or more": the last step has no end, so a run that keeps going never falls
  // off the ladder or back down it.
  it.each([731, 1000, 5000, 100000])('stays on the last step at %i days', (days) => {
    expect(flameLevelFor(days)?.name).toBe('double-bonfire')
  })

  // The 14-day step keeps the green: the heart grows, and nothing turns orange until 30.
  it('keeps the house green until the fire at 30', () => {
    const green = FLAME_LEVELS.filter((level) => level.from < 30)
    expect(green.every((level) => level.heat === 'green' || level.heat === 'green-core')).toBe(true)
    expect(flameLevelFor(30)?.heat).toBe('fire')
    expect(flameLevelFor(365)?.heat).toBe('blue')
  })
})
