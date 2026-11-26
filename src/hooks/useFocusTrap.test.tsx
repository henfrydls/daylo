import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { followInputModality } from '../lib/quietFocus'

/**
 * Where the focus goes when a trap lets go.
 *
 * Back to whatever had it before, when that is still on the page. The first day showed
 * the two ways that fails: the door that opened the day sheet is gone by the time the sheet
 * closes (the first activity replaced it with the Today bar), and the round button that
 * opened the activities panel is gone once the last activity is deleted. Both left the
 * focus on <body>.
 */
function Trap({
  open,
  mounted = true,
  fallback,
}: {
  open: boolean
  mounted?: boolean
  fallback?: () => HTMLElement | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, { autoFocus: false, fallbackFocus: fallback })
  return mounted ? (
    <div ref={ref}>
      <button data-testid="inside">Inside</button>
    </div>
  ) : null
}

function Page(props: {
  open: boolean
  opener?: boolean
  mounted?: boolean
  fallback?: () => HTMLElement | null
}) {
  const { opener = true, ...trap } = props
  return (
    <>
      {opener ? <button data-testid="opener">Opener</button> : null}
      <button data-testid="other">Other</button>
      <Trap {...trap} />
    </>
  )
}

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!

afterEach(() => {
  document.body.style.overflow = ''
})

