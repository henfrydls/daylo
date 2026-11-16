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

/**
 * Where the focus lands after the first day's surfaces close. Read from
 * `document.activeElement`, because each of these used to leave it on <body>: the thing
 * that had opened them was gone by the time they closed.
 */
test.describe('the focus after the first day changes the page', () => {
  const active = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement
      return el === null || el === document.body
        ? 'body'
        : (el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
    })

  for (const close of ['Escape', 'Done'] as const) {
    test(`closing the sheet where the first activity was born gives the focus to the Today bar (${close})`, async ({
      page,
    }) => {
      await page.goto('/')
      const door = page.locator(DOOR)
      await door.focus()
      await page.keyboard.press('Enter')
      const name = page.getByTestId('quicklog-new-activity-input')
      await expect(name).toBeFocused()
      await name.fill('Read')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('first-day-line')).toBeVisible()
      await expect(page.locator(DOOR)).toHaveCount(0)

      if (close === 'Escape') await page.keyboard.press('Escape')
      else await page.getByTestId('quicklog-done-button').click()
      await expect(page.locator(SHEET)).toHaveCount(0)

      expect(await active(page)).toBe('log-today-bar')
    })
  }

  // From Year the door takes itself away on the way to Month, so the sheet opens with the
  // focus on nobody. Closing it must not leave the focus there.
  for (const close of ['Escape', 'Done'] as const) {
    test(`at 360 from the door in Year, closing the sheet gives the focus to the Today bar (${close})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 })
      await page.goto('/')
      await page.getByRole('button', { name: 'Year', exact: true }).click()
      await settle(page)
      await page.locator(DOOR).click()
      const name = page.getByTestId('quicklog-new-activity-input')
      await expect(name).toBeFocused()
      await name.fill('Read')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('first-day-line')).toBeVisible()

      if (close === 'Escape') await page.keyboard.press('Escape')
      else await page.getByTestId('quicklog-done-button').click()
      await expect(page.locator(SHEET)).toHaveCount(0)

      expect(await active(page)).toBe('log-today-bar')
    })
  }

  test('closing the panel after deleting the last activity gives the focus to the door', async ({
    page,
  }) => {
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
    await page.goto('/')
    await page.getByTestId('fab-button').click()
    const sheet = page.getByTestId('bottom-sheet')
    await expect(sheet).toBeVisible()
    await expect(page.locator('[data-testid="bottom-sheet-backdrop"]')).toHaveCSS('opacity', '1')
    await page.waitForTimeout(350)
    await sheet.getByRole('button', { name: 'Delete Read' }).click()
    await page
      .getByTestId('delete-activity-confirm')
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(page.getByTestId('delete-activity-confirm')).toHaveCount(0)
    await expect(page.getByTestId('fab-button')).toHaveCount(0)

    // The confirm closed over the panel: the focus goes back into the panel, not to the
    // page behind it, and Tab keeps going round inside it.
    const inPanel = () =>
      page.evaluate(() => document.activeElement?.closest('[data-testid="bottom-sheet"]') !== null)
    expect(await inPanel()).toBe(true)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await inPanel()).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    expect(await active(page)).toBe('first-day-door')
  })

  test('importing from the door in Year leaves the focus on the year', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Year', exact: true }).click()
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running')
    )
    await page.getByRole('button', { name: 'Import your backup' }).click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="modal-title"]')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'daylo-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          activities: [
            {
              id: 'b1',
              name: 'Swim',
              color: '#3B82F6',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          logs: [],
        })
      ),
    })
    await dialog.getByRole('button', { name: 'Import Data' }).click()
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator(DOOR)).toHaveCount(0)

    expect(await active(page)).toBe('year-title')
  })
})
