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

    // Stats panel should now be visible. Scoped to the sidebar: the year summary under
    // the calendar also counts active days, and getByText matches case-insensitively, so
    // an unscoped query now finds both and fails on strict mode rather than on the panel.
    const stats = page.getByTestId('stats-panel')
    await expect(stats.getByText('Statistics')).toBeVisible()
    await expect(stats.getByText('Active Days')).toBeVisible()
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

// Tagged @webkit so it runs in that project too. These are here rather than among the
// Chromium tests because what they guard does not show up in Chromium: in 1.1.3 a day
// cell asked to be the height of its grid row while the row was sized from its content,
// and WebKit fed the hovered cell's scaled box back into that row. Measured in WebKitGTK
// 4.1 at the time: the cell went from 18x24 to 19x158 and its week column from 18x170 to
// 18x1032, filling the window and pushing the rest of the year behind it.
//
// The grid is what is asserted now. The old test measured the cell's grandparent, which
// was the week column of a layout that no longer exists; the continuous heatmap has no
// element per week, because the columns are grid tracks. What must never change is the
// geometry around the cell, and the last cell of the year is where any of it would show.
test.describe('year view under the pointer @webkit', () => {
  test('hovering a day moves nothing', async ({ page }) => {
    await page.goto('/')
    await createActivity(page, 'Read')
    await openYearView(page)

    const cells = page.getByTestId('day-cell')
    const grid = page.getByRole('group', { name: /activity calendar/i })
    const last = cells.last()
    await expect(last).toBeVisible()

    const [gridBefore, lastBefore] = [await grid.boundingBox(), await last.boundingBox()]

    await cells.nth(100).hover()
    await expect(page.getByTestId('heatmap-tooltip')).toBeVisible()

    const [gridAfter, lastAfter] = [await grid.boundingBox(), await last.boundingBox()]
    expect(gridAfter).toEqual(gridBefore)
    expect(lastAfter).toEqual(lastBefore)
  })

  // A keyboard user has to be able to see where they are. This could not be measured in
  // the PyGObject harness: a GTK window that the window manager never focuses reports
  // document.hasFocus() false, and then no focus selector can match, so the question was
  // moved here where the browser really has focus.
  test('arrowing through the year draws a ring and says the day', async ({ page }) => {
    await page.goto('/')
    await createActivity(page, 'Read')
    await openYearView(page)

    const first = page.getByTestId('day-cell').first()
    await first.focus()
    await page.keyboard.press('ArrowDown')

    const focused = page.locator('[data-testid="day-cell"]:focus')
    await expect(focused).toHaveCount(1)

    // The ring is a box-shadow rather than an outline or a transform, so that is what is
    // asked for. "none" would mean a keyboard user sees nothing at all.
    const shadow = await focused.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe('none')

    // And the same tooltip the pointer gets, or the grid says nothing to them.
    await expect(page.getByTestId('heatmap-tooltip')).toBeVisible()
  })

  test('the grid is a single tab stop', async ({ page }) => {
    await page.goto('/')
    await createActivity(page, 'Read')
    await openYearView(page)

    const stops = page.locator('[data-testid="day-cell"][tabindex="0"]')
    await expect(stops).toHaveCount(1)
  })
})

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

// ── Month cards on a narrow phone ─────────────────────────

/**
 * A year whose numbers are as wide as they ever get: a fully completed month reads
 * "28/28 · 100%", which is the widest the header has to hold. Seeding beats clicking here
 * because the test is about a width, not about the flow that produces it.
 */
