import { test, expect } from '@playwright/test'

/**
 * The app renders a mobile and a desktop variant of several controls at once, and only
 * one of them is visible at a given width. Three tests used .first() and spent thirty
 * seconds waiting for a span that is never going to be visible, which is how this suite
 * rotted without anyone noticing: nothing runs it.
 */
function visibleMenuTrigger(page: import('@playwright/test').Page) {
  return page.getByLabel('More options').filter({ visible: true }).first()
}

/**
 * Take the app to the year view.
 *
 * Daylo opens on the month now, so every test that works with the year grid has to say
 * so. Waiting for the year heading rather than for the click matters: the two views swap
 * behind a transition, and asserting on a cell before the swap lands is how a suite
 * becomes flaky.
 */
async function openYearView(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Year', exact: true }).click()
  await expect(
    page.locator('h1').filter({ hasText: String(new Date().getFullYear()) })
  ).toBeVisible()
  // The heading is there before the view has finished sliding in. Anything that measures
  // a box has to wait for the animation to land, or it measures a moving one.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

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
    await expect(page.getByText('No activities yet. Create one to start tracking!')).toBeVisible()
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

    await openYearView(page)
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    const quickLog = page.getByTestId('quicklog-modal')
    await expect(quickLog).toBeVisible()
  })

  test('should toggle activity completion in QuickLog', async ({ page }) => {
    await createActivity(page, 'Meditation')

    await openYearView(page)
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

    await openYearView(page)
    const dayCell = page.getByTestId('day-cell').first()
    await dayCell.click()

    await expect(page.getByTestId('quicklog-modal')).toBeVisible()

    const doneButton = page.getByTestId('quicklog-done-button')
    await doneButton.click()

    await expect(page.getByTestId('quicklog-modal')).not.toBeVisible()
  })

  test('should create activity from QuickLog empty state', async ({ page }) => {
    // Open QuickLog with no activities
    await openYearView(page)
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

    await openYearView(page)
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
    // Daylo opens on the month.
    await expect(page.getByText('Sun')).toBeVisible()

    // Switch to Year
    const yearButton = page.getByRole('button', { name: 'Year', exact: true })
    await yearButton.click()

    // Should see year navigation (the year number heading)
    const yearHeading = page.locator('h1').filter({ hasText: String(new Date().getFullYear()) })
    await expect(yearHeading).toBeVisible()
  })

  // ── Month View ────────────────────────────────────────────

  test('should navigate months with prev/next buttons', async ({ page }) => {
    // Switch to month view
    const monthButton = page.getByRole('button', { name: 'Month', exact: true })
    await monthButton.click()

    // Get the current month heading text
    const heading = page.getByTestId('month-title-button')
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
    const monthButton = page.getByRole('button', { name: 'Month', exact: true })
    await monthButton.click()

    // Navigate away
    const prevButton = page.getByLabel('Previous month')
    await prevButton.click()
    await prevButton.click()

    // Click Today
    const todayButton = page.getByLabel('Go to current month')
    await todayButton.click()

    // Heading should contain current month
    const heading = page.getByTestId('month-title-button')
    const monthName = new Date().toLocaleString('en-US', { month: 'long' })
    await expect(heading).toContainText(monthName)
  })

  test('should open QuickLog from month view day click', async ({ page }) => {
    await createActivity(page, 'Test')

    const monthButton = page.getByRole('button', { name: 'Month', exact: true })
    await monthButton.click()

    // Click a day in the month grid
    const dayButtons = page.locator('.grid.grid-cols-7 button')
    await dayButtons.first().click()

    await expect(page.getByTestId('quicklog-modal')).toBeVisible()
  })

  // ── Year View Navigation ──────────────────────────────────

  test('should navigate years with prev/next buttons', async ({ page }) => {
    await openYearView(page)
    const currentYear = new Date().getFullYear()

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
    await openYearView(page)
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
    await openYearView(page)
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
    const menuTrigger = visibleMenuTrigger(page)
    await menuTrigger.click()

    // Click Export Data
    await page.getByText('Export Data').click()

    // Export modal should be visible
    await expect(page.getByText('Export Your Data')).toBeVisible()
    // By role, not by text: 'JSON' also matches the Export JSON button, and what this
    // test means to assert is that both formats are offered.
    await expect(page.getByRole('radio', { name: /json/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /csv/i })).toBeVisible()
  })

  test('should show empty data warning in export modal', async ({ page }) => {
    const menuTrigger = visibleMenuTrigger(page)
    await menuTrigger.click()

    await page.getByText('Export Data').click()

    await expect(page.getByText('No data to export')).toBeVisible()
  })

  // ── Import ────────────────────────────────────────────────

  test('should open import modal from dropdown menu', async ({ page }) => {
    const menuTrigger = visibleMenuTrigger(page)
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
    await openYearView(page)
    await expect(page.getByLabel('Previous year')).toBeVisible()
    await expect(page.getByLabel('Next year')).toBeVisible()
    await expect(page.getByLabel('Go to current year')).toBeVisible()
  })

  test('should have legend for activity levels', async ({ page }) => {
    await openYearView(page)
    await expect(page.getByText('Less')).toBeVisible()
    await expect(page.getByText('More')).toBeVisible()
  })
})

