import { test, expect, devices } from '@playwright/test'

/**
 * The Activities sheet on a phone, and the difference between touching it and dragging it.
 *
 * Henfry filmed six of these in four seconds: every press inside the sheet, the pencil
 * included, took the blur off the page behind and put it back on release. The sheet began
 * a drag on any touch at all, and the blur is cut while dragging with no transition.
 *
 * Measured here as the computed backdrop-filter before and after a press, because that is
 * the thing that flickered, and with the button's own effect checked in the same test so
 * that a sheet which stopped flickering by swallowing presses would not pass.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const SHEET = '[data-testid="bottom-sheet"]'
const BACKDROP = '[data-testid="bottom-sheet-backdrop"]'

const blurOf = (page: import('@playwright/test').Page) =>
  page.locator(BACKDROP).evaluate((el) => getComputedStyle(el).backdropFilter)

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
        },
        version: 0,
      })
    )
  })
  await page.goto('/')
  await page.getByTestId('fab-button').click()
  await expect(page.locator(SHEET)).toBeVisible()
  // Let it arrive: the blur is part of the opening, and measuring through that returns a
  // fraction of where it lands.
  await page.waitForTimeout(500)
})

test('a press inside the sheet leaves the page behind it alone', async ({ page }) => {
  const atRest = await blurOf(page)
  expect(atRest).not.toBe('none')

  const edit = page.getByTestId('activity-item').getByRole('button').first()
  const box = (await edit.boundingBox())!
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  })
  await page.waitForTimeout(80)

  // Still blurred, with a finger down on a button. This is the flicker.
  expect(await blurOf(page)).toBe(atRest)

  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(80)
  expect(await blurOf(page)).toBe(atRest)
})

test('and the press still does what it is for', async ({ page }) => {
  const edit = page.getByTestId('activity-item').getByRole('button').first()

  await edit.tap()

  // Whatever that button opens, something answered: a sheet that stopped flickering by
  // swallowing its presses would be worse than the flicker.
  await expect(page.getByTestId('activity-item').getByRole('button').first()).toBeVisible()
  expect(await blurOf(page)).not.toBe('none')
})

test('a finger dragged down takes the sheet with it', async ({ page }) => {
  const before = (await page.locator(SHEET).boundingBox())!
  const client = await page.context().newCDPSession(page)
  const x = before.x + before.width / 2
  const y = before.y + 20

  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (const step of [20, 60, 120]) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + step }],
    })
    await page.waitForTimeout(16)
  }

  // Polled rather than read once after a 16ms sleep. The three moves are three React
  // updates and the last one lands a frame or two after the call returns, so a single read
  // caught the sheet at the second position under load and failed by a pixel exactly.
  await expect
    .poll(async () => (await page.locator(SHEET).boundingBox())!.y, { timeout: 2000 })
    .toBeGreaterThan(before.y + 60)

  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
})

/**
 * Saying no to deleting an activity used to close the panel you said it in.
 *
 * Two separate faults, and both had to go. A drag began on a bare move, with `dragStartY`
 * still at zero, so the first pointer to cross the sheet measured five hundred and
 * thirty-one pixels of drag, past the distance that dismisses it; the sheet went the next
 * time anything was let go. And every focus trap listened for Escape on the document, so
 * one press reached the confirm and the sheet at once, while Android's back button has
 * kept a stack since the day it was written.
 *
 * Measured rather than reasoned about, and the first reasoning was wrong twice: it was not
 * the portal's press, and it was not only Escape.
 */
const CONFIRM = '[data-testid="delete-activity-confirm"]'
const sheetTop = (page: import('@playwright/test').Page) =>
  page.evaluate(
    (selector) => Math.round(document.querySelector(selector)!.getBoundingClientRect().top),
    SHEET
  )

async function askToDelete(page: import('@playwright/test').Page) {
  const row = page.getByTestId('bottom-sheet').getByTestId('activity-item')
  await expect(row).toHaveCount(1)
  await row.getByRole('button').last().click()
  await expect(page.locator(CONFIRM)).toBeVisible()
}

test('saying no leaves the sheet open and where it was', async ({ page }) => {
  const before = await sheetTop(page)
  await askToDelete(page)

  // It does not move while the question is up either: the stray drag pushed it down.
  expect(await sheetTop(page)).toBe(before)

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator(CONFIRM)).toBeHidden()

  await expect(page.locator(SHEET)).toBeVisible()
  expect(await sheetTop(page)).toBe(before)
  await expect(page.getByTestId('bottom-sheet').getByTestId('activity-item')).toHaveCount(1)
})

test('Escape takes away the question and nothing behind it', async ({ page }) => {
  const before = await sheetTop(page)
  await askToDelete(page)

  await page.keyboard.press('Escape')
  await expect(page.locator(CONFIRM)).toBeHidden()

  await expect(page.locator(SHEET)).toBeVisible()
  expect(await sheetTop(page)).toBe(before)

  // And a second Escape, with nothing in front of it any more, does close the sheet.
  await page.keyboard.press('Escape')
  await expect(page.locator(SHEET)).toBeHidden()
})

