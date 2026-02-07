import { useState, useId, Children, cloneElement, isValidElement } from 'react'
import type { ReactNode, ReactElement } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const tooltipId = useId()

  const showTooltip = () => setIsVisible(true)
  const hideTooltip = () => setIsVisible(false)

  return (
    <div
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {Children.map(children, (child) => {
        // Pass aria-describedby to child element if it's a valid element
        if (isValidElement(child)) {
          return cloneElement(child as ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': isVisible ? tooltipId : undefined,
          })
        }
        return child
      })}
      {isVisible && (
        <div
          id={tooltipId}
          className="absolute z-50 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg shadow-lg whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none"
          role="tooltip"
          aria-hidden={!isVisible}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  )
}
