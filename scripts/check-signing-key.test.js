import { describe, it, expect } from 'vitest'
import { keyIdOf, publicKeyLineOf, signatureLineOf, sameKey } from './check-signing-key.js'

/**
 * The link between the secret in this repository and the key installed copies trust.
 *
 * The fixtures are built from Daylo's real public key, which is public and lives in
 * src-tauri/tauri.conf.json. That matters: a fixture invented to match the parser proves
 * the parser matches the fixture, and the format is the whole subject here.
 */

// The key half of Daylo's own public key file, 34DFDA978AF47824.
const OURS = 'RWQkePSKl9rfNAj4XgXpmZd9yaFNZRJb6NnISXUM6TVo/nFPS3JtomwF'
const OUR_ID = '34DFDA978AF47824'

/** A minisign public key file, base64 encoded the way tauri.conf.json carries it. */
const publicKeyFile = (keyLine) =>
  Buffer.from(
    `untrusted comment: minisign public key: whatever\n${keyLine}\n`,
    'utf8'
  ).toString('base64')

/** What `tauri signer sign` leaves beside the file it signed. */
const signatureFile = (keyLine) =>
  [
    'untrusted comment: signature from tauri secret key',
    keyLine,
    'trusted comment: timestamp:1762099200\tfile:throwaway.txt',
    Buffer.alloc(64, 7).toString('base64'),
    '',
  ].join('\n')

/** A signature line carrying a given key id and nothing else that matters. */
const signedBy = (hexId) => {
  const id = Buffer.from(hexId, 'hex').reverse()
  return Buffer.concat([Buffer.from('Ed', 'ascii'), id, Buffer.alloc(64, 7)]).toString('base64')
}

describe('reading a key id', () => {
  // Minisign prints the id with the bytes the other way round from how it stores them,
  // and the comment on our own key says 34DFDA978AF47824. Getting this backwards would
  // give a check that never matches, which looks exactly like a wrong key.
  it('reads our own key as the id its comment names', () => {
    expect(keyIdOf(OURS)).toBe(OUR_ID)
  })

  it('reads a signature line the same way', () => {
    expect(keyIdOf(signedBy(OUR_ID))).toBe(OUR_ID)
  })

  it('refuses something that is not a minisign line', () => {
    expect(() => keyIdOf('bm90IGEga2V5')).toThrow(/not a minisign/i)
  })
})

describe('finding the line that carries the key', () => {
  it('takes the second line of the public key file', () => {
    expect(publicKeyLineOf(publicKeyFile(OURS))).toBe(OURS)
  })

  it('takes the second line of the signature file', () => {
    expect(signatureLineOf(signatureFile(signedBy(OUR_ID)))).toBe(signedBy(OUR_ID))
  })

  it('refuses a public key that is not a key file', () => {
    expect(() => publicKeyLineOf(Buffer.from('nope', 'utf8').toString('base64'))).toThrow(
      /second line/i
    )
  })
})

describe('the comparison', () => {
  /**
   * The failure this exists for. Both of these are valid keys and both sign happily; the
   * only question that was never asked is whether they are the same key. A release signed
   * by the second one publishes clean and cannot be installed by anybody.
   */
  it('fails when the secret is a different key from the one in the config', () => {
    const verdict = sameKey({
      pubkey: publicKeyFile(OURS),
      signature: signatureFile(signedBy('0123456789ABCDEF')),
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.expected).toBe(OUR_ID)
    expect(verdict.signed).toBe('0123456789ABCDEF')
  })

  it('passes when they are the same key', () => {
    const verdict = sameKey({
      pubkey: publicKeyFile(OURS),
      signature: signatureFile(signedBy(OUR_ID)),
    })
    expect(verdict).toEqual({ ok: true, keyId: OUR_ID })
  })

  // Neither half is a secret: the public key is in the repository and the id is in its own
  // comment. The 32 bytes of key material and the 64 of signature are never read out.
  it('names only the two ids, never any key material', () => {
    const verdict = sameKey({
      pubkey: publicKeyFile(OURS),
      signature: signatureFile(signedBy('0123456789ABCDEF')),
    })
    const said = JSON.stringify(verdict)
    expect(said).not.toContain(OURS)
    expect(said).not.toContain(Buffer.alloc(64, 7).toString('base64'))
  })
})
