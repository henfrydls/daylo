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
 * Run by the unit tests against the manifest written by hand, by Build Check (Android)
 * against the debug manifests Gradle merged, and by release.yml against the release ones
 * before anything is uploaded, because a library can declare the permission too and the
 * hand-written file would never show it.
 */

/**
 * Both permissions that give exact alarms. SCHEDULE_EXACT_ALARM is the one Daylo asks for;
 * USE_EXACT_ALARM is granted on sight and reserved for alarm clocks and calendars. Either
 * one, from Daylo or from a library, makes the build one that sets exact alarms, and either
 * one is what Play asks to be justified.
 */
const PERMISSIONS = [
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]

const ANDROID_NS = 'http://schemas.android.com/apk/res/android'
const TOOLS_NS = 'http://schemas.android.com/tools'

/**
 * The value of EXACT_ALARMS_DECLARED, read from the source of reminders.ts.
 *
 * Comments are taken out first, so a line commented out above the real one cannot win.
 * Throws rather than guessing when the line is not there in the shape it is written in, or
 * is there twice: a switch this cannot read is a switch it cannot compare, and calling that
 * "off" would pass the one case this exists to catch.
 */
export function switchIn(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const matches = [
    ...withoutComments.matchAll(
      /^\s*export const EXACT_ALARMS_DECLARED(?::\s*boolean)?\s*=\s*(true|false)\b/gm
    ),
  ]
  if (matches.length !== 1) {
    throw new Error(
      `EXACT_ALARMS_DECLARED is in reminders.ts ${matches.length} times as \`= true\` or \`= false\`, and has to be there once`
    )
  }
  return matches[0][1] === 'true'
}

const withoutXmlComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '')

/**
 * The prefix a namespace is bound to in this manifest, or the usual one when the text does
 * not bind it at all, which is how the short snippets in the tests are written.
 *
 * Matched on the whole text rather than per element: a manifest binds these once, on its
 * root, and a prefix bound to two namespaces in one file is not something the merger writes.
 */
function prefixFor(xml, namespace, usual) {
  const bindings = [...xml.matchAll(/xmlns:([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
  const bound = bindings.find(([, , double, single]) => (double ?? single) === namespace)
  if (bound) return bound[1]
  // The usual prefix bound to something else is not Android's, and nothing here is.
  return bindings.some(([, prefix]) => prefix === usual) ? null : usual
}

/**
 * The exact-alarm permissions a manifest asks Android for.
 *
 * Comments are taken out first, because the comment beside that line is where the
 * permission gets explained, and it names the permission whether or not it is declared.
 *
 * Then every request is read, in both of the forms Android has: `uses-permission` and
 * `uses-permission-sdk-23`, which asks for the same thing on Android 6 and up and which
 * Play counts all the same. XML lets an attribute be quoted either way, and the prefixes
 * are whatever the manifest binds the Android and tools namespaces to. And a line marked
 * `tools:node="remove"` names the permission to take it away: it is how an app removes one
 * a library brought in, so it is the opposite of a request.
 */
export function exactAlarmPermissionsIn(xml) {
  const text = withoutXmlComments(xml)
  const android = prefixFor(text, ANDROID_NS, 'android')
  const tools = prefixFor(text, TOOLS_NS, 'tools')
  if (android === null) return []
  const requests = text.match(/<uses-permission(?:-sdk-23)?\s[^>]*>/g) ?? []
  const found = new Set()
  for (const tag of requests) {
    const attributes = {}
    for (const [, name, double, single] of tag.matchAll(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    )) {
      attributes[name] = double ?? single
    }
    const name = attributes[`${android}:name`]
    const removed = tools !== null && attributes[`${tools}:node`] === 'remove'
    if (PERMISSIONS.includes(name) && !removed) found.add(name)
  }
  return [...found]
}

/** Whether a manifest asks Android for exact alarms, by either permission. */
export function declaresExactAlarms(xml) {
  return exactAlarmPermissionsIn(xml).length > 0
}

/**
 * The manifest given, read as a manifest, or an error saying why it cannot be.
 *
 * "No permission found" and "nothing to look in" have to stay two answers. A path Gradle
 * stopped writing to, or a file that is not a manifest, contains no permission either, and
 * read as "not declared" it would agree with a switch that is off, which is the direction
 * that matters for Play. Decided with the comments taken out, like everything else here, so
 * a manifest that exists only inside a comment is not one.
 */
export function verdictOn({ xml, switchOn, path }) {
  if (!/<manifest[\s>/]/.test(withoutXmlComments(xml))) {
    return `${path} does not look like an Android manifest, so it cannot say anything`
  }
  const found = exactAlarmPermissionsIn(xml)
  const declared = found.length > 0
  if (declared === switchOn) return null
  return declared
    ? `${path} declares ${found.join(' and ')} and EXACT_ALARMS_DECLARED is false`
    : `${path} does not declare an exact-alarm permission and EXACT_ALARMS_DECLARED is true`
}

const SWITCH_FILE = 'src/lib/reminders.ts'

/**
 * The check over a list of manifests, returning the exit code.
 *
 * Every file is looked at even when one before it failed, and every failure is reported in
 * the runner's own `::error file=...::` form, so one unreadable path cannot hide what the
 * others say, and cannot end the run without saying why.
 */
export function run({ paths, readFile, log, error }) {
  if (paths.length === 0) {
    error('::error::No manifest was given to check, so nothing was checked.')
    return 1
  }
  let switchOn
  try {
    switchOn = switchIn(readFile(SWITCH_FILE))
  } catch (cause) {
    error(`::error file=${SWITCH_FILE}::${cause.message}`)
    return 1
  }
  let failed = false
  for (const path of paths) {
    let xml
    try {
      xml = readFile(path)
    } catch (cause) {
      error(`::error file=${path}::could not be read (${cause.message}), so it was not checked`)
      failed = true
      continue
    }
    const problem = verdictOn({ xml, switchOn, path })
    if (problem) {
      error(`::error file=${path}::${problem}`)
      failed = true
    } else {
      log(`${path}: agrees (exact alarms ${switchOn ? 'declared' : 'not declared'})`)
    }
  }
  return failed ? 1 : 0
}

if (process.argv[1] && process.argv[1].endsWith('check-exact-alarm.js')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  process.exit(
    run({
      paths: process.argv.slice(2),
      // The switch is found from the repository root; the manifests as given.
      readFile: (path) =>
        readFileSync(path === SWITCH_FILE ? join(root, SWITCH_FILE) : path, 'utf8'),
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    })
  )
}
