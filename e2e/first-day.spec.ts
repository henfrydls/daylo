import { test, expect, devices, type Page } from '@playwright/test'

/**
 * The first day and the second, on a phone, in a real browser.
 *
 * With no activities the Today bar is the way in. It opens today's sheet on the form, the
 * first activity is born logged on today, and the sheet says so once. The next morning the
 * bar says what today would make. Nothing new is saved for any of it.
 */
test.use({ ...devices['Pixel 7'], isMobile: true, hasTouch: true })

const DOOR = '[data-testid="first-day-door"]:visible'
const SHEET = '[data-testid="quicklog-modal"]'
const LINE = 'Today is in. Log it again tomorrow.'

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test('the door leads to a logged today, and the next morning to two days', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
  await page.goto('/')
  await expect(page.locator(DOOR)).toHaveText(/Add your first activity/)
  await expect(page.getByTestId('fab-button')).toHaveCount(0)

  await page.locator(DOOR).click()
  const name = page.getByTestId('quicklog-new-activity-input')
  await expect(page.locator(SHEET)).toBeVisible()
  await expect(page.locator('#quicklog-title')).toHaveText('Today · Nov 13')
  await expect(name).toBeFocused()

  await name.fill('Read')
  await page.getByTestId('quicklog-add-activity').click()
  await expect(page.getByTestId('first-day-line')).toHaveText(LINE)
  await expect(page.getByTestId('quicklog-activity-checkbox')).toBeChecked()

  await page.getByTestId('quicklog-done-button').click()
  await expect(page.locator(SHEET)).toHaveCount(0)
  await expect(page.locator('[data-testid="today-tile"]:visible')).toHaveClass(/bg-emerald-700/)
  await expect(page.getByTestId('fab-button')).toBeVisible()
  await expect(page.locator('[data-testid="streak-chip"]:visible')).toHaveText('1 day')

  // Once: the next opening of the same sheet says nothing.
  await page.getByTestId('log-today-bar').click()
  await expect(page.locator(SHEET)).toBeVisible()
  await expect(page.getByText(LINE)).toHaveCount(0)
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.locator(SHEET)).toHaveCount(0)

  // The next morning.
  await page.clock.setSystemTime(new Date('2026-11-14T09:00:00'))
  await page.reload()
  await expect(page.getByTestId('log-today-bar')).toContainText('Log today to make 2 days in a row')
  await expect(page.locator('[data-testid="today-tile"]:visible')).toHaveClass(/border-dashed/)
  await expect(
    page.locator('[data-testid="streak-chip"]:visible [data-testid="streak-flame"]')
  ).toHaveAttribute('data-lit', 'false')
  await expect(page.getByText('Yesterday is still open')).toHaveCount(0)

  await page.getByTestId('log-today-bar').click()
  await page.getByTestId('quicklog-activity-checkbox').check()
  await page.getByTestId('quicklog-done-button').click()
  await expect(page.getByTestId('log-today-bar')).toContainText('1/1 activity')
  await expect(page.locator('[data-testid="streak-chip"]:visible')).toHaveText('2 days')
})

// Deleting the last activity brings the door back, and "Activity deleted" comes up in the
// corner where the phone's panel ends. It used to sit over "No activities yet.".
test('the toast after deleting the last activity leaves the words in sight', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
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
        },
        version: 0,
      })
    )
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await page.getByTestId('fab-button').click()
  const sheet = page.getByTestId('bottom-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.locator('[data-testid="bottom-sheet-backdrop"]')).toHaveCSS('opacity', '1')
  await page.waitForTimeout(350)

  await sheet.getByRole('button', { name: 'Delete Read' }).click()
  await page.getByTestId('delete-activity-confirm').getByRole('button', { name: 'Delete' }).click()
  const toast = page.getByRole('alert').filter({ hasText: 'Activity deleted' })
  await expect(toast).toBeVisible()
  await settle(page)

  const words = sheet.getByTestId('activity-list-empty')
  await expect(words).toHaveText('No activities yet.')
  const add = sheet.getByTestId('add-activity-button')
  await expect(add).toHaveClass(/bg-gray-100/)

  // The words themselves, not their padded box.
  const text = await words.evaluate((p) => {
    const range = document.createRange()
    range.selectNodeContents(p)
    const r = range.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  })
  const box = (await toast.boundingBox())!
  const apart =
    text.bottom <= box.y ||
    text.top >= box.y + box.height ||
    text.right <= box.x ||
    text.left >= box.x + box.width
  expect(apart).toBe(true)
  // And the toast is where it always was: the bottom right corner, over the inset.
  const vp = page.viewportSize()!
  expect(Math.round(vp.height - (box.y + box.height))).toBe(16)
  expect(Math.round(vp.width - (box.x + box.width))).toBe(16)

  await expect(page.getByTestId('fab-button')).toHaveCount(0)
})

/**
 * Where the focus lands after the first day's surfaces close. Read from
 * `document.activeElement`, because each of these used to leave it on <body>: the thing
 * that had opened them was gone by the time they closed.
 */
