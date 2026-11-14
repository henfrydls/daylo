import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * Whether the Android build asks for SCHEDULE_EXACT_ALARM exactly when the app says it does.
 *
 * Two things have to agree. EXACT_ALARMS_DECLARED in src/lib/reminders.ts decides whether
 * the settings screen offers the phone's "Alarms & reminders" screen; the manifest decides
 * whether Android lists Daylo there at all, and whether Google Play asks for the permission
 * to be justified. Apart, they fail quietly: a switch on without the permission offers a
 * screen Daylo is not on, and the permission declared with the switch off ships a
 * declaration Play has to be argued with over a build that never uses it.
 *
 * Run by the unit tests against the manifest written by hand, and by Build Check (Android)
 * against the manifests Gradle merged, because a library can declare the permission too and
 * the hand-written file would never show it.
 */

const PERMISSION = 'android.permission.SCHEDULE_EXACT_ALARM'

/**
 * The value of EXACT_ALARMS_DECLARED, read from the source of reminders.ts.
 *
 * Throws rather than guessing when the line is not there in the shape it is written in: a
 * switch this cannot read is a switch it cannot compare, and calling that "off" would pass
 * the one case this exists to catch.
 */
export function switchIn(source) {
  const match = /export const EXACT_ALARMS_DECLARED(?::\s*boolean)?\s*=\s*(true|false)\b/.exec(
    source
  )
  if (!match) {
    throw new Error('EXACT_ALARMS_DECLARED is not in reminders.ts as `= true` or `= false`')
  }
  return match[1] === 'true'
}

/**
 * Whether a manifest asks Android for SCHEDULE_EXACT_ALARM.
 *
 * Comments are taken out first, because the comment beside that line is where the
 * permission gets explained, and it names the permission whether or not it is declared.
 *
 * Then every request is read, in both of the forms Android has: `uses-permission` and
 * `uses-permission-sdk-23`, which asks for the same thing on Android 6 and up and which
 * Play counts all the same. XML lets an attribute be quoted either way. And a line marked
 * `tools:node="remove"` names the permission to take it away: it is how an app removes one
 * a library brought in, so it is the opposite of a request.
 */
export function declaresExactAlarms(xml) {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  const requests = withoutComments.match(/<uses-permission(?:-sdk-23)?\s[^>]*>/g) ?? []
  return requests.some((tag) => {
    const attributes = {}
    for (const [, name, double, single] of tag.matchAll(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    )) {
      attributes[name] = double ?? single
    }
    return attributes['android:name'] === PERMISSION && attributes['tools:node'] !== 'remove'
  })
}

/**
 * The manifest given, read as a manifest, or an error saying why it cannot be.
 *
 * "No permission found" and "nothing to look in" have to stay two answers. A path Gradle
 * stopped writing to, or a file that is not a manifest, contains no permission either, and
 * read as "not declared" it would agree with a switch that is off, which is the direction
 * that matters for Play.
 */
export function verdictOn({ xml, switchOn, path }) {
  if (!/<manifest[\s>]/.test(xml) || !/<uses-permission[\s>]/.test(xml)) {
    return `${path} does not look like a merged Android manifest, so it cannot say anything`
  }
  const declared = declaresExactAlarms(xml)
  if (declared === switchOn) return null
  return declared
    ? `${path} declares ${PERMISSION} and EXACT_ALARMS_DECLARED is false`
    : `${path} does not declare ${PERMISSION} and EXACT_ALARMS_DECLARED is true`
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error('::error::No manifest was given to check, so nothing was checked.')
    process.exit(1)
  }
  const switchOn = switchIn(readFileSync(join(root, 'src/lib/reminders.ts'), 'utf8'))
  let failed = false
  for (const path of paths) {
    const problem = verdictOn({ xml: readFileSync(path, 'utf8'), switchOn, path })
    if (problem) {
      console.error(`::error::${problem}`)
      failed = true
    } else {
      console.log(`${path}: agrees (${PERMISSION} ${switchOn ? 'declared' : 'not declared'})`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] && process.argv[1].endsWith('check-exact-alarm.js')) {
  main()
}
