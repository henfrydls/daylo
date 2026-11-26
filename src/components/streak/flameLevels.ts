/**
 * How the flame in the streak chip grows with the run.
 *
 * Eleven steps, each from its first day until the next one begins. The last has no end:
 * 730 is "730 or more", so a run of a thousand days or a hundred thousand stays on it rather
 * than falling off the ladder. A broken run starts again from the first step, with no word
 * about it, and the steps are not explained anywhere: the number already says how long the
 * run is, and the flame only says it again without words.
 *
 * Each step adds to the one before, with one exception. The heart is lit at 7 and grows at
 * 14, the whole flame is fire at 30, then there are two and three of them. At 180 the three
 * flames give way to a single bonfire, wider and taller than any one of them; after that come
 * embers over it, a blue bonfire at a year and two of them at two years. The wait for each step is never
 * shorter than the one before: 2, 4, 7, 16, 30, 40, 80, 90, 95 and 365 days.
 */

/** What is drawn: a small flame, the flame, or the wider bonfire, with embers over it or not. */
export type FlameShape = 'ember' | 'flame' | 'bonfire' | 'bonfire-embers'

/** The house green, the green with its heart lit, fire, or the blue of a whole year. */
export type FlameHeat = 'green' | 'green-core' | 'fire' | 'blue'

export interface FlameLevel {
  /** The first day of the run this step is drawn for. */
  from: number
  /** What the step is called in tests and in the page, never on screen. */
  name: string
  shape: FlameShape
  heat: FlameHeat
  /** How many are drawn side by side. */
  count: 1 | 2 | 3
  /** The lit heart, grown to fill most of the flame: the step at 14 days. */
  bigCore?: boolean
}

export const FLAME_LEVELS: readonly FlameLevel[] = [
  { from: 1, name: 'ember', shape: 'ember', heat: 'green', count: 1 },
  { from: 3, name: 'flame', shape: 'flame', heat: 'green', count: 1 },
  { from: 7, name: 'heart', shape: 'flame', heat: 'green-core', count: 1 },
  { from: 14, name: 'big-heart', shape: 'flame', heat: 'green-core', count: 1, bigCore: true },
  { from: 30, name: 'fire', shape: 'flame', heat: 'fire', count: 1 },
  { from: 60, name: 'two-flames', shape: 'flame', heat: 'fire', count: 2 },
  { from: 100, name: 'three-flames', shape: 'flame', heat: 'fire', count: 3 },
  { from: 180, name: 'bonfire', shape: 'bonfire', heat: 'fire', count: 1 },
  { from: 270, name: 'bonfire-embers', shape: 'bonfire-embers', heat: 'fire', count: 1 },
  { from: 365, name: 'blue-bonfire', shape: 'bonfire-embers', heat: 'blue', count: 1 },
  { from: 730, name: 'double-bonfire', shape: 'bonfire-embers', heat: 'blue', count: 2 },
]

/**
 * The step for a run of so many days. Below one day it is the first step: there is no chip
 * with no run, but whoever asks always gets a step back.
 */
export function flameLevelFor(days: number): FlameLevel {
  let level = FLAME_LEVELS[0]
  for (const step of FLAME_LEVELS) if (days >= step.from) level = step
  return level
}
