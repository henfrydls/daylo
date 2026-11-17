import { test, expect, devices, type Page } from '@playwright/test'

/**
 * A tap on the daily reminder, with the streak open (#192, #270).
 *
 * The tap opens today's sheet. The streak sheet (on a phone) and the streak panel (from
 * 640px up) sit above the day sheet, so a tap that left them open put the day sheet
 * underneath, out of sight, and the first Escape or back closed a sheet nobody had seen.
 *
 * The browser is told it is the Android build the way app.spec.ts does it: isTauri() reads
 * one global and invoke() goes to another. The tap itself arrives the way the notification
 * plugin sends it while Daylo is in memory: as an `actionPerformed` message on the channel
 * the page registered for it. Every native call answers here, in the page, so nothing
 * leaves it, the check-in included.
 */
async function asTheAndroidApp(page: Page) {
  // Belt and braces: the check-in has no fields here and so sends nothing, and if it ever
  // tried, it would not get out.
  await page.route(/checkin\.henfrydls\.com/, (route) => route.abort())
  await page.addInitScript(() => {
    const callbacks = new Map<number, (message: unknown) => void>()
    const listeners: Array<{ event: string; channel: number }> = []
    let nextCallback = 1
    let nextIndex = 0
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (message: unknown) => void) => {
          const id = nextCallback++
          callbacks.set(id, callback)
          return id
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        invoke: (command: string, args?: { event?: string; handler?: { id: number } }) => {
          if (command === 'plugin:notification|register_listener') {
            listeners.push({ event: args?.event ?? '', channel: args?.handler?.id ?? -1 })
            return Promise.resolve()
          }
          if (command === 'launch_notification' || command === 'checkin_fields') {
            return Promise.resolve(null)
          }
          if (command === 'exact_alarms') {
            return Promise.resolve({ requested: false, allowed: false, sdk: 34 })
          }
          return Promise.resolve(
            command === 'reminders_available' ||
              command === 'plugin:notification|is_permission_granted'
          )
        },
      },
      __tapTheReminder: () => {
        let heard = 0
        for (const { event, channel } of listeners) {
          const callback = callbacks.get(channel)
          if (event !== 'actionPerformed' || callback === undefined) continue
          callback({
            index: nextIndex++,
            message: { actionId: 'tap', notification: { id: 1 } },
          })
          heard++
        }
        return heard
      },
    })
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    })
    const log = (date: string) => ({
      id: `l-${date}`,
      activityId: 'a1',
      date,
      completed: true,
      createdAt: `${date}T09:00:00.000Z`,
    })
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
          // Yesterday and the day before: a run of two, with today still to log.
          logs: [log('2026-11-11'), log('2026-11-12')],
          reminderEnabled: true,
          reminderHour: 21,
          reminderMinute: 0,
          // Or the one-time offer opens on its own and takes the keys.
          reminderOffered: true,
        },
        version: 0,
      })
    )
  })
  await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
  await page.goto('/')
}

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

async function tapTheReminder(page: Page) {
  const heard = await page.evaluate(() =>
    (window as unknown as { __tapTheReminder: () => number }).__tapTheReminder()
  )
  // Nobody listening would make every check below pass for the wrong reason.
  expect(heard).toBeGreaterThan(0)
}

const DAY_SHEET = '[data-testid="quicklog-modal"]'
const CHIP = '[data-testid="streak-chip"]:visible'

/** Whether the day sheet is what is drawn at its own middle: on top, and not under. */
const daySheetOnTop = (page: Page) =>
  page.evaluate((selector) => {
    const sheet = document.querySelector(selector)
    if (sheet === null) return false
    const box = sheet.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit !== null && sheet.contains(hit)
  }, DAY_SHEET)

test.describe('a tap on the reminder with the streak sheet open, on a phone', () => {
  // The Pixel 7, all but its browser type, which a describe cannot change.
  const { userAgent, viewport, deviceScaleFactor } = devices['Pixel 7']
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile: true, hasTouch: true })

  test("closes the streak sheet and leaves today's sheet on top", async ({ page }) => {
    await asTheAndroidApp(page)
    await page.locator(CHIP).click()
    const streak = page.getByTestId('streak-sheet')
    await expect(streak).toBeVisible()
    // The header holds both surfaces; only the phone's opens. The panel, in its hidden
    // row, would take the focus and the keys with nobody seeing it.
    await expect(page.getByTestId('streak-panel')).toHaveCount(0)
    await settle(page)

    await tapTheReminder(page)

    await expect(streak).toHaveCount(0)
    await expect(page.locator(DAY_SHEET)).toBeVisible()
    await expect(page.locator('#quicklog-title')).toHaveText('Today · Nov 13')
    await settle(page)
    expect(await daySheetOnTop(page)).toBe(true)

    // One Escape closes what the tap opened, and nothing is left behind it.
    await page.keyboard.press('Escape')
    await expect(page.locator(DAY_SHEET)).toHaveCount(0)
    await expect(streak).toHaveCount(0)
    await expect(page.locator(CHIP)).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('a tap on the reminder with the streak panel open, on a tablet', () => {
  // An Android tablet: wide enough for the panel, and Android, where the tap exists.
  test.use({
    viewport: { width: 1024, height: 768 },
    userAgent: devices['Galaxy Tab S4'].userAgent,
    hasTouch: true,
  })

  test("closes the streak panel and leaves today's sheet on top", async ({ page }) => {
    await asTheAndroidApp(page)
    await page.locator(CHIP).click()
    const panel = page.getByTestId('streak-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('streak-sheet')).toHaveCount(0)
    await settle(page)

    await tapTheReminder(page)

    await expect(panel).toHaveCount(0)
    await expect(page.locator(DAY_SHEET)).toBeVisible()
    await settle(page)
    expect(await daySheetOnTop(page)).toBe(true)

    await page.keyboard.press('Escape')
    await expect(page.locator(DAY_SHEET)).toHaveCount(0)
    await expect(panel).toHaveCount(0)
    await expect(page.locator(CHIP)).toHaveAttribute('aria-expanded', 'false')
  })
})
