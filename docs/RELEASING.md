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
