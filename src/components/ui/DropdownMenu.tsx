import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'

export interface DropdownMenuActionItem {
  type?: 'action'
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
}

export interface DropdownMenuDivider {
  type: 'divider'
}

export interface DropdownMenuInfoItem {
  type: 'info'
  label: string
  icon?: ReactNode
}

export type DropdownMenuItem = DropdownMenuActionItem | DropdownMenuDivider | DropdownMenuInfoItem

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

  // Helper to check if item is an action item
  const isActionItem = (item: DropdownMenuItem): item is DropdownMenuActionItem => {
    return item.type === undefined || item.type === 'action'
  }

  // Get only action items for keyboard navigation (memoized for stable reference)
  const actionItems = useMemo(() => items.filter(isActionItem), [items])

  // Define handleItemClick before useEffect that uses it
  const handleItemClick = useCallback((item: DropdownMenuActionItem) => {
    if (item.disabled) return
    item.onClick()
    setIsOpen(false)
  }, [])

  // Handle keyboard navigation (only for action items)
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
            const enabledItems = actionItems.filter((item) => !item.disabled)
            const currentEnabledIndex = enabledItems.findIndex(
              (_, i) => actionItems.indexOf(enabledItems[i]) === prev
            )
            const nextIndex = currentEnabledIndex + 1
            if (nextIndex >= enabledItems.length) return actionItems.indexOf(enabledItems[0])
            return actionItems.indexOf(enabledItems[nextIndex])
          })
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => {
            const enabledItems = actionItems.filter((item) => !item.disabled)
            const currentEnabledIndex = enabledItems.findIndex(
              (_, i) => actionItems.indexOf(enabledItems[i]) === prev
            )
            const nextIndex = currentEnabledIndex - 1
            if (nextIndex < 0) return actionItems.indexOf(enabledItems[enabledItems.length - 1])
            return actionItems.indexOf(enabledItems[nextIndex])
          })
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (
            focusedIndex >= 0 &&
            actionItems[focusedIndex] &&
            !actionItems[focusedIndex].disabled
          ) {
            handleItemClick(actionItems[focusedIndex])
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
  }, [isOpen, focusedIndex, actionItems, handleItemClick])

  // Reset focus when menu opens (only consider action items)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isOpen) {
      const firstEnabledIndex = actionItems.findIndex((item) => !item.disabled)
      setFocusedIndex(firstEnabledIndex)
    } else {
      setFocusedIndex(-1)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, actionItems])

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
          {items.map((item, index) => {
            // Render divider
            if (item.type === 'divider') {
              return (
                <div
                  key={index}
                  className="my-1 border-t border-gray-100"
                  role="separator"
                  aria-hidden="true"
                />
              )
            }

            // Render info item (non-interactive)
            if (item.type === 'info') {
              return (
                <div
                  key={index}
                  className="px-4 py-2 text-xs text-gray-400 flex items-center gap-2"
                  role="presentation"
                >
                  {item.icon && (
                    <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </div>
              )
            }

            // Render action item (default)
            const actionIndex = actionItems.indexOf(item)
            return (
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
                  ${focusedIndex === actionIndex && !item.disabled ? 'bg-gray-100' : ''}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
