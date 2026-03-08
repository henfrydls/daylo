# S5-07 Animations v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add directional view transitions, month nav slide, checkbox bounce, and fix all broken `animate-in/out` classes across the app.

**Architecture:** CSS `@keyframes` in `index.css` for mount animations (key-based remount), CSS `transition-*` utilities for enter/exit animations (isVisible toggle), M3 easing curves as CSS custom properties. Zero new dependencies.

**Tech Stack:** React 19, Tailwind CSS v4.1, Zustand 5, Vitest

**Critical finding:** `animate-in`/`animate-out` classes (used in Modal, ConfirmDialog, DropdownMenu, Toast) produce NO CSS in Tailwind v4 — these are all broken and must be replaced with working CSS transition patterns.

---

### Task 1: Add M3 easing CSS variables and keyframes

**Files:**
- Modify: `src/index.css`

**Step 1: Add CSS custom properties and keyframes to index.css**

Add after the existing `:root` block (after line 32):

```css
/* M3 Motion Tokens */
:root {
  --ease-emphasized-decel: cubic-bezier(0.05, 0.7, 0.1, 1.0);
  --ease-emphasized-accel: cubic-bezier(0.3, 0.0, 0.8, 0.15);
  --ease-standard: cubic-bezier(0.2, 0.0, 0, 1.0);
}

/* View transition keyframes */
@keyframes view-drill-down {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes view-drill-up {
  from { opacity: 0; transform: scale(1.08); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes view-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Month navigation slide keyframes */
@keyframes slide-from-left {
  from { opacity: 0; transform: translateX(-30%); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slide-from-right {
  from { opacity: 0; transform: translateX(30%); }
  to { opacity: 1; transform: translateX(0); }
}

/* Checkbox bounce */
@keyframes check-bounce {
  0% { transform: scale(1); }
  35% { transform: scale(1.2); }
  65% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
```

**Step 2: Verify build succeeds**

Run: `npx vite build 2>&1 | tail -3`
Expected: `built in Xs` with no errors

**Step 3: Commit**

```bash
git add src/index.css
git commit -m "S5-07o: Add M3 easing CSS vars and animation keyframes"
```

---

### Task 2: Year-Month zoom transition (P0)

**Files:**
- Modify: `src/store/index.ts` (add transition direction state)
- Modify: `src/App.tsx` (apply directional animation on view wrapper)
- Modify: `src/components/calendar/MonthView.tsx` (drill-up sets direction)

**Step 1: Add `_viewTransitionDirection` to store**

In `src/store/index.ts`:

1. After `type ViewType = 'year' | 'month'` (line 6), add:
```typescript
type ViewTransitionDirection = 'drill-down' | 'drill-up' | null
```

2. In the `CalendarState` interface, after `_hasHydrated: boolean` (line 80), add:
```typescript
_viewTransitionDirection: ViewTransitionDirection
```

3. In the `setCurrentView` signature (line 94), change to:
```typescript
setCurrentView: (view: ViewType, direction?: ViewTransitionDirection) => void
```

4. In the initial state, after `_hasHydrated: false,` (line 117), add:
```typescript
_viewTransitionDirection: null as ViewTransitionDirection,
```

5. Replace `setCurrentView` implementation (line 183):
```typescript
setCurrentView: (view, direction) => set({ currentView: view, _viewTransitionDirection: direction ?? null }),
```

6. Update `navigateToMonth` (line 185-186) to include direction:
```typescript
navigateToMonth: (year, month) =>
  set({ selectedYear: year, selectedMonth: month, currentView: 'month', _viewTransitionDirection: 'drill-down' }),
```

**Step 2: Update App.tsx view wrapper**

In `src/App.tsx`:

1. In the `App` function, extract `_viewTransitionDirection` from store. Replace line 70:
```typescript
const { selectedDate, currentView, setCurrentView } = useCalendarStore()
```
with:
```typescript
const { selectedDate, currentView, setCurrentView, _viewTransitionDirection } = useCalendarStore()
```

2. Replace the view wrapper (lines 231-235):
```tsx
<div ref={swipeRef} className="lg:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
  <div
    key={currentView}
    style={{
      animation: _viewTransitionDirection === 'drill-down'
        ? 'view-drill-down 250ms var(--ease-emphasized-decel) both'
        : _viewTransitionDirection === 'drill-up'
          ? 'view-drill-up 200ms var(--ease-emphasized-decel) both'
          : 'view-fade 200ms ease both',
    }}
  >
    {currentView === 'year' ? <YearView /> : <MonthView />}
  </div>
</div>
```

