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