// ── The engine the app actually runs on ───────────────────

// Tagged @webkit so it runs in that project too. It is here rather than among the
// Chromium tests because the bug it guards against does not exist in Chromium: a day
// cell asked to be the height of its grid row while the row was sized from its content,
// and WebKit fed the hovered cell's scaled box back into that row. Measured in WebKitGTK
// 4.1 before the fix: the cell went from 18x24 to 19x158 and its week column from 18x170
// to 18x1032, filling the window and pushing the rest of the year behind it.
//
// The column is what is asserted. The cell itself is supposed to change size on hover,
// because hover:scale-110 scales it; what must never change is the layout around it.
test.describe('year view under the pointer @webkit', () => {
  test('hovering a day does not resize its week column', async ({ page }) => {
    await page.goto('/')
    await createActivity(page, 'Read')

    await openYearView(page)
    const cell = page.getByTestId('day-cell').nth(20)
    await expect(cell).toBeVisible()

    const column = cell.locator('xpath=../..')
    const before = await column.boundingBox()

    await cell.hover()
    await page.waitForTimeout(600)
    const after = await column.boundingBox()

    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(2)
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(2)
  })
})

// ── Modal actions stay reachable ──────────────────────────

// A modal's buttons used to live inside its scrolling body, so on a short window the
// button that finishes the job scrolled out of sight. Measured before the fix, at
// 1024x600: the Import button sat at 698px with the modal ending at 570 and the viewport
// at 600. It was reachable, but only by discovering that the body scrolled.
//
// These check the property that replaced it: the footer is pinned, so the button's
// distance from the bottom of the window does not depend on how much content the modal
// has. Asserting a margin rather than "is it inside" is deliberate: at 1366x768 the old
// layout left 62px, so a yes/no check would have passed while the thing was one small
// metric difference away from breaking, which is exactly how it reached a user.
const SAMPLE_BACKUP = JSON.stringify({
  version: '1.1.3',
  exportedAt: '2026-09-10T00:00:00.000Z',
  activities: Array.from({ length: 8 }, (_, i) => ({
    id: `a${i}`,
    name: `Habit ${i}`,
    color: '#10B981',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
  logs: Array.from({ length: 30 }, (_, i) => ({
    id: `l${i}`,
    activityId: 'a0',
    date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    completed: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  })),
})

async function openImportWithFile(page: import('@playwright/test').Page) {
  await page.getByLabel('More options').filter({ visible: true }).first().click()
  await page.getByRole('menu').getByText('Import Data', { exact: true }).click()
  await page.setInputFiles('input[type="file"]', {
    name: 'daylo-backup-2026-09-10.json',
    mimeType: 'application/json',
    buffer: Buffer.from(SAMPLE_BACKUP),
  })
  // Waits for the button itself, not for the footer's test id. Waiting for the footer
  // made these fail against the old layout because the element did not exist, which
  // looks like the guard working and is not: it would have passed a broken layout that
  // happened to keep the test id. The button exists either way; where it sits is the
  // thing under test.
  await expect(importButton(page)).toBeAttached()
}

function importButton(page: import('@playwright/test').Page) {
  return page.getByRole('dialog').getByRole('button', { name: /import data/i })
}

test.describe('modal actions', () => {
  test('the import button is on screen on a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 })
    await page.goto('/')
    await openImportWithFile(page)

    const button = importButton(page)
    await expect(button).toBeInViewport()

    const box = await button.boundingBox()
    const viewport = page.viewportSize()!
    expect(viewport.height - (box!.y + box!.height)).toBeGreaterThanOrEqual(24)
  })

  test('the import button keeps its margin on a laptop window', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/')
    await openImportWithFile(page)

    const button = importButton(page)
    const box = await button.boundingBox()
    const viewport = page.viewportSize()!
    expect(viewport.height - (box!.y + box!.height)).toBeGreaterThanOrEqual(24)
  })
})
