# Firma del APK de Android

## El problema que esto arregla

Hasta ahora `release.yml` generaba la llave de firma **dentro del runner** con
`keytool -genkey` en cada build. Esa llave existía sólo durante el job y nunca se guardaba
en ninguna parte: `release.yml` no la subía como artifact, y los artifacts de Actions
caducan a los 90 días de todas formas.

Android exige que una actualización esté firmada con **la misma llave** que la versión
instalada. Un APK firmado con una llave distinta falla al instalarse encima con
"App not installed", y la única salida del usuario es desinstalar. Daylo guarda los datos en
el dispositivo, así que desinstalar **le borra todo**.

El APK de v1.1.0 está firmado con una de esas llaves perdidas:

```
Owner/Issuer: CN=Daylo, O=DLSLabs, C=US
Valid from:   2026-03-19 03:13:49 UTC   (la release se publicó a las 03:11:47)
SHA256: 2C:D5:A0:EB:D7:A5:F6:0C:24:D1:6D:8B:99:6D:42:EB:69:DC:6D:5B:1F:5A:3D:DE:05:AC:DC:7D:84:E9:4F:2A
```

El workflow ya no genera llaves: ahora exige un keystore en `secrets` y **aborta el build**
si no lo encuentra, en vez de publicar otro APK sin ruta de actualización.

## Lo que hace falta para que una actualizacion se instale encima

Android exige **dos** cosas, y la firma es solo una:

1. **La misma firma.** Un APK firmado con otra llave no puede instalarse sobre el
   instalado: falla con "App not installed" y la unica salida del usuario es desinstalar,
   lo que borra sus datos.
2. **Un `versionCode` mayor.** Aunque la firma coincida, un `versionCode` que no crezca
   impide la actualizacion.

El segundo es facil de olvidar porque no lo escribe nadie a mano: `build.gradle.kts` lo lee
de `tauri.properties`, que Tauri genera al construir y **no esta en el repositorio**. Su
valor por defecto en el gradle es `1`, asi que si esa propiedad faltara, todos los APK
saldrian con el mismo numero y ninguna actualizacion se instalaria, con la firma
correcta y sin ningun error visible en el build.

Comprobado en los APK publicados, parseando su `AndroidManifest.xml`:

| Version | `versionCode` |
|---|---|
| v1.1.0 | 1001000 |
| v1.1.1 | 1001001 |

Tauri lo deriva de la version (`major * 1000000 + minor * 1000 + patch`), asi que progresa
solo con cada bump. No hay nada que mantener a mano, pero si algun dia una actualizacion no
se instala y la firma coincide, **este es el segundo sitio donde mirar**.

Para comprobarlo en un APK sin el SDK de Android instalado, basta parsear el manifest
binario: el `versionCode` es un atributo de tipo entero del elemento `manifest`.

## Paso 0: comprobar antes de generar nada

Puede que la llave no esté perdida. Hay un keystore en el working tree que quizá sea el que
firmó v1.1.0. **Comprobar esto primero**, porque si coincide se conserva la continuidad con
los usuarios que ya tienen la app instalada:

```bash
keytool -list -v -keystore src-tauri/gen/android/daylo-release.keystore
```

Comparar el `SHA256` con el de arriba.

- **Coincide** → usar ese keystore en los pasos siguientes. Los usuarios de v1.1.0 podrán
  actualizar sin perder datos.
- **No coincide** → generar uno nuevo (paso 1). v1.1.0 se queda sin ruta de actualización;
  quien ya la tenga instalada tendrá que exportar sus datos, desinstalar, instalar y
  reimportar.

**Lo que no vale es la llave del CI**, ni siquiera si apareciera: su contraseña era `android`,
en claro en `release.yml` y en el historial público desde `9fa82d3`. Con esa contraseña
pública, cualquiera podría firmar un APK que Android aceptaría como actualización legítima de
Daylo.

## Paso 1: generar el keystore (sólo si el paso 0 no dio coincidencia)

En local, **nunca en CI**. `keytool` pedirá la contraseña de forma interactiva; no la pases
por línea de comandos, porque queda en el historial del shell.

