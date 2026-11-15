import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  channelIn,
  declaresExactAlarms,
  removedPermissionsIn,
  run,
  verdictOn,
} from './check-exact-alarm.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const MAIN = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
const PLAY = 'src-tauri/gen/android/app/src/play/AndroidManifest.xml'

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
  // The APK is built from the main manifest and keeps the permission, so that no update of
  // it takes away an exact alarm somebody allowed.
  it('is declared in the main Android manifest', () => {
    expect(declaresExactAlarms(read(MAIN))).toBe(true)
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

describe('the Play overlay', () => {
  // The one line that makes the Play bundle different. A typo in the name would make the
  // removal match nothing, the merge would keep the permission, and the overlay would look
  // as if it did its job.
  it('removes exactly the exact-alarm permission, and nothing else', () => {
    expect(removedPermissionsIn(read(PLAY))).toEqual(['android.permission.SCHEDULE_EXACT_ALARM'])
  })

  it('does not ask for exact alarms itself', () => {
    expect(declaresExactAlarms(read(PLAY))).toBe(false)
  })

  // How the installed app knows it came from the Play build, whoever installed it.
  it('marks the build as the Play one', () => {
    expect(channelIn(read(PLAY))).toBe('play')
  })

  // And the APK carries no mark, so it goes on behaving as it does today.
  it('leaves the main manifest without a mark', () => {
    expect(channelIn(read(MAIN))).toBeNull()
  })
})

describe('the permissions a manifest removes', () => {
  it('reads a removal under whatever prefix the tools namespace has', () => {
    expect(
      removedPermissionsIn(
        '<manifest xmlns:a="http://schemas.android.com/apk/res/android" xmlns:t="http://schemas.android.com/tools">\n    <uses-permission a:name="android.permission.SCHEDULE_EXACT_ALARM" t:node="remove" />\n</manifest>'
      )
    ).toEqual(['android.permission.SCHEDULE_EXACT_ALARM'])
  })

  it('does not count a removal that is only inside a comment', () => {
    expect(
      removedPermissionsIn(
        inAManifest(
          '<!-- <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" /> -->'
        )
      )
    ).toEqual([])
  })

  it('does not count a request as a removal', () => {
    expect(
      removedPermissionsIn(
        inAManifest('<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />')
      )
    ).toEqual([])
  })
})

describe('the channel mark', () => {
  const marked = (line) => inAManifest(`<application>\n        ${line}\n    </application>`)

  it('reads the value the mark carries', () => {
    expect(
      channelIn(marked('<meta-data android:name="daylo.channel" android:value="play" />'))
    ).toBe('play')
  })

  it('reads it with the value written before the name, and in single quotes', () => {
    expect(
      channelIn(marked("<meta-data android:value='play' android:name='daylo.channel' />"))
    ).toBe('play')
  })

  it('does not count a mark that is only inside a comment', () => {
    expect(
      channelIn(marked('<!-- <meta-data android:name="daylo.channel" android:value="play" /> -->'))
    ).toBeNull()
  })

  it('does not take some other meta-data for it', () => {
    expect(
      channelIn(marked('<meta-data android:name="daylo.channels" android:value="play" />'))
    ).toBeNull()
  })

  it('does not count a mark that is there to be removed', () => {
    expect(
      channelIn(
        marked(
          '<meta-data android:name="daylo.channel" android:value="play" tools:node="remove" />'
        )
      )
    ).toBeNull()
  })

  // The merged manifest of a real build, which has meta-data of its own from the libraries.
  it('finds no mark in a merged manifest that has none', () => {
    expect(channelIn(MERGED)).toBeNull()
  })
})

describe('the check on the merged manifests', () => {
  it('has the permission in the copy made to carry it', () => {
    expect(MERGED_WITH_IT).not.toBe(MERGED)
    expect(MERGED_WITH_IT).toContain('android.permission.SCHEDULE_EXACT_ALARM')
  })

  // The Play bundle.
  it('passes a merged manifest without the permission when none was expected', () => {
    expect(verdictOn({ xml: MERGED, expect: 'absent', path: 'bundle' })).toBeNull()
  })

  it('stops a merged manifest that carries the permission when none was expected', () => {
    expect(verdictOn({ xml: MERGED_WITH_IT, expect: 'absent', path: 'bundle' })).toMatch(
      /declares .*SCHEDULE_EXACT_ALARM/
    )
  })

  // The APK.
  it('passes a merged manifest with the permission when it was expected', () => {
    expect(verdictOn({ xml: MERGED_WITH_IT, expect: 'declared', path: 'apk' })).toBeNull()
  })

  it('stops a merged manifest that lacks the permission when it was expected', () => {
    expect(verdictOn({ xml: MERGED, expect: 'declared', path: 'apk' })).toMatch(/does not declare/)
  })

  // Nothing to read is not the same answer as nothing declared, whichever was expected: an
  // empty file agrees with "absent" by accident.
  it('stops on something that is not a manifest, whatever was expected', () => {
    for (const expected of ['declared', 'absent']) {
      expect(verdictOn({ xml: '', expect: expected, path: 'empty' })).toMatch(/cannot say/)
      expect(verdictOn({ xml: '<html></html>', expect: expected, path: 'page' })).toMatch(
        /cannot say/
      )
    }
  })
})

describe('the check on the channel mark', () => {
  const PLAY_MERGED = MERGED.replace(
    /(<application[^>]*>)/,
    '$1\n        <meta-data android:name="daylo.channel" android:value="play" />'
  )

  it('has the mark in the copy made to carry it', () => {
    expect(channelIn(PLAY_MERGED)).toBe('play')
  })

  it('passes the Play mark when it was expected', () => {
    expect(verdictOn({ xml: PLAY_MERGED, expect: 'absent', channel: 'play', path: 'b' })).toBeNull()
  })

  it('stops a bundle without the mark when the mark was expected', () => {
    expect(verdictOn({ xml: MERGED, expect: 'absent', channel: 'play', path: 'b' })).toMatch(
      /carries no channel mark and play was expected/
    )
  })

  // The APK has to stay without it, or it would go silent about updates and count as Play.
  it('stops a mark where none was expected', () => {
    expect(verdictOn({ xml: PLAY_MERGED, expect: 'absent', channel: 'none', path: 'a' })).toMatch(
      /is marked as the play channel and no mark was expected/
    )
  })

  it('says both when both are wrong', () => {
    const problem = verdictOn({ xml: MERGED_WITH_IT, expect: 'absent', channel: 'play', path: 'b' })
    expect(problem).toMatch(/declares/)
    expect(problem).toMatch(/channel mark/)
  })
})

describe('what counts as a manifest', () => {
  // Decided on the file with its comments taken out, the same way the permission is.
  it('does not take a manifest that is only inside a comment for one', () => {
    expect(verdictOn({ xml: '<!-- <manifest> -->', expect: 'absent', path: 'x' })).toMatch(
      /cannot say/
    )
  })

  it('does not take a permission inside a comment for a declared one', () => {
    const xml =
      '<manifest><!-- <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" /> --></manifest>'
    expect(verdictOn({ xml, expect: 'declared', path: 'x' })).toMatch(/does not declare/)
    expect(verdictOn({ xml, expect: 'absent', path: 'x' })).toBeNull()
  })

  it('reads a manifest with no permissions at all as one that declares none', () => {
    const xml = inAManifest('<application />')
    expect(verdictOn({ xml, expect: 'absent', path: 'x' })).toBeNull()
    expect(verdictOn({ xml, expect: 'declared', path: 'x' })).toMatch(/does not declare/)
  })

  it('reads a manifest whose only request is for Android 6 and up', () => {
    const xml = inAManifest(
      '<uses-permission-sdk-23 android:name="android.permission.SCHEDULE_EXACT_ALARM" />'
    )
    expect(verdictOn({ xml, expect: 'declared', path: 'x' })).toBeNull()
  })
})

describe('running the check', () => {
  const runWith = (files, args) => {
    const errors = []
    const lines = []
    const code = run({
      args,
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
    const { code, errors, lines } = runWith({ good: MERGED_WITH_IT }, [
      '--expect',
      'declared',
      'missing',
      'good',
    ])

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/^::error file=missing::/)])
    expect(lines).toEqual([expect.stringContaining('good')])
  })

  it('ends green when every manifest is as expected', () => {
    const { code, errors } = runWith({ a: MERGED_WITH_IT, b: MERGED_WITH_IT }, [
      '--expect',
      'declared',
      'a',
      'b',
    ])

    expect(errors).toEqual([])
    expect(code).toBe(0)
  })

  it('ends red, naming the file, when one is not as expected', () => {
    const { code, errors } = runWith({ a: MERGED_WITH_IT, b: MERGED }, [
      '--expect',
      'declared',
      'a',
      'b',
    ])

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/^::error file=b::.*does not declare/)])
  })

  it('reads the channel it is told to expect', () => {
    const { code, errors } = runWith({ a: MERGED_WITH_IT }, [
      '--expect',
      'declared',
      '--channel',
      'play',
      'a',
    ])

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/channel mark/)])
  })

  it('ends red when it was given nothing to check', () => {
    const { code, errors } = runWith({}, ['--expect', 'absent'])

    expect(code).toBe(1)
    expect(errors).toHaveLength(1)
  })

  // Without an expectation there is nothing to compare with, and guessing one is how a
  // check passes the one case it is there for.
  it('ends red when it was not told what to expect', () => {
    const { code, errors } = runWith({ a: MERGED_WITH_IT }, ['a'])

    expect(code).toBe(1)
    expect(errors).toEqual([expect.stringMatching(/--expect/)])
  })

  it('ends red on an expectation it does not know', () => {
    for (const args of [
      ['--expect', 'yes', 'a'],
      ['--expect', 'declared', '--channel', 'apk', 'a'],
    ]) {
      const { code, errors } = runWith({ a: MERGED_WITH_IT }, args)
      expect(code).toBe(1)
      expect(errors).toHaveLength(1)
    }
  })
})
