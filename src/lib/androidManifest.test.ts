import { describe, it, expect } from 'vitest'
import { EXACT_ALARMS_DECLARED } from './reminders'
// ?raw rather than reading the file: this project's TypeScript is typed for vite/client,
// not for Node, the same way fileSave.test.ts reads the desktop capability.
import manifest from '../../src-tauri/gen/android/app/src/main/AndroidManifest.xml?raw'

/**
 * Whether a manifest asks Android for SCHEDULE_EXACT_ALARM.
 *
 * Comments are taken out first, because the comment beside that line is where the
 * permission gets explained, and it names the permission whether or not it is declared.
 */
function declaresExactAlarms(xml: string): boolean {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  return /<uses-permission\s[^>]*android:name="android\.permission\.SCHEDULE_EXACT_ALARM"/.test(
    withoutComments
  )
}

// The switch in reminders.ts decides what the settings screen offers, and the manifest
// decides what Android lets the app do. Apart, they fail quietly in both directions: a
// switch on without the permission offers a screen Daylo is not listed on, and the
// permission back without the switch ships a declaration Google Play asks to be justified
// for a build that never uses it.
describe('the exact-alarm permission', () => {
  it('is declared in the Android manifest exactly when the app says it is', () => {
    expect(declaresExactAlarms(manifest)).toBe(EXACT_ALARMS_DECLARED)
  })

  it('is not counted when it is only named in a comment', () => {
    const commented =
      '<manifest><!-- <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" /> --></manifest>'

    expect(declaresExactAlarms(commented)).toBe(false)
  })

  it('is counted when it is declared', () => {
    const declared =
      '<manifest>\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n</manifest>'

    expect(declaresExactAlarms(declared)).toBe(true)
  })
})
