import { test, expect, devices, type Page } from '@playwright/test'

/**
 * The first day and the second, on a phone, in a real browser.
 *
 * With no activities the Today bar is the way in. It opens today's sheet on the form, the
 * first activity is born logged on today, and the sheet says so once. The next morning the
 * bar says what today would make. Nothing new is saved for any of it.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const DOOR = '[data-testid="first-day-door"]:visible'
const SHEET = '[data-testid="quicklog-modal"]'
const LINE = 'Today is in. Log it again tomorrow.'

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test('the door leads to a logged today, and the next morning to two days', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
  await page.goto('/')
  await expect(page.locator(DOOR)).toHaveText(/Add your first activity/)
  await expect(page.getByTestId('fab-button')).toHaveCount(0)

  await page.locator(DOOR).click()
  const name = page.getByTestId('quicklog-new-activity-input')
  await expect(page.locator(SHEET)).toBeVisible()
  await expect(page.locator('#quicklog-title')).toHaveText('Today · Nov 13')
  await expect(name).toBeFocused()

  await name.fill('Read')
  await page.getByTestId('quicklog-add-activity').click()
  await expect(page.getByTestId('first-day-line')).toHaveText(LINE)
  await expect(page.getByTestId('quicklog-activity-checkbox')).toBeChecked()

  await page.getByTestId('quicklog-done-button').click()
  await expect(page.locator(SHEET)).toHaveCount(0)
  await expect(page.locator('[data-testid="today-tile"]:visible')).toHaveClass(/bg-emerald-700/)
  await expect(page.getByTestId('fab-button')).toBeVisible()
  await expect(page.locator('[data-testid="streak-chip"]:visible')).toHaveText('1 day')

  // Once: the next opening of the same sheet says nothing.
  await page.getByTestId('log-today-bar').click()
  await expect(page.locator(SHEET)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.locator(SHEET)).toHaveCount(0)

  // The next morning.
  await page.clock.setSystemTime(new Date('2026-11-14T09:00:00'))
  await page.reload()
  await expect(page.getByTestId('log-today-bar')).toContainText('Log today to make 2 days in a row')
  await expect(page.locator('[data-testid="today-tile"]:visible')).toHaveClass(/border-dashed/)
  await expect(
    page.locator('[data-testid="streak-chip"]:visible [data-testid="streak-flame"]')
  ).toHaveAttribute('data-lit', 'false')
  await expect(page.getByText('Yesterday is still open')).toHaveCount(0)

  await page.getByTestId('log-today-bar').click()
  await page.getByTestId('quicklog-activity-checkbox').check()
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.getByTestId('log-today-bar')).toContainText('1/1 activity')
  await expect(page.locator('[data-testid="streak-chip"]:visible')).toHaveText('2 days')
})

// Deleting the last activity brings the door back, and "Activity deleted" comes up in the
// corner where the phone's panel ends. It used to sit over "No activities yet.".
test('the toast after deleting the last activity leaves the words in sight', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
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
        },
        version: 0,
      })
    )
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await page.getByTestId('fab-button').click()
  const sheet = page.getByTestId('bottom-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.locator('[data-testid="bottom-sheet-backdrop"]')).toHaveCSS('opacity', '1')
  await page.waitForTimeout(350)

  await sheet.getByRole('button', { name: 'Delete Read' }).click()
  await page.getByTestId('delete-activity-confirm').getByRole('button', { name: 'Delete' }).click()
  const toast = page.getByRole('alert').filter({ hasText: 'Activity deleted' })
  await expect(toast).toBeVisible()
  await settle(page)

  const words = sheet.getByTestId('activity-list-empty')
  await expect(words).toHaveText('No activities yet.')
  const add = sheet.getByTestId('add-activity-button')
  await expect(add).toHaveClass(/bg-gray-100/)

  // The words themselves, not their padded box.
  const text = await words.evaluate((p) => {
    const range = document.createRange()
    range.selectNodeContents(p)
    const r = range.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  })
  const box = (await toast.boundingBox())!
  const apart =
    text.bottom <= box.y ||
    text.top >= box.y + box.height ||
    text.right <= box.x ||
    text.left >= box.x + box.width
  expect(apart).toBe(true)
  // And the toast is where it always was: the bottom right corner, over the inset.
  const vp = page.viewportSize()!
  expect(Math.round(vp.height - (box.y + box.height))).toBe(16)
  expect(Math.round(vp.width - (box.x + box.width))).toBe(16)

  await expect(page.getByTestId('fab-button')).toHaveCount(0)
})
