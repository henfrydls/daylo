import { reachable } from './onScreen'

/** Everything that can take the focus at all, before asking whether Tab stops there. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]'

/**
 * Whether Tab stops here, short of being drawn: in the tab order, not disabled, and for a
 * radio button, the one a group stops at. That is the chosen one, or with none chosen, any:
 * a browser stops at the first or the last depending on the direction, and either is in the
 * group.
 */
function inTheOrder(node: HTMLElement, within: ParentNode): boolean {
  if (node.tabIndex < 0 || node.matches(':disabled')) return false
  if (
    node instanceof HTMLInputElement &&
    node.type === 'radio' &&
    node.name !== '' &&
    !node.checked
  ) {
    const radios = within.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    return ![...radios].some((radio) => radio.name === node.name && radio.checked)
  }
  return true
}

/** The candidates in page order, without the cost of asking whether each one is drawn. */
function candidates(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) =>
    inTheOrder(node, container)
  )
}

/**
 * The controls in `container` that Tab stops at, in page order: in the tab order, not
 * disabled, drawn and not inert. The one meaning of "can have the focus" for a trap's first
 * focus, its Tab and the focus it gives to a trap underneath.
 */
export function tabbable(container: HTMLElement): HTMLElement[] {
  return candidates(container).filter(reachable)
}

/**
 * Where Tab (or Shift+Tab, `backwards`) goes from `from` inside `container`, going round at
 * either end. From a control in the list, the one beside it; from something else inside
 * (a list that scrolls, a grid cell with tabIndex -1), the first control after it, or before
 * it, on the page; from outside, or from the container itself, the first or the last.
 * Null when there is nothing at all.
 *
 * Walks out from where it starts and asks whether a control is drawn only on the way,
 * which is one or two questions for a Tab and not one for every control in the sheet.
 */
export function nextTabbable(
  container: HTMLElement,
  from: Element | null,
  backwards: boolean
): HTMLElement | null {
  const list = candidates(container)
  const n = list.length
  if (n === 0) return null

  let start: number
  const at = from === null ? -1 : list.indexOf(from as HTMLElement)
  if (at !== -1) {
    start = at + (backwards ? -1 : 1)
  } else if (from !== null && from !== container && container.contains(from)) {
    if (backwards) {
      start = -1
      for (let i = n - 1; i >= 0; i--) {
        if (from.compareDocumentPosition(list[i]) & Node.DOCUMENT_POSITION_PRECEDING) {
          start = i
          break
        }
      }
    } else {
      start = n
      for (let i = 0; i < n; i++) {
        if (from.compareDocumentPosition(list[i]) & Node.DOCUMENT_POSITION_FOLLOWING) {
          start = i
          break
        }
      }
    }
  } else {
    start = backwards ? n - 1 : 0
  }

  for (let step = 0; step < n; step++) {
    const i = (((start + (backwards ? -step : step)) % n) + n) % n
    if (reachable(list[i])) return list[i]
  }
  return null
}
