/**
 * Can the oldest phone we claim to support render the CSS we ship?
 *
 * The two numbers that have to meet are a long way apart in the repository. One is
 * `minSdk` in the Android build file, which today is 24, Android 7.0, and which the
 * release notes turn into "phones and tablets from about 2017 onwards". The other is
 * whatever CSS Tailwind emits, which nobody writes and nobody reads.
 *
 * They met by luck once. Tailwind 4 emits oklch(), which Chromium learned in 111, and
 * Android 7 can reach WebView 119 — eight versions of margin that nobody chose. The day
 * that margin goes, the promise becomes false for every Android 7 device and there is
 * nothing the person holding one can do about it: 119 is the last WebView ever published
 * for that release. This is the check that notices.
 *
 * It needs no network. caniuse-lite is already here, arriving with browserslist.
 */

/**
 * The newest WebView each Android release can ever reach.
 *
 * WebView and Chrome for Android ship together with the same version numbers, and WebView
 * arrives through the Play Store rather than with the system, so what caps it is not the
 * phone's age but the last Chrome release Google built for that Android version.
 *
 * Recorded 2026-09-12, from Chromium's own WebView documentation for the shared release
 * train, APKMirror for the minapi each WebView build declares, and Google's announcements
 * of the two cut-offs. A newer cut-off would only lower a ceiling, never raise one, so an
 * out-of-date table here fails safe: it can pass something it should not only if Google
 * un-drops an Android version, which has never happened.
 */
const CEILINGS = [
  { minSdk: 24, android: '7.0 and 7.1', chromium: 119 },
  { minSdk: 26, android: '8.0, 8.1 and 9', chromium: 138 },
  // Android 10 and up still get whatever is current, so there is no ceiling to meet.
  { minSdk: 29, android: '10 and up', chromium: Infinity },
]

/**
 * What the shipped stylesheet uses that an old engine might not have.
 *
 * Every entry carries its own Chromium version rather than looking it up, so the failure
 * message can name a number without the reader going anywhere. `caniuse` is the key of
 * the same feature in caniuse-lite where it has one, and the test asserts the two agree:
 * that is what keeps these constants from drifting quietly.
 */
