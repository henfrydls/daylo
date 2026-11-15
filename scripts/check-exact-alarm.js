import { readFileSync } from 'fs'

/**
 * Whether an Android manifest asks for exact alarms, and carries the Play mark, as expected.
 *
 * Two builds come out of one tree. The APK keeps SCHEDULE_EXACT_ALARM, so that no update of
 * it takes away an exact alarm somebody allowed. The Google Play bundle goes without it,
 * because Play asks for it to be justified and a habit reminder does not need the minute,
 * and it carries a channel mark so the installed app knows it is the Play build. Both come
 * from src-tauri/gen/android/app/src/play/AndroidManifest.xml, which only the Play pass
 * merges.
 *
 * Wrong either way, they fail quietly. A Play bundle with the permission is a declaration
 * Play has to be argued with; an APK without it takes the exact alarm away on update; a
 * bundle without the mark offers updates from outside Play; an APK with it never offers one.
 *
 * So the question is not "which is right" but "is this file what it was expected to be":
 *
 *   node scripts/check-exact-alarm.js --expect declared|absent [--channel play|none] FILE...
 *
 * Run by the unit tests on the hand-written manifests, by Build Check (Android) on the
 * manifests Gradle merged, and by release.yml before and after the two release passes,
 * because a library can declare the permission too and the hand-written file would never
 * show it.
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
 * Every element of one kind in a manifest, as its attributes under the usual names.
 *
 * Comments are taken out first, because the comment beside a line is where it gets
 * explained, and it names the permission or the mark whether or not they are there. XML
 * lets an attribute be quoted either way, and the prefixes are whatever the manifest binds
 * the Android and tools namespaces to, so each attribute comes back as `name`, `value` or
 * `node` whatever prefix it was written with. `removed` says the element is marked
 * `tools:node="remove"`: that is how a manifest takes away what a lower one brought in, so
 * it names the thing to ask for the opposite.
 */
function elementsIn(xml, pattern) {
  const text = withoutXmlComments(xml)
  const android = prefixFor(text, ANDROID_NS, 'android')
  const tools = prefixFor(text, TOOLS_NS, 'tools')
  if (android === null) return []
  return (text.match(pattern) ?? []).map((tag) => {
    const attributes = {}
    for (const [, name, double, single] of tag.matchAll(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    )) {
      attributes[name] = double ?? single
    }
    return {
      name: attributes[`${android}:name`],
      value: attributes[`${android}:value`],
      removed: tools !== null && attributes[`${tools}:node`] === 'remove',
    }
  })
}

/**
 * Every permission line, in every form Android has: `uses-permission`, and
 * `uses-permission-sdk-23` with its older spelling `uses-permission-sdk-m`, which ask for the
 * same thing on Android 6 and up and which Play counts all the same.
 */
const permissionLinesIn = (xml) => elementsIn(xml, /<uses-permission(?:-sdk-23|-sdk-m)?\s[^>]*>/g)

/** The exact-alarm permissions a manifest asks Android for. A removal is not a request. */
export function exactAlarmPermissionsIn(xml) {
  const found = new Set()
  for (const { name, removed } of permissionLinesIn(xml)) {
    if (PERMISSIONS.includes(name) && !removed) found.add(name)
  }
  return [...found]
}

/** Whether a manifest asks Android for exact alarms, by either permission. */
export function declaresExactAlarms(xml) {
  return exactAlarmPermissionsIn(xml).length > 0
}

/**
 * Every permission a manifest takes away from the ones merged under it, whatever it is.
 *
 * All of them and not only the exact-alarm ones, so that the Play overlay can be held to
 * removing that one permission and nothing more.
 */
export function removedPermissionsIn(xml) {
  return [
    ...new Set(
      permissionLinesIn(xml)
        .filter(({ removed }) => removed)
        .map(({ name }) => name)
    ),
  ]
}

/** The meta-data that says which channel a build was made for. Only the Play pass has it. */
const CHANNEL_KEY = 'daylo.channel'

