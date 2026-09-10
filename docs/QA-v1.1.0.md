# QA of the published release v1.1.0

**Date:** 2026-09-07 · **Run from:** Ubuntu 25.10, x86-64, Wayland
**What was tested:** the 7 artifacts **downloaded from GitHub Releases**, not the working tree.
Downloaded with `gh release download v1.1.0` into a clean directory outside the repo.

## Why this approach

A new visitor does not have the checkout: they download a binary. Testing the local code
would have verified something nobody uses. What follows measures the published artifact.

## Refutation condition (written before seeing results)

- **"Does not start"** requires a reproducible failure in ≥3 attempts, with clean data and a
  **named root cause**. No root cause → "inconclusive", never "broken".
- **"Starts"** does not mean a window opens. It requires the cycle: data created → app closed →
  app reopened → data present.
- **Three buckets, never two:** GREEN (executed), RED (fails with a cause), **GRAY (not
  verifiable with the available equipment)**. Gray does not collapse into either of the other two.
- A build that does not finish is **gray due to budget**, never red.

Controls applied to separate "the package is broken" from "it is the test environment":
`A` build from source if the published one fails · `B` identify the exact dependency and
compare it with the package's `Depends` · `C` persistence cycle · `D` clean HOME on every
attempt, without touching the user's real data.

**Control B prevented a false conclusion.** The first screenshot of the window came out black.
Before recording it as a failure, the environment was checked: `LockedHint=yes` and
`org.gnome.ScreenSaver.GetActive` → `true`. The desktop session was locked and the black was
the lock screen. It stays as gray, not red.

## GREEN: executed and verified

| Artifact | Result |
|---|---|
| `Daylo_1.1.0_amd64.AppImage` | Starts, survives >15 s, creates a `Daylo` window (class `activity-tracker`, 2400x1600), initializes storage |
| `Daylo_1.1.0_amd64.deb` | Extracted without installing; binary starts, **all libs resolve**, creates storage |
| Dependencies on current distro | `Depends: libwebkit2gtk-4.1-0, libgtk-3-0`; Ubuntu 25.10 has them. **Does not suffer the classic Tauri failure with webkit 4.0** |
| **Persistence** | State with 1 activity + 2 logs injected into `localStorage`; after restarting the app the data remains **intact and uncorrupted** |
| Initial state | Zustand store `simple-calendar-storage` with the correct current date (`selectedYear:2026`, `selectedMonth:8`) |

The first start with empty data **does not fail**, and neither does starting with
pre-existing data. That was the hypothesis inherited from actual-mcp and it does not
reproduce here.

## RED: real defects found

### 1. The key that signed the APK is ephemeral: data loss on the first update

**The most serious defect in the project.** `release.yml:165-167` generates a new key inside
the job on every build:

```
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias release -storepass android -keypass android \
  -dname "CN=Daylo,O=DLSLabs,C=US"
```

The only `secrets.*` in the workflow are two uses of `GITHUB_TOKEN`. There is no persistent
keystore, and `release.yml` **does not upload `release.jks` as an artifact** in any step, so
the private part existed only on that runner and no copy was left anywhere.

Verified on the published binary, not deduced from the workflow. Certificate from
`META-INF/RELEASE.RSA` of the downloaded APK:

```
Owner/Issuer: CN=Daylo, O=DLSLabs, C=US        ← the workflow's -dname
Valid from:   2026-03-19 03:13:49 UTC          ← the release was published at 03:11:47
SHA256: 2C:D5:A0:EB:D7:A5:F6:0C:24:D1:6D:8B:99:6D:42:EB:69:DC:6D:5B:1F:5A:3D:DE:05:AC:DC:7D:84:E9:4F:2A
```

The certificate was born **two minutes after** the release was published: it was generated
during the build. Original finding from the distribution review, independently verified in
this QA.

**Consequence.** Android requires an identical signature to update. Any v1.2 signed with
another key fails with "App not installed" over an installed v1.1.0. The user's only way out
is to uninstall, and since Daylo is local-first, uninstalling **destroys their data**. For an
app whose pitch is "your data is yours and never leaves your device", the first update wipes
it. Irreparable for anyone who already has v1.1.0; fixable from here on.

**And the key should not be reused even if it turned up.** Its password is `android`,
written in plain text in `release.yml:166` and in the public history since `9fa82d3`. A
lifetime signing key with a public password is not a signing key. So the question is not
only "can it be recovered?" but "should it be?", and the answer to the second one is no.

**Pending a check by whoever has the keystore password:** if
`src-tauri/gen/android/daylo-release.keystore` turned out to have this same SHA256,
continuity would be saved. Opening the keystore was outside the scope of this QA. The
command is
`keytool -list -v -keystore src-tauri/gen/android/daylo-release.keystore` and the SHA256 must
be compared with the one above. **Until that is checked, this remains red number 1.**

