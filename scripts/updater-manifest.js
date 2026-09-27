/**
 * Builds the updater's `latest.json` from the signatures a release already carries.
 *
 * It exists because tauri-action builds one per platform and uploads them all to the same
 * name. With five platforms in the matrix that is five writes to one file, the last one
 * wins, and the manifest ends up describing whichever platform finished last. The app then
 * says "none of the fallback platforms were found", which reads like a broken release and
 * is really a race. Skima has lived with that for a year, detecting it by the text of the
 * error.
 *
 * So the action is told not to upload a manifest at all (`uploadUpdaterJson: false`) and
 * only to upload the `.sig` files (`uploadUpdaterSignatures: true`), and this runs once,
 * afterwards, with every platform already on the release. One writer, no race, and the
 * refusal below turns a missing platform into a red build instead of a silent hole.
 */

/**
 * The platforms the app is published for, and how to recognise each one's artifact.
 *
 * The keys are the updater's own, not ours: they are what the app asks for at runtime.
 * The patterns are matched against the asset name that carries the signature, minus the
 * `.sig`.
 *
 * Only one artifact per platform can be listed, which on Linux is a decision and not a
 * detail: Daylo is published as both a `.deb` and an AppImage, and the manifest has room
 * for one. Whichever is not here gets no update at all, which is why the app asks how it
 * was installed before offering anything. See src-tauri/src/packaging.rs.
 */
export const PLATFORMS = {
  'windows-x86_64': /_x64-setup\.exe$/,
  'windows-aarch64': /_arm64-setup\.exe$/,
  'darwin-x86_64': /_x64\.app\.tar\.gz$/,
  'darwin-aarch64': /_aarch64\.app\.tar\.gz$/,
  // The AppImage and not the .deb. The .deb updates by running dpkg through pkexec, which
  // asks for the administrator's password; the AppImage replaces itself with no prompt at
  // all. Both are signed and either could go here.
  'linux-x86_64': /_amd64\.AppImage$/,
}

/** The platform an asset belongs to, or null if it is not one of ours. */
export function platformOf(assetName) {
  const artifact = assetName.replace(/\.sig$/, '')
  for (const [platform, pattern] of Object.entries(PLATFORMS)) {
    if (pattern.test(artifact)) return platform
  }
  return null
}

/**
 * The manifest, or an error naming exactly what is missing.
 *
 * Refusing is the point. A manifest built from four platforms out of five publishes fine,
 * looks fine, and leaves one platform's worth of people with an app that says there is
 * nothing to update, forever, with nothing anywhere going red.
 */
export function compose({ version, pubDate, notes, signatures, downloadUrl }) {
  const found = new Map()
  const strays = []

  for (const { name, signature } of signatures) {
    const platform = platformOf(name)
    if (platform === null) {
      strays.push(name)
      continue
    }
    if (found.has(platform)) {
      throw new Error(
        `Two artifacts claim ${platform}: ${found.get(platform).name} and ${name}. ` +
          'The manifest has room for one, so this has to be decided rather than guessed.'
      )
    }
    found.set(platform, { name, signature })
  }

  const missing = Object.keys(PLATFORMS).filter((p) => !found.has(p))
  if (missing.length > 0) {
    throw new Error(
      `No signature for: ${missing.join(', ')}.\n` +
        'Every platform in the matrix has to be on the release before the manifest is ' +
        'written, or the ones left out never see an update again.\n' +
        `Signatures that were found: ${[...found.values()].map((f) => f.name).join(', ') || '(none)'}` +
        (strays.length > 0 ? `\nUnrecognised: ${strays.join(', ')}` : '')
    )
  }

  const platforms = {}
  for (const [platform, { name, signature }] of found) {
    platforms[platform] = { signature, url: downloadUrl(name.replace(/\.sig$/, '')) }
  }

  return { version, notes, pub_date: pubDate, platforms }
}

/**
 * What the previous version's note was, from the answer the published manifest gave.
 *
 * Three outcomes and they are not two. **404 is an answer**: it means there is no manifest
 * yet, which is the truth on the first release that carries an updater and has to pass.
 * Anything else that is not a manifest is **not knowing**, and not knowing may not pass:
 * a timeout or a 500 would otherwise let a stale note through in silence, on the one
 * publication where nobody is going to notice.
 *
 * Folding the two together in either direction breaks something. Treating 404 as a failure
 * fails the first release, on the day of the deadline, over a check written to protect the
 * fifth. Treating every failure as "no previous version" turns the check off whenever the
 * network hiccups, which is the shape of every guard we have had to fix this week.
 */
export function previousNoteFrom({ status, body }) {
  if (status === 404) return null

  if (status < 200 || status >= 300) {
    throw new Error(
      `Asking for the published manifest answered ${status}. That is not "there is no ` +
        'previous version", it is "we do not know what the previous version said", and a ' +
        'stale note is exactly what goes unnoticed. Try again rather than publish blind.'
    )
  }

  let manifest
  try {
    manifest = JSON.parse(body)
  } catch (error) {
    throw new Error(
      `The published manifest is not JSON, so what the previous version said cannot be ` +
        `read: ${error.message}`
    )
  }

  const notes = manifest.notes
  return typeof notes === 'string' && notes.trim() !== '' ? notes : null
}

