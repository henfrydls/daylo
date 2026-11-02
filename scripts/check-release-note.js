import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { checkReleaseNote } from './updater-manifest.js'

/**
 * The release note's rules, asked in the pull request instead of at the tag.
 *
 * The rules are `checkReleaseNote`'s and are not restated here: one definition, imported.
 * What this file adds is when they are asked.
 *
 * They used to be asked only inside the `updater-manifest` job, which only a tag runs. By
 * then the release exists and is public, five desktop installers and an APK have been
 * uploaded over twenty to forty minutes, and a refusal leaves a complete release page with
 * no `latest.json` in it. Every installed copy goes on being told it is up to date, and
 * `release-summary` prints "All builds completed successfully" over the top, because it
 * only reads the two build jobs.
 *
 * And the refusal was certain to come. `collect-changelog.js` leaves `RELEASE-NOTE.md`
 * alone on purpose, so nothing empties it: after a release, main still holds the note that
 * release shipped with. Measured on 2026-11-02, with 1.5.1 published five days earlier:
 * `git show v1.5.1:changelog.d/RELEASE-NOTE.md` was byte for byte what main held.
 */

const FILE = 'changelog.d/RELEASE-NOTE.md'

/**
 * The newest version among the tags, or null when there is no version among them.
 *
 * Compared as three numbers rather than as text. Sorted as text, `v1.5.10` sorts before
 * `v1.5.9`, and the note compared against would be the one from two releases back: a
 * check that passes for the wrong reason, which is the thing this whole file exists to
 * take out of the release.
 */
export function newestTag(tags) {
  const versions = tags
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => ({ tag, parts: tag.slice(1).split('.').map(Number) }))

  if (versions.length === 0) return null

  versions.sort(
    (a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]
  )
  return versions[0].tag
}

/**
 * What the note said at a tag, or why that could not be read.
 *
 * The two are different answers and the difference is the point. `previousNoteFrom` in
 * `updater-manifest.js` asks GitHub for the published manifest and reads a failure as "no
 * previous note", which skips the comparison and passes. Here a failure to look is carried
 * out as a failure, and `verdictOn` refuses on it.
 */
export function noteAt(tag, read) {
  try {
    return { found: true, note: read(tag) }
  } catch (error) {
    return { found: false, why: error.message.trim() }
  }
}

/**
 * Whether this note may be released, and if not, the sentence that says why.
 *
 * Returns rather than throws, because the caller's job is to turn the answer into
 * annotations a person reads in a pull request, and a thrown error there is a stack trace
 * in a log.
 */
export function verdictOn({ note, previous }) {
  if (!previous.found) {
    return {
      ok: false,
      problem:
        `I could not read the note the last release shipped with, so I cannot say ` +
        `whether this one is different: ${previous.why}`,
    }
  }

  try {
    checkReleaseNote({ note, previousNote: previous.note })
    return { ok: true }
  } catch (error) {
    return { ok: false, problem: error.message }
  }
}

/**
 * Whether the repository is on its way to a tag, which is when the note has to be fresh.
 *
 * The version pull request raises `package.json` above the newest tag and it stays there
 * until that tag is cut, so the two numbers disagreeing *is* "a release is being
 * prepared". Asking on every pull request instead would paint a typo fix red over a note
 * nobody was due to write yet, and a check that is red for something its author cannot act
 * on is a check people learn to merge past, which costs more than it saves.
 *
 * It still catches the whole of what it is for: at a tag the version is always above the
 * previous one, so there is no tag this can be asleep for.
 */
export function aTagIsComing({ version, tag }) {
  if (tag === null) return true
  return version !== tag.slice(1)
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const note = readFileSync(join(root, FILE), 'utf8')
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  const tags = execFileSync('git', ['tag', '--list'], { cwd: root, encoding: 'utf8' }).split('\n')
  const tag = newestTag(tags)

  if (!aTagIsComing({ version, tag })) {
    console.log(
      `package.json is still ${version}, which is what ${tag} shipped, so no release is ` +
        `being prepared and this note does not have to be rewritten yet.`
    )
    return
  }

  // No version tag at all is a first release: there is nothing for this note to be the
  // same as. Not the same as being unable to look, which is the case below.
  const previous =
    tag === null
      ? { found: true, note: null }
      : noteAt(tag, (at) =>
          execFileSync('git', ['show', `${at}:${FILE}`], { cwd: root, encoding: 'utf8' })
        )

  const verdict = verdictOn({ note, previous })

  if (verdict.ok) {
    const against = tag === null ? 'no earlier release' : tag
    console.log(`The release note is ready, and is not the one ${against} shipped with.`)
    return
  }

  console.error(`::error file=${FILE}::${verdict.problem}`)
  console.error(
    `::error file=${FILE}::Write this version's note in ${FILE}, in the version pull ` +
      `request, beside the collect-changelog run. It is what the update dialog shows, and ` +
      `at tag time this same refusal arrives after the installers are already published.`
  )
  process.exit(1)
}

// Only when run, not when imported by its tests.
if (process.argv[1] && process.argv[1].endsWith('check-release-note.js')) {
  main()
}