describe('giving the focus back', () => {
  it('goes back to what opened it, when that is still there', () => {
    const { rerender } = render(<Page open={false} />)
    byId('opener').focus()
    rerender(<Page open />)
    act(() => byId('inside').focus())

    rerender(<Page open={false} />)

    expect(document.activeElement).toBe(byId('opener'))
  })

  it('goes to the fallback when what opened it has gone', () => {
    const fallback = () => byId('other')
    const { rerender } = render(<Page open={false} fallback={fallback} />)
    byId('opener').focus()
    rerender(<Page open fallback={fallback} />)
    act(() => byId('inside').focus())
    rerender(<Page open opener={false} fallback={fallback} />)

    rerender(<Page open={false} opener={false} fallback={fallback} />)

    expect(document.activeElement).toBe(byId('other'))
  })

  // A dialog closed over the trap can take the focus with it to <body>: the delete
  // confirmation inside the activities panel, whose button went with the deleted row.
  // Focus lost to the page is still the trap's to give back.
  it('gives it back when the focus had fallen to the page', () => {
    const fallback = () => byId('other')
    const { rerender } = render(<Page open={false} fallback={fallback} />)
    byId('opener').focus()
    rerender(<Page open fallback={fallback} />)
    act(() => byId('inside').focus())
    rerender(<Page open opener={false} fallback={fallback} />)
    act(() => byId('inside').blur())
    expect(document.activeElement).toBe(document.body)

    rerender(<Page open={false} opener={false} fallback={fallback} />)

    expect(document.activeElement).toBe(byId('other'))
  })

  it('leaves it alone when it has moved somewhere else on purpose', () => {
    const { rerender } = render(<Page open={false} fallback={() => byId('opener')} />)
    byId('opener').focus()
    rerender(<Page open fallback={() => byId('opener')} />)
    act(() => byId('other').focus())

    rerender(<Page open={false} fallback={() => byId('opener')} />)

    expect(document.activeElement).toBe(byId('other'))
  })

  // The day sheet is put on the page a render after it is opened, so the trap found no
  // container as it switched on, and then never gave the focus back at all.
  it('gives it back from a container that arrived after it switched on', () => {
    const { rerender } = render(<Page open={false} mounted={false} />)
    byId('opener').focus()
    rerender(<Page open mounted={false} />)
    rerender(<Page open mounted />)
    act(() => byId('inside').focus())

    rerender(<Page open={false} mounted />)

    expect(document.activeElement).toBe(byId('opener'))
  })

  // The door in Year is in the hidden view by the time the day sheet opens over Month, and
  // the focus went with it to <body>. Body is somewhere nobody can be sent back to.
  it('goes to the fallback when it opened with the focus on the page', () => {
    const fallback = () => byId('other')
    const { rerender } = render(<Page open={false} fallback={fallback} />)
    expect(document.activeElement).toBe(document.body)
    rerender(<Page open fallback={fallback} />)
    act(() => byId('inside').focus())

    rerender(<Page open={false} fallback={fallback} />)

    expect(document.activeElement).toBe(byId('other'))
  })

  // A tap on the backdrop drops the focus on <body> with the opener still there. It used
  // to stay there, because sending it back scrolled the page to the opener and lit a ring
  // after a tap. giveFocusBack does neither now, and <body> is where Tab walks the page
  // from the top: back to the opener, quietly.
  it('gives it back, without a ring, after a tap on the backdrop dropped it to the page', () => {
    const stop = followInputModality(window)
    const fallback = () => byId('other')
    const { rerender } = render(<Page open={false} fallback={fallback} />)
    byId('opener').focus()
    rerender(<Page open fallback={fallback} />)
    act(() => byId('inside').focus())
    fireEvent.pointerDown(document.body)
    act(() => byId('inside').blur())
    const focus = vi.spyOn(byId('opener'), 'focus')

    rerender(<Page open={false} fallback={fallback} />)

    expect(document.activeElement).toBe(byId('opener'))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false })
    stop()
  })

  it.each([
    ['inert', (node: HTMLElement) => node.parentElement!.setAttribute('inert', '')],
    ['under display: none', (node: HTMLElement) => (node.parentElement!.style.display = 'none')],
    ['invisible', (node: HTMLElement) => (node.style.visibility = 'hidden')],
  ])('goes to the fallback when what opened it is still there but %s', (_, hide) => {
    const fallback = () => byId('other')
    const { rerender } = render(
      <>
        <div>
          <button data-testid="far">Far</button>
        </div>
        <Page open={false} opener={false} fallback={fallback} />
      </>
    )
    byId('far').focus()
    const view = (open: boolean) => (
      <>
        <div>
          <button data-testid="far">Far</button>
        </div>
        <Page open={open} opener={false} fallback={fallback} />
      </>
    )
    rerender(view(true))
    act(() => byId('inside').focus())
    hide(byId('far'))

    rerender(view(false))

    expect(document.activeElement).toBe(byId('other'))
  })

  // Giving the focus back must not scroll anything: on the phone that moved the page, or
  // the rail, towards what had opened the sheet.
  it('gives it back without scrolling', () => {
    const { rerender } = render(<Page open={false} />)
    byId('opener').focus()
    rerender(<Page open />)
    act(() => byId('inside').focus())
    const focus = vi.spyOn(byId('opener'), 'focus')

    rerender(<Page open={false} />)

    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  })

  // Closed by a tap (the backdrop, Android's back): back without the keyboard ring, and
  // marked for an engine that would draw one anyway.
  it('gives it back without a ring after a pointer', () => {
    const stop = followInputModality(window)
    const { rerender } = render(<Page open={false} />)
    byId('opener').focus()
    rerender(<Page open />)
    act(() => byId('inside').focus())
    fireEvent.pointerDown(byId('inside'))
    const focus = vi.spyOn(byId('opener'), 'focus')
    vi.spyOn(byId('opener'), 'matches').mockImplementation((s) => s === ':focus-visible')

    rerender(<Page open={false} />)

    expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false })
    expect(byId('opener')).toHaveFocus()
    expect(byId('opener')).toHaveAttribute('data-focus-quiet')
    stop()
  })

  // Closed with Escape on a real keyboard: the ring is owed, and nothing holds it back.
  it('gives it back with the ring after a key', () => {
    const stop = followInputModality(window)
    const { rerender } = render(<Page open={false} />)
    byId('opener').focus()
    rerender(<Page open />)
    act(() => byId('inside').focus())
    fireEvent.keyDown(byId('inside'), { key: 'Escape' })
    const focus = vi.spyOn(byId('opener'), 'focus')
    vi.spyOn(byId('opener'), 'matches').mockImplementation((s) => s === ':focus-visible')

    rerender(<Page open={false} />)

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(byId('opener')).toHaveFocus()
    expect(byId('opener')).not.toHaveAttribute('data-focus-quiet')
    stop()
  })
})

/**
 * A trap inside a trap: the delete confirmation over the activities panel. Deleting the
 * last activity takes the confirmation's opener (the row's bin) with it, and with no
 * fallback of its own the focus fell to <body> behind a panel that was still open, where
 * Tab walked out of it. It goes into the trap underneath instead.
 */
type First = 'ok' | 'disabled' | 'hidden' | 'none'
function Outer({
  inner,
  row,
  first = 'ok',
  innerFallback,
  innerMounted = true,
}: {
  inner: boolean
  row: boolean
  first?: First
  innerFallback?: () => HTMLElement | null
  innerMounted?: boolean
}) {
  const outer = useRef<HTMLDivElement>(null)
  useFocusTrap(outer, true, { autoFocus: false })
  return (
    <div ref={outer} data-testid="outer">
      {first === 'none' ? null : (
        <button
          data-testid="add"
          disabled={first === 'disabled'}
          style={first === 'hidden' ? { display: 'none' } : undefined}
        >
          + Add
        </button>
      )}
      {first === 'ok' || first === 'none' ? null : <button data-testid="next">Next</button>}
      {row ? <button data-testid="bin">Delete</button> : null}
      <Inner open={inner} fallback={innerFallback} mounted={innerMounted} />
    </div>
  )
}
function Inner({
  open,
  fallback,
  mounted = true,
}: {
  open: boolean
  fallback?: () => HTMLElement | null
  mounted?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, { autoFocus: false, fallbackFocus: fallback })
  return open && mounted ? (
    <div ref={ref}>
      <button data-testid="confirm">Delete</button>
    </div>
  ) : null
}

