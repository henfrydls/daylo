import { useEffect, useRef, useState } from 'react'

interface KeyboardRing {
  /** Whether to draw the ring now. */
  visible: boolean
  /** Put on the control: `onFocus={ring.onFocus}` and `onBlur={ring.onBlur}`. */
  onFocus: () => void
  onBlur: () => void
}

/**
 * Whether a focus ring belongs on something the browser cannot be left to decide about.
 *
 * Chromium treats any control you could type into as always focus-visible, tap or not:
 * measured side by side, an `input[type=time]` matches `:focus-visible` after a touch tap
 * and a button does not. So `focus-visible` lights a time row up on every tap and leaves it
 * lit, which is the same green ring a phone has already complained about once.
 *
 * The rule is the one the rest of the app follows: rings are for keyboards. What decides it
 * is **the last thing the person did**, not how this particular focus arrived, and that
 * distinction is the whole reason it is written this way: the native time picker takes over
 * the screen and hands focus back when it closes, and a focus handed back by the platform
 * is not a pointer event. Reading the last interaction instead keeps the ring off through
 * the whole tap-pick-close round, and brings it on for a Tab.
 */
export function useKeyboardRing(active: boolean): KeyboardRing {
  const [visible, setVisible] = useState(false)
  const lastInteraction = useRef<'pointer' | 'keyboard'>('pointer')

  useEffect(() => {
    if (!active) return
    const pointer = () => {
      lastInteraction.current = 'pointer'
    }
    const keyboard = () => {
      lastInteraction.current = 'keyboard'
    }
    // Capture, so this hears the interaction whatever else stops it on the way down.
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [active])

  return {
    visible,
    onFocus: () => setVisible(lastInteraction.current === 'keyboard'),
    onBlur: () => setVisible(false),
  }
}