test('saying yes still deletes, and still leaves the sheet', async ({ page }) => {
  await askToDelete(page)

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator(CONFIRM)).toBeHidden()

  await expect(page.locator(SHEET)).toBeVisible()
  await expect(page.getByTestId('bottom-sheet').getByTestId('activity-item')).toHaveCount(0)
})

/**
 * With five or more activities the Activities sheet is taller than a phone, and it would
 * not move under a finger: upwards nothing happened, downwards it closed. With eight there
 * was no way to reach the last one or any of the statistics. The whole sheet was
 * `touch-action: none`, put there so the drag that closes it would not fight the scroll,
 * and it switched the scroll off with it.
 *
 * Measured with a finger, not with `scrollTo`: setting `scrollTop` from a script works on a
 * sheet no finger can move, which is exactly the sheet this was. The day sheet is the
 * control, the same gesture on a sheet that has always scrolled, so a gesture that moves
 * nothing anywhere cannot pass for a sheet that is stuck.
 */
test.describe('a sheet longer than the phone', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  const NAMES = [
    'Read 20 minutes',
    'Walk',
    'Meditate',
    'Drink water',
    'Study English',
    'No sugar',
    'Sleep before 11',
    'Stretch',
    'Guitar',
    'Journal',
    'Vitamins',
    'Call home',
  ]

  /** Replaces the one activity the hook above seeds, and loads the page again. */
  async function seed(page: import('@playwright/test').Page, count: number, view: string) {
    await page.addInitScript(
      ([names, currentView]) => {
        localStorage.setItem(
          'simple-calendar-storage',
          JSON.stringify({
            state: {
              activities: (names as string[]).map((name, i) => ({
                id: `a${i}`,
                name,
                color: '#10B981',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              })),
              logs: [],
              selectedYear: 2026,
              selectedMonth: 1,
              selectedDate: null,
              currentView,
            },
            version: 0,
          })
        )
      },
      [NAMES.slice(0, count), view] as const
    )
    await page.goto('/')
  }

  /** A finger put down, moved in twelve steps a frame apart, and lifted. */
  async function swipe(page: import('@playwright/test').Page, x: number, from: number, to: number) {
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: from }],
    })
    for (let i = 1; i <= 12; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: from + ((to - from) * i) / 12 }],
      })
      await page.waitForTimeout(16)
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  const scrollTopOf = (page: import('@playwright/test').Page, selector: string) =>
    page.locator(selector).evaluate((el) => el.scrollTop)

  async function openWithEight(page: import('@playwright/test').Page) {
    await seed(page, 8, 'year')
    await page.getByTestId('fab-button').click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.waitForTimeout(500)
    await page.locator(SHEET).getByTestId('show-more-button').tap()
    await expect(page.locator(SHEET).getByTestId('activity-item')).toHaveCount(8)
  }

  const lastActivityInView = (page: import('@playwright/test').Page) =>
    page
      .locator(SHEET)
      .getByTestId('activity-item')
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)

  test('a finger moves the Activities sheet up to the last activity', async ({ page }) => {
    await openWithEight(page)
    expect(await scrollTopOf(page, SHEET)).toBe(0)
    // The thing a person cannot do today, and the reason for the test.
    expect(await lastActivityInView(page)).toBe(false)

    await swipe(page, 180, 650, 380)

    await expect.poll(() => scrollTopOf(page, SHEET), { timeout: 2000 }).toBeGreaterThan(0)
    await expect.poll(() => lastActivityInView(page), { timeout: 2000 }).toBe(true)
    await expect(page.locator(SHEET)).toBeVisible()
  })

  // A fault in this same sheet once showed only on the second gesture, so this is two of
  // them back to back: up, let go, and straight away down again. Down on the content has
  // to bring the list back rather than take the sheet away.
  test('a second swipe straight after the first scrolls back instead of closing', async ({
    page,
  }) => {
    await openWithEight(page)
    const top = await sheetTop(page)

    await swipe(page, 180, 650, 380)
    await expect.poll(() => scrollTopOf(page, SHEET), { timeout: 2000 }).toBeGreaterThan(100)
    const afterFirst = await scrollTopOf(page, SHEET)

    await swipe(page, 180, 400, 600)
    await page.waitForTimeout(500)

    expect(await scrollTopOf(page, SHEET)).toBeLessThan(afterFirst)
    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)
  })

  test('the control: the same finger moves the day sheet', async ({ page }) => {
    await seed(page, 12, 'month')
    await page.locator('button[aria-label$="activities completed"]').first().click()
    const daySheet = '[data-testid="quicklog-modal"]'
    await expect(page.locator(daySheet)).toBeVisible()
    await page.waitForTimeout(500)
    expect(await scrollTopOf(page, daySheet)).toBe(0)

    await swipe(page, 180, 650, 380)

    await expect.poll(() => scrollTopOf(page, daySheet), { timeout: 2000 }).toBeGreaterThan(0)
  })

  test('pulling the handle down still closes it', async ({ page }) => {
    await openWithEight(page)
    const top = await sheetTop(page)

    await swipe(page, 180, top + 14, top + 400)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  test('and a tap above it still closes it', async ({ page }) => {
    await openWithEight(page)

    await page.touchscreen.tap(180, 60)

    await expect(page.locator(SHEET)).toBeHidden()
  })
})