describe('a trap over a trap', () => {
  it('sends the focus into the trap underneath when the opener has gone', () => {
    const { rerender } = render(<Outer inner={false} row />)
    byId('bin').focus()
    rerender(<Outer inner row />)
    act(() => byId('confirm').focus())

    rerender(<Outer inner={false} row={false} />)

    expect(byId('outer').contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(byId('add'))
  })

  // The day sheet's fallback is the Today bar, on the page. With a panel still open under
  // the sheet, the bar is behind the panel: the trap underneath comes first.
  it('prefers the trap underneath to its own fallback', () => {
    const page = document.createElement('button')
    document.body.appendChild(page)
    const { rerender } = render(<Outer inner={false} row innerFallback={() => page} />)
    byId('bin').focus()
    rerender(<Outer inner row innerFallback={() => page} />)
    act(() => byId('confirm').focus())

    rerender(<Outer inner={false} row={false} innerFallback={() => page} />)

    expect(document.activeElement).toBe(byId('add'))
    page.remove()
  })

  it.each([
    ['disabled', 'disabled'],
    ['hidden', 'hidden'],
  ] as const)('skips a first control that is %s', (_, first) => {
    const { rerender } = render(<Outer inner={false} row first={first} />)
    byId('bin').focus()
    rerender(<Outer inner row first={first} />)
    act(() => byId('confirm').focus())

    rerender(<Outer inner={false} row={false} first={first} />)

    expect(document.activeElement).toBe(byId('next'))
  })

  it('takes the panel itself when nothing in it can have the focus', () => {
    const { rerender } = render(<Outer inner={false} row first="none" />)
    byId('bin').focus()
    rerender(<Outer inner row first="none" />)
    act(() => byId('confirm').focus())

    rerender(<Outer inner={false} row={false} first="none" />)

    expect(document.activeElement).toBe(byId('outer'))
    expect(byId('outer').tabIndex).toBe(-1)
  })
})

/**
 * A sheet with three controls, the way the day sheet and Settings are: opened from a button
 * on the page behind, which keeps the focus because they do not take it as they open.
 */
function Sheet({ open, lastDisabled = false }: { open: boolean; lastDisabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, { autoFocus: false })
  return (
    <>
      <button data-testid="before">Before</button>
      <button data-testid="opener">Opener</button>
      {open ? (
        <div ref={ref} tabIndex={-1} data-testid="sheet">
          <button data-testid="first">First</button>
          <button data-testid="middle">Middle</button>
          <button data-testid="hidden" style={{ display: 'none' }}>
            Hidden
          </button>
          <button data-testid="last">Last</button>
          <button data-testid="add" disabled={lastDisabled}>
            Add
          </button>
        </div>
      ) : null}
      <button data-testid="after">After</button>
    </>
  )
}

describe('Tab from outside the sheet', () => {
  // Settings, Modal, BottomSheet and the day sheet leave the focus on the button that
  // opened them, on purpose. From there Tab walked the page behind an aria-modal sheet:
  // the trap only wrapped at its own first and last control.
  it('takes Tab from the opener behind it to the first control in it', () => {
    const { rerender } = render(<Sheet open={false} />)
    byId('opener').focus()
    rerender(<Sheet open />)

    const went = fireEvent.keyDown(byId('opener'), { key: 'Tab' })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('first'))
  })

  it('takes Shift+Tab from the opener behind it to the last control in it', () => {
    const { rerender } = render(<Sheet open={false} />)
    byId('opener').focus()
    rerender(<Sheet open />)

    const went = fireEvent.keyDown(byId('opener'), { key: 'Tab', shiftKey: true })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('add'))
  })

  // A tap on nothing inside the sheet drops the focus on <body>, and Tab from there starts
  // at the top of the page.
  it.each([
    ['Tab', false, 'first'],
    ['Shift+Tab', true, 'add'],
  ])('takes %s from the page itself into the sheet', (_, shiftKey, to) => {
    render(<Sheet open />)
    expect(document.activeElement).toBe(document.body)

    const went = fireEvent.keyDown(document.body, { key: 'Tab', shiftKey })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId(to))
  })

  // The sheet itself can hold the focus (the trap gives it there when nothing inside can
  // take it). Shift+Tab from it would go to whatever is before it on the page.
  it('takes Shift+Tab from the sheet itself to its last control', () => {
    render(<Sheet open />)
    act(() => byId('sheet').focus())

    const went = fireEvent.keyDown(byId('sheet'), { key: 'Tab', shiftKey: true })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('add'))
  })

  it('takes Tab from the sheet itself to its first control', () => {
    render(<Sheet open />)
    act(() => byId('sheet').focus())

    fireEvent.keyDown(byId('sheet'), { key: 'Tab' })

    expect(document.activeElement).toBe(byId('first'))
  })

  it('keeps Tab on the sheet itself when nothing in it can have the focus', () => {
    function Empty() {
      const ref = useRef<HTMLDivElement>(null)
      useFocusTrap(ref, true, { autoFocus: false })
      return (
        <>
          <button data-testid="opener">Opener</button>
          <div ref={ref} data-testid="sheet">
            <button disabled>Nothing</button>
          </div>
        </>
      )
    }
    render(<Empty />)
    byId('opener').focus()

    const went = fireEvent.keyDown(byId('opener'), { key: 'Tab' })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('sheet'))
  })

  it('leaves Tab inside the sheet to the browser', () => {
    render(<Sheet open />)
    act(() => byId('first').focus())

    expect(fireEvent.keyDown(byId('first'), { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(byId('first'), { key: 'Tab', shiftKey: true })).toBe(false)
  })

  // The first day's form: with nothing typed, Add is disabled and is the last button in the
  // sheet. The focus can never be on it, so the wrap never fired and Tab left the sheet.
  it('wraps from the last control that can have the focus, past a disabled one', () => {
    render(<Sheet open lastDisabled />)
    act(() => byId('last').focus())

    const went = fireEvent.keyDown(byId('last'), { key: 'Tab' })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('first'))
  })

  it('wraps backwards to the last control that can have the focus', () => {
    render(<Sheet open lastDisabled />)
    act(() => byId('first').focus())

    fireEvent.keyDown(byId('first'), { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(byId('last'))
  })

  // WebKitGTK, the engine of the Linux app, names Shift+Tab "Unidentified": the toolkit
  // turns Shift+Tab into ISO_Left_Tab, and the engine has no name for that. Measured with
  // real X key events in WebKitGTK 2.52: key "Unidentified", code "Tab", shiftKey true.
  // Read by its name alone, Shift+Tab walked out of every sheet on Linux.
  it.each([
    ['from the opener', 'opener', 'add'],
    ['from the first control', 'first', 'add'],
  ])('takes the Shift+Tab WebKitGTK sends %s', (_, from, to) => {
    const { rerender } = render(<Sheet open={false} />)
    byId('opener').focus()
    rerender(<Sheet open />)
    if (from !== 'opener') act(() => byId(from).focus())

    const went = fireEvent.keyDown(byId(from), { key: 'Unidentified', code: 'Tab', shiftKey: true })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId(to))
  })

  it('lets go of Tab once it is closed', () => {
    const { rerender } = render(<Sheet open />)
    rerender(<Sheet open={false} />)
    byId('opener').focus()

    expect(fireEvent.keyDown(byId('opener'), { key: 'Tab' })).toBe(true)
  })
})