/** The channel a manifest is marked with, or null when it carries no mark. */
export function channelIn(xml) {
  const mark = elementsIn(xml, /<meta-data\s[^>]*>/g).find(
    ({ name, removed }) => name === CHANNEL_KEY && !removed
  )
  return mark?.value ?? null
}

const EXPECTATIONS = ['declared', 'absent']
const CHANNELS = ['play', 'none']

/**
 * The manifest given, held to what was expected of it, or what is wrong with it.
 *
 * "No permission found" and "nothing to look in" have to stay two answers. A path Gradle
 * stopped writing to, or a file that is not a manifest, contains no permission either, and
 * read as "absent" it would pass the Play bundle by accident. Decided with the comments
 * taken out, like everything else here, so a manifest that exists only inside a comment is
 * not one.
 *
 * `channel` is optional: left out, the mark is not looked at. Every problem is said, so one
 * red run names both when both are wrong.
 */
export function verdictOn({ xml, expect, channel, path }) {
  if (!/<manifest[\s>/]/.test(withoutXmlComments(xml))) {
    return `${path} does not look like an Android manifest, so it cannot say anything`
  }
  const problems = []
  const found = exactAlarmPermissionsIn(xml)
  if (expect === 'absent' && found.length > 0) {
    problems.push(
      `${path} declares ${found.join(' and ')} and no exact-alarm permission was expected`
    )
  }
  if (expect === 'declared' && found.length === 0) {
    problems.push(`${path} does not declare an exact-alarm permission and one was expected`)
  }
  const mark = channelIn(xml)
  if (channel === 'play' && mark !== 'play') {
    problems.push(
      mark === null
        ? `${path} carries no channel mark and play was expected`
        : `${path} is marked as the ${mark} channel and play was expected`
    )
  }
  if (channel === 'none' && mark !== null) {
    problems.push(`${path} is marked as the ${mark} channel and no mark was expected`)
  }
  return problems.length === 0 ? null : problems.join('; ')
}

/**
 * What the command line asks for: `--expect` once, `--channel` at most once, and the files.
 * Throws with the reason when it cannot be read, rather than falling back to a default: a
 * guessed expectation passes the one case the check exists for.
 */
export function readArguments(args) {
  const options = {}
  const paths = []
  for (let at = 0; at < args.length; at += 1) {
    const flag = args[at]
    if (flag === '--expect' || flag === '--channel') {
      const key = flag.slice(2)
      const value = args[at + 1]
      const allowed = key === 'expect' ? EXPECTATIONS : CHANNELS
      if (!allowed.includes(value)) {
        throw new Error(
          `${flag} takes ${allowed.join(' or ')}, and was given ${value ?? 'nothing'}`
        )
      }
      if (key in options) throw new Error(`${flag} was given twice`)
      options[key] = value
      at += 1
    } else {
      paths.push(flag)
    }
  }
  if (!options.expect) {
    throw new Error('Say what is expected with --expect declared or --expect absent')
  }
  return { ...options, paths }
}

/**
 * The check over a list of manifests, returning the exit code.
 *
 * Every file is looked at even when one before it failed, and every failure is reported in
 * the runner's own `::error file=...::` form, so one unreadable path cannot hide what the
 * others say, and cannot end the run without saying why.
 */
export function run({ args, readFile, log, error }) {
  let options
  try {
    options = readArguments(args)
  } catch (cause) {
    error(`::error::${cause.message}`)
    return 1
  }
  const { expect, channel, paths } = options
  if (paths.length === 0) {
    error('::error::No manifest was given to check, so nothing was checked.')
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
    const problem = verdictOn({ xml, expect, channel, path })
    if (problem) {
      error(`::error file=${path}::${problem}`)
      failed = true
    } else {
      const mark = channel === undefined ? '' : `, channel mark ${channel}`
      log(`${path}: as expected (exact alarms ${expect}${mark})`)
    }
  }
  return failed ? 1 : 0
}

if (process.argv[1] && process.argv[1].endsWith('check-exact-alarm.js')) {
  process.exit(
    run({
      args: process.argv.slice(2),
      readFile: (path) => readFileSync(path, 'utf8'),
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    })
  )
}