```bash
keytool -genkey -v -keystore daylo-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias daylo -dname "CN=Daylo, O=DLSLabs, C=DO"
```

`-validity 10000` son unos 27 años. Es deliberado: la Play Store exige que el certificado
siga válido bastante más allá de 2033, y renovarlo no es posible sin perder la continuidad.

Anotar el `SHA256` resultante (`keytool -list -v -keystore daylo-release.jks`) en un sitio
seguro. Sirve para verificar en el futuro que un APK publicado se firmó con la llave correcta.

## Paso 2: cargar los cuatro secrets

```bash
base64 -w0 daylo-release.jks > /tmp/ks.b64
gh secret set ANDROID_KEYSTORE_BASE64 < /tmp/ks.b64
shred -u /tmp/ks.b64          # o rm, pero que no quede rondando

gh secret set ANDROID_KEYSTORE_PASSWORD   # las pide por stdin, no quedan en el historial
gh secret set ANDROID_KEY_ALIAS           # 'daylo' si se siguió el paso 1
gh secret set ANDROID_KEY_PASSWORD
```

## Paso 3: guardar la llave donde no se pierda

**Esto es lo que de verdad importa a largo plazo.** Si el `.jks` se pierde, Daylo no puede
volver a publicar una actualización de Android nunca más, y todos los usuarios instalados
quedan varados. Los secrets de GitHub no son un backup: no se pueden leer de vuelta.

Y hay una segunda razón, que no se ve hasta que alguien instala el APK en un teléfono.

### La llave también es la reputación ante Play Protect

Al instalar un APK de fuera de Play, Google Play Protect puede bloquearlo con «App blocked
to protect your device. Play Protect hasn't seen an app from this developer before.» Ese
aviso se calcula por **certificado de firma**, no por nombre de paquete: «este
desarrollador» significa literalmente «esta llave». Comprobado en el teléfono de Henfry al
instalar v1.1.2 el 2026-09-09.

La consecuencia importa al decidir qué hacer si la llave se complica: **rotarla no solo
rompe las actualizaciones, además reinicia esa reputación a cero** y todo el mundo vuelve a
ver el diálogo de bloqueo.

Y las dos consecuencias no se recuperan igual. Una actualización rota tiene salida, aunque
sea mala: exportar los datos, desinstalar, instalar y volver a importar, que es lo que hubo
que decirle a quien venía de v1.1.0. La reputación no tiene ningún atajo: se recupera con
tiempo y con instalaciones de otras personas, y no hay nada que hacer para acelerarla.

Lo que sí la quita es registrar al desarrollador con Google, que es una verificación **de la
cuenta** y tarda en propagarse: abrir Play Console no borra el aviso esa misma tarde.

- Copia en un gestor de contraseñas o en almacenamiento cifrado offline.
- Junto con ella, la contraseña y el alias.
- **No commitear el `.jks`.** `.gitignore` ya cubre `*.jks`, `*.keystore`,
  `keystore.properties`, `*.p12` y `*.mobileprovision`.

## Verificar que funcionó

El paso `Sign APK` imprime el fingerprint de la llave con la que firmó, al final de su log:

```
--- firma del APK que se va a publicar ---
Signer #1 certificate SHA-256 digest: ...
```

Ese valor tiene que ser idéntico en todas las releases. Si cambia, la siguiente
actualización romperá las instalaciones existentes.

## Y comprobarlo sobre el APK publicado

En releases hasta v1.1.0 incluida el APK se llamaba `daylo-android.apk`; a partir de
v1.1.1 es `Daylo-android-arm64.apk`. Ajusta el nombre segun el tag que estes comprobando.

```bash
gh release download <tag> --pattern 'Daylo-android-arm64.apk'
unzip -p Daylo-android-arm64.apk 'META-INF/*.RSA' > /tmp/sig.rsa
keytool -printcert -file /tmp/sig.rsa | grep SHA256
```

Es así como se detectó este problema: leyendo el certificado del binario publicado, no el
workflow. El workflow decía lo que hacía; el certificado decía cuándo había nacido la llave.
