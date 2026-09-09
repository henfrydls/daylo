#!/usr/bin/env bash
#
# Comprueba que no hay codigo de analitica ni telemetria en lo que se le pase.
#
# Daylo promete que los datos del usuario no salen de su dispositivo, y esa promesa se
# sostiene enteramente sobre que este repositorio no contenga nada que llame a casa. Este
# script es el que convierte la promesa en algo que se verifica en cada cambio, en vez de
# depender de que alguien se acuerde de mirarlo en la revision.
#
# Vive en un solo sitio a proposito: lo llaman el CI de cada PR y el job que construye la
# demo, y si la lista estuviera duplicada en los dos workflows derivarian, con lo que uno
# de los dos daria una garantia mas debil de lo que promete.
#
# Uso: scripts/check-no-analytics.sh <ruta> [ruta...]

set -uo pipefail

# Hosts a los que se enviarian datos. 'analytics' va acotado a contexto de host: sin eso,
# un comentario que diga "no analytics" en el codigo rompe el build, y en este repositorio
# esa frase es probable justamente por lo que estamos defendiendo.
#
# Los nombres sueltos van con \b por la misma razon, y no es teorico: 'rollbar' sin limites
# casa dentro de 'scrollbar', asi que un 'scrollbar-width: thin' en cualquier hoja de estilos
# ponia todos los PR en rojo diciendo que la app tiene telemetria. Los que llevan dominio
# (plausible\.io, sentry\.io, amplitude\.com, segment\.(com|io)) ya estan anclados por el punto.
# Nuestro propio host va explicito: 'analytics.henfrydls.com' NO casa con el patron
# generico de abajo, porque ahi 'analytics' es un subdominio y el TLD viene despues de otra
# etiqueta. Sin esta linea, pegar el script de Umami de la landing en la app pasaba el check
# limpio: el guardian era ciego justo al unico proveedor que usamos. deploy/build.sh del
# sitio si lo listaba, y esa asimetria entre dos listas con el mismo proposito era la pista.
HOSTS='analytics\.henfrydls\.com'
HOSTS="$HOSTS"'|[a-z0-9-]*analytics\.(com|io|js|net)|\bumami\b|\bgoogle-analytics\b|\bgoogletagmanager\b'
HOSTS="$HOSTS"'|plausible\.io|\bmatomo\b|\bmixpanel\b|segment\.(com|io)|amplitude\.com|sentry\.io'
HOSTS="$HOSTS"'|\bposthog\b|\bhotjar\b|\bfullstory\b|\bdatadoghq\b|\bbugsnag\b|\brollbar\b|\bnewrelic\b'

# APIs de pagina que solo existen para medir. Con limites de palabra, para que no casen
# dentro de identificadores mas largos.
APIS='\bgtag\(|\bdataLayer\b|\b_paq\b|\bnavigator\.sendBeacon\b'

# Nombres de paquete npm: un SDK declarado como dependencia no menciona su propio host en
# package.json, y los nombres desaparecen del bundle minificado porque los import se
# resuelven. Sin esto, un SDK entrado como dependencia transitiva no aparece en ningun
# sitio.
PAQUETES='@sentry/|posthog-js|mixpanel-browser|amplitude-js|@amplitude/|plausible-tracker'
PAQUETES="$PAQUETES"'|react-ga|@vercel/analytics|@datadog/|logrocket|@microsoft/clarity'
PAQUETES="$PAQUETES"'|web-vitals'

# Crates de Rust. Anadir src-tauri/ a los objetivos no basta por si solo: los nombres de
# los paquetes npm no casan con los de cargo -- un SDK de Rust se declara como 'sentry' y
# no como '@sentry/' -- asi que sin esta lista la puerta al binario empaquetado, que es
# justo lo que la promesa protege, quedaba abierta. Con limites de palabra para no casar
# dentro de identificadores mas largos.
CRATES='\bsentry\b|\bsentry-core\b|\bopentelemetry\b|\baptabase\b|\bposthog-rs\b'
CRATES="$CRATES"'|\btauri-plugin-aptabase\b|\bmixpanel\b|\bsegment-rs\b'

# Dos modos, y la distincion importa:
#
#   (por defecto)     hosts + APIs + nombres de paquete y de crate
#   --solo-textos     solo hosts + APIs
#
# El segundo existe por package-lock.json y por dist/. El lock contiene el arbol COMPLETO
# de dependencias, devDependencies incluidas y con sus peers opcionales: '@opentelemetry/api'
# aparece ahi como peer de vitest, no esta instalado y no llega al bundle. Buscar nombres de
# paquete en el lock da ese falso positivo el primer dia.
#
# Lo que de verdad cubre el riesgo de un SDK entrado como dependencia transitiva es buscar
# sus HOSTS en dist/: los nombres de paquete desaparecen al minificar porque los import se
# resuelven, pero las cadenas de URL no se minifican. Si el SDK se usa, su host esta en el
# bundle; si no se usa, no hay riesgo que cubrir.
if [ "${1:-}" = "--solo-textos" ]; then
  PATRONES="$HOSTS|$APIS"
  shift
else
  PATRONES="$HOSTS|$APIS|$PAQUETES|$CRATES"
fi

if [ "$#" -eq 0 ]; then
  echo "Uso: $0 [--solo-textos] <ruta> [ruta...]" >&2
  exit 2
fi

encontrado=0
for objetivo in "$@"; do
  [ -e "$objetivo" ] || continue
  # -I salta los binarios: sin eso, un fichero binario en dist/ imprime "Binary file
  # matches" sin numero de linea, que no sirve para diagnosticar nada.
  grep -rInE "$PATRONES" "$objetivo"
  estado=$?
  case $estado in
    0) encontrado=1 ;;
    1) ;;  # sin coincidencias: el unico resultado aceptable
    *) echo "::error::grep no pudo leer $objetivo (codigo $estado); no se puede afirmar que este limpio" >&2
       exit 2 ;;
  esac
done

if [ "$encontrado" -eq 1 ]; then
  echo "::error::Se encontro codigo de analitica o telemetria en la aplicacion."
  echo "::error::Daylo promete que los datos del usuario no salen de su dispositivo, y"
  echo "::error::eso solo se sostiene si este repositorio no contiene nada de esto."
  echo "::error::El script de analitica de la landing se inyecta en el despliegue del"
  echo "::error::sitio web, sobre el artefacto ya construido, no aqui."
  exit 1
fi

echo "Sin analitica ni telemetria en: $*"
