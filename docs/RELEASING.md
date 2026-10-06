# Releasing a New Version

## How Versioning Works

The app version lives in **one source of truth**: `package.json`.

- `src-tauri/tauri.conf.json` reads from `package.json` automatically (`"version": "../package.json"`)
- `src-tauri/Cargo.toml` is synced via `scripts/sync-version.js` during the bump

## Release Workflow

### 1. Gather the changelog

```bash
node scripts/collect-changelog.js 1.3.0 --dry-run   # print what it would do
node scripts/collect-changelog.js 1.3.0             # do it
```

Joins the fragments in `changelog.d/` into a new section of `CHANGELOG.md`, in the order
their pull requests landed, and empties the directory. `--dry-run` prints the section it
would write and the files it would remove, and writes nothing: worth doing first, because
the real run is the one thing in this procedure that cannot be undone except through git,
and a fragment written minutes ago is not in git yet.

It refuses a version that does not look like one, which includes a flag. That rule exists
because `--help`, which this script does not have, was once taken as the version and wrote
a section called `## --help`. It refuses to run with no fragments
or with a version the changelog already has, so a release cannot quietly ship with nothing
written about it.

See `changelog.d/README.md` for what belongs in a fragment. Anything that arrived before
this was introduced is already written straight into `CHANGELOG.md`; leave it there.

### 1b. Write the one line the update dialog shows

`changelog.d/RELEASE-NOTE.md`, one line, at most 200 characters. It is what somebody will see
in the update dialog, and for most people it will be the only thing they ever read about
the release. Nothing displays it yet: the band that will is still being designed, and this
is checked ahead of it because a missing or stale note would be seen by everybody at once
on the day something does.

It is written by hand rather than taken from `changelog.d/`, and that is not laziness. The
fragments are written to be read on a page: each spends its best sentences on _why_
something changed, which is what makes a changelog worth reading and the first thing that
does not fit in a small box. Measured for 1.4.0: those fragments came to 1379 characters
over three paragraphs, about thirty-four lines on a phone, and two of the three described
the same change from different angles.

The publication refuses three things, so none of them can be forgotten: a note that is
missing or empty, one over 200 characters, and one **word for word the same as the
previous version's**. That last one is the reason this is checked at all: a stale note
publishes cleanly, looks cared for, and tells people about a release they already have.

### 2. Bump the version, in a pull request

```bash
npm version patch --no-git-tag-version   # 1.0.0 → 1.0.1 (bug fixes)
npm version minor --no-git-tag-version   # 1.0.0 → 1.1.0 (new features)
npm version major --no-git-tag-version   # 1.0.0 → 2.0.0 (breaking changes)
```

That writes the version into `package.json` and `package-lock.json`, and the `version`
script runs `scripts/sync-version.js`, which writes it into `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`.

**The flag is not optional here.** Without it, `npm version` also makes a commit and a git
tag on the spot, and the next `git push --follow-tags` sends that tag, which starts the
release build from a branch nobody has reviewed. The tag belongs after the merge, not
before it.

Then add the release to `packaging/flathub/io.github.henfrydls.daylo.metainfo.xml`, dated
the day the tag will be made, and open the bump as its own pull request. If the tag slips
to another day, move the date with it.

### 3. Tag, once the bump is on main

The tag is the owner's to make, on the merge commit, and it is what publishes:

```bash
git tag v1.3.0
git push origin v1.3.0
```

### 4. CI builds and publishes

GitHub Actions (`.github/workflows/release.yml`) automatically:

- Builds for Windows (x64, ARM64), macOS (Intel, Apple Silicon), and Linux (x64)
- Creates a GitHub Release with all installers attached
- Signs the updater artifacts and, once every platform has finished, writes the one
  `latest.json` the updater reads
- Asks the address the app actually reads whether it gives back the version just published

Nothing on this page has to be remembered for the updater to be correct: each of those is
a step that fails the publication rather than a note somebody checks. What is worth knowing
is what each failure means.

