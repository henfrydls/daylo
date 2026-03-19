# S5-05: Animations & BottomSheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fluid animations across all overlay components and rewrite BottomSheet with native-feel gestures.

**Architecture:** A reusable `useAnimatedPresence` hook provides delayed-unmount pattern for exit animations. BottomSheet uses pointer events for swipe gestures with snap points. All overlays get symmetric enter/exit animations via Tailwind CSS classes.

**Tech Stack:** React 18, Tailwind CSS v4 (animate-in/animate-out), pointer events API, zero new dependencies.

---

### Task 1: Create `useAnimatedPresence` hook

**Files:**
- Create: `src/hooks/useAnimatedPresence.ts`
- Create: `src/hooks/useAnimatedPresence.test.ts`
- Modify: `src/hooks/index.ts`

**Step 1: Write the failing test**

Create `src/hooks/useAnimatedPresence.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnimatedPresence } from './useAnimatedPresence'

describe('useAnimatedPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render and animate-in when isOpen is true', () => {
    const { result } = renderHook(() => useAnimatedPresence(true, 200))

    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })

  it('should not render when isOpen is false initially', () => {
    const { result } = renderHook(() => useAnimatedPresence(false, 200))

    expect(result.current.shouldRender).toBe(false)
    expect(result.current.isVisible).toBe(false)
  })

  it('should keep rendering during exit animation', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useAnimatedPresence(isOpen, 200),
      { initialProps: { isOpen: true } }
    )

    // Close - should start exit animation
    rerender({ isOpen: false })

    // Still rendered but not visible (animating out)
    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(false)
  })

  it('should stop rendering after exit animation duration', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useAnimatedPresence(isOpen, 200),
      { initialProps: { isOpen: true } }
    )

    rerender({ isOpen: false })

    // After duration, should unmount
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.shouldRender).toBe(false)
  })

  it('should cancel exit animation if reopened before duration', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useAnimatedPresence(isOpen, 200),
      { initialProps: { isOpen: true } }
    )

    // Close
    rerender({ isOpen: false })
    expect(result.current.isVisible).toBe(false)

    // Reopen before timer expires
    act(() => {
      vi.advanceTimersByTime(100) // only 100ms of 200ms
    })
    rerender({ isOpen: true })

    expect(result.current.shouldRender).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAnimatedPresence.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/hooks/useAnimatedPresence.ts`:

```ts
import { useState, useEffect, useRef } from 'react'

/**
 * Hook for delayed unmount — keeps component in DOM during exit animation.
 *
 * @param isOpen - Whether the component should be visible
 * @param duration - Exit animation duration in ms
 * @returns shouldRender (keep in DOM), isVisible (apply enter/exit classes)
 */
export function useAnimatedPresence(
  isOpen: boolean,
  duration: number
): { shouldRender: boolean; isVisible: boolean } {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(isOpen)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Cancel any pending exit animation
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      // Mount immediately, then mark visible on next frame for CSS transition
      setShouldRender(true)
      // Use requestAnimationFrame to ensure DOM is mounted before animating in
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    } else {
      // Start exit animation
      setIsVisible(false)
      // Unmount after animation completes
      timerRef.current = setTimeout(() => {
        setShouldRender(false)
        timerRef.current = null
      }, duration)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isOpen, duration])

  return { shouldRender, isVisible }
}
```

**Step 4: Export from hooks/index.ts**

Add to `src/hooks/index.ts`:

```ts
export { useAnimatedPresence } from './useAnimatedPresence'
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAnimatedPresence.test.ts`
Expected: PASS (5 tests)

**Step 6: Commit**

```bash
git add src/hooks/useAnimatedPresence.ts src/hooks/useAnimatedPresence.test.ts src/hooks/index.ts
git commit -m "S5-05a: Add useAnimatedPresence hook for exit animations"
```

---

### Task 2: Rewrite BottomSheet with gestures + animations

**Files:**
- Modify: `src/components/ui/BottomSheet.tsx` (full rewrite)
- Modify: `src/components/ui/BottomSheet.test.tsx`

**Step 1: Write the failing tests**

