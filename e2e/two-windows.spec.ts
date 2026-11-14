import { test, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * Two windows of Daylo, in a real browser.
 *
 * Somebody who thinks Daylo has not refreshed opens it again. They tick today in the new
 * window and close it, go back to the old one and tap anything. The old window used to
 * write everything it held in memory, which did not include today, and the tick was gone.
 *
 * Two pages of one context share localStorage and hand each other the 'storage' event the
 * way two tabs do. This is the browser's case: on the desktop a second launch now brings
 * back the window already open instead (src-tauri/src/lib.rs), and that cannot be driven
 * from here.
 */

/** Seeded only when nothing is there, so a reload does not put the seed back. */
async function seedOnce(context: BrowserContext) {
  await context.addInitScript(() => {
    if (localStorage.getItem('simple-calendar-storage')) return
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
          reminderOffered: true,
          checkinEnabled: false,
          checkinNoticeSeen: true,
        },
        version: 0,
      })
    )
  })
}

/**
 * Today's square in the month, which is where a desktop window opens. Worked out here on
 * the same machine and clock as the browser, so it is the browser's today too.
 */
function todayCell(page: Page) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return page.locator(`button[aria-label^="${today},"]`)
}

async function open(context: BrowserContext, { behind = false } = {}): Promise<Page> {
  const page = await context.newPage()
  // A tab in front never takes in what another tab wrote: the person may have just ticked
  // something there. Playwright gives every page the focus (measured: document.hasFocus()
  // is true in both pages, with focus emulation on or off), so a tab meant to be behind,
  // the way it is while somebody ticks in the other one, is told so.
  if (behind) await page.addInitScript(() => (document.hasFocus = () => false))
  await page.goto('/')
  await expect(todayCell(page)).toBeVisible()
  return page
}

async function tickToday(page: Page) {
  await todayCell(page).click()
  await expect(page.getByTestId('quicklog-modal')).toBeVisible()
  await page.getByTestId('quicklog-activity-checkbox').first().click()
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.getByTestId('quicklog-modal')).not.toBeVisible()
}

async function createActivity(page: Page, name: string) {
  await page.getByTestId('add-activity-button').click()
  await expect(page.getByTestId('activity-form-modal')).toBeVisible()
  await page.getByTestId('activity-name-input').fill(name)
  await page.getByTestId('activity-form-submit').click()
  await expect(page.getByTestId('activity-form-modal')).not.toBeVisible()
}

const stored = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('simple-calendar-storage')
    const state = raw ? JSON.parse(raw).state : { activities: [], logs: [] }
    return {
      activities: (state.activities as { name: string }[]).map((a) => a.name),
      logs: (state.logs as unknown[]).length,
    }
  })

/** Until the second window's tick is on the disk, the way closing that window leaves it. */
async function waitForTheTickOnDisk(page: Page) {
  await expect.poll(async () => (await stored(page)).logs).toBe(1)
}

test('a tick from the second window survives the first one writing', async ({ context }) => {
  await seedOnce(context)
  const first = await open(context, { behind: true })
  const second = await open(context)

  await tickToday(second)
  await waitForTheTickOnDisk(first)
  await second.close()

  // Back in the first window, without reloading it: anything that writes.
  await createActivity(first, 'Walk')
  await expect.poll(async () => (await stored(first)).activities).toEqual(['Read', 'Walk'])

  await first.reload()
  await expect(todayCell(first)).toBeVisible()
  expect(await stored(first)).toEqual({ activities: ['Read', 'Walk'], logs: 1 })
})

// A web view may not hand the other tab the 'storage' event, so coming back to the front
// reads the disk again. Playwright cannot minimise a window, so the first one
// is told it has the focus, and is kept from hearing 'storage' at all by a listener that
// runs before the app's own.
test('a tick from the second window survives without being told, on coming back', async ({
  context,
}) => {
  await seedOnce(context)
  const first = await context.newPage()
  await first.addInitScript(() => {
    window.addEventListener('storage', (event) => event.stopImmediatePropagation(), true)
  })
  await first.goto('/')
  await expect(todayCell(first)).toBeVisible()
  const second = await open(context)

  await tickToday(second)
  await waitForTheTickOnDisk(first)
  await second.close()

  await first.evaluate(() => window.dispatchEvent(new Event('focus')))
  await createActivity(first, 'Walk')
  await expect.poll(async () => (await stored(first)).activities).toEqual(['Read', 'Walk'])

  await first.reload()
  await expect(todayCell(first)).toBeVisible()
  expect(await stored(first)).toEqual({ activities: ['Read', 'Walk'], logs: 1 })
})
