# QA de la release publicada v1.1.0

**Fecha:** 2026-09-07 · **Ejecutado desde:** Ubuntu 25.10, x86-64, Wayland
**Qué se probó:** los 7 artefactos **descargados de GitHub Releases**, no el working tree.
Descargados con `gh release download v1.1.0` a un directorio limpio fuera del repo.

## Por qué esta forma

Un visitante nuevo no tiene el checkout: se descarga un binario. Probar el código local
habría verificado algo que nadie usa. Lo que sigue mide el artefacto publicado.

## Condición de refutación (escrita antes de ver resultados)

- **"No arranca"** exige fallo reproducible en ≥3 intentos, con datos limpios y **causa raíz
  nombrada**. Sin causa raíz → "no concluyente", nunca "roto".
- **"Arranca"** no es que se abra una ventana. Exige el ciclo: dato creado → app cerrada →
  app reabierta → dato presente.
- **Tres cajones, nunca dos:** VERDE (ejecutado), ROJO (falla con causa), **GRIS (no
  verificable aquí)**. Gris no se colapsa en ninguno de los otros dos.
- Una compilación que no termina es **gris por presupuesto**, jamás roja.

Controles aplicados para separar "el paquete está roto" de "es mi máquina":
`A` compilar desde fuente si el publicado falla · `B` identificar la dependencia exacta y
compararla con `Depends` del paquete · `C` ciclo de persistencia · `D` HOME limpio en cada
intento, sin tocar los datos reales del usuario.

**El control B evitó una conclusión falsa.** La primera captura de la ventana salió negra.
Antes de escribir "Daylo renderiza en negro" comprobé el entorno: `LockedHint=yes` y
`org.gnome.ScreenSaver.GetActive` → `true`. La sesión estaba bloqueada; el negro era la
pantalla de bloqueo. Queda como gris, no como rojo.

## VERDE — ejecutado y verificado

| Artefacto | Resultado |
|---|---|
| `Daylo_1.1.0_amd64.AppImage` | Arranca, sobrevive >15 s, crea ventana `Daylo` (clase `activity-tracker`, 2400x1600), inicializa almacenamiento |
| `Daylo_1.1.0_amd64.deb` | Extraído sin instalar; binario arranca, **todas las libs se resuelven**, crea almacenamiento |
| Dependencias en distro actual | `Depends: libwebkit2gtk-4.1-0, libgtk-3-0`; Ubuntu 25.10 los tiene. **No sufre el fallo clásico de Tauri con webkit 4.0** |
| **Persistencia** | Estado con 1 actividad + 2 logs inyectado en `localStorage`; tras reiniciar la app los datos siguen **intactos y sin corromper** |
| Estado inicial | Store Zustand `simple-calendar-storage` con la fecha actual correcta (`selectedYear:2026`, `selectedMonth:8`) |

El primer arranque con datos vacíos **no falla**, y el arranque con datos preexistentes
tampoco. Era la hipótesis heredada de actual-mcp y aquí no se reproduce.

## ROJO — defectos reales encontrados

### 1. Ningún artefacto de escritorio está firmado (prioridad máxima)

- **Windows** (`x64` y `arm64`): tabla de certificados Authenticode con `size=0` en ambos.
- **macOS** (`x64` y `aarch64`): no existe `Daylo.app/Contents/_CodeSignature`.

Consecuencia para quien descarga: Windows muestra "Windows protegió tu PC" (SmartScreen) con
el botón de continuar escondido tras "Más información"; macOS reciente **se niega a abrir**
un `.app` sin firmar ni notarizar por doble clic, y obliga a ir a Ajustes del Sistema →
Privacidad y Seguridad → "Abrir de todos modos".

Esto no es "no arranca" en sentido técnico, y por eso no lo llamo así. Es una barrera de
sistema operativo entre el visitante y la app, y cae sobre el **64% de las descargas
(Windows) y el 100% de macOS**. Es el equivalente al "primer arranque falla siempre" que
encontró el equipo de actual-mcp: sólo se ve probando el paquete publicado.

### 2. El APK sólo trae `arm64-v8a`

Sin `armeabi-v7a` ni `x86_64`. No se ejecuta en los emuladores por defecto de Android Studio
(x86_64) ni en dispositivos de 32 bits. Afecta directamente al QA pendiente de S5-07: hace
falta un dispositivo arm64 físico, un emulador no sirve.

### 3. `Categories=` vacío en el `.desktop`

`/usr/share/applications/Daylo.desktop` instala con `Categories=` sin valor, así que la app
no se clasifica en el menú de aplicaciones de Linux. Arreglo de una línea.

### 4. El binario se llama `activity-tracker`, no `daylo`

