import { test, expect, type Page } from '@playwright/test'

/**
 * Export and Import, which are dialogs and until now did not arrive or leave.
 *
 * Measured frame by frame from inside the page rather than asserted off the class list,
 * for the reason the carousel and the day sheet are: a class that names a transition
 * proves nothing about whether anything moved. Two separate things could stop it, and
 * both did.
 *
 * The first is the mount guard. `{isOpen && <ExportModal isOpen={isOpen} />}` means the
 * prop can never be false while the component exists: it is born open, so there is no
 * frame at the state it should come from, and it is taken out of the page the instant it
 * closes, so the leaving classes never paint.
 *
 * The second is the property. Tailwind 4 scales with the `scale` property, not with
 * `transform`, the same way it moves with `translate`. A transition that lists `transform`
 * lists something this element never changes, and the scale jumps.
 */
const DIALOG = '[role="dialog"][aria-labelledby="modal-title"]'

interface Frame {
  at: number
  opacity: number
  scale: number
  gone: boolean
}

/** One reading per frame, from inside the page, until it is told to stop. */
async function watch(page: Page) {
  await page.evaluate((selector) => {
    const w = window as unknown as { __frames: Frame[]; __t0: number }
    w.__frames = []
    w.__t0 = performance.now()
    const tick = () => {
      const node = document.querySelector(selector)
      const at = Math.round(performance.now() - w.__t0)
      if (node) {
        const style = getComputedStyle(node)
        // `scale` is "none" before anything sets it, and otherwise a number or a pair.
        const scale = style.scale === 'none' ? 1 : Number(style.scale.split(' ')[0])
        w.__frames.push({ at, opacity: Number(style.opacity), scale, gone: false })
      } else if (w.__frames.length) {
        w.__frames.push({ at, opacity: 0, scale: 0, gone: true })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, DIALOG)
}

const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)

const restart = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __t0: number }
    w.__frames = []
    w.__t0 = performance.now()
  })

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
  await page.locator('[data-testid="settings-button"]:visible').click()
  await expect(page.locator('[data-testid="settings-surface"]')).toBeVisible()
  // The panel's own arrival, out of the way, so what is measured is the dialog's.
  await page.waitForTimeout(400)
})

test('Export comes up instead of appearing', async ({ page }) => {
  await watch(page)
  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(500)

  const seen = (await frames(page)).filter((f) => !f.gone)
  expect(seen.length).toBeGreaterThan(5)

  // It starts somewhere else and ends where it belongs. The first reading is the frame it
  // was painted at, which is the whole of what was wrong: it used to be painted finished.
  expect(seen[0].opacity).toBeLessThan(0.5)
  expect(seen[0].scale).toBeLessThan(1)
  expect(seen[seen.length - 1].opacity).toBe(1)
  expect(seen[seen.length - 1].scale).toBe(1)

  // And it travelled, rather than jumping: readings in between, not two values.
  const between = seen.filter((f) => f.opacity > 0.05 && f.opacity < 0.95)
  expect(between.length).toBeGreaterThan(2)

  /**
   * The scale travelled too, which is a separate claim and needs its own reading.
   *
   * Asserting only that it starts under 1 and ends at 1 is satisfied by a jump: the first
   * frame is painted at the state it comes from whether or not anything animates it. This
   * passed with the transition naming `transform`, a property this element never changes,
   * which is exactly the bug it was supposed to catch.
   */
  const scales = new Set(seen.map((f) => f.scale))
  expect(scales.size).toBeGreaterThan(3)
})

test('Export goes down instead of vanishing', async ({ page }) => {
  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(400)

  await watch(page)
  await restart(page)
  await page.getByRole('button', { name: 'Close modal' }).click()
  await page.waitForTimeout(600)

  const seen = await frames(page)
  const present = seen.filter((f) => !f.gone)
  expect(present.length).toBeGreaterThan(5)

  // Fading on its way out, and only then taken out of the page.
  const fading = present.filter((f) => f.opacity < 0.95)
  expect(fading.length).toBeGreaterThan(2)
  // Nearly gone before it is taken out, rather than cut off partway down: the ease it
  // leaves on does most of its work in the last frames, so a timer the same length as the
  // transition removed it at a third of its opacity.
  expect(present[present.length - 1].opacity).toBeLessThan(0.1)
  expect(seen[seen.length - 1].gone).toBe(true)
})

