import { memo } from 'react'

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
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
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
}: ColorPickerProps) {
  const isSelected = (colorValue: string): boolean => value === colorValue

  return (
    <fieldset className={className}>
      <legend
        className={label ? 'block text-sm font-medium text-gray-700 mb-2' : 'sr-only'}
      >
        {label || 'Select color'}
      </legend>
      <div
        className={`flex flex-wrap gap-2 ${centered ? 'justify-center' : ''}`}
        role="radiogroup"
        aria-label={`Select ${label?.toLowerCase() || 'color'}`}
      >
        {colors.map((color) => (
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
            aria-pressed={isSelected(color.value)}
            data-testid={
              testIdPrefix
                ? `${testIdPrefix}-${color.name.toLowerCase()}`
                : 'color-option'
            }
          />
        ))}
      </div>
    </fieldset>
  )
})