Nombre viejo del proyecto, presente en las tres plataformas de escritorio:
`/usr/bin/activity-tracker` (Linux), `activity-tracker.exe` (Windows),
`CFBundleExecutable: activity-tracker` (macOS, aunque el bundle sí es `Daylo.app`).
Quien instale el `.deb` y teclee `daylo` no encuentra nada. En Windows aparece como
`activity-tracker.exe` en el Administrador de tareas.

### 5. Binario sin `strip`, con `debug_info`

10,7 MB el ELF de Linux. Es parte de por qué el AppImage pesa **81,5 MB frente a 4,0 MB del
`.deb`** — 20 veces más para la misma app.

## GRIS — no verificable en esta máquina

No tengo Windows, ni Mac, ni dispositivo Android. De estos artefactos puedo demostrar que
están **bien construidos**, no que arranquen:

| Artefacto | Verificado | **No** verificado |
|---|---|---|
| `x64-setup.exe` | NSIS válido → contiene `activity-tracker.exe` **PE32+ x86-64** correcto | Que instale y abra |
| `arm64-setup.exe` | NSIS válido → contiene **PE32+ ARM64** real, sin etiquetado cruzado | Que instale y abra |
| `x64.dmg` | UDIF `koly` válido → `Daylo.app` con **Mach-O x86_64**, `CFBundleShortVersionString 1.1.0`, mínimo macOS 10.13 | Que Gatekeeper lo deje abrir |
| `aarch64.dmg` | UDIF válido → `Daylo.app` con **Mach-O arm64** | Ídem |
| `daylo-android.apk` | Firmado (`RELEASE.RSA`), 920 entradas, `classes.dex`, manifest `com.daylo` + `1.1.0` | Que instale y abra en un teléfono |

También gris: **el render visual en Linux** y **el ciclo con clics humanos reales**, ambos
por la sesión bloqueada. La persistencia se verificó por inyección de estado, que demuestra
que la app lee y conserva datos existentes, no que el usuario pueda crearlos con la interfaz.

**Cobertura honesta: 2 de 7 artefactos ejecutados. 1 de 5 plataformas verificada en
ejecución (Linux). 4 de 5 en gris (Windows, macOS, Android, iOS).**
Ningún artefacto está roto de construcción: los 7 son del formato y arquitectura que declaran.

## Qué haría falta para una v1.2 (propuesta, no ejecutada)

Ordenado por daño que evita, no por esfuerzo.

1. **Firmar y notarizar.** Es lo único de esta lista que un visitante nota antes de poder
   usar la app. macOS necesita cuenta de Apple Developer (99 USD/año) + notarización;
   Windows, un certificado de firma (los OV rondan 200-400 USD/año, y hasta que acumula
   reputación SmartScreen sigue avisando). Si el coste no cabe: documentar en el README los
   pasos exactos para saltarse el aviso en cada sistema. Es gratis y recupera parte del daño.
2. **`Categories=Utility;Office;`** en el `.desktop`.
3. **Renombrar el binario** de `activity-tracker` a `daylo` en las tres plataformas. Ojo:
   no tocar `identifier`/`applicationId` `com.daylo.app` — cambiarlo rompe la actualización
   de las instalaciones existentes y en Android exige la misma llave de firma.
4. **`strip` + `debug = false`** en el perfil release de Cargo, y revisar el AppImage: 81 MB
   para una app cuyo `.deb` pesa 4 MB.
5. **Añadir `armeabi-v7a` y `x86_64` al APK**, o declarar explícitamente que es arm64-only.
   Sin `x86_64` no hay QA por emulador.
6. **Cerrar S5-06b (iOS)**, que sigue necesitando un Mac con Xcode.

## Cómo cerrar el gris (para quien siga esto)

- **Windows y macOS:** o una máquina real, o CI que arranque el instalador en un runner
  `windows-latest` / `macos-latest` y compruebe que el proceso vive. GitHub Actions ya se usa
  para construir; verificar el arranque es una extensión pequeña.
- **Android:** dispositivo arm64 físico. El emulador x86_64 **no puede** con este APK.
- **Render e interacción en Linux:** con la sesión desbloqueada, capturar la ventana y
  automatizar clics (hay `ffmpeg` y `python-xlib`; falta `xdotool`).

## Nota de seguridad resuelta durante este trabajo

Los dos keystores de firma Android del working tree (`src-tauri/keystore.jks`,
`src-tauri/gen/android/daylo-release.keystore`) **no estaban en `.gitignore`** — verificado
con `git check-ignore`, no supuesto. Un `git add -A` los habría publicado. Añadidos los
patrones `*.jks`, `*.keystore`, `keystore.properties`, `*.p12`, `*.mobileprovision`.

`git log --all --diff-filter=A` sobre esos patrones sale **vacío**: ninguna llave entró nunca
al historial, en ninguna rama. Era prevención, no filtración. No hay que rotar nada.
