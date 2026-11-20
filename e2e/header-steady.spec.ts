import { test, expect, type Page } from '@playwright/test'

/**
 * The header holds still: the same height with a run and without one, and the controls on
 * its right in the same place in Month and in Year.
 *
 * Found in 1.6 on Windows at 1280x800. The streak button is 48px tall in a 44px row, so the
 * header grew 4px the moment a run began. And Month is a few pixels taller than the window
 * while Year is not, so the scrollbar came and went with the view, and with it 15px of
 * width: the toggle and the gear jumped sideways on every switch.
 *
 * Headless Chromium draws no scrollbar and leaves no room for one, so the second half
 * cannot be seen moving here. What can be checked is that the room is kept for it
 * (`scrollbar-gutter: stable` on the root), and that nothing else in the two views makes
 * the right side land somewhere different. The jump itself was measured in WebKitGTK with
 * overlay scrolling off, before and after.
 */
test.use({ viewport: { width: 1280, height: 800 } })

const log = (date: string) => ({
  id: `l-${date}`,
  activityId: 'a1',
  date,
  completed: true,
  createdAt: `${date}T10:00:00.000Z`,
})

async function open(page: Page, dates: string[]) {
  await page.addInitScript((logs) => {
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
          // Or the one-time offer opens on its own and covers the page.
          reminderOffered: true,
        },
        version: 0,
      })
    )
  }, dates.map(log))
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'))
  await page.goto('/')
  await expect(page.locator('header')).toBeVisible()
}

const headerHeight = (page: Page) =>
  page.locator('header').evaluate((node) => node.getBoundingClientRect().height)

/** Where the toggle and the gear start, from the visible copy of each. */
const rightSide = (page: Page) =>
  page.evaluate(() => {
    const x = (selector: string) =>
      [...document.querySelectorAll(selector)]
        .map((node) => node.getBoundingClientRect())
        .find((box) => box.width > 0)?.x
    return {
      toggle: x('[aria-label="Calendar view toggle"]'),
      gear: x('[data-testid="settings-button"]'),
    }
  })

async function show(page: Page, view: 'Year' | 'Month') {
  await page.getByRole('button', { name: view, exact: true }).click()
  await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running')
  )
}

test('the header is as tall with a run as without one', async ({ page }) => {
  await open(page, ['2026-10-01'])
  await expect(page.getByTestId('streak-chip')).toHaveCount(0)
  const without = await headerHeight(page)

  await page.goto('about:blank')
  await open(page, ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
  await expect(page.getByTestId('streak-chip').filter({ visible: true })).toBeVisible()
  const withRun = await headerHeight(page)

  expect(withRun).toBe(without)
  // And the button keeps the 48px a finger was promised.
  const chip = await page
    .getByTestId('streak-chip')
    .filter({ visible: true })
    .evaluate((node) => node.getBoundingClientRect().height)
  expect(chip).toBe(48)
})

test('the toggle and the gear stay put between Month and Year', async ({ page }) => {
  await open(page, ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])

  // The room for the scrollbar is kept whether the view scrolls or not.
  const gutter = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollbarGutter
  )
  expect(gutter).toBe('stable')

  await show(page, 'Month')
  const month = await rightSide(page)
  await show(page, 'Year')
  const year = await rightSide(page)

  expect(month.toggle).toBeDefined()
  expect(month.gear).toBeDefined()
  expect(year).toEqual(month)
})
