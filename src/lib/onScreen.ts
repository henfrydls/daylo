/**
 * The first element matching `selector` that somebody could actually reach: drawn, and not
 * inside the hidden view the phone keeps beside the one on screen, which is inert.
 *
 * For giving the focus somewhere when the thing that had it is gone. The views are mounted
 * twice on a phone, so "the Today bar" by test id alone can be the one nobody can see.
 */
export function onScreen(selector: string): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    if (reachable(node)) return node
  }
  return null
}

/**
 * Whether the focus could land on this node and somebody see it there: on the page, not
 * inert, drawn. Being on the page alone is not enough: the door in Year is still connected
 * when it has gone into the hidden, inert view beside Month.
 */
export function reachable(node: HTMLElement): boolean {
  return (
    node.isConnected &&
    node.closest('[inert]') === null &&
    getComputedStyle(node).visibility !== 'hidden' &&
    !underDisplayNone(node)
  )
}

/** `display` is not inherited, so a node inside a `display: none` box says block. */
function underDisplayNone(node: HTMLElement): boolean {
  for (let at: HTMLElement | null = node; at !== null; at = at.parentElement) {
    if (getComputedStyle(at).display === 'none') return true
  }
  return false
}
