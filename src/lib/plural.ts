/**
 * The word for a count: the singular for exactly one, the plural for anything else,
 * nothing included. "1 active days" and "1/1 activities" were what everybody saw on their
 * first day, with one activity and one day done.
 *
 * English only, because the app is: the day it speaks another language this is the one
 * place to change, which is why every count in the app goes through it rather than its
 * own ternary.
 */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/** The number and its word together: "1 log", "2 logs". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${plural(n, one, many)}`
}