async function seedFullYear(page: import('@playwright/test').Page) {
  // addInitScript, not evaluate-then-reload: the store persists through a deferred write,
  // so its own empty state can land on top of a seed written after the app has started.
  // This runs before any app code does, and the app finds the data already there.
  await page.addInitScript(() => {
    const logs = []
    for (let day = 1; day <= 28; day++) {
      const date = `2026-02-${String(day).padStart(2, '0')}`
      logs.push({ id: `l${day}`, activityId: 'a1', date, completed: true, createdAt: date })
    }
    localStorage.setItem(
      'simple-calendar-storage',
      JSON.stringify({
        state: {
          activities: [
            {
              id: 'a1',
              name: 'Read',
              color: '#10B981',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          logs,
          selectedYear: 2026,
          selectedDate: null,
          currentView: 'year',
          selectedMonth: 1,
        },
        version: 0,
      })
    )
  })
  await page.goto('/')
  await page.waitForSelector('[data-testid="month-card"]')
}

test.describe('month cards on a narrow phone', () => {
  // 360 is the narrowest phone Daylo is expected on, and the one where this broke: the
  // figures wrapped to a second line and ran into the month name, which reads as two
  // overlapping labels rather than one heading.
  //
  // Every card is checked, not the first: the first is January, which in this seed reads
  // "0/31 · 0%" and fits anywhere. The card that breaks is the full one, and asserting on
  // all twelve means the test does not depend on knowing which that is.
  for (const width of [360, 390]) {
    test(`month card headers stay on one line at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await seedFullYear(page)

      const headers = page.getByTestId('month-card-header')
      await expect(headers).toHaveCount(12)

      for (let i = 0; i < 12; i++) {
        const header = headers.nth(i)
        const nameBox = await header.getByTestId('month-card-name').boundingBox()
        const statsBox = await header.getByTestId('month-card-stats').boundingBox()
        const label = await header.getByTestId('month-card-name').textContent()

        // A wrap shows up as a taller box, a collision as two different centres.
        expect(statsBox!.height, `${label} wrapped`).toBeLessThan(20)
        expect(
          Math.abs(nameBox!.y + nameBox!.height / 2 - (statsBox!.y + statsBox!.height / 2)),
          `${label} is off the line`
        ).toBeLessThanOrEqual(2)
      }
    })
  }
})

// ── Touch ────────────────────────────────────────────────

// Tagged @webkit as well: the ring depends on an engine heuristic, and the year grid
// has already shown that Chromium and WebKit do not agree about what raises it.
test.describe('the view toggle on a touch screen @webkit', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  /**
   * The button's own shadow once nothing is moving.
   *
   * Read as a string and compared against the resting state rather than matched against a
   * colour: Tailwind 4 writes these in oklab, so a regex for the emerald rgb triple can
   * never match and a test built on one passes whatever the ring does. The wait is not
   * decoration either, because the ring grows through a 150ms transition and measuring
   * during it returns a fraction of a pixel.
   */
  async function shadowOf(page: import('@playwright/test').Page, name: string) {
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running')
    )
    return page
      .getByRole('button', { name, exact: true })
      .evaluate((el) => getComputedStyle(el).boxShadow)
  }

  // Measured on the button that is already selected. Daylo opens on the month, so tapping
  // Month changes nothing about the selection and the only thing that can move the shadow
  // is the focus ring. Tapping Year would also swap which button carries shadow-sm, and
  // the test would be reading that instead.
  //
  // Reported from a real phone: tapping the toggle painted the green focus ring and left
  // it there. Swiping to the other view then moved the selection but not the ring, so two
  // buttons were highlighted at once, one of them the view you had just left.
  test('tapping it leaves no ring behind', async ({ page }) => {
    await page.goto('/')
    const resting = await shadowOf(page, 'Month')

    await page.getByRole('button', { name: 'Month', exact: true }).tap()

    expect(await shadowOf(page, 'Month')).toBe(resting)
  })

  // The other half of the same rule: a keyboard still has to be able to see where it is.
  // Tabbed to, not focused by script. WebKit does not treat a focus() call as keyboard
  // work, which is exactly what the year grid ran into, so a test that used one would be
  // asking a different question than the one a person asks with their hands.
  test('but the keyboard still gets one', async ({ page }) => {
    await page.goto('/')
    const resting = await shadowOf(page, 'Month')

    const month = page.getByRole('button', { name: 'Month', exact: true })
    for (
      let press = 0;
      press < 12 && !(await month.evaluate((el) => el === document.activeElement));
      press++
    ) {
      await page.keyboard.press('Tab')
    }
    await expect(month).toBeFocused()

    expect(await shadowOf(page, 'Month')).not.toBe(resting)
  })
})

// ── The reminder sheet on a phone ─────────────────────────

/**
 * The sheet exists only in the Android build, so the browser is told it is one. isTauri()
 * reads a single global and invoke() goes straight to another, which is the whole of what
 * has to be faked: everything below this line is the app's own code, in a real engine, at
 * the size of the phone that reported these two bugs.
 */
async function openTheReminderSheet(
  page: import('@playwright/test').Page,
  { enabled }: { enabled: boolean }
) {
  await page.addInitScript((on) => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: (command: string) =>
          Promise.resolve(
            command === 'reminders_available' ||
              command === 'plugin:notification|is_permission_granted'
          ),
      },
    })
    // The plugin's isPermissionGranted looks at window.Notification.permission first and
    // only asks the native side when it reads 'default'. A headless browser says 'denied',
    // which would have the app turn the reminder off on the way in and render the sheet
    // in the wrong state. A phone that has been granted the permission says granted.
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    })
    localStorage.setItem(
      'simple-calendar-storage',
      JSON.stringify({
        state: {
          activities: [
            {
              id: 'a1',
              name: 'Read',
              color: '#10B981',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          logs: [],
          selectedYear: 2026,
          selectedDate: null,
          currentView: 'month',
          yearMode: 'all',
          selectedMonth: 8,
          reminderEnabled: on,
          reminderHour: 19,
          reminderMinute: 0,
          // Or the one-time offer opens on top of the sheet and takes the taps.
          reminderOffered: true,
        },
        version: 0,
      })
    )
  }, enabled)

  await page.goto('/')
  // Two triggers are in the DOM at once, one for phones and one for wider screens.
  await page.locator('[aria-label="More options"]:visible').click()
  await page.getByText('Daily reminder').click()
  await expect(page.getByTestId('reminder-settings')).toBeVisible()
  // The sheet slides up; measuring through that returns a fraction of where things land.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test.describe('the reminder sheet on a phone', () => {
  test.use({ viewport: { width: 412, height: 820 }, hasTouch: true })

  /**
   * Reported from the same phone: "Stop reminders" sat flush against the gesture bar with
   * no air at all. The sheet reaches the bottom edge of the screen by design, and a phone
   * on gesture navigation keeps a strip down there for its own bar.
   *
   * The inset is set through the devtools protocol rather than described, so this measures
   * the same arithmetic a phone does. Without an override the engine reports zero, which
   * is the other half of the fix: nothing may move on a desktop.
   */
  test('clears the system bar at the bottom of the screen', async ({ page, context }) => {
    await openTheReminderSheet(page, { enabled: true })
    const sheet = page.getByTestId('reminder-settings')

    expect(await sheet.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('16px')

    const devtools = await context.newCDPSession(page)
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } })

    // 34 for the system's strip, 16 of the sheet's own air above it.
    expect(await sheet.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('50px')

    const button = page.getByTestId('reminder-stop')
    const box = (await button.boundingBox())!
    const viewport = page.viewportSize()!
    expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(50)
  })
})