Note: `overflow-hidden` on the parent prevents flash of scaled content during animation.

**Step 3: Update MonthView drill-up button**

In `src/components/calendar/MonthView.tsx`, the title button (line 161) already calls `setCurrentView('year')`. Change to:
```tsx
onClick={() => setCurrentView('year', 'drill-up')}
```

**Step 4: Verify app starts and transitions work**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/store/index.ts src/App.tsx src/components/calendar/MonthView.tsx
git commit -m "S5-07p: Year-Month directional zoom transition (P0)"
```

---

### Task 3: Month navigation slide (P0)

**Files:**
- Modify: `src/components/calendar/MonthView.tsx`

**Step 1: Add slide direction tracking and key-based animation**

In `src/components/calendar/MonthView.tsx`:

1. Add `useRef` to the React import (line 1):
```typescript
import { useMemo, useCallback, memo, useRef } from 'react'
```

2. Inside the `MonthView` component, after the store selectors (after line 79), add:
```typescript
const slideDirection = useRef<'left' | 'right' | null>(null)
```

3. In `handlePrevMonth` (line 117-124), set direction before navigation. Add as first line of the callback:
```typescript
slideDirection.current = 'right'
```

4. In `handleNextMonth` (line 126-133), set direction before navigation. Add as first line of the callback:
```typescript
slideDirection.current = 'left'
```

5. In `handleToday` (line 135-139), set direction to null (no slide for jump-to-today):
```typescript
slideDirection.current = null
```

6. Wrap the Calendar Grid section. Replace the outer `<div className="bg-white rounded-xl...">` (line 246) and its closing `</div>` (line 320) with a keyed animated wrapper:
```tsx
<div className="overflow-hidden rounded-xl border border-gray-200">
  <div
    key={`${selectedYear}-${selectedMonth}`}
    style={
      slideDirection.current
        ? {
            animation: `${slideDirection.current === 'left' ? 'slide-from-right' : 'slide-from-left'} 250ms var(--ease-emphasized-decel) both`,
          }
        : undefined
    }
    className="bg-white"
  >
    {/* Day of Week Headers */}
    <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
      ...existing header code...
    </div>

    {/* Days Grid */}
    <div className="grid grid-cols-7">
      ...existing grid code...
    </div>
  </div>
</div>
```

The key changes when year/month changes, causing remount. The `slide-from-left/right` keyframe plays on mount. The `overflow-hidden` on parent clips the sliding content.

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/calendar/MonthView.tsx
git commit -m "S5-07q: Month navigation slide animation (P0)"
```

---

### Task 4: Checkbox bounce micro-interaction (P0)

**Files:**
- Modify: `src/components/activities/QuickLog.tsx`

**Step 1: Add bounce animation on checkbox toggle**

In `src/components/activities/QuickLog.tsx`, in the `renderActivityList` function, find the `<label>` element that wraps each activity (around line 171-198).

Replace the `<label>` element with one that applies the bounce animation when completed:
```tsx
<label
  key={activity.id}
  className={`flex items-center gap-3 p-3 sm:p-3 rounded-lg cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-emerald-500 min-h-[48px] ${
    isCompleted ? 'bg-emerald-50' : 'hover:bg-gray-50'
  }`}
  style={isCompleted ? { animation: 'check-bounce 300ms var(--ease-standard)' } : undefined}
>
```

**Important caveat:** The `key={activity.id}` doesn't change, so the animation won't replay on subsequent toggles. To fix this, use a key that changes on toggle:

Instead, modify the approach. Track a "just toggled" state. In the `handleToggleLog` callback, after toggling, set a transient animation key.

Simpler approach — use a CSS class toggled via state:

1. Add state for the last bounced activity ID, after the existing state declarations (around line 18-21):
```typescript
const [bouncingId, setBouncingId] = useState<string | null>(null)
```

2. Modify `handleToggleLog` (line 58-64) to trigger bounce:
```typescript
const handleToggleLog = useCallback(
  (activityId: string): void => {
    if (!selectedDate) return
    toggleLog(activityId, selectedDate)
    setBouncingId(activityId)
  },
  [selectedDate, toggleLog]
)
```