describe('keeping Tab inside', () => {
  // The activities panel is put on the page a render after it opens, like the day sheet,
  // and the Tab half of the trap looked for its container only then: it found none and
  // never listened. Tab walked out of the panel to the page behind it.
  it('wraps Tab in a container that arrived after it switched on', () => {
    const { rerender } = render(<Page open={false} mounted={false} />)
    rerender(<Page open mounted={false} />)
    rerender(<Page open mounted />)
    act(() => byId('inside').focus())

    const went = fireEvent.keyDown(byId('inside'), { key: 'Tab' })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('inside'))
  })

  // Only the one in front wraps. The one underneath would otherwise answer the same key
  // and pull the focus out of the confirmation into the panel.
  it('leaves Tab to the trap in front', () => {
    const { rerender } = render(<Outer inner={false} row />)
    rerender(<Outer inner row />)
    act(() => byId('confirm').focus())

    fireEvent.keyDown(byId('confirm'), { key: 'Tab' })

    expect(document.activeElement).toBe(byId('confirm'))
  })

  // The trap in front can be switched on a render before its container is on the page.
  // Until then the one underneath keeps Tab, rather than nobody.
  it('leaves Tab to the trap underneath while the one in front has no container yet', () => {
    const { rerender } = render(<Outer inner={false} row />)
    rerender(<Outer inner row innerMounted={false} />)
    act(() => byId('bin').focus())

    const went = fireEvent.keyDown(byId('bin'), { key: 'Tab' })

    expect(went).toBe(false)
    expect(document.activeElement).toBe(byId('add'))
  })
})
