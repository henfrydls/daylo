// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'
import caniuse from 'caniuse-lite'
import {
  FEATURES,
  ceilingFor,
  check,
  featuresIn,
  minSdkFrom,
  report,
  withoutSupports,
} from './css-reach.mjs'

const root = resolve(import.meta.dirname, '..')

/** The stylesheet as it would ship, built here rather than read off a stale dist/. */
async function shippedCss() {
  const result = await build({ root, logLevel: 'silent', build: { write: false } })
  const outputs = Array.isArray(result) ? result[0].output : result.output
  const css = outputs.filter((o) => o.type === 'asset' && o.fileName.endsWith('.css'))
  expect(css.length).toBeGreaterThan(0)
  return css.map((o) => String(o.source)).join('\n')
}

const minSdk = () =>
  minSdkFrom(readFileSync(resolve(root, 'src-tauri/gen/android/app/build.gradle.kts'), 'utf8'))

// This is the check itself. Everything below it tests the parts.
describe('what we ship against the oldest phone we promise', () => {
  it('renders on every Android the build says it supports', async () => {
    const result = check(await shippedCss(), minSdk())

    expect(report(result)).toBeTruthy()
    expect(result.beyond, report(result)).toEqual([])
  }, 60_000)
})

describe('the ceiling', () => {
  it('is the last WebView the declared minSdk can ever reach', () => {
    expect(ceilingFor(24).chromium).toBe(119)
    expect(ceilingFor(25).chromium).toBe(119)
    expect(ceilingFor(26).chromium).toBe(138)
    expect(ceilingFor(28).chromium).toBe(138)
    expect(ceilingFor(29).chromium).toBe(Infinity)
    expect(ceilingFor(34).chromium).toBe(Infinity)
  })

  it('is read from the Android build file, not repeated here', () => {
    expect(minSdkFrom('    minSdk = 24\n    targetSdk = 36')).toBe(24)
    expect(() => minSdkFrom('targetSdk = 36')).toThrow(/minSdk/)
  })
})

// Tailwind writes its browser sniffing in CSS. Read literally, a stylesheet appears to
// demand the very features it is testing for, which is the opposite of what the test
// means. Scanning the file as it comes made it report Chromium 119 for relative colours
// used only inside an @supports condition.
describe('a guard is not a requirement', () => {
  it('ignores what is only inside an @supports', () => {
    const css = '.a{color:red}@supports (color:color-mix(in lab,red,red)){.b{color:color-mix(in lab,red,red)}}.c{color:blue}'

    expect(withoutSupports(css)).toBe('.a{color:red}.c{color:blue}')
    expect(featuresIn(css).map((f) => f.name)).not.toContain('color-mix()')
  })

  it('still counts what is outside one', () => {
    const css = '@supports (color:color-mix(in lab,red,red)){.b{color:red}}.c{color:oklch(70% .1 160)}'

    expect(featuresIn(css).map((f) => f.name)).toContain('oklch()')
  })

  it('survives an @supports that never closes', () => {
    expect(() => featuresIn('.a{color:red}@supports (x:y){.b{')).not.toThrow()
  })
})

describe('when something is out of reach', () => {
  // The person reading this a year from now has none of today's context, so the message
  // has to carry all of it: what, how far, which phones, and what to do.
  it('says the feature, its Chromium, the ceiling and who is left out', () => {
    const css = '.a{color:oklch(70% .1 160)}.b{field-sizing:content}'
    const result = check(css, 24)

    expect(result.ok).toBe(false)
    const said = report(result)
    expect(said).toContain('field-sizing')
    expect(said).toContain('Chromium 123')
    expect(said).toContain('WebView 119')
    expect(said).toContain('Android 7.0 and 7.1')
    expect(said).toContain('raise minSdk')
    // oklch is inside the ceiling, so it is not one of the complaints.
    expect(result.beyond.map((f) => f.name)).toEqual(['field-sizing'])
  })

  it('is quiet when the same CSS is promised to newer phones only', () => {
    expect(check('.b{field-sizing:content}', 29).ok).toBe(true)
  })
})

// The versions in the table are written down so the message can name one without sending
// the reader anywhere. Written down means they can drift. Where caniuse-lite carries the
// same feature, this refuses to let them.
describe('the versions are not just asserted', () => {
  const chromeFrom = (key) => {
    const data = caniuse.feature(caniuse.features[key])
    return Object.entries(data.stats.chrome)
      .filter(([, support]) => support.startsWith('y'))
      .map(([version]) => parseFloat(version))
      .filter((version) => !Number.isNaN(version))
      .sort((a, b) => a - b)[0]
  }

  it.each(FEATURES.filter((f) => f.caniuse))('$name agrees with caniuse-lite', (feature) => {
    expect(chromeFrom(feature.caniuse)).toBe(feature.chromium)
  })

  it('checks a real number of them, so an empty list cannot pass for agreement', () => {
    expect(FEATURES.filter((f) => f.caniuse).length).toBeGreaterThanOrEqual(5)
  })

  it('gives every feature a version, cross-checkable or not', () => {
    for (const feature of FEATURES) {
      expect(Number.isFinite(feature.chromium), feature.name).toBe(true)
    }
  })
})
