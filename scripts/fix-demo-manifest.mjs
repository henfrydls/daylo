// Ajusta el manifest de la PWA a la ruta donde se sirve la demo.
//
// Vite reescribe las rutas del index.html con la base, pero NO toca el JSON de public/:
// site.webmanifest se copia literal. Con start_url y scope en "/" y los iconos en rutas
// absolutas, la demo servida bajo /demo/ pediria los iconos a la raiz del sitio -- donde
// esta la landing y no existen -- y el scope de la PWA se solaparia con ella.
//
// Uso: node scripts/fix-demo-manifest.mjs <directorio> <base>

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const [dir, base] = process.argv.slice(2)
if (!dir || !base) {
  console.error('Uso: node scripts/fix-demo-manifest.mjs <directorio> <base>')
  process.exit(2)
}

const ruta = join(dir, 'site.webmanifest')
if (!existsSync(ruta)) {
  console.error(`No existe ${ruta}: revisa el directorio del build.`)
  process.exit(1)
}

const sinBarraFinal = base.endsWith('/') ? base.slice(0, -1) : base
const manifest = JSON.parse(readFileSync(ruta, 'utf8'))

manifest.start_url = `${sinBarraFinal}/`
manifest.scope = `${sinBarraFinal}/`
for (const icono of manifest.icons ?? []) {
  if (typeof icono.src === 'string' && icono.src.startsWith('/')) {
    icono.src = sinBarraFinal + icono.src
  }
}

writeFileSync(ruta, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Manifest ajustado a ${sinBarraFinal}/: start_url, scope e iconos`)
