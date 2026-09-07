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

### 1. La llave que firmó el APK es efímera: pérdida de datos en la primera actualización

**El defecto más grave del proyecto.** `release.yml:165-167` genera una llave nueva dentro
del job en cada build:

```
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias release -storepass android -keypass android \
  -dname "CN=Daylo,O=DLSLabs,C=US"
```

Los únicos `secrets.*` del workflow son dos usos de `GITHUB_TOKEN`. No hay keystore
persistente, y `release.yml` **no sube `release.jks` como artifact** en ningún paso, así que
la parte privada existió sólo en aquel runner y no quedó copia en ninguna parte.

Verificado en el binario publicado, no deducido del workflow. Certificado de
`META-INF/RELEASE.RSA` del APK descargado:

```
Owner/Issuer: CN=Daylo, O=DLSLabs, C=US        ← el -dname del workflow
Valid from:   2026-03-19 03:13:49 UTC          ← la release se publicó a las 03:11:47
SHA256: 2C:D5:A0:EB:D7:A5:F6:0C:24:D1:6D:8B:99:6D:42:EB:69:DC:6D:5B:1F:5A:3D:DE:05:AC:DC:7D:84:E9:4F:2A
```

El certificado nació **dos minutos después** de publicarse la release: se generó durante el
build. Hallazgo original de la sesión de growth, verificado aquí de forma independiente.

**Consecuencia.** Android exige firma idéntica para actualizar. Cualquier v1.2 firmada con
otra llave falla con "App not installed" sobre una v1.1.0 instalada. La única salida del
usuario es desinstalar, y siendo Daylo local-first, desinstalar **destruye sus datos**. Para
una app cuyo argumento es "tus datos son tuyos y no salen de tu dispositivo", el primer
update los borra. Irreparable para quien ya tiene v1.1.0; reparable de aquí en adelante.

**Y la llave no debería reutilizarse aunque apareciera.** Su contraseña es `android`,
escrita en claro en `release.yml:166` y en el historial público desde `9fa82d3`. Una llave
de firma de por vida con contraseña pública no es una llave de firma. Así que la pregunta no
es sólo "¿se puede recuperar?" sino "¿se debe?", y la respuesta a la segunda es no.

**Pendiente de comprobar, y sólo Henfry puede:** si `src-tauri/gen/android/daylo-release.keystore`
resultara tener este mismo SHA256, la continuidad estaría salvada. Abrir un keystore está
bloqueado por el clasificador de permisos de la sesión, con razón. El comando es
`keytool -list -v -keystore src-tauri/gen/android/daylo-release.keystore` y hay que comparar
el SHA256 con el de arriba. **Hasta que eso se comprueba, esto sigue siendo el rojo número 1.**

### 2. Ningún artefacto de escritorio está firmado

- **Windows** (`x64` y `arm64`): tabla de certificados Authenticode con `size=0` en ambos.
- **macOS** (`x64` y `aarch64`): no existe `Daylo.app/Contents/_CodeSignature`.

Windows muestra "Windows protegió tu PC" (SmartScreen) con el botón de continuar escondido
tras "Más información"; macOS reciente **se niega a abrir** un `.app` sin firmar ni
notarizar por doble clic, y obliga a pasar por Ajustes del Sistema → Privacidad y Seguridad.

No es "no arranca" en sentido técnico, y por eso no lo llamo así. Es una barrera del sistema
operativo entre el visitante y la app, sobre el **64% de las descargas (Windows) y el 100% de
macOS**. Es el equivalente del "primer arranque falla siempre" de actual-mcp: sólo se ve
probando el paquete publicado.

