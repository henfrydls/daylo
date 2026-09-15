# Releasing a New Version

## How Versioning Works

The app version lives in **one source of truth**: `package.json`.

- `src-tauri/tauri.conf.json` reads from `package.json` automatically (`"version": "../package.json"`)
- `src-tauri/Cargo.toml` is synced via `scripts/sync-version.js` during the bump

## Release Workflow

### 1. Gather the changelog

```bash
node scripts/collect-changelog.js 1.3.0
```

Joins the fragments in `changelog.d/` into a new section of `CHANGELOG.md`, in the order
their pull requests landed, and empties the directory. It refuses to run with no fragments
or with a version the changelog already has, so a release cannot quietly ship with nothing
written about it.

See `changelog.d/README.md` for what belongs in a fragment. Anything that arrived before
this was introduced is already written straight into `CHANGELOG.md`; leave it there.

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
