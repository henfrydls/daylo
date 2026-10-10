import { test, expect } from '@playwright/test'

/**
 * The settings panel, on a screen with room for one beside the calendar.
 *
 * In a browser there is no updater and no check-in, so the corner is the gear: a menu whose
 * only entry is "Settings" would be a button wearing a hat. What is measured here is the
 * one thing jsdom cannot say, which is whether the panel travels: its own left edge, every
 * frame, the same way the day sheet and the carousel's landing are measured.
 */
/** Both triggers are in the page at once, one per breakpoint; only one is on screen. */
const GEAR = '[data-testid="settings-button"]:visible'
const PANEL = '[data-testid="settings-surface"]'

async function watch(page: import('@playwright/test').Page) {
  await page.evaluate((selector) => {
    const w = window as unknown as { __seen: number[] }
    w.__seen = []
    const tick = () => {
      const node = document.querySelector(selector)
      if (node) w.__seen.push(Math.round(node.getBoundingClientRect().left))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, PANEL)
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
          logs: [
            {
              id: 'l1',
              activityId: 'a1',
              date: '2026-02-02',
              completed: true,
              createdAt: '2026-02-02',
            },
          ],
          selectedYear: 2026,
          selectedMonth: 1,
          selectedDate: null,
          currentView: 'year',
        },
        version: 0,
      })
    )
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible()
})

test('the gear opens a panel that slides in from the right', async ({ page }) => {
  await watch(page)

  await page.locator(GEAR).click()
  await expect(page.locator(PANEL)).toBeVisible()
  await page.waitForTimeout(500)

  const frames = await seen(page)
  const distinct = new Set(frames)

  // More than one place: a panel that is simply there has one left edge for its whole life.
  expect(distinct.size).toBeGreaterThan(2)
  // It comes from the right and settles further left than it started.
  expect(frames[0] - frames[frames.length - 1]).toBeGreaterThan(8)
})

test('the panel says what this copy can and cannot do', async ({ page }) => {
  await page.locator(GEAR).click()
  await expect(page.locator(PANEL)).toBeVisible()

  // A browser: nothing is sent, nothing updates itself, and no notification can arrive.
  await expect(page.getByText('Reminders')).toBeHidden()
  await expect(page.getByTestId('checkin-switch')).toBeHidden()
  await expect(page.getByTestId('updates-switch')).toBeHidden()

  // What it does have: the data, the one sentence about feedback, and who made it.
  await expect(page.getByText('1 activity, 1 entry')).toBeVisible()
  await expect(page.getByTestId('settings-export')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible()
  await expect(page.getByTestId('settings-privacy')).toHaveAttribute(
    'href',
    'https://daylo.henfrydls.com/privacy/'
  )
  await expect(page.getByText('Made by DLSLabs')).toBeVisible()
})

test('it closes with Escape and leaves the calendar where it was', async ({ page }) => {
  await page.locator(GEAR).click()
  await expect(page.locator(PANEL)).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.locator(PANEL)).toBeHidden()
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible()
})

/**
 * The four links at the foot sit in the middle, which is what Henfry asked for after
 * seeing 1.4.12.
 *
 * Measured as the space each side of the links themselves, never the row they are in: the
 * row fills the width whether or not anything is centred, so its own middle is the panel's
 * middle either way and a test written against it passes with the links hard left. Checked
 * by taking the class off in the live page: 14 and 14 becomes 0 and 28.
 */
test('the links at the foot sit in the middle of the panel', async ({ page }) => {
  await page.locator(GEAR).click()
  await expect(page.locator(PANEL)).toBeVisible()

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const room = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="settings-privacy"]')!.parentElement!
      const boxes = [...row.children].map((node) => node.getBoundingClientRect())
      const left = Math.min(...boxes.map((b) => b.left))
      const right = Math.max(...boxes.map((b) => b.right))
      const outer = row.getBoundingClientRect()
      return { before: left - outer.left, after: outer.right - right }
    })

    expect(room.before).toBeGreaterThan(1)
    expect(Math.abs(room.before - room.after)).toBeLessThan(2)
  }
})