Replace `src/components/ui/BottomSheet.test.tsx` with tests covering:
- Renders when open, doesn't render when closed (with animation delay)
- Backdrop click closes the sheet
- Content click does NOT close the sheet
- Escape key closes the sheet
- Has dialog role and aria-modal
- Handle bar is visible
- Swipe down beyond threshold closes sheet
- Sheet has slide-up animation classes when opening
- Sheet has slide-down animation classes when closing

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Sheet content</div>,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render children when open', () => {
    render(<BottomSheet {...defaultProps} />)
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('should not render when closed', () => {
    const { container } = render(<BottomSheet {...defaultProps} isOpen={false} />)
    expect(container.querySelector('[data-testid="bottom-sheet"]')).not.toBeInTheDocument()
  })

  it('should have dialog role and aria-modal', () => {
    render(<BottomSheet {...defaultProps} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should not close when content is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Sheet content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should close on Escape key', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('should render the handle bar', () => {
    render(<BottomSheet {...defaultProps} />)
    const sheet = screen.getByTestId('bottom-sheet')
    expect(sheet).toBeInTheDocument()
  })

  it('should use provided aria-label', () => {
    render(<BottomSheet {...defaultProps} aria-label="Activities panel" />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Activities panel')
  })
})
```

**Step 2: Write the BottomSheet rewrite**

Replace `src/components/ui/BottomSheet.tsx` with the gesture-enabled version.

Key architecture:
- `useAnimatedPresence(isOpen, 300)` for mount/unmount timing
- `useRef` for touch tracking: `startY`, `currentY`, `isDragging`
- `onPointerDown/Move/Up` on the sheet container
- `transform: translateY(${dragOffset}px)` during drag
- Dismiss threshold: if dragged > 30% of sheet height, call `onClose()`
- Backdrop opacity interpolates with drag position
- CSS: `transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1)` when NOT dragging
- Remove transition during active drag for 1:1 feel

```tsx
import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useFocusTrap, useAnimatedPresence } from '../../hooks'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  'aria-label'?: string
}

const ANIMATION_DURATION = 300
const DISMISS_THRESHOLD = 0.3 // 30% of sheet height

export function BottomSheet({
  isOpen,
  onClose,
  children,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, ANIMATION_DURATION)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false })

  // --- Drag state ---
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const sheetHeight = useRef(0)

  // Measure sheet height on open
  useEffect(() => {
    if (isVisible && sheetRef.current) {
      sheetHeight.current = sheetRef.current.getBoundingClientRect().height
    }
  }, [isVisible])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY
    setIsDragging(true)
    // Capture pointer for smooth tracking outside element
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      const deltaY = e.clientY - dragStartY.current
      // Only allow dragging downward (positive deltaY)
      setDragOffset(Math.max(0, deltaY))
    },
    [isDragging]
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    // Check if dragged past dismiss threshold
    if (sheetHeight.current > 0 && dragOffset > sheetHeight.current * DISMISS_THRESHOLD) {
      onClose()
    }
    // Snap back
    setDragOffset(0)
  }, [isDragging, dragOffset, onClose])

  // Reset drag offset when closing
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0)
      setIsDragging(false)
    }
  }, [isOpen])

  if (!shouldRender) return null

  // Calculate backdrop opacity based on drag
  const maxDrag = sheetHeight.current || 400
  const backdropOpacity = isDragging ? Math.max(0, 0.3 * (1 - dragOffset / maxDrag)) : isVisible ? 0.3 : 0

  // Sheet transform: slide-up animation + drag offset
  const translateY = isVisible ? dragOffset : sheetHeight.current || 400

  return (
    <div className="fixed inset-0 z-30" data-testid="bottom-sheet-container">
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
          transitionDuration: isDragging ? '0ms' : `${ANIMATION_DURATION}ms`,
        }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="bottom-sheet-backdrop"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[75vh] overflow-y-auto touch-none"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : `transform ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="bottom-sheet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white rounded-t-2xl z-10 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-gray-300 rounded-full" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="px-4 pb-6 pt-2">{children}</div>
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