**"No signature for: …"** means a platform did not finish, or its artifact is not named
the way the manifest expects. Publishing without it would leave that platform's people never
offered an update again, with nothing going red, which is why it stops instead.

**"The release note is …"**: see step 1b.

**"$url says X and this release is Y"** means the manifest was not replaced, or this is
not the release GitHub considers latest. `/releases/latest` skips prereleases and is also whatever
has been marked latest, which can be moved by hand, so this asks the question that covers
both: does the address the app reads give back what was just published?

### The signing key

The updater refuses any download not signed by the key whose public half is in
`src-tauri/tauri.conf.json`. The private half is in the repository's secrets as
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and a copy is on the
USB stick beside the Android keystore.

**If that key is lost, every installed copy of Daylo stops being updatable, for good.** The
public half is inside each one, so nothing else can sign something they will accept, and
the only way out is asking every person to reinstall by hand. Regenerating it has exactly
the same effect as losing it.

To check that the secret still signs, on the day it is set, the day it is rotated, and any
day there is doubt, run the **"Does the signing secret sign?"** workflow by hand. It takes
about a minute, publishes nothing, and prints nothing of the key. It exists because whoever
sets the secret has only checked that _their file_ signs: between that file and the secret
there is a `gh secret set` that can add a stray byte, and that byte fails with a message
about base64 that names nothing.

## Adding a Tauri plugin on Android

Nothing to do, but two things to know, because both of them only bite on a phone.

**The keep rule already covers you.** `src-tauri/gen/android/app/proguard-rules.pro` keeps
`app.tauri.**` with its members. Every plugin's argument and model classes are built by
Jackson through reflection in `Invoke.parseArgs`, R8 cannot see a reflective call, and the
release build minifies. Without that rule R8 strips the constructors it believes unused and
leaves the class names, and the plugin fails at runtime with

```
Cannot construct instance of `app.tauri.…` (no Creators, like default constructor, exist)
```

naming a class it can see but cannot build. That is what silenced the daily reminder for a
day. No plugin ships rules of its own: `tauri-plugin-notification` 2.3.3 declares
`consumerProguardFiles("consumer-rules.pro")` without shipping the file, and 2.4.0 ships it
empty.

**Test it on a release build, never a debug one.** `isMinifyEnabled` is `false` for debug,
so a debug APK cannot reproduce any of this: it will work, and send you looking for a
difference that is not there. Use the `build-installers` label, and check what the phone
actually did rather than what the app says it did:

```bash
adb shell dumpsys alarm | grep -B2 -A6 TimedNotificationPublisher   # for a scheduled one
adb shell dumpsys notification --noredact | grep -A5 com.daylo.app  # once it has fired
```

If something fails, the message has to reach the screen to be read at all. See below.

## Reading logs off a phone

Tauri, wry and the plugins gate every log line behind `BuildConfig.DEBUG`, `Logger.error`
included. On a release APK nothing they write reaches logcat: not a plugin's own messages,
not a `console.error` from the app. A release build's only channel out of the device is the
screen.

When that is not enough, the `build-debug-apk` label on a pull request (or the
`debug_apk` input on a manual run) builds the same code in debug and signs it with the
release key. It installs over an existing Daylo without uninstalling, so nobody loses their
data, and everything speaks: the plugins, the console, and `chrome://inspect` over USB.

That artifact is named with DEBUG in it and is never published. It is slower, larger, and
debuggable by any process on the phone.

## Verifying the Version

The app displays its version in the menu. In development:

- Web mode: reads `__APP_VERSION__` injected by Vite from `package.json`
- Desktop mode: reads from Tauri API (which reads `tauri.conf.json` → `package.json`)

## Local Build

To build a local installer without creating a release:

```bash
npm run tauri:build
```

Installers are generated in `src-tauri/target/release/bundle/`.
