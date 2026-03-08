# S5-07: Animations v2 — View Transitions + Micro-interactions

## Context

Sprint 5A QA revealed that while basic enter/exit animations exist (S5-05), the app still feels static in key interactions. Expert analysis from UX, CSS performance, and Material Design 3 specialists identified high-impact animation gaps.

User priorities: **Month-Year view transitions** and **how drawers/modals load**.

## Design Principles

- **GPU-only properties:** Only animate `transform` and `opacity` (composited by GPU on Android WebView)
- **Asymmetric easing:** Enter uses decelerate curve, exit uses accelerate curve (M3 pattern)
- **Zero dependencies:** CSS transitions + existing `useAnimatedPresence` hook
- **150-300ms durations:** Sweet spot for mobile (shorter = snappy, longer = sluggish)

### Easing Curves (M3 tokens)

| Token | CSS | Use |
|-------|-----|-----|
| emphasizedDecelerate | `cubic-bezier(0.05, 0.7, 0.1, 1.0)` | Enter animations |
| emphasizedAccelerate | `cubic-bezier(0.3, 0.0, 0.8, 0.15)` | Exit animations |
| standard | `cubic-bezier(0.2, 0.0, 0, 1.0)` | Symmetric transitions (nav) |

---

## P0 — High Impact (Must Have)

### 1. Month Navigation Slide

When navigating between months (prev/next), the calendar grid slides left or right.

**Mechanism:** Track navigation direction in state. On month change, apply `translateX(-100%)` or `translateX(100%)` exit, then `translateX(0)` enter on new content.

**Implementation:** Use a `direction` ref (`'left' | 'right' | null`) set by `handlePrevMonth`/`handleNextMonth`. Wrap the calendar grid in a container with `overflow: hidden`. Use CSS transition on `transform` + `opacity`.

| Phase | Transform | Opacity | Duration | Easing |
|-------|-----------|---------|----------|--------|
| Exit | `translateX(-30%)` or `(30%)` | 0 | 150ms | emphasizedAccelerate |
| Enter | `translateX(0)` from `(30%)` or `(-30%)` | 1 | 250ms | emphasizedDecelerate |

**Files:** `src/components/calendar/MonthView.tsx`

### 2. Year-Month Zoom Transition

Tapping a month in YearView drills down into MonthView with a zoom effect. Tapping the month title in MonthView drills back up with a zoom-out.

**Mechanism:** Track transition direction (`'drill-down' | 'drill-up' | null`) in the store or a ref. Apply different animation classes based on direction.

| Direction | Enter | Exit | Duration |
|-----------|-------|------|----------|
| drill-down (Year→Month) | scale(1) + fade-in from scale(0.9) | scale(1.05) + fade-out | 250ms |
| drill-up (Month→Year) | scale(1) + fade-in from scale(1.05) | scale(0.95) + fade-out | 200ms |

**Files:** `src/App.tsx` (view wrapper), `src/store/index.ts` (direction state)

### 3. Checkbox Micro-interaction

When toggling an activity checkbox in QuickLog, add a satisfying bounce/pop.

**Mechanism:** CSS keyframe animation triggered by adding a class on check. Scale from 1 → 1.2 → 0.95 → 1 over 300ms.

```css
@keyframes checkBounce {
  0% { transform: scale(1); }
  35% { transform: scale(1.2); }
  65% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
```

**Files:** `src/components/activities/QuickLog.tsx`

---

## P1 — Medium Impact (Should Have)

### 4. QuickLog Two-Phase Transition

When toggling between activity list and creation form (Two-Phase pattern), crossfade between states instead of instant swap.

**Mechanism:** Wrap each phase in a container. On phase change, fade-out old (100ms) then fade-in new (150ms). Use `useAnimatedPresence` for delayed unmount.

**Files:** `src/components/activities/QuickLog.tsx`

### 5. BottomSheet Enter/Exit Polish

Current BottomSheet uses `cubic-bezier(0.32, 0.72, 0, 1)` for both enter and exit. Apply asymmetric easing:

| Phase | Easing | Duration |
|-------|--------|----------|
| Enter | emphasizedDecelerate | 300ms |
| Exit | emphasizedAccelerate | 200ms |

Also add subtle backdrop blur on enter: `backdrop-filter: blur(4px)` (progressive enhancement, no-op if unsupported).

**Files:** `src/components/ui/BottomSheet.tsx`

### 6. Modal Enter/Exit Polish

Same asymmetric easing upgrade for Modal:

| Phase | Current | New |
|-------|---------|-----|
| Enter | zoom-in-95 200ms | scale from 0.92, emphasizedDecelerate 250ms |
| Exit | zoom-out-95 150ms | scale to 0.95, emphasizedAccelerate 150ms |

**Files:** `src/components/ui/Modal.tsx`

---

## P2 — Nice to Have (Can Defer)

### 7. Activity List Stagger

When BottomSheet opens, stagger activity items entrance (each item fades in 30ms after the previous).

### 8. Ripple Touch Feedback

Add Material-style ripple on tappable calendar day cells. Uses CSS pseudo-element with `::after` + `scale` animation from touch point.

---

## What Already Works (No Changes Needed)

- Toast enter/exit animations
- DropdownMenu enter/exit animations
- BottomSheet swipe-to-dismiss gesture
- QuickLog slide-up/down (bottom sheet pattern)
- View toggle fade (basic, but functional)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/calendar/MonthView.tsx` | Month nav slide animation (P0) |
| `src/App.tsx` | Year-Month zoom transition (P0) |
| `src/store/index.ts` | Optional: transition direction state (P0) |
| `src/components/activities/QuickLog.tsx` | Checkbox bounce (P0), two-phase crossfade (P1) |
| `src/components/ui/BottomSheet.tsx` | Asymmetric easing (P1) |
| `src/components/ui/Modal.tsx` | Asymmetric easing (P1) |

## Implementation Order

1. P0-2: Year-Month zoom (most visible, user priority)
2. P0-1: Month nav slide (second most visible, user priority)
3. P0-3: Checkbox bounce (quick win, delightful)
4. P1-5: BottomSheet easing polish
5. P1-6: Modal easing polish
6. P1-4: QuickLog two-phase crossfade
7. Tests for all
8. Build APK + device test
