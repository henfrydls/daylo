import { useState } from 'react'
import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className="absolute z-50 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg shadow-lg whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-2"
          role="tooltip"
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