### 2. No desktop artifact is signed

- **Windows** (`x64` and `arm64`): Authenticode certificate table with `size=0` in both.
- **macOS** (`x64` and `aarch64`): `Daylo.app/Contents/_CodeSignature` does not exist.

Windows shows "Windows protected your PC" (SmartScreen) with the continue button hidden
behind "More info"; recent macOS **refuses to open** an unsigned, un-notarized `.app` by
double-click, and forces the user to go through System Settings → Privacy & Security.

It is not "does not start" in the technical sense, and that is why I do not call it that. It
is an operating system barrier between the visitor and the app, on **64% of downloads
(Windows) and 100% of macOS**. It is the equivalent of actual-mcp's "first start always
fails": it only shows up when testing the published package.

**It was not an oversight.** `dbacaed` (2026-02-08, "Remove signing env vars from release
workflow") removed `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_TEAM_ID` and company with the
message "Signing keys are not configured yet; empty env vars cause tauri-action to fail". It
is technical debt taken on knowingly so the build would not fail, not a mistake.

### 3. There is no update channel on desktop

`tauri.conf.json` does not declare `updater` and `Cargo.toml` does not include
`tauri-plugin-updater` (only `shell` and `opener`). Anyone who installed v1.1.0 on Windows,
macOS or Linux **has no way of finding out that a v1.2 exists**: they have to come back to
the repo on their own.

That is why the updater key removed in `dbacaed` did not break anything, because there was no
updater to sign. But it explains why all traffic comes in cold from outside: there is no
installed base to notify.

### 4. The APK only ships `arm64-v8a`

No `armeabi-v7a` or `x86_64` (`release.yml:134,155` install and build only
`aarch64-linux-android`). It does not run on Android Studio's default emulators (x86_64) or
on 32-bit devices. This affects the pending S5-07 QA: a physical arm64 device is needed, an
emulator will not do.

**Nuance about the documentation:** the workflow's own release notes template
(`release.yml:99`) **does** warn "arm64 devices only (all phones/tablets since ~2017)". The
one that does not mention it, nor the APK, is the README. It is an inconsistency between the
two texts, not a total absence of warning.

### 5. Empty `Categories=` in the `.desktop`

`/usr/share/applications/Daylo.desktop` installs with `Categories=` with no value, so the app
is not classified in the Linux application menu. One-line fix.

### 6. The binary is called `activity-tracker`, not `daylo`

Old project name, on all three desktop platforms:
`/usr/bin/activity-tracker` (Linux), `activity-tracker.exe` (Windows),
`CFBundleExecutable: activity-tracker` (macOS, although the bundle is indeed `Daylo.app`).
Anyone who installs the `.deb` and types `daylo` finds nothing; on Windows it shows up as
`activity-tracker.exe` in Task Manager.

### 7. Binary without `strip`, with `debug_info`

The Linux ELF is 10.7 MB. It is part of why the AppImage weighs **81.5 MB versus 4.0 MB for
the `.deb`**, 20 times more for the same app.

## GRAY: not verifiable with the available equipment

There was no access to Windows, macOS or a physical Android device. For these artifacts it
can be shown that they are **well built**, not that they start:

| Artifact | Verified | **Not** verified |
|---|---|---|
| `x64-setup.exe` | Valid NSIS → contains a correct **PE32+ x86-64** `activity-tracker.exe` | That it installs and opens |
| `arm64-setup.exe` | Valid NSIS → contains a real **PE32+ ARM64**, no cross-labeling | That it installs and opens |
| `x64.dmg` | Valid UDIF `koly` → `Daylo.app` with **Mach-O x86_64**, `CFBundleShortVersionString 1.1.0`, minimum macOS 10.13 | That Gatekeeper lets it open |
| `aarch64.dmg` | Valid UDIF → `Daylo.app` with **Mach-O arm64** | Same |
| `daylo-android.apk` | Signed (`RELEASE.RSA`), 920 entries, `classes.dex`, manifest `com.daylo` + `1.1.0` | That it installs and opens on a phone |

### Rendering and interaction: closed on 2026-09-07

They were gray because the desktop session was locked. They were closed by serving the web
build (`npm run build`,
452 KB, 297 KB of JS) on `127.0.0.1` and driving it with a real browser:

1. The interface **renders correctly**: 2026 annual view with all twelve months, five-level
   heatmap legend, activities panel and statistics.
2. Full cycle **with real clicks**, not by injection: create the activity "QA
   Persistencia" → open September 7 → tick its checkbox → reload. After the reload the
   activity is still there, **the day shows green in the heatmap** and the statistics show
   1 active day, current streak 1 and 14% of the month.
3. No errors or warnings in the console. The dynamic `import()` of `@tauri-apps/api` in
   `useAppVersion.ts` falls back outside Tauri without breaking anything.

**Precision about what this covers.** What was verified is the **web build of the current
code**, which is the same bundle Tauri packages, not the published v1.1.0 binary. For the
published AppImage, what is verified remains: it starts, creates a real window and keeps the
data across restarts. That the interface renders and the click cycle works is strong evidence
for the package, not identical evidence.

As a side effect, it is shown that **the landing page web demo is viable today**: the app
works fully in the browser without Tauri.

**Honest coverage: 2 of 7 artifacts executed. 1 of 5 platforms verified at runtime (Linux).
4 of 5 gray (Windows, macOS, Android, iOS).**
No artifact is broken at build level: all 7 are of the format and architecture they declare.

## What a v1.2 would need (proposal, not executed)

Ordered by the damage it prevents, not by effort.

1. **Block the publication of another APK until the signing is fixed.** It is the only item
   on this list that destroys user data. A keystore has to go into `secrets` and
   `release.yml` has to use it instead of generating one with `keytool -genkey`. Before that
   there is a decision that **is not technical and falls to Henfry**: which key is
   consecrated as Daylo's signature forever, because the one that goes into `secrets` can no
   longer be changed without repeating this same problem. The CI one will not do: its
   password is public. First step, check whether the working tree keystore is the one that
   signed v1.1.0 (see red #1).
2. **Migration note in the next Android release.** Daylo has JSON export/import, and it is
   the only thing that saves the data of the 2 users who already have the APK: export →
   uninstall → install → import. Without that line, the update wipes everything for them. It
   belongs to the release documentation; it is noted here because the defect is in CI.
3. **Sign and notarize the desktop builds, or document the bypass.** macOS needs an Apple
   Developer account (99 USD/year) plus notarization; Windows, a code signing certificate
   (OV ones run around 200-400 USD/year, and SmartScreen keeps warning until reputation
   builds up). If the cost does not fit right now: **documenting in the README the exact
   steps to get past the warning on each system is free** and recovers part of the damage.
   The barrier will still be there, but it stops being a dead end.
4. **Decide whether Daylo wants an updater.** Today it does not have one, so there is no
   installed base to notify about anything. Adding `tauri-plugin-updater` in turn requires an
   updater signature (`TAURI_SIGNING_PRIVATE_KEY`, the one removed in `dbacaed`) and an
   endpoint where the manifest is published. It is a product decision with real cost, not a
   fix.
5. **`Categories=Utility;Office;`** in the `.desktop`. One line.
6. **Rename the binary** from `activity-tracker` to `daylo` on all three platforms. Careful:
   **do not touch** the `identifier`/`applicationId` `com.daylo.app`, because changing it
   breaks updates for existing installs and on Android it requires the same signing key,
   which would add to the red #1 problem.
7. **`strip` + `debug = false`** in the Cargo release profile, and review the AppImage: 81 MB
   for an app whose `.deb` weighs 4 MB.
8. **Add `armeabi-v7a` and `x86_64` to the APK**, or put on record that it is arm64-only.
   Without `x86_64` there is no emulator QA, which makes all Android testing more expensive.
9. **Align the README with the release notes**: the README does not mention the APK or the
   Windows arm64 installer, which are published and receiving downloads.
10. **Close S5-06b (iOS)**, which still needs a Mac with Xcode.

## How to close the gray (for whoever picks this up)

- **Windows and macOS:** either a real machine, or CI that launches the installer on a
  `windows-latest` / `macos-latest` runner and checks that the process is alive. GitHub
  Actions is already used to build; verifying startup is a small extension.
- **Android:** physical arm64 device. The x86_64 emulator **cannot** handle this APK.
- **Rendering and interaction on Linux:** with the desktop session unlocked, capture the
  window and
  automate clicks (`ffmpeg` and `python-xlib` are available; `xdotool` is missing).

## Security note resolved during this work

The two Android signing keystores in the working tree (`src-tauri/keystore.jks`,
`src-tauri/gen/android/daylo-release.keystore`) **were not in `.gitignore`**, verified with
`git check-ignore`, not assumed. A `git add -A` would have published them. Added the patterns
`*.jks`, `*.keystore`, `keystore.properties`, `*.p12`, `*.mobileprovision`.

`git log --all --diff-filter=A` on those patterns comes back **empty**: no key ever entered
the history, on any branch. It was prevention, not a leak. Nothing needs to be rotated.
