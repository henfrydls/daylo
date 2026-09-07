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

// Cargo.lock tambien declara la version del paquete raiz, y quedarse atras no rompe nada
// mientras nadie compile con --locked: cargo reescribe esa entrada al compilar. Pero en
// cuanto alguien anada --locked al CI por reproducibilidad, la release falla con "lock
// file needs to be updated" sin que el fallo tenga nada que ver con el codigo. Estuvo
// desincronizado desde v1.0.1 justamente por eso: nadie lo notaba.
//
// El reemplazo se ancla en el nombre del paquete a proposito: la linea 3 del lock es
// 'version = 4', que es la version del FORMATO del fichero y no se debe tocar.
const cargoLockPath = join(root, 'src-tauri', 'Cargo.lock')
let cargoLock = readFileSync(cargoLockPath, 'utf8')
const antes = cargoLock
cargoLock = cargoLock.replace(
  /(name = "activity-tracker"\nversion = )"[^"]*"/,
  `$1"${version}"`
)
if (cargoLock === antes) {
  console.error(
    'No se encontro la entrada de activity-tracker en Cargo.lock: revisa el nombre del paquete.'
  )
  process.exit(1)
}
writeFileSync(cargoLockPath, cargoLock)

console.log(`Synced Cargo.lock to v${version}`)