3. In `renderActivityList`, on the `<label>` element, add an `onAnimationEnd` handler and conditional style:
```tsx
<label
  key={activity.id}
  className={`flex items-center gap-3 p-3 sm:p-3 rounded-lg cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-emerald-500 min-h-[48px] ${
    isCompleted ? 'bg-emerald-50' : 'hover:bg-gray-50'
  }`}
  style={bouncingId === activity.id ? { animation: 'check-bounce 300ms var(--ease-standard)' } : undefined}
  onAnimationEnd={() => { if (bouncingId === activity.id) setBouncingId(null) }}
>
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/activities/QuickLog.tsx
git commit -m "S5-07r: Checkbox bounce micro-interaction (P0)"
```

---

### Task 5: Fix Modal enter/exit animation (P1)

**Files:**
- Modify: `src/components/ui/Modal.tsx`

The current `animate-in fade-in zoom-in-95` / `animate-out fade-out zoom-out-95` classes produce NO CSS. Replace with working CSS transition pattern.

**Step 1: Replace broken animation classes**

In `src/components/ui/Modal.tsx`, replace lines 29-35 (the modal panel div):

```tsx
<div
  ref={modalRef}
  className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 px-6 py-4 sm:p-6 max-h-[90dvh] flex flex-col overflow-hidden transition-[transform,opacity] ${
    isVisible
      ? 'opacity-100 scale-100 duration-250 ease-[var(--ease-emphasized-decel)]'
      : 'opacity-0 scale-95 duration-150 ease-[var(--ease-emphasized-accel)]'
  }`}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  data-testid={testId}
>
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ui/Modal.tsx
git commit -m "S5-07s: Fix Modal enter/exit animation with M3 easing (P1)"
```

---

### Task 6: Fix ConfirmDialog enter/exit animation (P1)

**Files:**
- Modify: `src/components/ui/ConfirmDialog.tsx`

**Step 1: Replace broken animation classes**

In `src/components/ui/ConfirmDialog.tsx`, replace lines 117-123 (the dialog panel div):

```tsx
<div
  ref={dialogRef}
  className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-sm w-full mx-0 sm:mx-4 p-4 sm:p-6 transition-[transform,opacity] ${
    isVisible
      ? 'opacity-100 scale-100 duration-250 ease-[var(--ease-emphasized-decel)]'
      : 'opacity-0 scale-95 duration-150 ease-[var(--ease-emphasized-accel)]'
  }`}
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="confirm-dialog-title"
  aria-describedby="confirm-dialog-message"
  data-testid={testId}
>
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ui/ConfirmDialog.tsx
git commit -m "S5-07t: Fix ConfirmDialog animation with M3 easing (P1)"
```

---

### Task 7: Fix Toast enter/exit animation (P1)

**Files:**
- Modify: `src/components/ui/Toast.tsx`

**Step 1: Replace broken animation classes**

In `src/components/ui/Toast.tsx`, replace the Toast item's animation classes (lines 41-49):

```tsx
<div
  className={`
    flex items-center gap-3 px-4 py-3
    border rounded-lg shadow-sm
    transition-[transform,opacity]
    ${
      isExiting
        ? 'opacity-0 translate-x-full duration-200 ease-[var(--ease-emphasized-accel)]'
        : 'opacity-100 translate-x-0 duration-300 ease-[var(--ease-emphasized-decel)]'
    }
    ${styles.bg}
  `}
  role="alert"
  aria-live="polite"
>
```

Note: Toast enters from right (`translate-x-full` → `translate-x-0`) and exits to right (`translate-x-0` → `translate-x-full`). But since we use `isExiting` state (not `isVisible` from useAnimatedPresence), the transition should work: on mount the initial state is `translate-x-0 opacity-100` (no enter animation by default).

For a proper enter animation, we need to start from `translate-x-full`. Use `@keyframes`:

Actually, simpler: use the existing `slide-from-right` pattern but for Toast it should slide from the right edge. Add a keyframe to `index.css` (Task 1) or use inline style for the enter:

Better approach — use a `useState` for enter animation:

