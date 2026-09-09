import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = packageJson.version

const cargoTomlPath = join(root, 'src-tauri', 'Cargo.toml')
let cargoToml = readFileSync(cargoTomlPath, 'utf8')
cargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`)
writeFileSync(cargoTomlPath, cargoToml)

console.log(`Synced Cargo.toml to v${version}`)

// Cargo.lock also declares the root package's version, and falling behind breaks nothing
// as long as nobody builds with --locked: cargo rewrites that entry when compiling. But as
// soon as somebody adds --locked to the CI for reproducibility, the release fails with
// "lock file needs to be updated" without the failure having anything to do with the code.
// It had been out of sync since v1.0.1 for exactly that reason: nobody noticed.
//
// The replacement is anchored on the package name on purpose: line 3 of the lock is
// 'version = 4', which is the version of the file FORMAT and must not be touched. Note
// that this is the crate name, not the binary name, so renaming the executable to Daylo
// left this working.
const cargoLockPath = join(root, 'src-tauri', 'Cargo.lock')
let cargoLock = readFileSync(cargoLockPath, 'utf8')
const before = cargoLock
cargoLock = cargoLock.replace(
  /(name = "activity-tracker"\nversion = )"[^"]*"/,
  `$1"${version}"`
)
if (cargoLock === before) {
  console.error(
    'The activity-tracker entry was not found in Cargo.lock: check the package name.'
  )
  process.exit(1)
}
writeFileSync(cargoLockPath, cargoLock)

console.log(`Synced Cargo.lock to v${version}`)