export const FEATURES = [
  { name: '@layer', chromium: 99, caniuse: 'css-cascade-layers', find: /@layer\b/g },
  { name: 'oklch()', chromium: 111, caniuse: 'css-lch-lab', find: /\boklch\(/g },
  { name: 'oklab()', chromium: 111, caniuse: 'css-lch-lab', find: /\boklab\(/g },
  { name: ':has()', chromium: 105, caniuse: 'css-has', find: /:has\(/g },
  { name: ':is()', chromium: 88, caniuse: 'css-matches-pseudo', find: /:is\(/g },
  { name: ':where()', chromium: 88, caniuse: 'css-matches-pseudo', find: /:where\(/g },
  { name: 'gap in flexbox', chromium: 84, caniuse: 'flexbox-gap', find: /[{;]gap:/g },
  // caniuse-lite does not carry these four, so the versions are from their own release
  // notes. The test cannot cross-check them; it can only check they are numbers.
  { name: 'color-mix()', chromium: 111, find: /\bcolor-mix\(/g },
  { name: '@property', chromium: 85, find: /@property\b/g },
  { name: 'aspect-ratio', chromium: 88, find: /[{;]aspect-ratio:/g },
  { name: 'inset shorthand', chromium: 87, find: /[{;]inset:/g },
  { name: '@container', chromium: 105, find: /@container\b/g },
  { name: '@starting-style', chromium: 117, find: /@starting-style\b/g },
  { name: 'relative colors', chromium: 119, find: /\b(?:rgb|hsl|oklch|oklab)\(\s*from\b/g },
  { name: 'text-wrap: balance', chromium: 114, find: /text-wrap:\s*balance/g },
  { name: 'field-sizing', chromium: 123, find: /[{;]field-sizing:/g },
]

/** The minSdk the Android build declares, read rather than repeated. */
export function minSdkFrom(buildGradle) {
  const match = /^\s*minSdk\s*=\s*(\d+)/m.exec(buildGradle)
  if (!match) {
    throw new Error('no minSdk in the Android build file: the ceiling cannot be worked out')
  }
  return Number(match[1])
}

/** The newest WebView a phone at this minSdk can ever be running. */
export function ceilingFor(minSdk) {
  let ceiling = CEILINGS[0]
  for (const entry of CEILINGS) {
    if (minSdk >= entry.minSdk) ceiling = entry
  }
  return ceiling
}

/**
 * Everything inside an `@supports`, condition and body both, cut out.
 *
 * Without this the check reads its own guards as requirements. Tailwind writes its
 * browser sniffing in CSS — `@supports (color:color-mix(in lab,red,red))` around the
 * rules that use color-mix, and a condition mentioning `rgb(from red r g b)` whose whole
 * purpose is to be false on engines that lack relative colours. Scanning the file
 * literally, the stylesheet appeared to demand Chromium 119 for a feature it uses
 * precisely because it does not demand it.
 *
 * So: only what is outside every `@supports` counts. Something guarded degrades, and
 * something ungated breaks. It is the second kind this is looking for.
 */
export function withoutSupports(css) {
  const pieces = []
  let from = 0
  for (;;) {
    const at = css.indexOf('@supports', from)
    if (at === -1) {
      pieces.push(css.slice(from))
      break
    }
    pieces.push(css.slice(from, at))
    const opens = css.indexOf('{', at + '@supports'.length)
    if (opens === -1) break
    let depth = 0
    let index = opens
    for (; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    from = index + 1
  }
  return pieces.join('')
}

/** Which of the features above the stylesheet actually requires, and how often. */
export function featuresIn(css) {
  const required = withoutSupports(css)
  return FEATURES.map((feature) => ({
    ...feature,
    uses: (required.match(feature.find) || []).length,
  })).filter((feature) => feature.uses > 0)
}

/**
 * The whole check. Returns the features that are out of reach, worst first, and enough
 * around them to write a message somebody can act on a year from now.
 */
export function check(css, minSdk) {
  const ceiling = ceilingFor(minSdk)
  const used = featuresIn(css)
  const beyond = used
    .filter((feature) => feature.chromium > ceiling.chromium)
    .sort((a, b) => b.chromium - a.chromium)
  return { ceiling, minSdk, used, beyond, ok: beyond.length === 0 }
}

/** What to print. Separate from the check so the test can read it. */
export function report({ ceiling, minSdk, used, beyond }) {
  if (!beyond.length) {
    const highest = used.reduce((a, b) => (a.chromium > b.chromium ? a : b), used[0])
    return (
      `The stylesheet needs Chromium ${highest ? highest.chromium : 0}` +
      `${highest ? ` (${highest.name})` : ''}. ` +
      `minSdk ${minSdk} reaches WebView ${ceiling.chromium}. ` +
      `${used.length} features checked.`
    )
  }
  const lines = [
    `The stylesheet uses ${beyond.length} thing${beyond.length > 1 ? 's' : ''} that no ` +
      `phone at minSdk ${minSdk} can render.`,
    '',
    `Android ${ceiling.android} can reach WebView ${ceiling.chromium} and no further: ` +
      `that is the last one Google published for it, so a person on such a phone cannot ` +
      `fix this by updating anything.`,
    '',
  ]
  for (const feature of beyond) {
    lines.push(
      `  ${feature.name} needs Chromium ${feature.chromium}, ${feature.uses} ` +
        `use${feature.uses > 1 ? 's' : ''} — ${feature.chromium - ceiling.chromium} ` +
        `beyond the ceiling`
    )
  }
  lines.push(
    '',
    'Either stop emitting it, or raise minSdk and say so in the release notes, which',
    'currently promise phones from about 2017 onwards.'
  )
  return lines.join('\n')
}