**No fue un descuido.** `dbacaed` (2026-02-08, "Remove signing env vars from release
workflow") quitó `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_TEAM_ID` y compañía con el mensaje
"Signing keys are not configured yet; empty env vars cause tauri-action to fail". Es deuda
técnica asumida a conciencia para que el build no fallara, no un error.

### 3. No hay canal de actualización en escritorio

`tauri.conf.json` no declara `updater` y `Cargo.toml` no incluye `tauri-plugin-updater`
(sólo `shell` y `opener`). Quien instaló v1.1.0 en Windows, macOS o Linux **no tiene forma de
enterarse de que existe una v1.2**: tiene que volver al repo por su cuenta.

Eso hace que la llave de updater retirada en `dbacaed` no rompiera nada — no había updater
que firmar. Pero explica por qué todo el tráfico entra frío desde fuera: no hay base
instalada a la que avisar.

### 4. El APK sólo trae `arm64-v8a`

Sin `armeabi-v7a` ni `x86_64` (`release.yml:134,155` instalan y compilan sólo
`aarch64-linux-android`). No se ejecuta en los emuladores por defecto de Android Studio
(x86_64) ni en dispositivos de 32 bits. Afecta al QA pendiente de S5-07: hace falta un
dispositivo arm64 físico, un emulador no sirve.

**Matiz sobre la documentación:** la plantilla de notas de release del propio workflow
(`release.yml:99`) **sí** avisa "arm64 devices only (all phones/tablets since ~2017)". El
que no lo menciona, ni menciona el APK, es el README. Es una inconsistencia entre los dos
textos, no una ausencia total de aviso.

### 5. `Categories=` vacío en el `.desktop`

`/usr/share/applications/Daylo.desktop` instala con `Categories=` sin valor, así que la app
no se clasifica en el menú de aplicaciones de Linux. Arreglo de una línea.

### 6. El binario se llama `activity-tracker`, no `daylo`

Nombre viejo del proyecto, en las tres plataformas de escritorio:
`/usr/bin/activity-tracker` (Linux), `activity-tracker.exe` (Windows),
`CFBundleExecutable: activity-tracker` (macOS, aunque el bundle sí es `Daylo.app`).
Quien instale el `.deb` y teclee `daylo` no encuentra nada; en Windows aparece como
`activity-tracker.exe` en el Administrador de tareas.

### 7. Binario sin `strip`, con `debug_info`

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

1. **Bloquear la publicación de otro APK hasta arreglar la firma.** Es lo único de esta
   lista que destruye datos de usuario. Hay que meter un keystore en `secrets` y que
   `release.yml` lo use en vez de generar uno con `keytool -genkey`. Antes de eso hay una
   decisión que **no es técnica y le toca a Henfry**: qué llave se consagra como firma de
   Daylo para siempre, porque la que entre en `secrets` ya no se puede cambiar sin repetir
   este mismo problema. La del CI no sirve: su contraseña es pública. Primer paso, comprobar
   si el keystore del working tree es el que firmó v1.1.0 (ver rojo #1).
2. **Nota de migración en la próxima release de Android.** Daylo tiene export/import JSON, y
   es lo único que salva los datos de los 2 usuarios que ya tienen el APK: exportar →
   desinstalar → instalar → importar. Sin esa línea, el update les borra todo. Artefacto de
   la sesión de growth; queda anotado aquí porque el defecto es de CI.
3. **Firmar y notarizar el escritorio, o documentar el bypass.** macOS necesita cuenta de
   Apple Developer (99 USD/año) más notarización; Windows, un certificado de firma (los OV
   rondan 200-400 USD/año, y SmartScreen sigue avisando hasta acumular reputación). Si el
   coste no cabe ahora: **documentar en el README los pasos exactos para saltarse el aviso
   en cada sistema es gratis** y recupera parte del daño. La barrera seguirá ahí, pero
   deja de ser un callejón sin salida.
4. **Decidir si Daylo quiere updater.** Hoy no lo tiene, así que no hay base instalada a la
   que avisar de nada. Añadir `tauri-plugin-updater` exige a su vez firma de updater
   (`TAURI_SIGNING_PRIVATE_KEY`, la que se quitó en `dbacaed`) y un endpoint donde publicar
   el manifiesto. Es una decisión de producto con coste real, no un arreglo.
5. **`Categories=Utility;Office;`** en el `.desktop`. Una línea.
6. **Renombrar el binario** de `activity-tracker` a `daylo` en las tres plataformas. Ojo:
   **no tocar** el `identifier`/`applicationId` `com.daylo.app` — cambiarlo rompe la
   actualización de las instalaciones existentes y en Android exige la misma llave de firma,
   con lo que se sumaría al problema del rojo #1.
7. **`strip` + `debug = false`** en el perfil release de Cargo, y revisar el AppImage: 81 MB
   para una app cuyo `.deb` pesa 4 MB.
8. **Añadir `armeabi-v7a` y `x86_64` al APK**, o dejar constancia de que es arm64-only.
   Sin `x86_64` no hay QA por emulador, lo que encarece todo el testing de Android.
9. **Alinear el README con las notas de release**: el README no menciona el APK ni el
   instalador arm64 de Windows, que sí están publicados y recibiendo descargas.
10. **Cerrar S5-06b (iOS)**, que sigue necesitando un Mac con Xcode.

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
