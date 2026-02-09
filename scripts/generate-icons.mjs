/**
 * Generates Daylo app icons with white background and rounded corners.
 * Usage: node scripts/generate-icons.mjs
 */
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const iconsDir = join(root, 'src-tauri', 'icons')
const sourceIcon = join(iconsDir, 'icon.png')

// Install sharp temporarily
console.log('Installing sharp...')
execSync('npm install --no-save sharp', { cwd: root, stdio: 'inherit' })

const sharp = (await import('sharp')).default

// Read the source icon
const image = sharp(sourceIcon)
const metadata = await image.metadata()
const { width, height } = metadata
console.log(`Source icon: ${width}x${height}`)

// First, get the raw pixels to restore the original white background
const raw = await image.raw().toBuffer()
const channels = metadata.channels
const pixels = width * height

// Restore white background (undo previous transparency)
const opaqueBuffer = Buffer.alloc(pixels * 4)
for (let i = 0; i < pixels; i++) {
  const srcIdx = i * channels
  const dstIdx = i * 4
  const r = raw[srcIdx]
  const g = raw[srcIdx + 1]
  const b = raw[srcIdx + 2]
  const a = channels === 4 ? raw[srcIdx + 3] : 255

  if (a === 0) {
    // Transparent pixel → white
    opaqueBuffer[dstIdx] = 255
    opaqueBuffer[dstIdx + 1] = 255
    opaqueBuffer[dstIdx + 2] = 255
    opaqueBuffer[dstIdx + 3] = 255
  } else {
    opaqueBuffer[dstIdx] = r
    opaqueBuffer[dstIdx + 1] = g
    opaqueBuffer[dstIdx + 2] = b
    opaqueBuffer[dstIdx + 3] = a
  }
}

// Create opaque image
const opaqueImage = sharp(opaqueBuffer, {
  raw: { width, height, channels: 4 },
})
const opaquePng = await opaqueImage.png().toBuffer()

// Create rounded corner mask as SVG
const radius = Math.round(width * 0.18) // ~18% corner radius (modern app style)
const roundedMask = Buffer.from(
  `<svg width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`
)

// Apply rounded corners: composite the opaque image with the rounded mask
const roundedIcon = await sharp(opaquePng)
  .composite([
    {
      input: roundedMask,
      blend: 'dest-in',
    },
  ])
  .png()
  .toFile(sourceIcon)

console.log(`Created icon with rounded corners (radius: ${radius}px)`)

// Regenerate all icon sizes with tauri icon
console.log('Regenerating all icon sizes...')
execSync(`npx tauri icon "${sourceIcon}"`, { cwd: root, stdio: 'inherit' })

console.log('All icons regenerated successfully!')
