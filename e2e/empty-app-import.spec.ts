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
// The one on screen. On a phone in Year the hidden Month beside it has its own line, which
// is inert and is checked on its own below.
const LINE = '[data-testid="month-empty-import"] >> visible=true'
const NAME = 'Import your backup.'

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
      top: r.top,
      bottom: r.bottom,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
    }
  })

/**
 * The boxes of the words above and beside the link: the empty-state sentence, and "Used
 * Daylo before?" itself, measured as text with a Range so the paragraph's own width does
 * not count. The link's target may be bigger than its words, but not over these: a tap or
 * a text selection there opened Import.
 */
const wordsAround = (page: Page) =>
  page.locator(LINE).evaluate((line) => {
    const sentence = line.parentElement!.querySelector('p')!
    const range = document.createRange()
    range.selectNodeContents(line.firstChild!)
    return [sentence.getBoundingClientRect(), ...Array.from(range.getClientRects())].map((r) => ({
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    }))
  })

type Box = { x: number; y: number; width: number; height: number }
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function importTheBackup(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(backup)
  await expect(page.getByText('Import mode:')).toBeVisible()
  await page.locator(DIALOG).getByRole('button', { name: 'Import Data' }).click()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.locator(DIALOG)).toBeHidden()
}

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
    expect(box.scrollY).toBe(0)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(box.innerHeight)

    // A finger's worth of target, on every width.
    const button = page.getByRole('button', { name: NAME })
    const target = (await button.boundingBox())!
    expect(target.height).toBeGreaterThanOrEqual(44)

    // ...grown below the words and not over the ones above them.
    for (const words of await wordsAround(page)) expect(overlap(target, words)).toBe(false)

    // Below lg the round button that opens the activities floats over the bottom right
    // corner, which is where a centred line ends on a phone. A link half under it is half
    // a link, and Playwright still clicks it because it aims at the middle.
    const fab = page.locator('[data-testid="fab-button"]')
    if (await fab.isVisible()) expect(overlap(target, (await fab.boundingBox())!)).toBe(false)

    await button.click()
    await expect(page.locator(DIALOG)).toBeVisible()
    await expect(page.locator(DIALOG)).toContainText('Import Data')

    await importTheBackup(page)
    await expect(page.locator('[data-testid="month-empty-import"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="month-empty-state"]')).toHaveCount(0)
    // The button that had focus went with the line. Focus goes to the month's title,
    // which was there before and is there after, rather than falling to the page.
    await expect(page.getByTestId('month-title-button')).toBeFocused()
  })
}

// On the shortest phones the line falls below the fold, and the brief is to say so rather
// than move other things to make room. What has to hold is that it is still there to be
// reached: one scroll away, whole, and clear of the round button.
test('at 360x640 the line is one scroll away and clear of the round button', async ({ page }) => {
  await openEmpty(page, 360, 640)
  const button = page.getByRole('button', { name: NAME })
  await button.scrollIntoViewIfNeeded()

  const box = await boxOf(page)
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(box.innerHeight)
  const target = (await button.boundingBox())!
  expect(overlap(target, (await page.getByTestId('fab-button').boundingBox())!)).toBe(false)

  await button.click()
  await expect(page.locator(DIALOG)).toBeVisible()
})

test('closing Import with nothing imported leaves focus on the line', async ({ page }) => {
  await openEmpty(page, 1200, 800)
  const button = page.getByRole('button', { name: NAME })
  await button.click()
  await expect(page.locator(DIALOG)).toBeVisible()
  await page.locator(DIALOG).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator(DIALOG)).toBeHidden()
  await expect(button).toBeFocused()
})

// In Year on a phone the Month beside it is drawn, hidden, so a drag has something to
// reveal. It keeps its line so it is as tall as it will be once it arrives, and it is
// inert: nothing can focus its link and no finger can land on it.
test('the hidden month beside Year keeps its line out of reach', async ({ page }) => {
  await openEmpty(page, 360, 800)
  await page.getByRole('button', { name: 'Year', exact: true }).click()
  await expect(page.locator('[data-testid="month-empty-import"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: NAME })).toHaveCount(0)

  const reach = await page.locator('[data-testid="month-empty-import"] button').evaluate((b) => {
    ;(b as HTMLElement).focus()
    const r = b.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      inert: b.closest('[inert]') !== null,
      focused: document.activeElement === b,
      hit: hit !== null && (hit === b || b.contains(hit)),
    }
  })
  expect(reach).toEqual({ inert: true, focused: false, hit: false })
})
