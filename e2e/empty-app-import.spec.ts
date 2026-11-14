import { test, expect, type Page } from '@playwright/test'

/**
 * The first day of a reinstalled Daylo looks exactly like the first day of a new one.
 *
 * Somebody who reinstalls, changes phones, or moves from the installer to the Store opens
 * an empty month and nothing about it says a backup can come back. Import is behind the
 * gear, in Settings, so the natural thing is to rebuild the activities by hand, and those
 * collide with the backup on the day it is finally found.
 *
 * The line under the empty month is the way in. It is only worth anything where the person
 * is already looking, so the test measures that it is inside the window without scrolling,
 * and does not take "visible" for it: Playwright calls a node visible when it is merely
 * below the fold.
 */

const DIALOG = '[role="dialog"][aria-labelledby="modal-title"]'
const LINE = '[data-testid="month-empty-import"]'

const backup = {
  name: 'daylo-backup.json',
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
}

async function openEmpty(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible()
}

/** The line's box against the window, read from the page so nothing scrolls to find it. */
const boxOf = (page: Page) =>
  page.locator(LINE).evaluate((node) => {
    const r = node.getBoundingClientRect()
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
    }
  })

for (const [width, height] of [
  [360, 800],
  // A tablet: the line is on one row again and the round button is still there.
  [768, 1024],
  [1200, 800],
] as const) {
  test(`at ${width}x${height} the line is in the window, opens Import, and goes once there is an activity`, async ({
    page,
  }) => {
    await openEmpty(page, width, height)

    const line = page.locator(LINE)
    await expect(line).toBeVisible()
    await expect(line).toHaveText('Used Daylo before? Import your backup.')

    const box = await boxOf(page)
    console.log(`line box at ${width}x${height}: ${JSON.stringify(box)}`)
    expect(box.scrollY).toBe(0)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(box.innerHeight)

    // A finger's worth of target on a phone, without the line itself looking taller.
    const button = page.getByRole('button', { name: 'Import your backup.' })
    const target = await button.boundingBox()
    expect(target).not.toBeNull()
    if (width < 640) expect(target!.height).toBeGreaterThanOrEqual(44)

    // Below lg the round button that opens the activities floats over the bottom right
    // corner, which is where a centred line ends on a phone. A link half under it is half
    // a link, and Playwright still clicks it because it aims at the middle.
    const fab = page.locator('[data-testid="fab-button"]')
    if (await fab.isVisible()) {
      const f = (await fab.boundingBox())!
      const t = target!
      const overlaps =
        t.x < f.x + f.width && f.x < t.x + t.width && t.y < f.y + f.height && f.y < t.y + t.height
      console.log(`target ${JSON.stringify(t)} fab ${JSON.stringify(f)}`)
      expect(overlaps).toBe(false)
    }

    await button.click()
    await expect(page.locator(DIALOG)).toBeVisible()
    await expect(page.locator(DIALOG)).toContainText('Import Data')

    await page.locator('input[type="file"]').setInputFiles(backup)
    await expect(page.getByText('Import mode:')).toBeVisible()
    await page.locator(DIALOG).getByRole('button', { name: 'Import Data' }).click()
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    await expect(page.locator(DIALOG)).toBeHidden()
    await expect(line).toHaveCount(0)
    await expect(page.locator('[data-testid="month-empty-state"]')).toHaveCount(0)
  })
}

// Measured and reported, not asserted: on the shortest phones the line may fall below the
// fold, and the brief is to say so rather than move other things to make room.
test('at 360x640 the line box is measured', async ({ page }) => {
  await openEmpty(page, 360, 640)
  await expect(page.locator(LINE)).toBeVisible()
  const box = await boxOf(page)
  console.log(`line box at 360x640: ${JSON.stringify(box)}`)
})
