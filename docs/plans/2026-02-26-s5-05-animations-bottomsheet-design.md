# S5-05: Animations & BottomSheet Refinement — Design

## Problem

1. **BottomSheet backdrop bug:** Tapping the dimmed area doesn't close the sheet (inner div intercepts clicks)
2. **No exit animations:** All modals/toasts/dropdowns vanish instantly on close
3. **BottomSheet too basic:** No swipe-to-dismiss, no snap points, no slide animation
4. **View switching is jarring:** Year/Month swap is instantaneous

## Solution

### 1. `useAnimatedPresence` hook

Reusable hook for delayed unmount pattern:

```ts
function useAnimatedPresence(isOpen: boolean, duration: number): {
  shouldRender: boolean  // Keep in DOM during exit animation
  isAnimating: boolean   // true = entering, false = exiting
}
```

Components stay mounted during exit animation, then unmount after `duration` ms.

### 2. BottomSheet — Native-feel gestures

- **Snap points:** 75vh (default), 50vh (half), 0 (closed)
- **Swipe-to-dismiss:** Drag down past 30% threshold closes sheet
- **Slide-up animation:** `transform: translateY()` with `cubic-bezier(0.32, 0.72, 0, 1)` 300ms
- **Backdrop fix:** Move `onClick={onClose}` to backdrop div directly
- **Backdrop interpolation:** Opacity syncs with sheet position during drag
- **Touch handling:** `onPointerDown/Move/Up` for cross-device support

### 3. Exit animations for all overlay components

| Component | Enter | Exit |
|-----------|-------|------|
| Modal | fade-in + zoom-in-95 200ms | fade-out + zoom-out-95 150ms |
| ConfirmDialog | fade-in + zoom-in-95 200ms | fade-out + zoom-out-95 150ms |
| QuickLog | slide-up 300ms | slide-down 250ms |
| Toast | slide-in-from-right 300ms | slide-out-to-right 200ms |
| DropdownMenu | fade-in + slide-from-top 150ms | fade-out + slide-to-top 100ms |
| BottomSheet | slide-up 300ms | slide-down 200ms |

### 4. View transition (Year/Month)

Fade crossfade 200ms using CSS transition on opacity with `useAnimatedPresence`.

### 5. Unified timing

- **Enter:** `cubic-bezier(0.32, 0.72, 0, 1)` 300ms
- **Exit:** `cubic-bezier(0.32, 0.72, 0, 1)` 200ms
- **Micro-interactions:** Existing hover/active unchanged

## Approach

- Zero new dependencies (no framer-motion)
- Tailwind CSS transitions + `useAnimatedPresence` hook
- Touch gestures via native pointer events

## Files to create/modify

| File | Action |
|------|--------|
| `src/hooks/useAnimatedPresence.ts` | Create — delayed unmount hook |
| `src/hooks/useAnimatedPresence.test.ts` | Create — tests |
| `src/hooks/index.ts` | Update — export new hook |
| `src/components/ui/BottomSheet.tsx` | Rewrite — gestures + animations |
| `src/components/ui/BottomSheet.test.tsx` | Update — new behavior tests |
| `src/components/ui/Modal.tsx` | Update — exit animation |
| `src/components/ui/Modal.test.tsx` | Update — exit animation test |
| `src/components/activities/QuickLog.tsx` | Update — slide animation |
| `src/components/ui/Toast.tsx` | Update — exit animation |
| `src/components/ui/DropdownMenu.tsx` | Update — exit animation |
| `src/components/ui/ConfirmDialog.tsx` | Update — exit animation |
| `src/App.tsx` | Update — view transition wrapper |
