import { describe, it, expect } from 'vitest'
import tauriConf from '../../src-tauri/tauri.conf.json'
import { REMINDER_ICON } from './reminders'

const plugins = (tauriConf as Record<string, unknown>).plugins as
  | Record<string, unknown>
  | undefined

// Every drawable that ends up in the APK. import.meta.glob rather than fs: this file is
// compiled as part of the app, which has no Node types, and a glob is checked at build
// time anyway, so a folder that moved is a failure here rather than a silent empty list.
const drawables = import.meta.glob('../../src-tauri/gen/android/app/src/main/res/drawable/*.xml')
const drawableNames = Object.keys(drawables).map((path) =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.xml$/, '')
)

// A `plugins.notification` block in tauri.conf.json is not ignored and it is not a
// warning: it kills the app on the first frame. Tauri deserializes `plugins.<name>` into
// the plugin's own config type, and tauri-plugin-notification 2.3.3 builds with a plain
// `Builder::new("notification")`, whose config type is the unit `()`. A map against a
// unit is an error, and the release profile's `panic = "abort"` turns it into SIGABRT.
// A phone showed "invalid type: map, expected unit" twice in a row before this existed.
//
// The plugin's Kotlin half does read a `notification` config block, which is what makes
// this look like it should work. It never gets the chance: the Rust half has already
// aborted the process. The same check with the real Rust types, for every plugin the app
// registers, is in src-tauri/src/lib.rs; this one is here so a change to the config is
// caught by the suite that runs on every push, in a second rather than in a Rust compile.
describe('the notification plugin takes no configuration', () => {
  it('is not configured in tauri.conf.json', () => {
    expect(plugins?.notification).toBeUndefined()
  })
})

// So the icon travels with each notification instead. Android reads it in
// Notification.getSmallIcon, which resolves the name against res/drawable and falls back
// to the system's ic_dialog_info when it resolves to nothing. The fallback is silent: a
// wrong name here shows a generic circled "i" in the status bar and reports no error.
describe('the small icon Android draws', () => {
  it('names a drawable that is in the APK', () => {
    expect(drawableNames).toContain(REMINDER_ICON)
  })

  // getSmallIcon passes the name straight to getResourceID, with no getResourceBaseName
  // in between: a path or an extension resolves to nothing and takes the silent fallback.
  it('is a bare resource name, which is all getResourceID accepts', () => {
    expect(REMINDER_ICON).not.toMatch(/[/.]/)
  })
})
