import { memo, useState } from 'react'

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
}

const sizeClasses = {
  sm: 'w-11 h-11 sm:w-6 sm:h-6',
  md: 'w-11 h-11 sm:w-8 sm:h-8',
}

const hoverScales = {
  sm: 'hover:scale-110',
  md: 'hover:scale-105',
}

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
}: ColorPickerProps) {
  const [expanded, setExpanded] = useState(false)

  const isSelected = (colorValue: string): boolean => value === colorValue

  // Determine if we need to auto-expand because the selected color is hidden
  const selectedIsHidden =
    collapsedCount > 0 &&
    !expanded &&
    colors.findIndex((c) => c.value === value) >= collapsedCount

  const shouldShowAll = collapsedCount <= 0 || expanded || selectedIsHidden
  const visibleColors = shouldShowAll ? colors : colors.slice(0, collapsedCount)
  const canToggle = collapsedCount > 0 && !selectedIsHidden && colors.length > collapsedCount

  return (
    <fieldset className={className}>
      <legend className={label ? 'block text-sm font-medium text-gray-700 mb-2' : 'sr-only'}>
        {label || 'Select color'}
      </legend>
      <div
        className={`flex flex-wrap gap-2 ${centered ? 'justify-center' : ''}`}
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
            className={`${sizeClasses[size]} rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs font-medium hover:border-gray-400 hover:text-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500`}
            aria-label={expanded ? 'Show fewer colors' : 'Show more colors'}
          >
            {expanded ? '\u2212' : '+'}
          </button>
        )}
      </div>
    </fieldset>
  )
})
