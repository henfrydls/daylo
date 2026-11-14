import { test, expect, devices, type Page } from '@playwright/test'

test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const SHEET = '[data-testid="bottom-sheet"]'
const LIST = '[data-testid="bottom-sheet-list"]'
const HANDLE = '[data-testid="bottom-sheet-handle"]'
const BACKDROP = '[data-testid="bottom-sheet-backdrop"]'

/** Activities saved before the page loads, one per name. */
async function seed(page: Page, names: string[]) {
  await page.addInitScript((list) => {
    localStorage.setItem(
      'simple-calendar-storage',
      JSON.stringify({
        state: {
          activities: list.map((name, i) => ({
            id: `a${i + 1}`,
            name,
            color: '#10B981',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          })),
          logs: [],
        },
        version: 0,
      })
    )
  }, names)
}

const blurOf = (page: Page) =>
  page.locator(BACKDROP).evaluate((el) => getComputedStyle(el).backdropFilter)

const sheetTop = (page: Page) =>
  page.evaluate(
    (selector) => Math.round(document.querySelector(selector)!.getBoundingClientRect().top),
    SHEET
  )

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
test.describe('one activity', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, ['Read'])
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
    await client.detach()
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
    await client.detach()
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

  async function askToDelete(page: Page) {
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
})

/**
 * A sheet longer than the phone, and one shorter than it, under a finger.
 *
 * With five or more activities the Activities sheet is taller than a phone, and it would
 * not move under a finger: upwards nothing happened, downwards it closed. With eight there
 * was no way to reach the last one or any of the statistics. The whole sheet was
 * `touch-action: none`, put there so the drag that closes it would not fight the scroll,
 * and it switched the scroll off with it. Then, with the list scrolling, a pull down on a
 * short list did nothing at all, so the list now hands that one gesture to the sheet: at
 * the top, and going down.
 *
 * Measured with a finger, not with `scrollTo`: setting `scrollTop` from a script works on a
 * sheet no finger can move, which is exactly the sheet this was. The day sheet is the
 * control, the same gesture on a sheet that has always scrolled, so a gesture that moves
 * nothing anywhere cannot pass for a sheet that is stuck.
 */
