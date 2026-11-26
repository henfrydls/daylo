/**
 * Tab, by its name or, where the engine has none for it, by the key it was pressed on.
 *
 * WebKitGTK, the engine of the Linux app, names Shift+Tab "Unidentified": GTK turns
 * Shift+Tab into ISO_Left_Tab before the page sees it, and the engine has no name for that.
 * Measured with real X key events in WebKitGTK 2.52: key "Unidentified", code "Tab",
 * shiftKey true. Read by its name alone, Shift+Tab walked out of every sheet on Linux, did
 * not close the menu, and did not count as the keyboard driving.
 *
 * Only an unnamed key is read by where it was pressed: a layout that puts another key there
 * says what it is. Shift is the only modifier that leaves it Tab.
 */
export function isTab(event: KeyboardEvent): boolean {
  // With Ctrl, Alt or Meta it is not moving around the page: Ctrl+Tab changes the browser's
  // tab on the web, Alt+Tab and Cmd+Tab change the app.
  if (event.ctrlKey || event.altKey || event.metaKey) return false
  return event.key === 'Tab' || (event.key === 'Unidentified' && event.code === 'Tab')
}
