import { test, expect, devices } from '@playwright/test'

/**
 * The carousel, driven by a real finger.
 *
 * Chromium only, and with touch on: these are touch pointer events sent through the
 * browser's own input pipeline, not events dispatched into the page, because the thing
 * being tested is a gesture and a dispatched event is only the shape of one. What this
 * cannot answer is how it feels on WebKitGTK and on a phone; that is the lab APK's job.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const BAR = '[data-testid="year-progress-bar"]'
const MONTH = '[data-testid="month-title-button"]'

/** A finger, moving across the calendar and letting go. */
async function drag(
  page: import('@playwright/test').Page,
  by: number,
  { steps = 12, lowDown = false }: { steps?: number; lowDown?: boolean } = {}
) {
  const card = page.locator('.lg\\:col-span-3').first()
  const box = await card.boundingBox()
  if (!box) throw new Error('the calendar is not on the page')

  // Near the bottom of the card when asked, which is where the grey used to be.
  const y = lowDown ? box.y + box.height - 60 : box.y + Math.min(120, box.height / 2)
  const from = by < 0 ? box.x + box.width - 24 : box.x + 24
  const client = await page.context().newCDPSession(page)

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from, y }],
  })
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from + (by * i) / steps, y }],
    })
    await page.waitForTimeout(16)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
}

test.beforeEach(async ({ page }) => {
  // Before any app code runs, so the store finds the data already there rather than
  // hydrating empty and overwriting it.
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
  await page.goto('/')
  await expect(page.locator(BAR)).toBeVisible()
})

test('dragging left brings Month, and the toggle follows', async ({ page }) => {
  const width = (await page.locator('.lg\\:col-span-3').first().boundingBox())!.width

  await drag(page, -width * 0.7)

  await expect(page.locator(MONTH)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

// Both views are on the page now, which is what makes the gesture possible: the one that
// is not in use is beside it, hidden and inert. So the question is never whether Month is
// in the document, it is whether anybody can see it.
test('letting go short of the threshold stays where it was', async ({ page }) => {
  const width = (await page.locator('.lg\\:col-span-3').first().boundingBox())!.width

  await drag(page, -width * 0.25)

  await expect(page.locator(BAR)).toBeVisible()
  await expect(page.locator(MONTH)).toBeHidden()
})

// Hidden from the eyes and from a screen reader both, which is a different claim.
test('the view nobody is looking at is out of reach', async ({ page }) => {
  const other = page.locator('[inert]')

  await expect(other).toHaveAttribute('aria-hidden', 'true')
  await expect(other.locator(MONTH)).toHaveCount(1)
})

// The other direction out of Year is a wall now. It used to go to Month as well, which
// made the two directions mean the same thing and left nothing meaning "back".
test('dragging right in Year goes nowhere', async ({ page }) => {
  const width = (await page.locator('.lg\\:col-span-3').first().boundingBox())!.width

  await drag(page, width * 0.7)

  await expect(page.locator(BAR)).toBeVisible()
})

// A year with no activities is a short view: the card used to end under its own text and
// leave grey below it, where the gesture did not live. The card fills the screen now, so
// there is nowhere on it that does nothing.
test('a drag low down on a short view still crosses', async ({ page }) => {
  // A second init script, not an evaluate: the one in beforeEach runs again on every
  // navigation, so anything written to localStorage after loading is overwritten by the
  // reload rather than kept. Init scripts run in order, so this one has the last word.
  await page.addInitScript(() => {
    const raw = localStorage.getItem('simple-calendar-storage')
    const saved = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    saved.state.activities = []
    saved.state.logs = []
    saved.state.yearMode = 'activity'
    localStorage.setItem('simple-calendar-storage', JSON.stringify(saved))
  })
  await page.reload()
  const card = page.locator('.lg\\:col-span-3').first()
  const box = (await card.boundingBox())!
  const screen = page.viewportSize()!

  // The card reaches the bottom of the screen, which is the fix itself.
  expect(box.y + box.height).toBeGreaterThan(screen.height - 40)

  await drag(page, -box.width * 0.7, { lowDown: true })

  await expect(page.locator(MONTH)).toBeVisible()
})

// The card filling the screen is a minimum, not a cage: a year with twelve months in it is
// taller than any phone, and the page still has to scroll.
test('a view taller than the screen still scrolls', async ({ page }) => {
  const canScroll = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 20
  )
  expect(canScroll).toBe(true)

  await page.mouse.wheel(0, 2000)
  await page.waitForTimeout(200)

  // All the way to the bottom rather than a number of pixels: how far there is to go
  // depends on how much taller the content is than the phone, and the claim is that the
  // page goes as far as it has.
  const { y, most } = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    most: Math.round(document.documentElement.scrollHeight - window.innerHeight),
  }))
  expect(y).toBeGreaterThan(0)
  expect(Math.abs(y - most)).toBeLessThan(4)
})

test('and from Month, dragging right brings Year back', async ({ page }) => {
  const width = (await page.locator('.lg\\:col-span-3').first().boundingBox())!.width
  await drag(page, -width * 0.7)
  await expect(page.locator(MONTH)).toBeVisible()

  await drag(page, width * 0.7)

  await expect(page.locator(BAR)).toBeVisible()
})
