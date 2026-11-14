import { test, expect, devices, type Page } from '@playwright/test'

/**
 * A new day with Daylo left open, in a real browser and without reloading.
 *
 * Somebody ticks their habit in the evening and leaves the app open. The next morning,
 * before this, yesterday was still drawn as today and the bar said "1/1". Three ways the
 * morning reaches the app, one test each: the window coming back from the background, the
 * window taking the focus, and midnight passing with the app in front of somebody.
 *
 * A phone, because that is where the "Today" bar and the swipe between views live, and
 * the swipe is the one thing the new day could break by building the views again.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const BAR = '[data-testid="log-today-bar"]'
const SHEET = '[data-testid="quicklog-modal"]'
const YEAR = '[data-testid="year-progress-bar"]'

const cell = (page: Page, date: string) => page.locator(`button[aria-label^="${date},"]`)

/** The filled circle on the number, which is how a cell says it is today. */
const circle = (page: Page, date: string) => cell(page, date).locator('span').first()
/**
 * The mark that says "this is today" since 1.6: filled once something is logged, a dashed
 * ring while the day is empty. A ringed yesterday is dashed too, but only after a run of
 * three, which nothing here builds.
 */
const TODAY = /bg-emerald-700|border-dashed/

async function seed(page: Page) {
  // Before any app code runs, so the store finds the data already there.
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
              createdAt: '2026-11-01T00:00:00.000Z',
              updatedAt: '2026-11-01T00:00:00.000Z',
            },
          ],
          logs: [
            {
              id: 'l13',
              activityId: 'a1',
              date: '2026-11-13',
              completed: true,
              createdAt: '2026-11-13T20:00:00.000Z',
            },
          ],
          selectedYear: 2026,
          selectedMonth: 10,
          selectedDate: null,
          currentView: 'month',
        },
        version: 0,
      })
    )
  })
}

/** The evening before: the habit ticked, and yesterday's sheet left open. */
async function theEveningBefore(page: Page) {
  await page.goto('/')
  await expect(page.locator(BAR)).toHaveAttribute(
    'aria-label',
    'Log today: 1 of 1 activity completed'
  )
  await expect(circle(page, '2026-11-13')).toHaveClass(TODAY)
  await page.locator(BAR).click()
  await expect(page.locator(SHEET)).toBeVisible()
}

/** A finger across the calendar, the way swipe.spec.ts does it. */
async function drag(page: Page, by: number) {
  const card = page.locator('.lg\\:col-span-3').first()
  const box = await card.boundingBox()
  if (!box) throw new Error('the calendar is not on the page')
  const y = box.y + Math.min(120, box.height / 2)
  const from = by < 0 ? box.x + box.width - 24 : box.x + 24
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from, y }],
  })
  for (let i = 1; i <= 12; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from + (by * i) / 12, y }],
    })
    await page.waitForTimeout(16)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
}

/**
 * Everything that must be true the morning after: today is the 14th, the bar starts from
 * nothing, yesterday's sheet is gone, and the day can be ticked and the views swiped. The
 * last two are there because the views were built again, and a view built again under a
 * gesture that kept hold of the old one would look right and not move.
 */
async function itIsTheNextDay(page: Page) {
  await expect(circle(page, '2026-11-14')).toHaveClass(TODAY)
  await expect(circle(page, '2026-11-13')).not.toHaveClass(TODAY)
  await expect(page.locator(BAR)).toHaveAttribute(
    'aria-label',
    'Log today: 0 of 1 activity completed'
  )
  await expect(page.locator(SHEET)).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('the-next-day.png') })

  await page.locator(BAR).click()
  await expect(page.locator(SHEET)).toBeVisible()
  await page.getByTestId('quicklog-activity-checkbox').check()
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.locator(SHEET)).toHaveCount(0)
  await expect(page.locator(BAR)).toHaveAttribute(
    'aria-label',
    'Log today: 1 of 1 activity completed'
  )

  const width = (await page.locator('.lg\\:col-span-3').first().boundingBox())!.width
  await drag(page, width * 0.7)
  await expect(page.locator(YEAR)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Year', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
}

test.beforeEach(async ({ page }) => {
  await seed(page)
})

