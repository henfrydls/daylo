import type { ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** What it turns on, read out instead of the word "switch". */
  label: string
  /** The line under the label, when there is one. It is named here so it can be read. */
  describedBy?: string
  disabled?: boolean
  'data-testid'?: string
}

/**
 * A switch, which is a thing that is already on or already off.
 *
 * A button and not a checkbox: a checkbox is a choice you make and then submit, and this
 * takes effect the moment it is pressed. `role="switch"` says exactly that, and it is the
 * difference between a screen reader saying "on" and saying "checked".
 *
 * The track is 44 pixels tall in its touch area and smaller to look at, which is the only
 * way to get a control this size that can still be hit with a thumb.
 */
export function Switch({
  checked,
  onChange,
  label,
  describedBy,
  disabled = false,
  'data-testid': testId,
}: SwitchProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-150 ${
          checked ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