```tsx
const ToastItem = memo(function ToastItem({ toast, onClose }: ToastItemProps) {
  const styles = variantStyles[toast.variant]
  const [isExiting, setIsExiting] = useState(false)
  const [hasEntered, setHasEntered] = useState(false)

  // Trigger enter animation after mount
  useEffect(() => {
    requestAnimationFrame(() => setHasEntered(true))
  }, [])

  const handleClose = useCallback(() => {
    setIsExiting(true)
    setTimeout(onClose, 200)
  }, [onClose])

  const isVisible = hasEntered && !isExiting

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3
        border rounded-lg shadow-sm
        transition-[transform,opacity]
        ${
          isVisible
            ? 'opacity-100 translate-x-0 duration-300 ease-[var(--ease-emphasized-decel)]'
            : 'opacity-0 translate-x-full duration-200 ease-[var(--ease-emphasized-accel)]'
        }
        ${styles.bg}
      `}
      role="alert"
      aria-live="polite"
    >
```

Add `useEffect` to imports (line 1):
```typescript
import { memo, useCallback, useState, useEffect } from 'react'
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ui/Toast.tsx
git commit -m "S5-07u: Fix Toast enter/exit animation with M3 easing (P1)"
```

---

### Task 8: Fix DropdownMenu enter/exit animation (P1)

**Files:**
- Modify: `src/components/ui/DropdownMenu.tsx`

**Step 1: Replace broken animation classes**

In `src/components/ui/DropdownMenu.tsx`, find the menu container div (around line 177-185). Replace the animation classes:

```tsx
<div
  ref={menuRef}
  id="dropdown-menu"
  className={`
    absolute right-0 mt-2 min-w-[160px] z-50
    bg-white border border-gray-200 rounded-lg shadow-lg
    py-1 origin-top-right
    transition-[transform,opacity]
    ${
      isMenuVisible
        ? 'opacity-100 scale-100 duration-150 ease-[var(--ease-emphasized-decel)]'
        : 'opacity-0 scale-95 duration-100 ease-[var(--ease-emphasized-accel)]'
    }
  `}
  role="menu"
  aria-orientation="vertical"
  aria-label="Options menu"
>
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ui/DropdownMenu.tsx
git commit -m "S5-07v: Fix DropdownMenu animation with M3 easing (P1)"
```

---

### Task 9: BottomSheet asymmetric easing polish (P1)

**Files:**
- Modify: `src/components/ui/BottomSheet.tsx`

**Step 1: Apply M3 asymmetric easing**

In `src/components/ui/BottomSheet.tsx`:

1. Replace the inline transition style (line 101-103). Change:
```typescript
transition: isDragging
  ? 'none'
  : `transform ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
```
to:
```typescript
transition: isDragging
  ? 'none'
  : isVisible
    ? 'transform 300ms var(--ease-emphasized-decel)'
    : 'transform 200ms var(--ease-emphasized-accel)',
```

2. Add backdrop blur to the backdrop div (line 86). Add `backdropFilter` to the style:
```tsx
<div
  className="absolute inset-0 transition-[opacity,backdrop-filter]"
  style={{
    backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
    backdropFilter: isVisible && !isDragging ? 'blur(4px)' : 'blur(0px)',
    transitionDuration: isDragging ? '0ms' : isVisible ? '300ms' : '200ms',
  }}
  onClick={onClose}
  aria-hidden="true"
  data-testid="bottom-sheet-backdrop"
/>
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ui/BottomSheet.tsx
git commit -m "S5-07w: BottomSheet asymmetric easing + backdrop blur (P1)"
```

---

### Task 10: QuickLog two-phase crossfade (P1)

**Files:**
- Modify: `src/components/activities/QuickLog.tsx`

**Step 1: Add crossfade between list and creation form**

In `src/components/activities/QuickLog.tsx`, the two-phase rendering is at lines 267-283. Currently it's an instant swap. Wrap both phases in a transition container.

Replace lines 267-283:
```tsx
{isCreating ? (
  renderCreationForm({ inputId: 'quicklog-activity-name' })
) : (
  <>
    {activities.length === 0 ? renderEmptyState() : renderActivityList()}
    <div className="mt-4 sm:mt-6 flex justify-end">
      <Button ...>Done</Button>
    </div>
  </>
)}
```

With a crossfade using key-based remount and keyframe:
```tsx
<div
  key={isCreating ? 'creating' : 'list'}
  style={{ animation: 'view-fade 150ms ease both' }}
>
  {isCreating ? (
    renderCreationForm({ inputId: 'quicklog-activity-name' })
  ) : (
    <>
      {activities.length === 0 ? renderEmptyState() : renderActivityList()}
      <div className="mt-4 sm:mt-6 flex justify-end">
        <Button
          onClick={() => setSelectedDate(null)}
          data-testid="quicklog-done-button"
          className="w-full sm:w-auto"
        >
          Done
        </Button>
      </div>
    </>
  )}
</div>
```

