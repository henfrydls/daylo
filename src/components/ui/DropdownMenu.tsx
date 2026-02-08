import { useState, useRef, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface DropdownMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
}

export interface DropdownMenuProps {
  trigger: ReactNode
  items: DropdownMenuItem[]
  'data-testid'?: string
}

export function DropdownMenu({ trigger, items, 'data-testid': testId }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Define handleItemClick before useEffect that uses it
  const handleItemClick = useCallback((item: DropdownMenuItem) => {
    if (item.disabled) return
    item.onClick()
    setIsOpen(false)
  }, [])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          setIsOpen(false)
          triggerRef.current?.focus()
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => {
            const enabledItems = items.filter((item) => !item.disabled)
            const currentEnabledIndex = enabledItems.findIndex(
              (_, i) => items.indexOf(enabledItems[i]) === prev
            )
            const nextIndex = currentEnabledIndex + 1
            if (nextIndex >= enabledItems.length) return items.indexOf(enabledItems[0])
            return items.indexOf(enabledItems[nextIndex])
          })
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => {
            const enabledItems = items.filter((item) => !item.disabled)
            const currentEnabledIndex = enabledItems.findIndex(
              (_, i) => items.indexOf(enabledItems[i]) === prev
            )
            const nextIndex = currentEnabledIndex - 1
            if (nextIndex < 0) return items.indexOf(enabledItems[enabledItems.length - 1])
            return items.indexOf(enabledItems[nextIndex])
          })
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (focusedIndex >= 0 && !items[focusedIndex].disabled) {
            handleItemClick(items[focusedIndex])
          }
          break
        case 'Tab':
          setIsOpen(false)
          break
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, focusedIndex, items, handleItemClick])

  // Reset focus when menu opens
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isOpen) {
      const firstEnabledIndex = items.findIndex((item) => !item.disabled)
      setFocusedIndex(firstEnabledIndex)
    } else {
      setFocusedIndex(-1)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, items])

  const handleTriggerClick = () => {
    setIsOpen((prev) => !prev)
  }

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
    }
  }

  return (
    <div className="relative inline-block" ref={dropdownRef} data-testid={testId}>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex items-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 rounded-lg"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'dropdown-menu' : undefined}
        type="button"
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id="dropdown-menu"
          className={`
            absolute right-0 mt-2 min-w-[160px] z-50
            bg-white border border-gray-200 rounded-lg shadow-lg
            py-1 origin-top-right
            animate-in fade-in slide-in-from-top-2 duration-150
          `}
          role="menu"
          aria-orientation="vertical"
          aria-label="Options menu"
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={`
                w-full px-4 py-2 text-sm text-left
                flex items-center gap-2
                transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500
                ${
                  item.disabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-100'
                }
                ${focusedIndex === index && !item.disabled ? 'bg-gray-100' : ''}
              `}
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled}
            >
              {item.icon && (
                <span className="w-4 h-4 flex-shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
