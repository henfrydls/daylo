# Releasing a New Version

## How Versioning Works

The app version lives in **one source of truth**: `package.json`.

- `src-tauri/tauri.conf.json` reads from `package.json` automatically (`"version": "../package.json"`)
- `src-tauri/Cargo.toml` is synced via `scripts/sync-version.js` during the bump

## Release Workflow

### 1. Bump the version

```bash
npm version patch   # 1.0.0 → 1.0.1 (bug fixes)
npm version minor   # 1.0.0 → 1.1.0 (new features)
npm version major   # 1.0.0 → 2.0.0 (breaking changes)
```

This single command:
- Updates `package.json` version
- Runs `scripts/sync-version.js` to update `Cargo.toml`
- Creates a git commit with message `v1.0.1`
- Creates a git tag `v1.0.1`

### 2. Push the tag

```bash
git push --follow-tags
```

### 3. CI builds and publishes

GitHub Actions (`.github/workflows/release.yml`) automatically:
- Builds for Windows (x64, ARM64), macOS (Intel, Apple Silicon), and Linux (x64)
- Creates a GitHub Release with all installers attached

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
