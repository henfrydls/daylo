import { describe, it, expect } from 'vitest'
import { keyIdOf, publicKeyLineOf, signatureLineOf, sameKey } from './check-signing-key.js'

/**
 * The link between the secret in this repository and the key installed copies trust.
 *
 * Every fixture here is real. The public key is Daylo's own, out of tauri.conf.json. The
 * two signatures were made by `tauri signer sign` itself: one is the signature published
 * beside Daylo_1.5.1_amd64.AppImage, the other was made with a key generated for this test
 * and thrown away.
 *
 * That is not fussiness. The first version of this file built its signatures by hand, in
 * the shape the parser expected, and every test passed while the check rejected the real
 * production signature on two separate counts. A fixture invented to match the parser only
 * ever proves the parser matches the fixture.
 *
 * Neither signature is a secret: a signature is published beside the file it signs, and
 * the second key exists nowhere any more.
 */

/** The key half of Daylo's public key file, which names itself 34DFDA978AF47824. */
const OURS = 'RWQkePSKl9rfNAj4XgXpmZd9yaFNZRJb6NnISXUM6TVo/nFPS3JtomwF'
const OUR_ID = '34DFDA978AF47824'

/** tauri.conf.json carries the whole public key file, base64 encoded. */
const PUBKEY = Buffer.from(
  `untrusted comment: minisign public key: ${OUR_ID}\n${OURS}\n`,
  'utf8'
).toString('base64')

/**
 * Published beside Daylo_1.5.1_amd64.AppImage. Two things about its shape cost this file
 * a rewrite: a tauri .sig is the minisign file base64 encoded onto ONE line, and the
 * signature inside begins with `ED`, not `Ed`, because tauri signs prehashed. Only the
 * public key uses `Ed`.
 */
const SIGNED_BY_OURS =
  'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRa2VQU0tsOXJmTkNrcU1Z' +
  'bkpPMTUyY05xNWtUNUV5RnNmNUt3OGNjUGFHU1VhM0lRNEFiZ3Z3aStMeGZ3T1ZWTWhJbmloNXNjbFh4bmRKcFNrSW9P' +
  'MDdXZ2FFa1J6ZEE4PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkzNTgzMTcxCWZpbGU6RGF5bG9fMS41LjFf' +
  'YW1kNjQuQXBwSW1hZ2UKUHo0OGpyc2toZ2kzN1hXTzlKdENmN3RzK2I4d0F2QmdQTi9YVXRJMjhtOVNaRjdLNTA2TWxu' +
  'NERHcWJkL2RRbUlSbG00c3poMkJCcURjVFhlUTR6Q2c9PQo='

/** The same tool, a key generated for this test: 053BF1C1B3AAD982. */
const SIGNED_BY_ANOTHER =
  'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTQzJhcXp3ZkU3QmVMc1Z2' +
  'SzdNOGx1Tnd2V29EN2daQkM5cjd2czNpaGZFNlJibk1OUlYyT1laTytSSWZmVG1XYzlSOGFmcDYrc0hZOVF4RHVVTlFP' +
  'c1ZkZW1DY21oSkEwPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkzNjU3Nzk5CWZpbGU6bXVlc3RyYS50eHQK' +
  'eVR3ZmVBOWNBMkd0UzdsVjhSYkx2V01MelZrejdWdUZVTHQ3d2RHTTRHOVBQbjNaZGVSTzNrUmZmT1oybVZ2Q0lIZUNW' +
  'djVBbUIvRS95SmJRaW12Q3c9PQo='
const ANOTHER_ID = '053BF1C1B3AAD982'

describe('what a real tauri signature looks like', () => {
  // The two facts the first version of this file got wrong, pinned so they cannot be lost
  // again by someone tidying the parser.
  it('is the minisign file base64 encoded, not the file itself', () => {
    expect(SIGNED_BY_OURS).not.toContain('\n')
    expect(Buffer.from(SIGNED_BY_OURS, 'base64').toString('utf8')).toContain(
      'untrusted comment: signature from tauri secret key'
    )
  })

  it('signs prehashed, so its algorithm is ED and not Ed', () => {
    const file = Buffer.from(SIGNED_BY_OURS, 'base64').toString('utf8')
    const line = Buffer.from(file.split('\n')[1], 'base64')
    expect(line.subarray(0, 2).toString('ascii')).toBe('ED')
  })
})

describe('reading a key id', () => {
  // Minisign prints the id with the bytes the other way round from how it stores them,
  // and the comment on our own key says 34DFDA978AF47824. Getting this backwards gives a
  // check that never matches, which looks exactly like a wrong key.
  it('reads our own public key as the id its comment names', () => {
    expect(keyIdOf(OURS)).toBe(OUR_ID)
  })

  it('refuses something that is not a minisign line', () => {
    expect(() => keyIdOf('bm90IGEga2V5')).toThrow(/not a minisign/i)
  })
})

describe('finding the line that carries the key', () => {
  it('takes the second line of the public key file', () => {
    expect(publicKeyLineOf(PUBKEY)).toBe(OURS)
  })

  it('reads a real tauri signature through its base64 wrapper', () => {
    expect(keyIdOf(signatureLineOf(SIGNED_BY_OURS))).toBe(OUR_ID)
  })

  it('refuses a public key that is not a key file', () => {
    expect(() => publicKeyLineOf(Buffer.from('nope', 'utf8').toString('base64'))).toThrow(
      /second line/i
    )
  })
})

describe('the comparison', () => {
  /**
   * The case this whole file exists for, and now with both halves real: a release signed
   * by the second key publishes perfectly and cannot be installed by anybody.
   */
  it('fails when the secret is a different key from the one in the config', () => {
    const verdict = sameKey({ pubkey: PUBKEY, signature: SIGNED_BY_ANOTHER })
    expect(verdict.ok).toBe(false)
    expect(verdict.expected).toBe(OUR_ID)
    expect(verdict.signed).toBe(ANOTHER_ID)
  })

  /**
   * And the case that matters just as much, which the first version got wrong: the key IS
   * right and the check has to say so. A guard that refuses the correct key is the failure
   * it was written to prevent, arriving by the other door.
   */
  it('passes the signature Daylo actually published', () => {
    expect(sameKey({ pubkey: PUBKEY, signature: SIGNED_BY_OURS })).toEqual({
      ok: true,
      keyId: OUR_ID,
    })
  })

  // Neither id is a secret: the public key is committed and names itself. The 32 bytes of
  // key and the 64 of signature are never read out, on either path.
  it('names only the two ids, never any key material', () => {
    const said = JSON.stringify(sameKey({ pubkey: PUBKEY, signature: SIGNED_BY_ANOTHER }))
    expect(said).not.toContain(OURS)
    expect(said).not.toContain(SIGNED_BY_ANOTHER)
  })
})
