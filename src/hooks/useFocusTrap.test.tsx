import { describe, it, expect, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

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
})
