import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * Joins the fragments in `changelog.d/` into a new section of the changelog.
 *
 * One file per change means two branches never write the same lines, which is the whole
 * reason this exists: the Unreleased section collided three times in a single day while
 * 1.2 was being assembled, and each collision cost a merge, a resolution and a re-run of
 * the checks on a pull request that was already approved.
 */

const FRAGMENT = /^(\d+)-[a-z0-9-]+\.md$/

/**
 * Which files in `changelog.d/` are fragments of the changelog.
 *
 * Two files live there that are not, and each would break this differently. `README.md`
 * explains what belongs in a fragment. `RELEASE-NOTE.md` is the one line the update
 * dialog shows, added in 1.4, and before this function existed it went straight into
 * `collect()` and stopped the release with "RELEASE-NOTE.md is not named after a pull
 * request" — the first step of a publication, failing on the day of one, over a file that
 * is supposed to be there.
 *
 * Named and exported rather than written inline in main() so it can be tested. It was
 * inline, which is why nothing caught this.
 */
export function isFragment(name) {
  return name.endsWith('.md') && name !== 'README.md' && name !== 'RELEASE-NOTE.md'
}

/** Where a fragment's name comes from: the pull request it belongs to, and its title. */
export function nameOf(pullRequest, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '')
  return `${pullRequest}-${slug}.md`
}

/**
 * The new file's contents. Pure on purpose: the ordering and the refusals are the part
 * worth testing, and they have nothing to do with a disk.
 */
export function collect({ changelog, version, fragments }) {
  if (fragments.length === 0) {
    throw new Error(
      'No fragments in changelog.d/. A release with nothing to say is more likely a ' +
        'forgotten fragment than a silent release.'
    )
  }

  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) {
    throw new Error(`The changelog already has a section for ${version}.`)
  }

  const ordered = fragments
    .map((fragment) => {
      const match = FRAGMENT.exec(fragment.name)
      if (!match) {
        throw new Error(
          `${fragment.name} is not named after a pull request. Use <number>-<slug>.md, ` +
            'so the release reads in the order the changes landed.'
        )
      }
      // As a number. Sorted as text, "9" would come after "60".
      return { order: Number(match[1]), body: fragment.body.trim() }
    })
    .sort((a, b) => a.order - b.order)

  const section = `## ${version}\n\n${ordered.map((f) => f.body).join('\n\n')}\n`

  const firstSection = changelog.search(/^## /m)
  if (firstSection === -1) {
    return `${changelog.trimEnd()}\n\n${section}`
  }
  return `${changelog.slice(0, firstSection)}${section}\n${changelog.slice(firstSection)}`
}

/**
 * The section this version would get, pulled back out of the joined changelog.
 *
 * It exists for the dry run: the only honest way to show what would be written is to
 * write it and read it back, rather than to describe it a second time and risk the
 * description drifting from the thing.
 */
export function sectionOf(changelog, version) {
  const start = changelog.indexOf(`## ${version}\n`)
  if (start === -1) return ''
  const next = changelog.indexOf('\n## ', start + 1)
  return changelog.slice(start, next === -1 ? undefined : next).trimEnd()
}

/**
 * A version, or a reason it is not one.
 *
 * It refuses a flag, and that is not pedantry: running this with `--help` wrote a section
 * called `## --help` into the changelog and emptied changelog.d, because the script has no
 * help and takes whatever it is handed as the version. Nothing is reversible here except
 * through git, and a fragment written minutes earlier is not in git yet.
 */
export function versionFrom(args) {
  // An option this does not know is refused rather than ignored. Ignoring it is the same
  // accident through a politer door: `--dryrun 1.4.1`, with the typo, would have run for
  // real while whoever typed it believed they were looking first.
  const unknown = args.find((arg) => arg.startsWith('-') && arg !== '--dry-run')
  if (unknown !== undefined) {
    return { error: `I do not know the option "${unknown}". The only one is --dry-run.` }
  }

  const version = args.find((arg) => !arg.startsWith('-'))
  if (version === undefined) return { error: 'No version given.' }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return { error: `"${version}" is not a version. It has to look like 1.4.1.` }
  }
  return { version }
}

function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry-run')
  const { version, error } = versionFrom(args)
  if (error) {
    console.error(error)
    console.error('Usage: node scripts/collect-changelog.js <version> [--dry-run]')
    console.error('  --dry-run  print what it would do, and write nothing')
    process.exit(1)
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const directory = join(root, 'changelog.d')
  const changelogPath = join(root, 'CHANGELOG.md')

  const names = readdirSync(directory).filter(isFragment)
  const fragments = names.map((name) => ({
    name,
    body: readFileSync(join(directory, name), 'utf8'),
  }))

  const changelog = readFileSync(changelogPath, 'utf8')
  const next = collect({ changelog, version, fragments })

  if (dry) {
    console.log(sectionOf(next, version))
    console.log('')
    console.log(`Would write that section and remove ${names.length} fragments:`)
    for (const name of names) console.log(`  ${name}`)
    console.log('Nothing was written.')
    return
  }

  writeFileSync(changelogPath, next)
  for (const name of names) {
    unlinkSync(join(directory, name))
  }

  console.log(`Collected ${names.length} fragments into ${version}`)
}

// Only when run, not when imported by its tests.
if (process.argv[1] && process.argv[1].endsWith('collect-changelog.js')) {
  main()
}
