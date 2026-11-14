import { test, expect, type Locator } from '@playwright/test'

/**
 * The pointer over what can be pressed.
 *
 * Tailwind 4 stopped giving buttons `cursor: pointer` and nothing put it back, so on a
 * computer the arrow stayed an arrow over every day, every switch and every button, and
 * nothing looked pressable. The day is the gesture somebody makes every day.
 *
 * jsdom does not apply the stylesheet, so this is read in a real browser. It is Chromium:
 * the engines the app ships in (WebKitGTK, WebView2) cannot be driven from here.
 */
const cursorOf = (target: Locator) => target.evaluate((el) => getComputedStyle(el).cursor)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
          selectedDate: null,
          currentView: 'month',
        },
        version: 0,
      })
    )
  })
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible()
})

test('shows a hand over the things a person presses on a computer', async ({ page }) => {
  const pressable = {
    'a day': page.getByRole('button', { name: /^\d{4}-\d{2}-15, / }),
    '+ Add': page.locator('[data-testid="add-activity-button"]:visible'),
    'the Year switch': page.getByRole('button', { name: 'Year', exact: true }),
    'the gear': page.locator('[data-testid="settings-button"]:visible'),
    'the previous month arrow': page.getByRole('button', { name: 'Previous month' }),
    'the next month arrow': page.getByRole('button', { name: 'Next month' }),
  }

  const seen: Record<string, string> = {}
  for (const [name, target] of Object.entries(pressable)) {
    await expect(target, name).toHaveCount(1)
    seen[name] = await cursorOf(target)
  }

  expect(seen).toEqual(Object.fromEntries(Object.keys(pressable).map((name) => [name, 'pointer'])))
})

test('does not show a hand over a button that cannot be pressed', async ({ page }) => {
  await page.getByRole('button', { name: /^\d{4}-\d{2}-15, / }).click()
  await page.getByTestId('quicklog-new-activity-button').click()

  // Add, with no name typed yet.
  const add = page.getByTestId('quicklog-add-activity')
  await expect(add).toBeDisabled()

  // The button says so itself, with not-allowed. Accepting default as well let this pass
  // whatever the cursor was, short of a hand.
  expect(await cursorOf(add)).toBe('not-allowed')

  // Add carries its own not-allowed, so it would pass whatever the global rule said. The
  // switch in settings does not, and it is disabled only while it is busy; a bare button
  // stands in for it here, so the rule itself is what is read.
  const bare = await page.evaluate(() => {
    const button = document.createElement('button')
    button.disabled = true
    document.body.append(button)
    const cursor = getComputedStyle(button).cursor
    button.remove()
    return cursor
  })
  expect(bare).toBe('default')
})

// A hand over a label says pressing it does something, and over a text field's label it
// only focuses the field. The hand belongs on the label of a box that ticks, and only
// while it can be ticked.
test('shows a hand over the label of a checkbox, not over the label of a field', async ({
  page,
}) => {
  await page.locator('[data-testid="add-activity-button"]:visible').click()
  await expect(page.getByTestId('activity-form-modal')).toBeVisible()

  const nameLabel = page.locator('label[for="activity-name"]')
  const tickLabel = page.locator('label[for="log-for-date"]')
  expect(await cursorOf(nameLabel)).not.toBe('pointer')
  expect(await cursorOf(tickLabel)).toBe('pointer')
  expect(await cursorOf(page.getByTestId('log-for-date-checkbox'))).toBe('pointer')

  await tickLabel.click()
  const dateLabel = page.locator('label[for="selected-date"]')
  await expect(dateLabel).toBeVisible()
  expect(await cursorOf(dateLabel)).not.toBe('pointer')

  // The same label beside a box that cannot be ticked.
  await page.getByTestId('log-for-date-checkbox').evaluate((box) => {
    ;(box as HTMLInputElement).disabled = true
  })
  expect(await cursorOf(tickLabel)).not.toBe('pointer')
  // Nor over the box itself, whose own rule sits outside the layers.
  expect(await cursorOf(page.getByTestId('log-for-date-checkbox'))).not.toBe('pointer')
})
