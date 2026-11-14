import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { declaresExactAlarms, run, switchIn, verdictOn } from './check-exact-alarm.js'

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

  // The older spelling of the same element. The framework's parser still takes it
  // (ParsingPackageUtils, TAG_USES_PERMISSION_SDK_M), so a manifest that uses it asks for
  // the permission all the same.
  it('is counted when it is declared with the older spelling for Android 6 and up', () => {
    expect(
      declaresExactAlarms(
        inAManifest(
          '<uses-permission-sdk-m android:name="android.permission.SCHEDULE_EXACT_ALARM" />'
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

describe('the other exact-alarm permission', () => {
  // USE_EXACT_ALARM is granted on sight and is reserved for alarm clocks and calendars.
  // Declared by Daylo or by a library, it gives exact alarms all the same, and Play asks
  // about it at least as hard, so for this check it is the same thing.
  it('counts USE_EXACT_ALARM as asking for exact alarms', () => {
    expect(
      declaresExactAlarms(
        inAManifest('<uses-permission android:name="android.permission.USE_EXACT_ALARM" />')
      )
    ).toBe(true)
  })
})

describe('the namespace prefixes', () => {
  // `android:` and `tools:` are only the usual names. What makes an attribute Android's is
  // the namespace its prefix is bound to, and a merged manifest is free to bind another.
  const withPrefixes = (line) =>
    `<manifest xmlns:a="http://schemas.android.com/apk/res/android" xmlns:t="http://schemas.android.com/tools">\n    ${line}\n</manifest>`

  it('reads the name under whatever prefix the Android namespace has', () => {
    expect(
      declaresExactAlarms(
        withPrefixes('<uses-permission a:name="android.permission.SCHEDULE_EXACT_ALARM" />')
      )
    ).toBe(true)
  })

  it('reads a removal under whatever prefix the tools namespace has', () => {
    expect(
      declaresExactAlarms(
        withPrefixes(
          '<uses-permission a:name="android.permission.SCHEDULE_EXACT_ALARM" t:node="remove" />'
        )
      )
    ).toBe(false)
  })

  it('does not take a name in some other namespace for the Android one', () => {
    expect(
      declaresExactAlarms(
        `<manifest xmlns:android="http://example.com/not-android">\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n</manifest>`
      )
    ).toBe(false)
  })
})

describe('the switch, read from the source', () => {
  it('reads the value reminders.ts has', () => {
    expect(switchIn('export const EXACT_ALARMS_DECLARED: boolean = false\n')).toBe(false)
    expect(switchIn('export const EXACT_ALARMS_DECLARED: boolean = true\n')).toBe(true)
  })

  // A line commented out above the real one used to win, because the first match was
  // taken from the raw source.
  it('reads past a commented-out line to the real one', () => {
    expect(
      switchIn(
        '// export const EXACT_ALARMS_DECLARED: boolean = true\nexport const EXACT_ALARMS_DECLARED: boolean = false\n'
      )
    ).toBe(false)
    expect(
      switchIn(
        '  /** export const EXACT_ALARMS_DECLARED: boolean = false */\n  export const EXACT_ALARMS_DECLARED: boolean = true\n'
      )
    ).toBe(true)
  })

  // Only lines that begin with the declaration count, so a copy of it at the start of a
  // line inside a block comment counts as a second switch. Refused rather than parsed: the
  // reader does not understand comments, and says so instead of guessing which one is real.
  it('refuses a second declaration even inside a block comment', () => {
    expect(() =>
      switchIn(
        '/*\nexport const EXACT_ALARMS_DECLARED: boolean = false\n*/\nexport const EXACT_ALARMS_DECLARED: boolean = true\n'
      )
    ).toThrow()
  })

  it('refuses two switches rather than picking one', () => {
    expect(() =>
      switchIn(
        'export const EXACT_ALARMS_DECLARED: boolean = true\nexport const EXACT_ALARMS_DECLARED: boolean = false\n'
      )
    ).toThrow()
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

  // The state 1.5.3 ships in.
  it('passes a merged manifest with the permission while the switch is on', () => {
    expect(verdictOn({ xml: MERGED_WITH_IT, switchOn: true, path: 'bundle' })).toBeNull()
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

describe('what counts as a manifest', () => {
  // Decided on the file with its comments taken out, the same way the permission is.
  it('does not take a manifest that is only inside a comment for one', () => {
    expect(verdictOn({ xml: '<!-- <manifest> -->', switchOn: false, path: 'x' })).toMatch(
      /cannot say/
    )
  })

  it('does not take a permission inside a comment for a declared one', () => {
    const xml =
      '<manifest><!-- <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" /> --></manifest>'
    expect(verdictOn({ xml, switchOn: true, path: 'x' })).toMatch(/does not declare/)
    expect(verdictOn({ xml, switchOn: false, path: 'x' })).toBeNull()
  })

  it('reads a manifest with no permissions at all as one that declares none', () => {
    const xml = inAManifest('<application />')
    expect(verdictOn({ xml, switchOn: false, path: 'x' })).toBeNull()
    expect(verdictOn({ xml, switchOn: true, path: 'x' })).toMatch(/does not declare/)
  })

  it('reads a manifest whose only request is for Android 6 and up', () => {
    const xml = inAManifest(
      '<uses-permission-sdk-23 android:name="android.permission.SCHEDULE_EXACT_ALARM" />'
    )
    expect(verdictOn({ xml, switchOn: true, path: 'x' })).toBeNull()
  })
})

describe('running the check', () => {
  const SWITCH_ON = 'export const EXACT_ALARMS_DECLARED: boolean = true\n'
  const runWith = (files, paths) => {
    const errors = []
    const lines = []
    const code = run({
      paths,
      readFile: (path) => {
        if (!(path in files)) throw new Error(`ENOENT: ${path}`)
        return files[path]
      },
      log: (line) => lines.push(line),
      error: (line) => errors.push(line),
    })
    return { code, errors, lines }
  }

  // A path that cannot be read used to throw out of the loop: no ::error for the runner to
  // show, and none of the files after it looked at.
  it('says which file it could not read, goes on to the rest, and ends red', () => {
    const { code, errors, lines } = runWith(
      { 'src/lib/reminders.ts': SWITCH_ON, good: MERGED_WITH_IT },
      ['missing', 'good']
    )

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/^::error file=missing::/)])
    expect(lines).toEqual([expect.stringContaining('good')])
  })

  it('ends red, with a reason, when the switch cannot be read', () => {
    const { code, errors } = runWith({ good: MERGED_WITH_IT }, ['good'])

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/^::error file=src\/lib\/reminders\.ts::/)])
  })

  it('ends green when every manifest agrees', () => {
    const { code, errors } = runWith(
      { 'src/lib/reminders.ts': SWITCH_ON, a: MERGED_WITH_IT, b: MERGED_WITH_IT },
      ['a', 'b']
    )

    expect(errors).toEqual([])
    expect(code).toBe(0)
  })

  it('ends red when it was given nothing to check', () => {
    const { code, errors } = runWith({ 'src/lib/reminders.ts': SWITCH_ON }, [])

    expect(code).toBe(1)
    expect(errors).toHaveLength(1)
  })
})