test.describe('the focus after the first day changes the page', () => {
  const active = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement
      return el === null || el === document.body
        ? 'body'
        : (el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
    })

  for (const close of ['Escape', 'Done'] as const) {
    test(`closing the sheet where the first activity was born gives the focus to the Today bar (${close})`, async ({
      page,
    }) => {
      await page.goto('/')
      const door = page.locator(DOOR)
      await door.focus()
      await page.keyboard.press('Enter')
      const name = page.getByTestId('quicklog-new-activity-input')
      await expect(name).toBeFocused()
      await name.fill('Read')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('first-day-line')).toBeVisible()
      await expect(page.locator(DOOR)).toHaveCount(0)

      if (close === 'Escape') await page.keyboard.press('Escape')
      else await page.getByTestId('quicklog-done-button').click()
      await expect(page.locator(SHEET)).toHaveCount(0)

      expect(await active(page)).toBe('log-today-bar')
    })
  }

  // From Year the door takes itself away on the way to Month, so the sheet opens with the
  // focus on nobody. Closing it must not leave the focus there.
  for (const close of ['Escape', 'Done'] as const) {
    test(`at 360 from the door in Year, closing the sheet gives the focus to the Today bar (${close})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 })
      await page.goto('/')
      await page.getByRole('button', { name: 'Year', exact: true }).click()
      await settle(page)
      await page.locator(DOOR).click()
      const name = page.getByTestId('quicklog-new-activity-input')
      await expect(name).toBeFocused()
      await name.fill('Read')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('first-day-line')).toBeVisible()

      if (close === 'Escape') await page.keyboard.press('Escape')
      else await page.getByTestId('quicklog-done-button').click()
      await expect(page.locator(SHEET)).toHaveCount(0)

      expect(await active(page)).toBe('log-today-bar')
    })
  }

  test('closing the panel after deleting the last activity gives the focus to the door', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
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
          },
          version: 0,
        })
      )
    })
    await page.goto('/')
    await page.getByTestId('fab-button').click()
    const sheet = page.getByTestId('bottom-sheet')
    await expect(sheet).toBeVisible()
    await expect(page.locator('[data-testid="bottom-sheet-backdrop"]')).toHaveCSS('opacity', '1')
    await page.waitForTimeout(350)
    await sheet.getByRole('button', { name: 'Delete Read' }).click()
    await page
      .getByTestId('delete-activity-confirm')
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(page.getByTestId('delete-activity-confirm')).toHaveCount(0)
    await expect(page.getByTestId('fab-button')).toHaveCount(0)

    // The confirm closed over the panel: the focus goes back into the panel, not to the
    // page behind it, and Tab keeps going round inside it.
    const inPanel = () =>
      page.evaluate(() => document.activeElement?.closest('[data-testid="bottom-sheet"]') !== null)
    expect(await inPanel()).toBe(true)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await inPanel()).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    expect(await active(page)).toBe('first-day-door')
  })

  test('importing from the door in Year leaves the focus on the year', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Year', exact: true }).click()
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running')
    )
    await page.getByRole('button', { name: 'Import your backup' }).click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="modal-title"]')
    await page.locator('input[type="file"]').setInputFiles({
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
    })
    await dialog.getByRole('button', { name: 'Import Data' }).click()
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator(DOOR)).toHaveCount(0)

    expect(await active(page)).toBe('year-title')
  })
})

/**
 * The reminder offer on the first day, on the Android app: it comes as soon as the first
 * activity exists, and not over the sheet that activity was made in. It waits for "Today is
 * in" to be closed with Done, then asks.
 *
 * The browser is told it is the Android build the same way the reminder sheet's tests in
 * app.spec.ts do it: isTauri() reads one global and invoke() goes to another. Every native
 * call answers here, in the page, so nothing leaves it, the check-in included.
 *
 * The locale is fixed because the offer writes the time the way the phone's clock does: a
 * 24-hour locale says 21:00, and the check below reads the 12-hour form.
 */
test.describe('the reminder offer on the first day', () => {
  test.use({ locale: 'en-US' })

  test('on Android it is offered after the first day is in, not over it', async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(window, {
        isTauri: true,
        __TAURI_INTERNALS__: {
          invoke: (command: string) =>
            command === 'exact_alarms'
              ? Promise.resolve({ requested: false, allowed: false, sdk: 34 })
              : Promise.resolve(
                  command === 'reminders_available' ||
                    command === 'plugin:notification|is_permission_granted'
                ),
        },
      })
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { permission: 'granted' },
      })
    })
    await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
    await page.goto('/')
    const offer = page.getByTestId('reminder-offer')

    await page.locator(DOOR).click()
    await page.getByTestId('quicklog-new-activity-input').fill('Read')
    await page.getByTestId('quicklog-add-activity').click()
    await expect(page.getByTestId('first-day-line')).toHaveText(LINE)
    // The activity is ticked and the sheet is still up: the question waits behind it.
    await settle(page)
    await expect(offer).toHaveCount(0)

    await page.getByTestId('quicklog-done-button').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(offer).toBeVisible()
    await expect(offer).toContainText('Remind me each evening?')
    // Nine in the evening, as the offer proposes since 1.6.
    await expect(offer).toContainText(/\b9:00\sPM\b/)
  })
})

/**
 * The anonymous check-in, on the first day and on the day of an update, with nothing on
 * the screen about it. From 1.3.0 to 1.5.x a line under the header said whether it was on;
 * it is gone, and the switch and what it sends are in the menu.
 *
 * The page is told it is the Android build, as above, and this time the check-in answers
 * too, so the code that turns it on and sends runs for real. Every native call answers
 * here, in the page, and is written down, so nothing leaves it and the test can see what
 * would have been sent.
 *
 * Absence asserted once at the end would pass for a line that came and went. So the page
 * watches itself from before the app loads, and keeps the first sign of the line: its
 * test id, or the sentence it opened with. Not any mention of the check-in, which other
 * things rightly make (the question with stars says its message carries the check-in's
 * number when the check-in is on).
 */
async function asTheAndroidApp(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = []
    Object.assign(window, {
      isTauri: true,
      __calls: calls,
      __checkinSeen: null,
      __TAURI_INTERNALS__: {
        invoke: (command: string) => {
          calls.push(command)
          if (command === 'checkin_fields') {
            return Promise.resolve({ version: '1.6.0', os: 'android', source: 'apk' })
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
    })
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    })
    const observer = new MutationObserver(() => {
      const body = document.body
      if (!body) return
      const found = body.querySelector('[data-testid="checkin-notice"]')
        ? 'the line'
        : /Anonymous check-in is (on|off)\./.test(body.textContent ?? '')
          ? 'its sentence'
          : null
      if (found === null) return
      Object.assign(window, { __checkinSeen: found })
      observer.disconnect()
    })
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)
const checkinSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __checkinSeen: string | null }).__checkinSeen)
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('simple-calendar-storage') ?? '{}').state)

test.describe('the check-in, with nothing on the screen about it', () => {
  test.use({ locale: 'en-US' })

  test('a new installation: on, and the reminder is offered after the first day', async ({
    page,
  }) => {
    await asTheAndroidApp(page)
    await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
    await page.goto('/')
    const offer = page.getByTestId('reminder-offer')

    // On by default, as before: turned on and sent through the native side, here the page.
    await expect.poll(() => calls(page)).toContain('send_checkin')
    await expect.poll(async () => (await stored(page))?.checkinEnabled).toBe(true)

    await page.locator(DOOR).click()
    await page.getByTestId('quicklog-new-activity-input').fill('Read')
    await page.getByTestId('quicklog-add-activity').click()
    await expect(page.getByTestId('first-day-line')).toHaveText(LINE)
    await settle(page)
    await expect(offer).toHaveCount(0)

    await page.getByTestId('quicklog-done-button').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(offer).toBeVisible()
    await expect(offer).toContainText('Remind me each evening?')

    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(offer).toHaveCount(0)
    await settle(page)

    expect(await checkinSeen(page)).toBeNull()
  })

  test('an update: off, and the invitation to write still comes when it is due', async ({
    page,
  }) => {
    await asTheAndroidApp(page)
    // Somebody who has used Daylo for three weeks, from a version before the check-in:
    // nothing stored about it at all. Past the invitation's week, and already asked about
    // the reminder, so nothing else is owed ahead of it.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      // Twenty days, from 2026-10-13 to 2026-11-01, one record each.
      const logs = Array.from({ length: 20 }, (_, i) => {
        const d = new Date(2026, 9, 13 + i)
        const date = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-')
        return { id: `l${i}`, activityId: 'a1', date, completed: true, createdAt: date }
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
                createdAt: '2026-10-13T00:00:00.000Z',
                updatedAt: '2026-10-13T00:00:00.000Z',
              },
            ],
            logs,
            yearMode: 'all',
            reminderEnabled: false,
            reminderHour: 21,
            reminderMinute: 0,
            reminderOffered: true,
            firstOpenedAt: '2026-10-13',
            feedbackInviteSeen: false,
          },
          version: 0,
        })
      )
    })
    await page.clock.install({ time: new Date('2026-11-13T10:00:00') })
    await page.goto('/')
    await expect(page.getByTestId('log-today-bar')).toBeVisible()

    // Off, as before: asked what it would send, never sent, and written down as off.
    await expect.poll(() => calls(page)).toContain('checkin_fields')
    await expect.poll(async () => (await stored(page))?.checkinEnabled).toBe(false)

    await page.getByTestId('log-today-bar').click()
    await page.getByTestId('quicklog-activity-checkbox').check()
    await page.getByTestId('quicklog-done-button').click()
    await expect(page.locator(SHEET)).toHaveCount(0)

    await expect(page.getByTestId('feedback-rating')).toBeVisible()
    expect(await calls(page)).not.toContain('send_checkin')
    expect(await checkinSeen(page)).toBeNull()
  })
})