/** What a release note may take up, in characters. About five lines on a phone. */
export const LONGEST_NOTE = 200

/**
 * The one line the app will show about a release, checked rather than trusted.
 *
 * Will, not does: the band that draws it is not written yet, so today this goes into the
 * manifest and nothing reads it. It is checked anyway, because the day something does
 * read it is the day a missing or stale one would be seen by everybody at once.
 *
 * Written by hand, once per version, and deliberately not assembled from changelog.d. The
 * fragments there are written to be read on a page: each spends its best sentences on
 * *why* something changed, which is what makes a changelog worth reading and the first
 * thing that does not fit in a small box. Measured for 1.4.0: 1379 characters over three
 * paragraphs, about thirty-four lines on a phone, and two of the three paragraphs about
 * the same change from different angles. Read in a row that is a story; in a box it is
 * repeating itself. Trimming would not fix it, because what is in the way is a whole
 * paragraph, not words.
 *
 * Three refusals, and the third is the one worth having. A note that is missing or too
 * long is a mistake somebody notices. A note left over from the previous version is a
 * mistake nobody ever notices: it publishes clean, it looks cared for, and it tells people
 * about a release that is not the one they are being offered.
 */
export function checkReleaseNote({ note, previousNote }) {
  const written = (note ?? '').trim()

  if (written === '') {
    throw new Error(
      'The release note is empty. Write one line in changelog.d/RELEASE-NOTE.md saying ' +
        'what this version brings: it is what the update dialog shows, and it is the only ' +
        'thing most people will ever read about this release.'
    )
  }

  if (written.length > LONGEST_NOTE) {
    throw new Error(
      `The release note is ${written.length} characters and the most it may be is ` +
        `${LONGEST_NOTE}. It has one line in a small box, so the limit is what keeps it ` +
        'to one line rather than the good intentions of whoever writes it.'
    )
  }

  if (previousNote !== null && written === previousNote.trim()) {
    throw new Error(
      'The release note is word for word the one the previous version shipped with. ' +
        'Nothing fails when this happens, which is exactly why it is checked: it ' +
        'publishes clean and tells people about a release they already have.'
    )
  }

  return written
}

/**
 * Writing the manifest for a release that is already published.
 *
 * Everything above is pure and tested; this is the thin part that touches the world. It
 * runs once, after every platform has uploaded its signature, and it is the only writer.
 *
 * Note what it does NOT prove and what does: the signatures it reads were made by whatever
 * key the build had. That the key in GitHub's secrets is the one whose public half is in
 * tauri.conf.json is the one link in this chain nobody has watched, and it is what the
 * "Does the signing secret sign?" workflow is for.
 */
async function main() {
  const [tag] = process.argv.slice(2)
  if (!tag) throw new Error('Usage: node scripts/updater-manifest.js <tag>')

  const version = tag.replace(/^v/, '')
  const repo = process.env.GITHUB_REPOSITORY ?? 'henfrydls/daylo'
  const { readFile, writeFile } = await import('node:fs/promises')
  const { execFileSync } = await import('node:child_process')

  // The note is compared against what is published right now, which is the previous
  // version's, because this runs before the new manifest exists.
  const published = `https://github.com/${repo}/releases/latest/download/latest.json`
  const answer = await fetch(published)
  const previousNote = previousNoteFrom({
    status: answer.status,
    body: answer.ok ? await answer.text() : '',
  })

  const note = checkReleaseNote({
    note: await readFile('changelog.d/RELEASE-NOTE.md', 'utf8').catch(() => ''),
    previousNote,
  })

  // The signatures, read from the release rather than from the build, so this sees exactly
  // what the world sees.
  const assets = JSON.parse(
    execFileSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'assets'], {
      encoding: 'utf8',
    })
  ).assets

  const signatures = []
  for (const asset of assets.filter((a) => a.name.endsWith('.sig'))) {
    const response = await fetch(asset.url)
    if (!response.ok) {
      throw new Error(`Could not read ${asset.name}: ${response.status}`)
    }
    signatures.push({ name: asset.name, signature: (await response.text()).trim() })
  }

  const manifest = compose({
    version,
    pubDate: new Date().toISOString(),
    notes: note,
    signatures,
    downloadUrl: (name) => `https://github.com/${repo}/releases/download/${tag}/${name}`,
  })

  await writeFile('latest.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(`latest.json written for ${version}, ${Object.keys(manifest.platforms).length} platforms`)
}

// Only when run, never when imported by the tests.
if (process.argv[1] && process.argv[1].endsWith('updater-manifest.js')) {
  main().catch((error) => {
    console.error(`::error::${error.message}`)
    process.exit(1)
  })
}
