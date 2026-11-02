import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * Whether the signing secret is the key installed copies trust, and not merely a key.
 *
 * "Does the signing secret sign?" signed a throwaway file and asked whether the command
 * exited zero. That proves the secret is one whole key with its own password, which is
 * worth knowing and is not the question. A perfectly valid key that is not the one in
 * `plugins.updater.pubkey` passes that check and publishes a release nobody can install:
 * every copy out there verifies the update against the public key it was built with, and
 * refuses with "signature verification failed".
 *
 * The comment on `scripts/updater-manifest.js:194-196` said this workflow already covered
 * that, and named it "the one link nobody has looked at". It was not covered. This is it.
 *
 * What is compared is the key id. A minisign key id is derived from the key pair and is
 * carried, in the clear, in both halves: the public key file prints it in its own comment,
 * and every signature begins with it. Two shapes have to be got right to read it, and the
 * first version of this file got both wrong while its own tests passed: a tauri .sig is
 * base64 around the minisign file, and the signature inside is `ED` where the public key
 * is `Ed`. The fixtures beside this are real signatures now, for that reason. Two keys agreeing on an id are the same key. The 32
 * bytes of public key and the 64 of signature are never read out of either file, so there
 * is nothing here that could leak, and the ids themselves are public by construction.
 *
 * What this does NOT do is verify the signature arithmetically. That would want a minisign
 * binary on the runner and the right answer about which of the two hashing modes tauri
 * emits, and getting that wrong fails a correct key, which is worse than the gap it
 * closes. The id answers the question that was open: is this the right key.
 */

/** Both files carry the same preamble: two bytes of algorithm, then eight of key id. */
const ALGORITHM = 2
const KEY_ID = 8

/**
 * The two algorithms minisign writes, and both of them turn up here.
 *
 * `Ed` is a plain Ed25519 signature over the file. `ED` is the same over a BLAKE2b hash of
 * it, which is what minisign calls prehashed and what tauri signs with. So a public key
 * says `Ed` and the signature beside a release says `ED`, in the same pair, for the same
 * key. Accepting only one of them rejected every real signature Daylo has ever published,
 * which was the first version of this file.
 */
const ALGORITHMS = ['Ed', 'ED']

/**
 * The key id a minisign line belongs to, as minisign itself writes it.
 *
 * The bytes come out of the file in the opposite order from the way they are printed. Our
 * own key stores `2478F48A97DADF34` and its comment calls it `34DFDA978AF47824`, which is
 * the name it is known by. Reading it the stored way would give a check that never matches
 * anything, and a check that never matches looks exactly like a wrong key.
 */
export function keyIdOf(line) {
  const raw = Buffer.from(line.trim(), 'base64')

  if (
    raw.length < ALGORITHM + KEY_ID ||
    !ALGORITHMS.includes(raw.subarray(0, ALGORITHM).toString('ascii'))
  ) {
    throw new Error('That is not a minisign line: it begins with neither Ed nor ED.')
  }

  return Buffer.from(raw.subarray(ALGORITHM, ALGORITHM + KEY_ID))
    .reverse()
    .toString('hex')
    .toUpperCase()
}

/** The key line of the public key, which tauri.conf.json carries as a base64 of the file. */
export function publicKeyLineOf(pubkey) {
  const file = Buffer.from(pubkey.trim(), 'base64').toString('utf8')
  const line = file.split('\n')[1]

  if (!line) {
    throw new Error('The pubkey has no second line, so it is not a minisign public key file.')
  }
  return line.trim()
}

/**
 * The signature line of what `tauri signer sign` leaves beside the file it signed.
 *
 * A tauri .sig is not the minisign file: it is that file base64 encoded onto a single
 * line, the same way tauri.conf.json carries the public key, and the same way the string
 * goes into latest.json. Measured on 2026-11-02 against the signature published beside
 * Daylo_1.5.1_amd64.AppImage, and against a file signed locally with a throwaway key:
 * `tauri signer sign` and the bundler produce the same shape, so what this reads on the
 * runner is what a release carries.
 *
 * The unwrapped file is still accepted, because minisign itself writes one and somebody
 * passing a hand made signature should not be told it is malformed.
 */
export function signatureLineOf(text) {
  const inside = text.includes('untrusted comment:')
    ? text
    : Buffer.from(text.trim(), 'base64').toString('utf8')

  const line = inside.split('\n')[1]

  if (!line) {
    throw new Error('The signature has no second line, so it is not a minisign signature.')
  }
  return line.trim()
}

/**
 * Whether the two halves name the same key.
 *
 * Returns rather than throws: the caller turns this into something a person reads at the
 * moment a key is being set, and the two ids are the whole of what they need.
 */
export function sameKey({ pubkey, signature }) {
  const expected = keyIdOf(publicKeyLineOf(pubkey))
  const signed = keyIdOf(signatureLineOf(signature))

  if (expected !== signed) return { ok: false, expected, signed }
  return { ok: true, keyId: expected }
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const [, , signaturePath] = process.argv

  if (!signaturePath) {
    console.error('::error::Usage: node scripts/check-signing-key.js <file.sig>')
    process.exit(1)
  }

  const { plugins } = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const pubkey = plugins?.updater?.pubkey

  if (!pubkey) {
    console.error('::error::There is no plugins.updater.pubkey in tauri.conf.json to compare to.')
    process.exit(1)
  }

  let verdict
  try {
    verdict = sameKey({ pubkey, signature: readFileSync(signaturePath, 'utf8') })
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }

  if (verdict.ok) {
    console.log(`The secret is key ${verdict.keyId}, which is the one in tauri.conf.json.`)
    console.log('An update signed with it is one every installed copy will accept.')
    return
  }

  console.error('::error::The secret is a valid key, but it is NOT the key Daylo is built to')
  console.error('::error::trust. A release signed with it would publish perfectly and every')
  console.error('::error::installed copy would refuse the update it offers.')
  console.error(`::error::tauri.conf.json expects key ${verdict.expected}.`)
  console.error(`::error::The secret in this repository is key ${verdict.signed}.`)
  console.error('::error::Either set TAURI_SIGNING_PRIVATE_KEY from the other key file, or,')
  console.error('::error::if this key is meant to replace the old one, update the pubkey in')
  console.error('::error::tauri.conf.json and know that copies already installed will not be')
  console.error('::error::able to update: they trust the key they were built with.')
  process.exit(1)
}

// Only when run, not when imported by its tests.
if (process.argv[1] && process.argv[1].endsWith('check-signing-key.js')) {
  main()
}
