import { test, expect, type Page } from '@playwright/test'

/**
 * The header holds still: the same height with a run and without one, and the controls on
 * its right in the same place in Month and in Year.
 *
 * Found in 1.6 on Windows at 1280x800. The streak button was 48px tall in a 44px row, so
 * the header grew 4px the moment a run began. And Month is a few pixels taller than the
 * window while Year is not, so the scrollbar came and went with the view, and with it 15px
 * of width: the toggle and the gear jumped sideways on every switch. The cure for that
 * (index.css keeps the scrollbar's room) leaves an empty strip where nothing scrolls, and
 * that strip has to look like the page, and be dimmed with it.
 *
 * What headless Chromium can and cannot show. Its scrollbars take no room, so the jump
 * itself never happens here and a test that only compared positions would pass with the
 * fix taken out. It does keep the room `scrollbar-gutter: stable` asks for (15px), so what
 * is measured is that room: kept in both views, painted the page's grey, and dimmed with
 * a dialog. The jump itself was measured, and is guarded, by screenshots with real
 * scrollbars: Chromium headed and WebKitGTK with overlay scrolling off (PR #283).
 */
test.use({ viewport: { width: 1280, height: 800 } })

const RUN = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']

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

/**
 * Until whatever is moving has arrived. Only animations with an end: a spinner or a pulse
 * runs for ever, and waiting for it would wait out the test.
 */
const settle = (page: Page) =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
      .every((animation) => animation.playState !== 'running')
  )

async function show(page: Page, view: 'Year' | 'Month') {
  const button = page.getByRole('button', { name: view, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await settle(page)
}

/**
 * Where the toggle and the corner control start, from the visible copy of each. The corner
 * is the gear, or the menu's three dots where there is a reminder to offer.
 */
async function rightSide(page: Page) {
  const side = await page.evaluate(() => {
    const x = (selector: string) =>
      [...document.querySelectorAll(selector)]
        .map((node) => node.getBoundingClientRect())
        .find((box) => box.width > 0)?.x ?? null
    return {
      toggle: x('[aria-label="Calendar view toggle"]'),
      corner: x('[data-testid="settings-button"], [aria-label^="More options"]'),
      // What the page is given to lay itself out in: the window less the scrollbar's room.
      body: document.body.getBoundingClientRect().width,
    }
  })
  expect(side.toggle, 'the view toggle is on screen').not.toBeNull()
  expect(side.corner, 'the gear or the menu is on screen').not.toBeNull()
  return side
}

/**
 * The colour on screen at a point, from a real screenshot: the strip kept for the scrollbar
 * is outside the page, so nothing in the DOM can say what is painted there.
 */
async function pixel(page: Page, x: number, y: number) {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64')
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, png)
}

const near = (a: number[], b: number[]) => a.every((value, i) => Math.abs(value - b[i]) <= 2)

test('the header is as tall with a run as without one', async ({ page }) => {
  await open(page, ['2026-10-01'])
  await expect(page.getByTestId('streak-chip')).toHaveCount(0)
  const without = await page.locator('header').evaluate((node) => node.offsetHeight)

  await page.goto('about:blank')
  await open(page, RUN)
  const chip = page.getByTestId('streak-chip').filter({ visible: true })
  await expect(chip).toBeVisible()
  const withRun = await page.locator('header').evaluate((node) => node.offsetHeight)

  expect(withRun).toBe(without)

  // And a finger still has 48px to land on: the button is 44, and a press 1.5px outside
  // it, above or below, still reaches it.
  const reach = await chip.evaluate((button) => {
    const box = button.getBoundingClientRect()
    const x = box.left + box.width / 2
    const hit = (y: number) => {
      const node = document.elementFromPoint(x, y)
      return node !== null && button.contains(node)
    }
    return {
      height: box.height,
      above: hit(box.top - 1.5),
      below: hit(box.bottom + 1.5),
      beyond: hit(box.top - 3),
    }
  })
  expect(reach).toEqual({ height: 44, above: true, below: true, beyond: false })
})

test('the toggle and the gear stay put between Month and Year', async ({ page }) => {
  await open(page, RUN)

  await show(page, 'Month')
  const month = await rightSide(page)
  await show(page, 'Year')
  const year = await rightSide(page)

  expect(year).toEqual(month)
  // The room is kept in Year too, where there is nothing to scroll. With it gone this is
  // the whole window's 1280.
  const wide = page.viewportSize()!.width
  expect(year.body).toBeLessThan(wide)
})

test('the room kept for the scrollbar looks like the page, and dims with it', async ({ page }) => {
  await open(page, RUN)
  await show(page, 'Year')

  const wide = page.viewportSize()!.width
  const body = await page.evaluate(() => document.body.getBoundingClientRect().width)
  expect(body, 'this browser keeps room for a scrollbar').toBeLessThan(wide)

  // Low on the page and at its right edge, where Year leaves nothing but the page's grey:
  // the strip, and the page just beside it.
  const y = 700
  const strip = () => pixel(page, wide - 2, y)
  const beside = () => pixel(page, Math.floor(body) - 4, y)

  const plain = { strip: await strip(), beside: await beside() }
  expect(near(plain.strip, plain.beside), JSON.stringify(plain)).toBe(true)

  // A dialog: the page goes dark, and the strip with it.
  await page.getByRole('button', { name: 'Add', exact: false }).filter({ visible: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // The fade starts a frame after the dialog mounts: wait for it to start, then to end.
  await expect(page.locator('[data-backdrop][data-shown="true"]')).toHaveCount(1)
  await settle(page)
  const dimmed = { strip: await strip(), beside: await beside() }
  expect(near(dimmed.strip, dimmed.beside), JSON.stringify(dimmed)).toBe(true)
  expect(dimmed.beside[0], 'the dialog dims the page').toBeLessThan(plain.beside[0] - 50)
})
