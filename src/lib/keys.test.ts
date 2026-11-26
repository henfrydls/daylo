import { describe, it, expect } from 'vitest'
import { isTab } from './keys'

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('isTab', () => {
  it('knows Tab and Shift+Tab by name', () => {
    expect(isTab(press({ key: 'Tab', code: 'Tab' }))).toBe(true)
    expect(isTab(press({ key: 'Tab', code: 'Tab', shiftKey: true }))).toBe(true)
  })

  // WebKitGTK names Shift+Tab "Unidentified": GTK turns it into ISO_Left_Tab first.
  // Measured with real X key events in WebKitGTK 2.52.
  it('knows the Shift+Tab WebKitGTK sends, by the key it was pressed on', () => {
    expect(isTab(press({ key: 'Unidentified', code: 'Tab', shiftKey: true }))).toBe(true)
  })

  it('is not any other key, nor another unnamed one', () => {
    expect(isTab(press({ key: 'Escape', code: 'Escape' }))).toBe(false)
    expect(isTab(press({ key: 'Unidentified', code: 'KeyQ' }))).toBe(false)
    // A layout that puts another key where Tab is says so by name.
    expect(isTab(press({ key: 'a', code: 'Tab' }))).toBe(false)
  })
})