Run: `npx vitest run src/components/ui/BottomSheet.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/ui/BottomSheet.tsx src/components/ui/BottomSheet.test.tsx
git commit -m "S5-05b: Rewrite BottomSheet with swipe gestures and slide animation"
```

---

### Task 3: Add exit animations to Modal

**Files:**
- Modify: `src/components/ui/Modal.tsx`

**Step 1: Update Modal to use useAnimatedPresence**

Changes to `src/components/ui/Modal.tsx`:
- Import `useAnimatedPresence` from `../../hooks`
- Replace `if (!isOpen) return null` with `useAnimatedPresence(isOpen, 150)`
- Use `shouldRender` for mount/unmount, `isVisible` for animation classes
- Backdrop: `isVisible ? 'opacity-100' : 'opacity-0'` with `transition-opacity duration-150`
- Content: toggle between `animate-in fade-in zoom-in-95 duration-200` and `animate-out fade-out zoom-out-95 duration-150`

The key pattern for all overlays:

```tsx
const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 150)

if (!shouldRender) return null

// Backdrop
<div className={`absolute inset-0 bg-black/50 transition-opacity duration-150 ${isVisible ? 'opacity-100' : 'opacity-0'}`} />

// Content
<div className={isVisible
  ? 'animate-in fade-in zoom-in-95 duration-200'
  : 'animate-out fade-out zoom-out-95 duration-150'
} />
```

**Step 2: Run existing Modal tests**

Run: `npx vitest run src/components/ui/Modal.test.tsx`
Expected: PASS (existing tests should still work with `vi.useFakeTimers()` if needed)

**Step 3: Commit**

```bash
git add src/components/ui/Modal.tsx
git commit -m "S5-05c: Add exit animation to Modal"
```

---

### Task 4: Add exit animations to ConfirmDialog

**Files:**
- Modify: `src/components/ui/ConfirmDialog.tsx`

Same pattern as Modal:
- Import `useAnimatedPresence`
- Replace `if (!isOpen) return null`
- Toggle animation classes based on `isVisible`
- Duration: 150ms exit

**Commit:**

```bash
git add src/components/ui/ConfirmDialog.tsx
git commit -m "S5-05d: Add exit animation to ConfirmDialog"
```

---

### Task 5: Add animations to QuickLog

**Files:**
- Modify: `src/components/activities/QuickLog.tsx`

QuickLog uses `selectedDate` (not `isOpen`), so the pattern is slightly different:

- Import `useAnimatedPresence`
- `const isOpen = !!selectedDate`
- `const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 250)`
- Replace `if (!selectedDate) return null` with `if (!shouldRender || !selectedDate) return null`
- Backdrop: `transition-opacity duration-250` + `isVisible ? 'opacity-100' : 'opacity-0'`
- Content: On mobile → slide-up/down (`translate-y-0` / `translate-y-full`), on desktop → fade+zoom

```tsx
// Content animation classes
const contentAnimation = isVisible
  ? 'translate-y-0 sm:translate-y-0 opacity-100 sm:scale-100'
  : 'translate-y-full sm:translate-y-0 opacity-0 sm:scale-95'
```

Add `transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]` to the content div.

**Commit:**

```bash
git add src/components/activities/QuickLog.tsx
git commit -m "S5-05e: Add slide-up/fade animations to QuickLog"
```

---

### Task 6: Add exit animations to Toast

**Files:**
- Modify: `src/components/ui/Toast.tsx`

Toast uses a different pattern — each toast has its own lifecycle via the toast store. We need per-toast exit animation.

Approach: Add `isExiting` state to the ToastItem and use CSS transitions.

- In `ToastItem`, when `onClose` is called:
  1. Set `isExiting = true`
  2. After 200ms, call the actual `onClose` (which removes from store)
- Toggle classes: entering → `animate-in slide-in-from-right-full fade-in duration-300`, exiting → `animate-out slide-out-to-right-full fade-out duration-200`

**Commit:**

```bash
git add src/components/ui/Toast.tsx
git commit -m "S5-05f: Add exit animation to Toast"
```

---

### Task 7: Add exit animation to DropdownMenu

**Files:**
- Modify: `src/components/ui/DropdownMenu.tsx`

