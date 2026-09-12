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

function main() {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: node scripts/collect-changelog.js <version>')
    process.exit(1)
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const directory = join(root, 'changelog.d')
  const changelogPath = join(root, 'CHANGELOG.md')

  const names = readdirSync(directory).filter((name) => name.endsWith('.md') && name !== 'README.md')
  const fragments = names.map((name) => ({
    name,
    body: readFileSync(join(directory, name), 'utf8'),
  }))

  const changelog = readFileSync(changelogPath, 'utf8')
  writeFileSync(changelogPath, collect({ changelog, version, fragments }))
  for (const name of names) {
    unlinkSync(join(directory, name))
  }

  console.log(`Collected ${names.length} fragments into ${version}`)
}

// Only when run, not when imported by its tests.
if (process.argv[1] && process.argv[1].endsWith('collect-changelog.js')) {
  main()
}
