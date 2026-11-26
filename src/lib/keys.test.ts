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

  // Ctrl+Tab changes the browser's tab on the web, Alt+Tab and Cmd+Tab change the app:
  // none of them is moving around the page.
  it('is not Tab with Ctrl, Alt or Meta held', () => {
    expect(isTab(press({ key: 'Tab', code: 'Tab', ctrlKey: true }))).toBe(false)
    expect(isTab(press({ key: 'Tab', code: 'Tab', altKey: true }))).toBe(false)
    expect(isTab(press({ key: 'Tab', code: 'Tab', metaKey: true }))).toBe(false)
    expect(isTab(press({ key: 'Unidentified', code: 'Tab', shiftKey: true, ctrlKey: true }))).toBe(
      false
    )
  })
})
