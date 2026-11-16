/**
 * The first element matching `selector` that somebody could actually reach: drawn, and not
 * inside the hidden view the phone keeps beside the one on screen, which is inert.
 *
 * For giving the focus somewhere when the thing that had it is gone. The views are mounted
 * twice on a phone, so "the Today bar" by test id alone can be the one nobody can see.
 */
export function onScreen(selector: string): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    if (node.closest('[inert]') !== null) continue
    const style = getComputedStyle(node)
    if (style.display !== 'none' && style.visibility !== 'hidden') return node
  }
  return null
}