// (a) and (b) dispatch the event themselves because Playwright cannot minimise a window or
// put another one in front of it. The clock is moved without firing any timer, so the
// midnight timer cannot be what brings the day: only the event can.
test('the window coming back from the background brings the new day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T21:00:00') })
  await theEveningBefore(page)

  await page.clock.setFixedTime(new Date('2026-11-14T08:30:00'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await itIsTheNextDay(page)
})

test('the window taking the focus brings the new day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T21:00:00') })
  await theEveningBefore(page)

  await page.clock.setFixedTime(new Date('2026-11-14T08:30:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await itIsTheNextDay(page)
})

// (c) No event at all: the app's own timer goes off at midnight. Yesterday's sheet was
// tapped open a few seconds before, so at midnight somebody is in the middle of something
// and the day waits. A minute later nobody has touched anything, and it comes in.
test('midnight in front of somebody brings the new day, once they stop', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T23:59:45') })
  await theEveningBefore(page)

  await page.clock.fastForward('00:20')
  await expect(page.locator(SHEET)).toBeVisible()
  await expect(circle(page, '2026-11-13')).toHaveClass(TODAY)

  await page.clock.fastForward('01:05')

  await itIsTheNextDay(page)
})

test('midnight does not take away a habit being written', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T23:59:40') })
  await page.goto('/')
  await expect(page.locator(BAR)).toBeVisible()

  await page.getByTestId('fab-button').click()
  await page.getByTestId('add-activity-button').locator('visible=true').click()
  const name = page.getByTestId('activity-name-input')
  await name.pressSequentially('Walk')

  await page.clock.fastForward('00:25')

  // Still there, still being written, still holding what was typed.
  await expect(name).toHaveValue('Walk')
  await name.pressSequentially(' the dog')
  await expect(name).toHaveValue('Walk the dog')
})

// Words written and not saved hold the new day for as long as they are there: not a
// minute, and not until the window comes back. Coming back from another window, or from
// the system's colour picker, gives the form its focus back and must not take the words.
// Saving is what lets the day in, and what was saved lands on the day the form showed.
test('words left in a form keep the old day until they are saved', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T23:59:40') })
  await page.goto('/')
  await expect(page.locator(BAR)).toBeVisible()

  await page.getByTestId('fab-button').click()
  await page.getByTestId('add-activity-button').locator('visible=true').click()
  const name = page.getByTestId('activity-name-input')
  await name.pressSequentially('Walk')
  await page.getByTestId('log-for-date-checkbox').check()
  await expect(page.getByTestId('selected-date-input')).toHaveValue('2026-11-13')

  // Past midnight, two minutes without a key, and then the window comes back.
  await page.clock.fastForward('02:00')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.clock.fastForward('00:10')

  await expect(name).toHaveValue('Walk')
  await expect(page.getByTestId('selected-date-input')).toHaveValue('2026-11-13')
  await expect(circle(page, '2026-11-13')).toHaveClass(TODAY)

  await page.getByTestId('activity-form-submit').click()
  await expect(page.getByTestId('activity-form-modal')).toHaveCount(0)
  // The sheet of activities is still open behind it, and was just used: the day waits
  // its minute for that, and then comes in.
  await page.clock.fastForward('01:05')

  await expect(circle(page, '2026-11-14')).toHaveClass(TODAY)
  await expect(cell(page, '2026-11-13')).toHaveAttribute(
    'aria-label',
    '2026-11-13, 2 activities completed'
  )
  await expect(page.locator(BAR)).toHaveAttribute(
    'aria-label',
    'Log today: 0 of 2 activities completed'
  )
})

// "Edit activity" opens with the name already in it. A form left open like that overnight
// holds nothing anybody wrote, and the morning must come in past it.
test('an Edit form left open with nothing changed does not keep yesterday', async ({ page }) => {
  await seed(page)
  await page.clock.install({ time: new Date('2026-11-13T23:59:40') })
  await page.goto('/')
  await expect(page.locator(BAR)).toBeVisible()

  await page.getByTestId('fab-button').click()
  await page.getByRole('button', { name: 'Edit Read' }).locator('visible=true').click()
  await expect(page.getByTestId('activity-name-input')).toHaveValue('Read')

  await page.clock.fastForward('01:00:00')

  await expect(circle(page, '2026-11-14')).toHaveClass(TODAY)
})
