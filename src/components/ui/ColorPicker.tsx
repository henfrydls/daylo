import { memo, useCallback, useEffect, useRef, useState } from 'react'

export interface ColorOption {
  name: string
  value: string
}

export interface ColorPickerProps {
  /** Currently selected color value */
  value: string
  /** Callback when a color is selected */
  onChange: (color: string) => void
  /** Array of color options to display */
  colors: readonly ColorOption[]
  /** Optional label for the color picker. If not provided, label is screen-reader only */
  label?: string
  /** Size variant for the color buttons */
  size?: 'sm' | 'md'
  /** Optional test ID prefix for buttons */
  testIdPrefix?: string
  /** Optional className for the container */
  className?: string
  /** Center the color options */
  centered?: boolean
  /** Number of colors to show when collapsed (0 = show all) */
  collapsedCount?: number
  /** Automatically calculate collapsedCount to fit one row (overrides collapsedCount on mobile) */
  autoCollapse?: boolean
}

const sizeClasses = {
  sm: 'w-10 h-10 sm:w-6 sm:h-6',
  md: 'w-10 h-10 sm:w-8 sm:h-8',
}

const hoverScales = {
  sm: 'hover:scale-110',
  md: 'hover:scale-105',
}

/** Dot pixel widths on mobile (matches w-10 = 2.5rem = 40px) */
const DOT_SIZE_PX = 40
/** Gap in pixels (gap-2 = 0.5rem = 8px) */
const GAP_PX = 8
/** Mobile breakpoint matching Tailwind's sm: */
const SM_BREAKPOINT = 640

export const ColorPicker = memo(function ColorPicker({
  value,
  onChange,
  colors,
  label = 'Color',
  size = 'md',
  testIdPrefix,
  className = '',
  centered = false,
  collapsedCount = 0,
  autoCollapse = false,
}: ColorPickerProps) {
  const [expanded, setExpanded] = useState(false)
  const [autoCount, setAutoCount] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const measureAndSetCount = useCallback(() => {
    if (!autoCollapse || !containerRef.current) return
    // Only auto-collapse on mobile
    if (window.innerWidth >= SM_BREAKPOINT) {
      setAutoCount(0)
      return
    }
    // Subtract padding (p-2 = 8px each side) from measured width
    const width = containerRef.current.offsetWidth - 16
    if (width <= 0) {
      setAutoCount(0)
      return
    }
    const dotsPerRow = Math.floor((width + GAP_PX) / (DOT_SIZE_PX + GAP_PX))
    // Reserve 1 spot for the "+" button
    setAutoCount(Math.max(dotsPerRow - 1, 1))
  }, [autoCollapse])

  useEffect(() => {
    if (!autoCollapse) return

    /* eslint-disable react-hooks/set-state-in-effect */
    measureAndSetCount()
    /* eslint-enable react-hooks/set-state-in-effect */

    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => {
      measureAndSetCount()
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
    }
  }, [autoCollapse, measureAndSetCount])

  const isSelected = (colorValue: string): boolean => value === colorValue

  // Use autoCount when autoCollapse is active, otherwise fall back to collapsedCount prop
  const effectiveCollapsedCount = autoCollapse ? autoCount : collapsedCount

  // Determine if we need to auto-expand because the selected color is hidden
  const selectedIsHidden =
    effectiveCollapsedCount > 0 &&
    !expanded &&
    colors.findIndex((c) => c.value === value) >= effectiveCollapsedCount

  const shouldShowAll = effectiveCollapsedCount <= 0 || expanded || selectedIsHidden
  const visibleColors = shouldShowAll ? colors : colors.slice(0, effectiveCollapsedCount)
  const canToggle =
    effectiveCollapsedCount > 0 && !selectedIsHidden && colors.length > effectiveCollapsedCount

  return (
    <fieldset className={className}>
      <legend className={label ? 'block text-sm font-medium text-gray-700 mb-2' : 'sr-only'}>
        {label || 'Select color'}
      </legend>
      <div
        ref={containerRef}
        className={`flex flex-wrap gap-2 p-2 ${centered ? 'justify-center' : ''}`}
        role="radiogroup"
        aria-label={`Select ${label?.toLowerCase() || 'color'}`}
      >
        {visibleColors.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            className={`
              ${sizeClasses[size]}
              rounded-full
              transition-all
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500
              ${
                isSelected(color.value)
                  ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                  : hoverScales[size]
              }
            `}
            style={{ backgroundColor: color.value }}
            aria-label={`${color.name} color`}
            role="radio"
            aria-checked={isSelected(color.value)}
            data-testid={
              testIdPrefix ? `${testIdPrefix}-${color.name.toLowerCase()}` : 'color-option'
            }
          />
        ))}
        {canToggle && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className={`${sizeClasses[size]} rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-base font-bold hover:border-gray-400 hover:text-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500`}
            aria-label={expanded ? 'Show fewer colors' : 'Show more colors'}
          >
            {expanded ? '\u2212' : '+'}
          </button>
        )}
      </div>
    </fieldset>
  )
})
