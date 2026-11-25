import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { followInputModality, giveFocusBack } from './quietFocus'

/**
 * Focus given back by script lights the keyboard ring only when the keyboard was driving.
 * jsdom never matches :focus-visible after a script's focus, which is what an engine that
 * reads `focusVisible: false` does. `oldEngine` makes the element match it anyway, as an
 * engine that ignores the option would, to see the fallback mark at work.
 */
let stop: () => void
let target: HTMLButtonElement

beforeEach(() => {
  stop = followInputModality(window)
  target = document.createElement('button')
  document.body.append(target)
})

afterEach(() => {
  stop()
  target.remove()
})

const oldEngine = () =>
  vi
    .spyOn(target, 'matches')
    .mockImplementation(
      (selector) =>
        selector === ':focus-visible' || Element.prototype.matches.call(target, selector)
    )

const key = (k: string, on: EventTarget = document.body) =>
  on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
const pointer = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))

describe('giving the focus back', () => {
  it('asks for no ring when nothing has been pressed yet', () => {
    const focus = vi.spyOn(target, 'focus')
    giveFocusBack(target)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false })
  })

  it('asks for no ring after a pointer, and marks it for an engine that ignores that', () => {
    key('Tab')
    pointer()
    oldEngine()
    const focus = vi.spyOn(target, 'focus')
    giveFocusBack(target)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false })
    expect(target).toHaveFocus()
    expect(target).toHaveAttribute('data-focus-quiet')
  })

  it('leaves no mark where the engine took the option', () => {
    giveFocusBack(target)
    expect(target).toHaveFocus()
    expect(target).not.toHaveAttribute('data-focus-quiet')
  })

  it('lets the ring show after a key, as Escape on a real keyboard', () => {
    pointer()
    key('Escape')
    oldEngine()
    const focus = vi.spyOn(target, 'focus')
    giveFocusBack(target)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(target).not.toHaveAttribute('data-focus-quiet')
  })

  it('does not count a modifier alone, or a letter typed in a field, as the keyboard', () => {
    const field = document.createElement('input')
    document.body.append(field)
    key('Shift')
    key('a', field)
    oldEngine()
    giveFocusBack(target)
    expect(target).toHaveAttribute('data-focus-quiet')
    field.remove()
  })

  it('counts Tab and Escape pressed in a field', () => {
    const field = document.createElement('input')
    document.body.append(field)
    key('Escape', field)
    oldEngine()
    giveFocusBack(target)
    expect(target).not.toHaveAttribute('data-focus-quiet')
    field.remove()
  })

  it('takes the mark off at the next key, so the ring the keyboard is owed shows', () => {
    oldEngine()
    giveFocusBack(target)
    expect(target).toHaveAttribute('data-focus-quiet')
    key('Tab')
    expect(target).not.toHaveAttribute('data-focus-quiet')
  })

  it('takes the mark off when the focus moves on', () => {
    oldEngine()
    giveFocusBack(target)
    target.blur()
    expect(target).not.toHaveAttribute('data-focus-quiet')
  })
})