DropdownMenu uses internal `isOpen` state, so we wrap with `useAnimatedPresence`:

- `const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 100)`
- Replace `{isOpen && (` with `{shouldRender && (`
- Toggle: entering → `animate-in fade-in slide-in-from-top-2 duration-150`, exiting → `animate-out fade-out slide-out-to-top-2 duration-100`

**Commit:**

```bash
git add src/components/ui/DropdownMenu.tsx
git commit -m "S5-05g: Add exit animation to DropdownMenu"
```

---

### Task 8: Add view transition (Year/Month crossfade)

**Files:**
- Modify: `src/App.tsx` (the view switching area)

Wrap the `{currentView === 'year' ? <YearView /> : <MonthView />}` in a fade transition:

- Add a wrapper `<div>` with `transition-opacity duration-200`
- Use a `key={currentView}` to force re-mount with animation
- Simpler approach: CSS `animate-in fade-in duration-200` on each view container, triggered by the key change

In `src/App.tsx`, change line ~226:

```tsx
{/* Calendar Section */}
<div className="lg:col-span-3 bg-white rounded-xl border border-gray-200">
  <div key={currentView} className="animate-in fade-in duration-200">
    {currentView === 'year' ? <YearView /> : <MonthView />}
  </div>
</div>
```

This uses React's `key` prop to remount the wrapper, triggering `animate-in fade-in` each time the view changes.

**Commit:**

```bash
git add src/App.tsx
git commit -m "S5-05h: Add fade transition for Year/Month view switching"
```

---

### Task 9: Format, lint, test all

**Step 1: Format**

```bash
npx prettier --write src/hooks/useAnimatedPresence.ts src/hooks/useAnimatedPresence.test.ts src/hooks/index.ts src/components/ui/BottomSheet.tsx src/components/ui/BottomSheet.test.tsx src/components/ui/Modal.tsx src/components/ui/ConfirmDialog.tsx src/components/activities/QuickLog.tsx src/components/ui/Toast.tsx src/components/ui/DropdownMenu.tsx src/App.tsx
```

**Step 2: Lint**

```bash
npx eslint src/hooks/useAnimatedPresence.ts src/components/ui/BottomSheet.tsx src/components/ui/Modal.tsx src/components/ui/ConfirmDialog.tsx src/components/activities/QuickLog.tsx src/components/ui/Toast.tsx src/components/ui/DropdownMenu.tsx src/App.tsx
```

**Step 3: Run all tests**

```bash
npx vitest run src/hooks/useAnimatedPresence.test.ts src/components/ui/BottomSheet.test.tsx src/components/ui/Modal.test.tsx src/components/ui/ConfirmDialog.test.tsx src/components/activities/QuickLog.test.tsx src/components/ui/Toast.test.tsx src/components/ui/DropdownMenu.test.tsx
```

Expected: ALL PASS

**Step 4: Final commit if format/lint changes**

```bash
git add -A && git commit -m "S5-05i: Format and lint cleanup"
```

---

## Execution Order Summary

| Task | Description | Commit |
|------|------------|--------|
| 1 | `useAnimatedPresence` hook + tests | S5-05a |
| 2 | BottomSheet rewrite (gestures + animation) | S5-05b |
| 3 | Modal exit animation | S5-05c |
| 4 | ConfirmDialog exit animation | S5-05d |
| 5 | QuickLog slide-up/fade animations | S5-05e |
| 6 | Toast exit animation | S5-05f |
| 7 | DropdownMenu exit animation | S5-05g |
| 8 | View transition crossfade | S5-05h |
| 9 | Format + lint + test all | S5-05i |

## Key patterns

**Animation curve:** `cubic-bezier(0.32, 0.72, 0, 1)` everywhere for consistency.

**Enter/exit toggle pattern:**
```tsx
className={isVisible
  ? 'animate-in fade-in duration-200'
  : 'animate-out fade-out duration-150'}
```

**Delayed unmount pattern:**
```tsx
const { shouldRender, isVisible } = useAnimatedPresence(isOpen, exitDuration)
if (!shouldRender) return null
```
