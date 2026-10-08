import { test, expect, devices } from '@playwright/test'

/**
 * The day sheet coming and going, measured frame by frame.
 *
 * Henfry, with 1.4.1 on a phone: it appears and disappears at once. Nothing in jsdom could
 * have said so, because there the transition is a class name; and nothing in the tests of
 * the component could either, because they all rendered it with a day already chosen,
 * which is a sheet that has no first frame to be off the screen in.
 *
 * So this records the sheet's own transform on every frame from inside the page, the same
 * way the carousel's landing is measured, and asks the only two questions that matter: did
 * it travel on the way in, and was it still there travelling on the way out.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const SHEET = '[data-testid="quicklog-modal"]'
/** A day in the month grid: they have no test id, but their label is a date. */
const DAY = 'button[aria-label$="activities completed"]'

/**
 * Where the sheet is on the screen, every frame, from inside the page.
 *
 * Its top edge rather than its transform: Tailwind moves this one with the `translate`
 * property and not with `transform`, so `getComputedStyle(node).transform` is `none` for
 * the whole journey and reads as a sheet that never moved. The rectangle does not care
 * which property put it there, which is the reason to ask the rectangle.
 */
async function watch(page: import('@playwright/test').Page) {
  await page.evaluate((selector) => {
    const w = window as unknown as { __seen: number[] }
    w.__seen = []
    const tick = () => {
      const node = document.querySelector(selector)
      if (node) w.__seen.push(Math.round(node.getBoundingClientRect().top))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, SHEET)
}

const seen = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __seen: number[] }).__seen)

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
          selectedYear: 2026,
          selectedMonth: 1,
          selectedDate: null,
          currentView: 'month',
        },
        version: 0,
      })
    )
  })
  await page.goto('/')
  // Month, because the days live there: the year on a phone is twelve cards and no squares.
  await expect(page.locator(DAY).first()).toBeVisible()
})

test('the day sheet comes up from under the edge instead of being there', async ({ page }) => {
  await watch(page)

  await page.locator(DAY).first().click()
  await expect(page.locator(SHEET)).toBeVisible()
  await page.waitForTimeout(500)

  const frames = await seen(page)
  const distinct = new Set(frames)

  // More than one place: a sheet that is simply there has one top edge for its whole life.
  expect(distinct.size).toBeGreaterThan(2)
  // It starts lower down the screen than it finishes, by a good part of the phone.
  expect(frames[0] - frames[frames.length - 1]).toBeGreaterThan(80)
})

test('the day sheet goes back down instead of vanishing', async ({ page }) => {
  await page.locator(DAY).first().click()
  await expect(page.locator(SHEET)).toBeVisible()
  await page.waitForTimeout(500)

  await watch(page)
  await page.getByRole('button', { name: 'Close quick log' }).click()
  await page.waitForTimeout(400)

  const frames = await seen(page)
  const distinct = new Set(frames)

  // It was still on the page, moving, after the day was cleared. Before this it was taken
  // off the page by its parent and by itself, both at once, so there were no frames at all.
  expect(distinct.size).toBeGreaterThan(2)
  // Downwards this time, off the bottom of the phone.
  expect(frames[frames.length - 1] - frames[0]).toBeGreaterThan(80)
  await expect(page.locator(SHEET)).toBeHidden()
})
