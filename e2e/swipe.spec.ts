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
  {
    steps = 12,
    lowDown = false,
    settleFor = 400,
  }: { steps?: number; lowDown?: boolean; settleFor?: number } = {}
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
  await page.waitForTimeout(settleFor)
}

/**
 * A finger you hold on to, for the tests that have to look at the screen mid-gesture.
 *
 * `drag` above starts and finishes in one call and then waits for the rail to come to
 * rest, which is the right shape for asking what a gesture decided and the wrong one for
 * asking what the screen looks like while a second gesture is under way.
 */
async function finger(page: import('@playwright/test').Page) {
  const card = page.locator('.lg\\:col-span-3').first()
  const box = await card.boundingBox()
  if (!box) throw new Error('the calendar is not on the page')
  const client = await page.context().newCDPSession(page)
  const y = box.y + Math.min(120, box.height / 2)

  return {
    width: box.width,
    async down(x: number) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + x, y }],
      })
    },
    async to(x: number) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: box.x + x, y }],
      })
      await page.waitForTimeout(16)
    },
    async up() {
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    },
  }
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
    saved.state.yearMode = 'byActivity'
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

/**
 * The one Henfry found in fourteen seconds with a phone in his hand and no test had.
 *
 * Slowly it was right; quickly the toggle said Month with Year still on the screen for
 * about a third of a second, and there was white where the other view should have been.
 * Both were the first landing arriving in the middle of the second gesture. Nothing here
 * waits for the rail to come to rest before the second finger goes down, which is the
 * whole point: the assertions are made while the second drag is still under way.
 */
test('a second drag before the first has landed finds everything where it should be', async ({
  page,
}) => {
  const hand = await finger(page)

  await drag(page, -hand.width * 0.7, { settleFor: 0 })

  // Straight back the other way, without waiting. The landing of the first is still in
  // flight at this point: it takes 320 to 450 ms and nothing has waited for it.
  await hand.down(24)
  await hand.to(24 + hand.width * 0.2)
  await hand.to(24 + hand.width * 0.4)

  // The toggle has to say what the first gesture did, not what it was before it.
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  // And the view the finger is pulling in has to be there to be pulled. This is the white
  // gap: Year was hidden under a finger that was already dragging it into place.
  await expect(page.locator(BAR)).toBeVisible()

  await hand.to(24 + hand.width * 0.7)
  await hand.up()
  await page.waitForTimeout(600)

  await expect(page.locator(BAR)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Year', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

/**
 * How the landing starts, measured in the browser the way growth measured it off a video.
 *
 * The 1.4.7 lab build was filmed at 60 fps and read frame by frame: the finger crossed at
 * 34 to 80 video pixels a frame, and the first frame after letting go moved 4. Then 16, 34,
 * 56, 84. The view stopped dead for a frame and set off again, which is what "al soltar
 * rápido se nota que de inmediato se pone más lento" is.
 *
 * Nothing in jsdom can see that: the curve is a string there. So this records the rail's
 * own transform on every frame, from inside the page, and asks what the first 64 ms of the
 * landing covered. The two drags are the same distance and the same duration, and differ
 * only in whether the hand was still moving when it let go, so the comparison between them
 * needs no absolute number and does not care how fast the machine is.
 */
async function landingProfile(page: import('@playwright/test').Page, hold: number) {
  const hand = await finger(page)
  const span = hand.width * 0.45

  await page.evaluate(() => {
    const card = document.querySelector('.lg\\:col-span-3')
    const rail = card?.firstElementChild as HTMLElement
    const w = window as unknown as { __frames: number[][]; __began: number | null }
    w.__frames = []
    w.__began = null
    rail.addEventListener('transitionstart', () => {
      if (w.__began === null) w.__began = performance.now()
    })
    const tick = (t: number) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(rail).transform)
      w.__frames.push([t, m.m41])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await hand.down(hand.width - 24)
  for (let i = 1; i <= 6; i++) await hand.to(hand.width - 24 - (span * i) / 6)
  if (hold > 0) await page.waitForTimeout(hold)
  await hand.up()
  await page.waitForTimeout(500)

  // Where the rail is going: one screen to the left, which is Month arriving from the right.
  return page.evaluate((destination) => {
    const w = window as unknown as { __frames: number[][]; __began: number | null }
    const began = w.__began
    if (began === null) throw new Error('the landing never started')
    const after = w.__frames.filter(([t]) => t >= began)
    const from = after[0]
    const to = after.find(([t]) => t >= began + 64)
    if (!from || !to) throw new Error('the landing was over before it could be read')
    // How much of what was left it covered in the first 64 ms, which is four frames.
    return (to[1] - from[1]) / (destination - from[1])
  }, -hand.width)
}

test('the landing leaves at the speed the finger let go at', async ({ page }) => {
  // Released in motion, and released after the hand had come to a stop. Same distance, so
  // the same journey is left and the same time to do it in.
  const moving = await landingProfile(page, 0)
  await page.reload()
  await expect(page.locator(BAR)).toBeVisible()
  const still = await landingProfile(page, 300)

  // Both are going somewhere: this is about how they start, not whether they work.
  expect(moving).toBeGreaterThan(0)
  expect(still).toBeGreaterThan(0)
  // The one let go in motion has to be clearly ahead in the first four frames. Before the
  // curve was drawn for the gesture these two were the **same number**, 0.2407 both, which
  // is the whole complaint: letting go fast and letting go still began identically.
  //
  // Measured here at 0.40 against 0.24, a ratio of 1.66, and it barely moves between runs
  // because a CSS transition is the compositor's work and not the clock's. A third is
  // asked for, which is well clear of the 1.0 the old curve gave and leaves room for a
  // slower machine.
  expect(moving).toBeGreaterThan(still * 1.3)
})
