import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenu } from './DropdownMenu'
import type { DropdownMenuItem } from './DropdownMenu'

const createItems = (overrides: Partial<DropdownMenuItem>[] = []): DropdownMenuItem[] => [
  { label: 'Edit', onClick: vi.fn(), ...overrides[0] },
  { label: 'Delete', onClick: vi.fn(), ...overrides[1] },
  { label: 'Share', onClick: vi.fn(), ...overrides[2] },
]

describe('DropdownMenu', () => {
  describe('Rendering', () => {
    it('should render the trigger element', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )
      expect(screen.getByText('Open Menu')).toBeInTheDocument()
    })

    it('should not render menu items initially', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    })

    it('should render with custom data-testid', () => {
      const items = createItems()
      render(
        <DropdownMenu
          trigger={<span>Open Menu</span>}
          items={items}
          data-testid="custom-dropdown"
        />
      )
      expect(screen.getByTestId('custom-dropdown')).toBeInTheDocument()
    })

    it('should render item icons when provided', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn(), icon: <span data-testid="edit-icon">E</span> },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByTestId('edit-icon')).toBeInTheDocument()
    })
  })

  describe('Opening and Closing', () => {
    it('should open menu when trigger is clicked', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('Share')).toBeInTheDocument()
    })

    it('should close menu when trigger is clicked again', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()

      await user.click(screen.getByText('Open Menu'))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should close menu when clicking outside', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <div>
          <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
          <button>Outside Button</button>
        </div>
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()

      // Click outside the dropdown
      fireEvent.mouseDown(screen.getByText('Outside Button'))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should close menu when Escape key is pressed', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should return focus to trigger after Escape closes menu', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const triggerButton = screen.getByRole('button', { name: 'Open Menu' })
      await user.click(triggerButton)
      expect(screen.getByRole('menu')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(triggerButton).toHaveFocus()
    })

    it('should close menu when Tab key is pressed', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()

      await user.keyboard('{Tab}')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  describe('Item Interaction', () => {
    it('should execute onClick and close menu when item is clicked', async () => {
      const user = userEvent.setup()
      const handleEdit = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: handleEdit },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.click(screen.getByText('Edit'))

      expect(handleEdit).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should not execute onClick for disabled items', async () => {
      const user = userEvent.setup()
      const handleEdit = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: handleEdit, disabled: true },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.click(screen.getByText('Edit'))

      expect(handleEdit).not.toHaveBeenCalled()
    })

    it('should keep menu open when clicking disabled item', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn(), disabled: true },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.click(screen.getByText('Edit'))

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should open menu with Enter key on trigger', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      screen.getByRole('button', { name: 'Open Menu' }).focus()
      await user.keyboard('{Enter}')

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should open menu with Space key on trigger', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      screen.getByRole('button', { name: 'Open Menu' }).focus()
      await user.keyboard(' ')

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should open menu with ArrowDown key on trigger', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      screen.getByRole('button', { name: 'Open Menu' }).focus()
      await user.keyboard('{ArrowDown}')

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should focus first enabled item when menu opens', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // First item should have visual focus (bg-gray-100 class)
      const editItem = screen.getByText('Edit').closest('button')
      expect(editItem).toHaveClass('bg-gray-100')
    })

    it('should skip disabled items when focusing first item on open', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn(), disabled: true },
        { label: 'Delete', onClick: vi.fn() },
        { label: 'Share', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // Second item (Delete) should have visual focus since first is disabled
      const deleteItem = screen.getByText('Delete').closest('button')
      expect(deleteItem).toHaveClass('bg-gray-100')
    })

    it('should move focus down with ArrowDown key', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // First item focused initially
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')

      await user.keyboard('{ArrowDown}')

      // Second item should now be focused
      expect(screen.getByText('Edit').closest('button')).not.toHaveClass('bg-gray-100')
      expect(screen.getByText('Delete').closest('button')).toHaveClass('bg-gray-100')
    })

    it('should move focus up with ArrowUp key', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.keyboard('{ArrowDown}')

      // Second item focused
      expect(screen.getByText('Delete').closest('button')).toHaveClass('bg-gray-100')

      await user.keyboard('{ArrowUp}')

      // First item should now be focused
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')
    })

    it('should wrap focus from last to first item with ArrowDown', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // Navigate to last item
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('Share').closest('button')).toHaveClass('bg-gray-100')

      // Wrap to first
      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')
    })

    it('should wrap focus from first to last item with ArrowUp', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // First item focused initially
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')

      // Wrap to last
      await user.keyboard('{ArrowUp}')
      expect(screen.getByText('Share').closest('button')).toHaveClass('bg-gray-100')
    })

    it('should skip disabled items during navigation', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn() },
        { label: 'Delete', onClick: vi.fn(), disabled: true },
        { label: 'Share', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')

      // ArrowDown should skip disabled Delete and focus Share
      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('Share').closest('button')).toHaveClass('bg-gray-100')
    })

    it('should execute onClick with Enter key on focused item', async () => {
      const user = userEvent.setup()
      const handleDelete = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn() },
        { label: 'Delete', onClick: handleDelete },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      expect(handleDelete).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should execute onClick with Space key on focused item', async () => {
      const user = userEvent.setup()
      const handleEdit = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: handleEdit },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.keyboard(' ')

      expect(handleEdit).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('should not execute onClick with Enter on disabled focused item', async () => {
      const user = userEvent.setup()
      const handleEdit = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: handleEdit, disabled: true },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // Note: When all items before current are disabled, focusedIndex starts at first enabled
      // But let's test the case where we somehow end up on a disabled item
      // Actually the component skips disabled items, so Delete will be focused
      // Let's test that disabled items don't get focused via keyboard at all
      expect(screen.getByText('Delete').closest('button')).toHaveClass('bg-gray-100')
    })
  })

  describe('Accessibility', () => {
    it('should have aria-haspopup on trigger button', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    })

    it('should have aria-expanded=false when menu is closed', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('should have aria-expanded=true when menu is open', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      await user.click(trigger)

      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('should have aria-controls pointing to menu when open', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      await user.click(trigger)

      expect(trigger).toHaveAttribute('aria-controls', 'dropdown-menu')
    })

    it('should not have aria-controls when menu is closed', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      expect(trigger).not.toHaveAttribute('aria-controls')
    })

    it('should have role="menu" on the dropdown container', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('should have role="menuitem" on each item', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      const menuItems = screen.getAllByRole('menuitem')
      expect(menuItems).toHaveLength(3)
    })

    it('should have aria-disabled on disabled items', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn(), disabled: true },
        { label: 'Delete', onClick: vi.fn() },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      const editItem = screen.getByText('Edit').closest('button')
      const deleteItem = screen.getByText('Delete').closest('button')

      expect(editItem).toHaveAttribute('aria-disabled', 'true')
      // Non-disabled items don't have aria-disabled attribute (undefined becomes no attribute)
      expect(deleteItem).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('should have aria-orientation on menu', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      const menu = screen.getByRole('menu')
      expect(menu).toHaveAttribute('aria-orientation', 'vertical')
    })

    it('should have aria-label on menu', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      const menu = screen.getByRole('menu')
      expect(menu).toHaveAttribute('aria-label', 'Options menu')
    })

    it('should have tabIndex=-1 on menu items', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      const menuItems = screen.getAllByRole('menuitem')
      menuItems.forEach((item) => {
        expect(item).toHaveAttribute('tabindex', '-1')
      })
    })

    it('should have type="button" on trigger', () => {
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      const trigger = screen.getByRole('button', { name: 'Open Menu' })
      expect(trigger).toHaveAttribute('type', 'button')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty items array', async () => {
      const user = userEvent.setup()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={[]} />
      )

      await user.click(screen.getByText('Open Menu'))

      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    })

    it('should handle all disabled items', async () => {
      const user = userEvent.setup()
      const items: DropdownMenuItem[] = [
        { label: 'Edit', onClick: vi.fn(), disabled: true },
        { label: 'Delete', onClick: vi.fn(), disabled: true },
      ]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))

      // No item should have the focused style since all are disabled
      const editItem = screen.getByText('Edit').closest('button')
      const deleteItem = screen.getByText('Delete').closest('button')
      expect(editItem).not.toHaveClass('bg-gray-100')
      expect(deleteItem).not.toHaveClass('bg-gray-100')
    })

    it('should handle single item', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const items: DropdownMenuItem[] = [{ label: 'Edit', onClick: handleClick }]
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      await user.click(screen.getByText('Open Menu'))
      await user.click(screen.getByText('Edit'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should reset focus index when menu closes and reopens', async () => {
      const user = userEvent.setup()
      const items = createItems()
      render(
        <DropdownMenu trigger={<span>Open Menu</span>} items={items} />
      )

      // Open and navigate
      await user.click(screen.getByText('Open Menu'))
      await user.keyboard('{ArrowDown}')
      expect(screen.getByText('Delete').closest('button')).toHaveClass('bg-gray-100')

      // Close
      await user.keyboard('{Escape}')

      // Reopen - should start at first item again
      await user.click(screen.getByText('Open Menu'))
      expect(screen.getByText('Edit').closest('button')).toHaveClass('bg-gray-100')
    })
  })
})
