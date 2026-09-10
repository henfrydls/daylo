# Android APK signing

## The problem this fixes

Until now, `release.yml` generated the signing key **inside the runner** with
`keytool -genkey` on every build. That key existed only for the duration of the job and was
never saved anywhere: `release.yml` did not upload it as an artifact, and Actions artifacts
expire after 90 days anyway.

Android requires an update to be signed with **the same key** as the installed version. An
APK signed with a different key fails to install on top of it with "App not installed", and
the user's only way out is to uninstall. Daylo stores its data on the device, so uninstalling
**wipes everything**.

The v1.1.0 APK is signed with one of those lost keys:

```
Owner/Issuer: CN=Daylo, O=DLSLabs, C=US
Valid from:   2026-03-19 03:13:49 UTC   (the release was published at 03:11:47)
SHA256: 2C:D5:A0:EB:D7:A5:F6:0C:24:D1:6D:8B:99:6D:42:EB:69:DC:6D:5B:1F:5A:3D:DE:05:AC:DC:7D:84:E9:4F:2A
```

The workflow no longer generates keys: it now requires a keystore in `secrets` and **aborts
the build** if it does not find one, instead of publishing another APK with no update path.

## What it takes for an update to install on top

Android requires **two** things, and the signature is only one of them:

1. **The same signature.** An APK signed with another key cannot be installed over the
   installed one: it fails with "App not installed" and the user's only way out is to
   uninstall, which wipes their data.
2. **A higher `versionCode`.** Even if the signature matches, a `versionCode` that does not
   increase blocks the update.

The second one is easy to forget because nobody writes it by hand: `build.gradle.kts` reads
it from `tauri.properties`, which Tauri generates at build time and which **is not in the
repository**. Its default value in the gradle file is `1`, so if that property were missing,
every APK would come out with the same number and no update would install, with the correct
signature and no visible error in the build.

Checked on the published APKs by parsing their `AndroidManifest.xml`:

| Version | `versionCode` |
|---|---|
| v1.1.0 | 1001000 |
| v1.1.1 | 1001001 |

Tauri derives it from the version (`major * 1000000 + minor * 1000 + patch`), so it advances
on its own with every bump. There is nothing to maintain by hand, but if some day an update
does not install and the signature matches, **this is the second place to look**.

To check it on an APK without the Android SDK installed, it is enough to parse the binary
manifest: `versionCode` is an integer-typed attribute of the `manifest` element.

## Step 0: check before generating anything

The key may not be lost. There is a keystore in the working tree that might be the one that
signed v1.1.0. **Check this first**, because if it matches, continuity is preserved for the
users who already have the app installed:

```bash
keytool -list -v -keystore src-tauri/gen/android/daylo-release.keystore
```

Compare the `SHA256` with the one above.

- **It matches** → use that keystore in the following steps. v1.1.0 users will be able to
  update without losing data.
- **It does not match** → generate a new one (step 1). v1.1.0 is left with no update path;
  anyone who already has it installed will have to export their data, uninstall, install and
  re-import.

**What is not acceptable is the CI key**, even if it turned up: its password was `android`,
in plain text in `release.yml` and in the public history since `9fa82d3`. With that public
password, anyone could sign an APK that Android would accept as a legitimate Daylo update.

## Step 1: generate the keystore (only if step 0 found no match)

Locally, **never in CI**. `keytool` will ask for the password interactively; do not pass it
on the command line, because it ends up in the shell history.

```bash
keytool -genkey -v -keystore daylo-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias daylo -dname "CN=Daylo, O=DLSLabs, C=DO"
```

`-validity 10000` is about 27 years. This is deliberate: the Play Store requires the
certificate to remain valid well beyond 2033, and renewing it is not possible without losing
continuity.

Write down the resulting `SHA256` (`keytool -list -v -keystore daylo-release.jks`) in a safe
place. It is used to verify in the future that a published APK was signed with the correct key.

## Step 2: upload the four secrets

```bash
base64 -w0 daylo-release.jks > /tmp/ks.b64
gh secret set ANDROID_KEYSTORE_BASE64 < /tmp/ks.b64
shred -u /tmp/ks.b64          # or rm, but do not leave it lying around

gh secret set ANDROID_KEYSTORE_PASSWORD   # prompts for them on stdin, they do not end up in the history
gh secret set ANDROID_KEY_ALIAS           # 'daylo' if step 1 was followed
gh secret set ANDROID_KEY_PASSWORD
```

## Step 3: store the key where it will not get lost

**This is what really matters in the long run.** If the `.jks` is lost, Daylo can never
publish an Android update again, and every installed user is stranded. GitHub secrets are not
a backup: they cannot be read back.

And there is a second reason, one that does not show up until someone installs the APK on a
phone.

### The key is also the reputation with Play Protect

When installing an APK from outside Play, Google Play Protect can block it with "App blocked
to protect your device. Play Protect hasn't seen an app from this developer before." That
warning is computed per **signing certificate**, not per package name: "this developer"
literally means "this key". Confirmed on Henfry's phone when installing v1.1.2 on
2026-09-09.

The consequence matters when deciding what to do if the key runs into trouble: **rotating it
not only breaks updates, it also resets that reputation to zero** and everyone sees the block
dialog again.

And the two consequences do not recover the same way. A broken update has a way out, even if
a bad one: export the data, uninstall, install and import again, which is what had to be told
to anyone coming from v1.1.0. Reputation has no shortcut: it recovers with time and with
installs by other people, and there is nothing to do to speed it up.

What does remove it is registering the developer with Google, which is an **account**
verification and takes time to propagate: opening Play Console does not clear the warning
that same afternoon.

- A copy in a password manager or in encrypted offline storage.
- Along with it, the password and the alias.
- **Do not commit the `.jks`.** `.gitignore` already covers `*.jks`, `*.keystore`,
  `keystore.properties`, `*.p12` and `*.mobileprovision`.

## Verify that it worked

The `Sign APK` step prints the fingerprint of the key it signed with, at the end of its log:

```
--- signature of the APK about to be published ---
Signer #1 certificate SHA-256 digest: ...
```

That value has to be identical across all releases. If it changes, the next update will
break existing installs.

## And check it on the published APK

In releases up to and including v1.1.0 the APK was called `daylo-android.apk`; from v1.1.1 on
it is `Daylo-android-arm64.apk`. Adjust the name according to the tag you are checking.

```bash
gh release download <tag> --pattern 'Daylo-android-arm64.apk'
unzip -p Daylo-android-arm64.apk 'META-INF/*.RSA' > /tmp/sig.rsa
keytool -printcert -file /tmp/sig.rsa | grep SHA256
```

This is how the problem was detected: by reading the certificate of the published binary,
not the workflow. The workflow said what it did; the certificate said when the key was born.
