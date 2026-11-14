import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { declaresExactAlarms, switchIn, verdictOn } from './check-exact-alarm.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

/**
 * A manifest as Gradle's merger writes it, taken from a real build of 1.0.1 (the bundle
 * manifest, which is the one that goes into the AAB). Old, and before the notification
 * plugin, but the shape is the merger's own and not one written here to suit the parser.
 */
const MERGED = read('scripts/fixtures/merged-manifest-1.0.1-bundle-debug.xml')

/**
 * The same merged manifest with the permission in it, where the merger would put it.
 *
 * The build wrote that file with Windows line endings and git hands it back with Unix ones,
 * and a plain string replace that expected one of the two matched nothing on the other and
 * returned the file unchanged: the test built on it failed for a reason that had nothing to
 * do with the check. Hence the \r? and the test below that the line went in.
 */
const MERGED_WITH_IT = MERGED.replace(
  /( *<uses-permission android:name="android\.permission\.INTERNET" \/>\r?\n)/,
  '$1    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\r\n'
)

const inAManifest = (line) =>
  `<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">\n    ${line}\n</manifest>`

describe('the exact-alarm permission', () => {
  // The switch decides what the settings screen offers, the manifest what Android lets the
  // app do. This is the two of them, as they are in the repository right now.
  it('is declared in the Android manifest exactly when the app says it is', () => {
    const manifest = read('src-tauri/gen/android/app/src/main/AndroidManifest.xml')
    const switchOn = switchIn(read('src/lib/reminders.ts'))

    expect(declaresExactAlarms(manifest)).toBe(switchOn)
  })

  it('is not counted when it is only named in a comment', () => {
    expect(
      declaresExactAlarms(
        inAManifest(
          '<!-- <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" /> -->'
        )
      )
    ).toBe(false)
  })

  it('is counted when it is declared', () => {
    expect(
      declaresExactAlarms(
        inAManifest('<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />')
      )
    ).toBe(true)
  })

  // The same request, limited to Android 6 and up. Play reads it as the permission all the
  // same.
  it('is counted when it is declared for Android 6 and up only', () => {
    expect(
      declaresExactAlarms(
        inAManifest(
          '<uses-permission-sdk-23 android:name="android.permission.SCHEDULE_EXACT_ALARM" />'
        )
      )
    ).toBe(true)
  })

  it('is counted when the name is in single quotes', () => {
    expect(
      declaresExactAlarms(
        inAManifest("<uses-permission android:name='android.permission.SCHEDULE_EXACT_ALARM' />")
      )
    ).toBe(true)
  })

  // This line is how an app takes away a permission a library brought in. It names the
  // permission and asks for the opposite.
  it('is not counted when the line is there to remove it', () => {
    expect(
      declaresExactAlarms(
        inAManifest(
          '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />'
        )
      )
    ).toBe(false)
  })
})

describe('the switch, read from the source', () => {
  it('reads the value reminders.ts has', () => {
    expect(switchIn('export const EXACT_ALARMS_DECLARED: boolean = false\n')).toBe(false)
    expect(switchIn('export const EXACT_ALARMS_DECLARED: boolean = true\n')).toBe(true)
  })

  it('refuses a switch it cannot read rather than calling it off', () => {
    expect(() => switchIn('export const EXACT_ALARMS_DECLARED = isPlayBuild()\n')).toThrow()
    expect(() => switchIn('')).toThrow()
  })
})

describe('the check on the merged manifests', () => {
  it('has the permission in the copy made to carry it', () => {
    expect(MERGED_WITH_IT).not.toBe(MERGED)
    expect(MERGED_WITH_IT).toContain('android.permission.SCHEDULE_EXACT_ALARM')
  })

  it('passes a merged manifest without the permission while the switch is off', () => {
    expect(verdictOn({ xml: MERGED, switchOn: false, path: 'bundle' })).toBeNull()
  })

  it('stops a merged manifest that carries the permission while the switch is off', () => {
    expect(verdictOn({ xml: MERGED_WITH_IT, switchOn: false, path: 'bundle' })).toMatch(
      /declares .*SCHEDULE_EXACT_ALARM/
    )
  })

  it('stops a merged manifest that lacks the permission while the switch is on', () => {
    expect(verdictOn({ xml: MERGED, switchOn: true, path: 'bundle' })).toMatch(/does not declare/)
  })

  // Nothing to read is not the same answer as nothing declared, in either position of the
  // switch: an empty file agrees with "off" by accident.
  it('stops on something that is not a manifest, whatever the switch says', () => {
    for (const switchOn of [false, true]) {
      expect(verdictOn({ xml: '', switchOn, path: 'empty' })).toMatch(/cannot say/)
      expect(verdictOn({ xml: '<html></html>', switchOn, path: 'page' })).toMatch(/cannot say/)
    }
  })
})