test('Import does the same thing', async ({ page }) => {
  await watch(page)
  await page.locator('[data-testid="settings-import"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(500)

  const seen = (await frames(page)).filter((f) => !f.gone)
  expect(seen[0].opacity).toBeLessThan(0.5)
  expect(seen[seen.length - 1].opacity).toBe(1)
})

/**
 * Opened, closed and opened again, which is where a arrival hook gets this wrong: the
 * frames that let the second opening start from somewhere have to belong to that opening,
 * or a dialog closed fast leaves the next one with nowhere to come from.
 */
test('and the second time is like the first', async ({ page }) => {
  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.getByRole('button', { name: 'Close modal' }).click()
  await expect(page.locator(DIALOG)).toBeHidden()

  await watch(page)
  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(500)

  const seen = (await frames(page)).filter((f) => !f.gone)
  expect(seen[0].opacity).toBeLessThan(0.5)
  expect(seen[seen.length - 1].opacity).toBe(1)
})

/**
 * What the mount guard used to guarantee for free, and now rests on code.
 *
 * Import was taken out of the page when it closed, so everything it held went with it and
 * the next opening started clean whatever the component did. It stays in the page now, so
 * the reset it already had on every close path is the only thing keeping a file somebody
 * chose once from being there the next time they open it.
 */
test('Import opens clean after a file was chosen and it was closed', async ({ page }) => {
  await page.locator('[data-testid="settings-import"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'daylo.json',
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
  await expect(page.getByText('Import mode:')).toBeVisible()

  await page.getByRole('button', { name: 'Close modal' }).click()
  await expect(page.locator(DIALOG)).toBeHidden()

  await page.locator('[data-testid="settings-import"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()

  // Nothing of the last time: no file read, so nothing to choose a mode for.
  await expect(page.getByText('Import mode:')).toBeHidden()
})

/**
 * On a phone a dialog is a sheet: it comes up from the bottom edge and goes back down.
 *
 * Measured as the rectangle's top edge, frame by frame, and never as a style. Tailwind 4
 * writes `translate-y-*` to the `translate` property, so `getComputedStyle(node).transform`
 * reads `none` for the whole journey and a test written against it sees a dialog that never
 * moved. The rectangle has no opinion about which property moved it.
 *
 * Counting the values it passed through, not where it started and ended: a jump satisfies
 * the two ends, which is how the scale assertion in #126 passed with the bug still in.
 */
test('on a phone it comes up from the bottom edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(100)

  await page.evaluate((selector) => {
    const w = window as unknown as { __tops: number[] }
    w.__tops = []
    const tick = () => {
      const node = document.querySelector(selector)
      if (node) w.__tops.push(Math.round(node.getBoundingClientRect().top))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, DIALOG)

  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(600)

  const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops)
  expect(tops.length).toBeGreaterThan(5)

  // It began below the bottom edge of a 844-tall screen and finished inside it.
  expect(tops[0]).toBeGreaterThanOrEqual(844)
  expect(tops[tops.length - 1]).toBeLessThan(844)

  // And it travelled: more than a handful of distinct heights on the way.
  expect(new Set(tops).size).toBeGreaterThan(4)

  // Going down again, the same way.
  await page.evaluate(() => {
    ;(window as unknown as { __tops: number[] }).__tops = []
  })
  await page.getByRole('button', { name: 'Close modal' }).click()
  await page.waitForTimeout(600)

  const leaving = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops)
  expect(leaving.length).toBeGreaterThan(5)
  expect(leaving[leaving.length - 1]).toBeGreaterThan(leaving[0])
  expect(new Set(leaving).size).toBeGreaterThan(4)
})

/**
 * And above `sm` it is still a dialog in the middle: it must not slide up there, or the
 * one change becomes two and the desktop gets a sheet nobody asked for.
 */
test('on a desktop it stays where it was and only grows', async ({ page }) => {
  await page.evaluate((selector) => {
    const w = window as unknown as { __tops: number[] }
    w.__tops = []
    const tick = () => {
      const node = document.querySelector(selector)
      if (node) w.__tops.push(Math.round(node.getBoundingClientRect().top))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, DIALOG)

  await page.locator('[data-testid="settings-export"]').click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.waitForTimeout(600)

  const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops)
  // A few pixels of movement are the box growing around its middle, not a journey.
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(40)
})

/**
 * The other shell, which is a copy of this one and had all three of the same faults.
 *
 * `ConfirmDialog` is not built on `Modal`; it is forty lines of the same markup written
 * out again. So it appeared finished, its scale never animated, and it was taken out of
 * the page before it had left. Nobody had looked, because what opens it is a question
 * somebody is already reading rather than a screen they are watching, and the one on a
 * phone that matters most, the reminder offer, only exists on Android.
 */
test('the confirm is a sheet on a phone too', async ({ page }) => {
  // From a fresh page at phone width rather than from what the hook left open at 1280.
  // Resizing a page that already has a panel on it and a sheet arriving over that was
  // enough to make this pass alone and fail in a full run: the sheet's backdrop was still
  // taking the press, and the row it wanted was off the bottom of the shorter screen.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible()
  await page.getByTestId('fab-button').click()
  await expect(page.locator('[data-testid="bottom-sheet"]')).toBeVisible()
  // Scoped to the sheet: the same row is also in the page behind it, and an unscoped
  // locator matches both and refuses to choose.
  const row = page.getByTestId('bottom-sheet').getByTestId('activity-item')
  await expect(row).toBeVisible()
  // The sheet's own arrival, out of the way: until it lands its backdrop takes the press.
  await expect(page.locator('[data-testid="bottom-sheet-backdrop"]')).toHaveCSS('opacity', '1')
  await page.waitForTimeout(350)

  const CONFIRM = '[data-testid="delete-activity-confirm"]'
  await page.evaluate((selector) => {
    const w = window as unknown as { __tops: number[] }
    w.__tops = []
    const tick = () => {
      const node = document.querySelector(selector)
      if (node) w.__tops.push(Math.round(node.getBoundingClientRect().top))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, CONFIRM)

  // The last button on an activity's row is the one that asks before deleting.
  await row.getByRole('button').last().click()
  await expect(page.locator(CONFIRM)).toBeVisible()
  await page.waitForTimeout(600)

  const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops)
  expect(tops.length).toBeGreaterThan(5)
  expect(tops[0]).toBeGreaterThanOrEqual(844)
  expect(tops[tops.length - 1]).toBeLessThan(844)
  expect(new Set(tops).size).toBeGreaterThan(4)

  // Left the way it came, and nothing deleted: this asks, it does not do.
  //
  // Counted in the page rather than in the sheet, because pressing Cancel closes the
  // activities sheet as well, which is a separate fault and not this one's. Measured on
  // main with none of this applied and it does the same there, so it is older than any of
  // it: you say no to deleting an activity and lose your place. Reported, not fixed here.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator(CONFIRM)).toBeHidden()
  await expect(page.locator('#main-content').getByTestId('activity-item')).toHaveCount(1)
})
