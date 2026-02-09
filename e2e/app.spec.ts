import { test, expect } from '@playwright/test'

// Helper: create an activity via the sidebar form
async function createActivity(page: import('@playwright/test').Page, name: string) {
  const addButton = page.getByTestId('add-activity-button')
  await addButton.click()

  const modal = page.getByTestId('activity-form-modal')
  await expect(modal).toBeVisible()

  const nameInput = page.getByTestId('activity-name-input')
  await nameInput.fill(name)

  const submitButton = page.getByTestId('activity-form-submit')
  await submitButton.click()

  await expect(modal).not.toBeVisible()
}

test.describe('Activity Tracker App', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test for isolation
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  // ── Basic UI ──────────────────────────────────────────────

  test('should display app header with logo', async ({ page }) => {
    const header = page.getByTestId('app-header')
    await expect(header).toBeVisible()
    await expect(header).toContainText('Daylo')
  })

  test('should show empty state message when no activities exist', async ({ page }) => {
    await expect(page.getByText('No activities yet')).toBeVisible()
  })

  // ── Activity CRUD ─────────────────────────────────────────

  test('should create a new activity', async ({ page }) => {
    await createActivity(page, 'Exercise')

    const activityItem = page.getByTestId('activity-item').filter({ hasText: 'Exercise' })
    await expect(activityItem).toBeVisible()
  })

  test('should create multiple activities', async ({ page }) => {
    await createActivity(page, 'Exercise')
    await createActivity(page, 'Reading')
    await createActivity(page, 'Meditate')

    const items = page.getByTestId('activity-item')
    await expect(items).toHaveCount(3)
  })

  test('should edit an activity name', async ({ page }) => {
    await createActivity(page, 'Exercis')

    // Click the edit button for the activity
    const activityItem = page.getByTestId('activity-item').filter({ hasText: 'Exercis' })
    const editButton = activityItem.getByLabel(/Edit/)
    await editButton.click()

    // Modal should open with existing name
    const modal = page.getByTestId('activity-form-modal')
    await expect(modal).toBeVisible()

    const nameInput = page.getByTestId('activity-name-input')
    await expect(nameInput).toHaveValue('Exercis')

    // Clear and type corrected name
    await nameInput.clear()
    await nameInput.fill('Exercise')

    const submitButton = page.getByTestId('activity-form-submit')
    await submitButton.click()

    await expect(modal).not.toBeVisible()
    await expect(page.getByTestId('activity-item').filter({ hasText: 'Exercise' })).toBeVisible()
  })

  test('should delete an activity', async ({ page }) => {
    await createActivity(page, 'Temporary')

    const activityItem = page.getByTestId('activity-item').filter({ hasText: 'Temporary' })
    const deleteButton = activityItem.getByLabel(/Delete/)
    await deleteButton.click()

    // Confirm dialog should appear
    const confirmButton = page.getByTestId('confirm-dialog-confirm')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Activity should be gone
    await expect(
      page.getByTestId('activity-item').filter({ hasText: 'Temporary' })
    ).not.toBeVisible()
  })

  test('should cancel activity deletion', async ({ page }) => {
    await createActivity(page, 'Keep Me')

    const activityItem = page.getByTestId('activity-item').filter({ hasText: 'Keep Me' })
    const deleteButton = activityItem.getByLabel(/Delete/)
    await deleteButton.click()

    // Click Cancel
    const cancelButton = page.getByTestId('confirm-dialog-cancel')
    await cancelButton.click()

    // Activity should still exist
    await expect(page.getByTestId('activity-item').filter({ hasText: 'Keep Me' })).toBeVisible()
  })

  test('should not submit activity with empty name', async ({ page }) => {
    const addButton = page.getByTestId('add-activity-button')
    await addButton.click()

    const modal = page.getByTestId('activity-form-modal')
    await expect(modal).toBeVisible()

    // Submit button should be disabled when name is empty
    const submitButton = page.getByTestId('activity-form-submit')
    await expect(submitButton).toBeDisabled()
  })

  // ── QuickLog ──────────────────────────────────────────────

  test('should open QuickLog when clicking a calendar day', async ({ page }) => {
    await createActivity(page, 'Test Activity')

    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()
  })

  test('should toggle activity completion in QuickLog', async ({ page }) => {
    await createActivity(page, 'Meditation')

    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()

    const activityCheckbox = page.getByTestId('quicklog-activity-checkbox').first()
    await expect(activityCheckbox).not.toBeChecked()
    await activityCheckbox.click()
    await expect(activityCheckbox).toBeChecked()

    // Toggle off
    await activityCheckbox.click()
    await expect(activityCheckbox).not.toBeChecked()
  })

  test('should close QuickLog with Done button', async ({ page }) => {
    await createActivity(page, 'Test')

    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    await expect(page.getByTestId('quicklog-modal')).toBeVisible()

    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    await expect(page.getByTestId('quicklog-modal')).not.toBeVisible()
  })

  test('should create activity from QuickLog empty state', async ({ page }) => {
    // Open QuickLog with no activities
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()

    // Click "Create your first activity"
    const createButton = page.getByTestId('quicklog-create-first-activity')
    await createButton.click()

    // Fill in activity name
    const nameInput = page.getByTestId('quicklog-new-activity-input')
    await nameInput.fill('New From QuickLog')

    const addButton = page.getByTestId('quicklog-add-activity')
    await addButton.click()

    // Activity should now appear in QuickLog as checked (auto-logged)
    const checkbox = page.getByTestId('quicklog-activity-checkbox').first()
    await expect(checkbox).toBeChecked()
  })

  test('should show heatmap color after marking activity as completed', async ({ page }) => {
    await createActivity(page, 'Reading')

    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const activityCheckbox = page.getByTestId('quicklog-activity-checkbox').first()
    await activityCheckbox.click()

    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    await expect(page.getByTestId('quicklog-modal')).not.toBeVisible()

    // Day cell should now have a heatmap color (emerald)
    await expect(dayCell).toHaveClass(/bg-emerald/)
  })

  // ── View Toggle ───────────────────────────────────────────

  test('should switch between Year and Month views', async ({ page }) => {
    // Default is Year view
    const monthButton = page.getByRole('button', { name: 'Month' })
    await monthButton.click()

    // Should see month view with day-of-week headers
    await expect(page.getByText('Sun')).toBeVisible()

    // Switch back to Year
    const yearButton = page.getByRole('button', { name: 'Year' })
    await yearButton.click()

    // Should see year navigation (the year number heading)
    const yearHeading = page.locator('h1').filter({ hasText: String(new Date().getFullYear()) })
    await expect(yearHeading).toBeVisible()
  })

  // ── Month View ────────────────────────────────────────────

  test('should navigate months with prev/next buttons', async ({ page }) => {
    // Switch to month view
    const monthButton = page.getByRole('button', { name: 'Month' })
    await monthButton.click()

    // Get the current month heading text
    const heading = page.locator('h1').first()
    const initialMonth = await heading.textContent()

    // Click previous month
    const prevButton = page.getByLabel('Previous month')
    await prevButton.click()

    const prevMonth = await heading.textContent()
    expect(prevMonth).not.toBe(initialMonth)

    // Click next month twice to go forward
    const nextButton = page.getByLabel('Next month')
    await nextButton.click()
    await nextButton.click()

    const nextMonth = await heading.textContent()
    expect(nextMonth).not.toBe(prevMonth)
  })

  test('should navigate to today from month view', async ({ page }) => {
    const monthButton = page.getByRole('button', { name: 'Month' })
    await monthButton.click()

    // Navigate away
    const prevButton = page.getByLabel('Previous month')
    await prevButton.click()
    await prevButton.click()

    // Click Today
    const todayButton = page.getByLabel('Go to current month')
    await todayButton.click()

    // Heading should contain current month
    const heading = page.locator('h1').first()
    const monthName = new Date().toLocaleString('en-US', { month: 'long' })
    await expect(heading).toContainText(monthName)
  })

  test('should open QuickLog from month view day click', async ({ page }) => {
    await createActivity(page, 'Test')

    const monthButton = page.getByRole('button', { name: 'Month' })
    await monthButton.click()

    // Click a day in the month grid
    const dayButtons = page.locator('.grid.grid-cols-7 button')
    await dayButtons.first().click()

    await expect(page.getByTestId('quicklog-modal')).toBeVisible()
  })

  // ── Year View Navigation ──────────────────────────────────

  test('should navigate years with prev/next buttons', async ({ page }) => {
    const currentYear = new Date().getFullYear()
    const yearHeading = page.locator('h1').filter({ hasText: String(currentYear) })
    await expect(yearHeading).toBeVisible()

    // Go to previous year
    const prevButton = page.getByLabel('Previous year')
    await prevButton.click()

    await expect(page.locator('h1').filter({ hasText: String(currentYear - 1) })).toBeVisible()

    // Go to today
    const todayButton = page.getByLabel('Go to current year')
    await todayButton.click()

    await expect(page.locator('h1').filter({ hasText: String(currentYear) })).toBeVisible()
  })

  // ── Statistics ────────────────────────────────────────────

  test('should show statistics after logging activities', async ({ page }) => {
    await createActivity(page, 'Exercise')

    // Log activity for a day
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const checkbox = page.getByTestId('quicklog-activity-checkbox').first()
    await checkbox.click()

    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    // Stats panel should now be visible
    await expect(page.getByText('Statistics')).toBeVisible()
    await expect(page.getByText('Active Days')).toBeVisible()
    await expect(page.getByText('Current Streak')).toBeVisible()
    await expect(page.getByText('Longest Streak')).toBeVisible()
    await expect(page.getByText('This Month')).toBeVisible()
  })

  test('should not show statistics when no activities exist', async ({ page }) => {
    await expect(page.getByText('Statistics')).not.toBeVisible()
  })

  // ── Data Persistence ──────────────────────────────────────

  test('should persist activities across page reloads', async ({ page }) => {
    await createActivity(page, 'Persistent Activity')

    await expect(
      page.getByTestId('activity-item').filter({ hasText: 'Persistent Activity' })
    ).toBeVisible()

    // Reload the page
    await page.reload()

    // Activity should still be there
    await expect(
      page.getByTestId('activity-item').filter({ hasText: 'Persistent Activity' })
    ).toBeVisible()
  })

  test('should persist activity logs across page reloads', async ({ page }) => {
    await createActivity(page, 'Logged Activity')

    // Log activity for a day
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const checkbox = page.getByTestId('quicklog-activity-checkbox').first()
    await checkbox.click()

    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    // Verify heatmap
    await expect(dayCell).toHaveClass(/bg-emerald/)

    // Reload
    await page.reload()

    // Heatmap color should persist
    const dayCellAfterReload = page.getByTestId('day-cell').first()
    await expect(dayCellAfterReload).toHaveClass(/bg-emerald/)
  })

  // ── Export ────────────────────────────────────────────────

  test('should open export modal from dropdown menu', async ({ page }) => {
    // Open the dropdown menu (desktop version)
    const menuTrigger = page.getByLabel('More options').first()
    await menuTrigger.click()

    // Click Export Data
    await page.getByText('Export Data').click()

    // Export modal should be visible
    await expect(page.getByText('Export Your Data')).toBeVisible()
    await expect(page.getByText('JSON')).toBeVisible()
    await expect(page.getByText('CSV')).toBeVisible()
  })

  test('should show empty data warning in export modal', async ({ page }) => {
    const menuTrigger = page.getByLabel('More options').first()
    await menuTrigger.click()

    await page.getByText('Export Data').click()

    await expect(page.getByText('No data to export')).toBeVisible()
  })

  // ── Import ────────────────────────────────────────────────

  test('should open import modal from dropdown menu', async ({ page }) => {
    const menuTrigger = page.getByLabel('More options').first()
    await menuTrigger.click()

    await page.getByText('Import Data').click()

    await expect(page.getByText('Import Data')).toBeVisible()
    await expect(page.getByText('Drop your backup file here')).toBeVisible()
  })

  // ── Accessibility ─────────────────────────────────────────

  test('should have skip-to-content link', async ({ page }) => {
    const skipLink = page.getByText('Skip to main content')
    // Skip link is sr-only by default
    await expect(skipLink).toBeAttached()
  })

  test('should have proper ARIA labels on navigation buttons', async ({ page }) => {
    await expect(page.getByLabel('Previous year')).toBeVisible()
    await expect(page.getByLabel('Next year')).toBeVisible()
    await expect(page.getByLabel('Go to current year')).toBeVisible()
  })

  test('should have legend for activity levels', async ({ page }) => {
    await expect(page.getByText('Less')).toBeVisible()
    await expect(page.getByText('More')).toBeVisible()
  })
})