This uses the `view-fade` keyframe (already added in Task 1) for a simple fade-in on phase change.

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/activities/QuickLog.tsx
git commit -m "S5-07x: QuickLog two-phase crossfade (P1)"
```

---

### Task 11: Activity list stagger on BottomSheet open (P2)

**Files:**
- Modify: `src/components/activities/ActivityList.tsx`

**Step 1: Add stagger animation to activity items**

In `src/components/activities/ActivityList.tsx`, each `<li>` in the activity list (line 73-107). Add a fade-in stagger via inline style using the item index:

Change the `<li>` (line 74-77):
```tsx
<li
  key={activity.id}
  className="flex items-center justify-between p-2 sm:p-3 rounded-lg hover:bg-gray-50 focus-within:bg-gray-50 transition-colors group"
  style={{
    animation: `view-fade 200ms var(--ease-emphasized-decel) both`,
    animationDelay: `${index * 30}ms`,
  }}
  data-testid="activity-item"
>
```

Note: `index` is available from `.map((activity, index) => ...)`. Update the `.map()` call (line 73) to include index:
```tsx
{(showAll ? activities : activities.slice(0, maxVisible)).map((activity, index) => (
```

**Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/activities/ActivityList.tsx
git commit -m "S5-07y: Activity list stagger animation (P2)"
```

---

### Task 12: Ripple touch feedback on calendar day cells (P2)

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/calendar/MonthView.tsx`

**Step 1: Add ripple keyframe to index.css**

Add to `src/index.css` after the existing keyframes:

```css
/* Ripple touch feedback */
@keyframes ripple {
  to { transform: scale(4); opacity: 0; }
}

.ripple-container {
  position: relative;
  overflow: hidden;
}

.ripple-container::after {
  content: '';
  display: block;
  position: absolute;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.15);
  transform: scale(0);
  opacity: 1;
  pointer-events: none;
}

.ripple-container:active::after {
  animation: ripple 400ms var(--ease-standard) forwards;
}
```

**Step 2: Add ripple class to day cells**

In `src/components/calendar/MonthView.tsx`, the day `<button>` (line 270-280). Add `ripple-container` to its className:

```tsx
className={`
  ripple-container
  relative min-h-[60px] sm:min-h-[80px] p-1.5 sm:p-2 text-left transition-colors
  ...
```

**Step 3: Verify build**

Run: `npx vite build 2>&1 | tail -3`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/index.css src/components/calendar/MonthView.tsx
git commit -m "S5-07z: Ripple touch feedback on calendar days (P2)"
```

---

### Task 13: Final verification and build

**Step 1: Run linter**

Run: `npx eslint src/ 2>&1 | tail -10`
Expected: No errors (warnings ok)

**Step 2: Run full build**

Run: `npx vite build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Run formatter**

Run: `npx prettier --write src/index.css src/store/index.ts src/App.tsx src/components/calendar/MonthView.tsx src/components/activities/QuickLog.tsx src/components/activities/ActivityList.tsx src/components/ui/Modal.tsx src/components/ui/ConfirmDialog.tsx src/components/ui/Toast.tsx src/components/ui/DropdownMenu.tsx src/components/ui/BottomSheet.tsx`

**Step 4: Commit if prettier made changes**

```bash
git add -A
git commit -m "S5-07: Format animation changes"
```

---

## Summary

| Task | Priority | Component | Animation |
|------|----------|-----------|-----------|
| 1 | Setup | index.css | M3 vars + keyframes |
| 2 | P0 | App.tsx + store | Year-Month zoom |
| 3 | P0 | MonthView | Month nav slide |
| 4 | P0 | QuickLog | Checkbox bounce |
| 5 | P1-fix | Modal | Replace broken animate-in/out |
| 6 | P1-fix | ConfirmDialog | Replace broken animate-in/out |
| 7 | P1-fix | Toast | Replace broken animate-in/out |
| 8 | P1-fix | DropdownMenu | Replace broken animate-in/out |
| 9 | P1 | BottomSheet | Asymmetric easing + blur |
| 10 | P1 | QuickLog | Two-phase crossfade |
| 11 | P2 | ActivityList | Stagger animation |
| 12 | P2 | MonthView + CSS | Ripple touch feedback |
| 13 | Final | All | Lint + build + format |