test.describe('scrolling and closing at phone size', () => {
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

  /** A finger put down, moved in twelve steps a frame apart, and lifted. */
  async function swipe(page: Page, x: number, from: number, to: number) {
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
    await client.detach()
  }

  const scrollTopOf = (page: Page, selector: string) =>
    page.locator(selector).evaluate((el) => el.scrollTop)

  /**
   * Where the list ends up once a fling has run out: two readings in a row the same.
   *
   * A swipe lets go with speed, and the list keeps going for a while after the finger is
   * off. Read during that, a number is wherever it happened to be on its way.
   */
  async function settledScrollTop(page: Page) {
    let last = -1
    await expect
      .poll(
        async () => {
          const now = await scrollTopOf(page, LIST)
          const same = now === last
          last = now
          return same
        },
        { timeout: 4000, intervals: [100] }
      )
      .toBe(true)
    return last
  }

  async function open(page: Page, count: number) {
    await seed(page, NAMES.slice(0, count))
    await page.goto('/')
    await page.getByTestId('fab-button').click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.waitForTimeout(500)
    if (count > 5) {
      await page.locator(SHEET).getByTestId('show-more-button').tap()
      await expect(page.locator(SHEET).getByTestId('activity-item')).toHaveCount(count)
    }
  }

  const lastActivityInView = (page: Page) =>
    page
      .locator(SHEET)
      .getByTestId('activity-item')
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)

  test('a finger moves the Activities sheet up to the last activity', async ({ page }) => {
    await open(page, 8)
    expect(await scrollTopOf(page, LIST)).toBe(0)
    // The thing a person could not do, and the reason for the test.
    expect(await lastActivityInView(page)).toBe(false)

    await swipe(page, 180, 650, 380)

    await expect.poll(() => scrollTopOf(page, LIST), { timeout: 2000 }).toBeGreaterThan(0)
    await expect.poll(() => lastActivityInView(page), { timeout: 2000 }).toBe(true)
    await expect(page.locator(SHEET)).toBeVisible()
  })

  // A fault in this same sheet once showed only on the second gesture, so this is two of
  // them back to back: up, let go, and down again. With the list scrolled, down on it
  // brings the list back rather than taking the sheet away.
  test('a second swipe after the first scrolls back instead of closing', async ({ page }) => {
    await open(page, 8)
    const top = await sheetTop(page)

    await swipe(page, 180, 650, 380)
    const afterFirst = await settledScrollTop(page)
    expect(afterFirst).toBeGreaterThan(100)

    await swipe(page, 180, 400, 500)

    expect(await settledScrollTop(page)).toBeLessThan(afterFirst)
    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)
  })

  test('the control: the same finger moves the day sheet', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-13T12:00:00'))
    await seed(page, NAMES)
    await page.goto('/')
    await page.locator('button[aria-label$="activities completed"]').first().click()
    const daySheet = '[data-testid="quicklog-modal"]'
    await expect(page.locator(daySheet)).toBeVisible()
    await page.waitForTimeout(500)
    expect(await scrollTopOf(page, daySheet)).toBe(0)

    await swipe(page, 180, 650, 380)

    await expect.poll(() => scrollTopOf(page, daySheet), { timeout: 2000 }).toBeGreaterThan(0)
  })

  test('with two activities, pulling the list down closes the sheet', async ({ page }) => {
    await open(page, 2)
    const top = await sheetTop(page)

    await swipe(page, 180, top + 120, top + 520)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  test('with eight and the list at the top, pulling it down closes the sheet', async ({ page }) => {
    await open(page, 8)
    expect(await scrollTopOf(page, LIST)).toBe(0)

    await swipe(page, 180, 300, 700)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  // Scrolling back up and reaching the top under the finger is still that scroll; the
  // sheet setting off down the screen in the middle of it would be a surprise. The next
  // pull, from the top, is the one that closes.
  test('a scroll that reaches the top stays a scroll, and the next pull closes', async ({
    page,
  }) => {
    await open(page, 8)
    const top = await sheetTop(page)
    await swipe(page, 180, 650, 380)
    expect(await settledScrollTop(page)).toBeGreaterThan(100)

    await swipe(page, 180, top + 50, 790)

    expect(await settledScrollTop(page)).toBe(0)
    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)

    await swipe(page, 180, top + 100, top + 500)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  // A thumb on the handle and a finger on the list both used to drag the one sheet. When
  // the thumb let go, the finger went on moving it with nothing left to release it, and
  // the sheet hung half way down. Whoever begins the drag has it; the other waits.
  test('a thumb on the handle and a finger on the list leave nothing hanging', async ({ page }) => {
    await open(page, 2)
    const top = await sheetTop(page)
    const client = await page.context().newCDPSession(page)
    const send = (type: string, points: { x: number; y: number; id: number }[]) =>
      client.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    const thumb = (y: number) => ({ x: 180, y, id: 1 })
    const other = (y: number) => ({ x: 120, y, id: 2 })

    await send('touchStart', [thumb(top + 14)])
    for (const y of [top + 34, top + 54, top + 74]) {
      await send('touchMove', [thumb(y)])
      await page.waitForTimeout(16)
    }
    await send('touchStart', [thumb(top + 74), other(top + 200)])
    for (const y of [top + 260, top + 330, top + 400]) {
      await send('touchMove', [thumb(top + 74), other(y)])
      await page.waitForTimeout(16)
    }
    // Followed by the thumb alone: forty pixels from where its drag began.
    await expect.poll(() => sheetTop(page), { timeout: 2000 }).toBe(top + 40)

    // The thumb lets go; the finger on the list goes on moving. A touchEnd lifts only the
    // points it names, so this is one finger up and the other still down.
    await send('touchEnd', [thumb(top + 74)])
    for (const y of [top + 420, top + 460, top + 500]) {
      await send('touchMove', [other(y)])
      await page.waitForTimeout(16)
    }
    await expect.poll(() => sheetTop(page), { timeout: 2000 }).toBe(top)

    await send('touchEnd', [other(top + 500)])
    await client.detach()
    await page.waitForTimeout(400)
    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)
  })

  test('pulling the handle down still closes it', async ({ page }) => {
    await open(page, 8)
    const top = await sheetTop(page)

    await swipe(page, 180, top + 14, top + 400)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  test('and a tap above it still closes it', async ({ page }) => {
    await open(page, 8)

    await page.touchscreen.tap(180, 60)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  // The strip that makes the handle 44 pixels tall sits above the sheet's edge, where the
  // eye sees the page behind. A tap there closes the sheet as a tap anywhere else above it
  // does; it was the one place above the sheet where a tap did nothing.
  test('a tap in the strip just above the edge closes it too', async ({ page }) => {
    await open(page, 8)
    const top = await sheetTop(page)

    await page.touchscreen.tap(180, top - 8)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  test('and a pull that starts in that strip closes it', async ({ page }) => {
    await open(page, 8)
    const top = await sheetTop(page)

    await swipe(page, 180, top - 8, top + 400)

    await expect(page.locator(SHEET)).toBeHidden()
  })

  // The grey bar and the gap under it are 28 pixels, short of the 44 a thumb needs. The
  // rest is an invisible strip above the sheet's edge, so the list has not moved and none
  // of it is under the handle.
  test('the handle is 44 pixels to a finger, and the list starts where it did', async ({
    page,
  }) => {
    await open(page, 2)
    const top = await sheetTop(page)

    const owner = (y: number) =>
      page.evaluate(
        ([handle, y]) =>
          document
            .querySelector(handle as string)!
            .contains(document.elementFromPoint(180, y as number)),
        [HANDLE, y] as const
      )
    expect(await owner(top - 15)).toBe(true)
    expect(await owner(top + 27)).toBe(true)
    // Either side of the forty-four: the page behind above it, the list below it.
    expect(await owner(top - 18)).toBe(false)
    expect(await owner(top + 30)).toBe(false)

    const listTop = await page
      .locator(LIST)
      .evaluate((el) => Math.round(el.getBoundingClientRect().top))
    expect(listTop - top).toBe(28)
    const bar = (await page.locator(HANDLE).locator('div').boundingBox())!
    expect([bar.width, bar.height]).toEqual([40, 4])
  })

  // "Show all" makes the sheet taller. Measured only when it opened, the 30% that closes it
  // was 30% of the shorter sheet: a small pull closed it, and on the way out it slid by the
  // old height and vanished the rest of the way.
  test('after Show all, a pull short of 30% of the new height leaves it open', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1600 })
    await seed(page, NAMES)
    await page.goto('/')
    await page.getByTestId('fab-button').click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.waitForTimeout(500)
    const heightOf = async () => (await page.locator(SHEET).boundingBox())!.height
    const before = await heightOf()

    await page.locator(SHEET).getByTestId('show-more-button').tap()
    await expect(page.locator(SHEET).getByTestId('activity-item')).toHaveCount(12)
    await page.waitForTimeout(500)
    const after = await heightOf()
    expect(after - before).toBeGreaterThan(100)

    const top = await sheetTop(page)
    const pull = Math.round(0.3 * ((before + after) / 2))
    await swipe(page, 180, top + 14, top + 14 + pull)
    await page.waitForTimeout(500)

    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)
  })

  // With a mouse there is no capture unless the sheet asks for one. Let go above the sheet
  // and the release went to the page behind, leaving the sheet mid-drag: it then followed
  // the pointer with no button down.
  test('a mouse let go above the sheet ends the drag', async ({ page }) => {
    await open(page, 2)
    const top = await sheetTop(page)

    await page.mouse.move(180, top + 14)
    await page.mouse.down()
    await page.mouse.move(180, top + 80, { steps: 5 })
    await page.mouse.move(180, 100, { steps: 5 })
    await page.mouse.up()
    await page.mouse.move(180, top + 300, { steps: 5 })
    await page.waitForTimeout(400)

    await expect(page.locator(SHEET)).toBeVisible()
    expect(await sheetTop(page)).toBe(top)
  })
})
