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
