// Android only, and it is the only module that is: everything inside it is a JNI call,
// so there is nothing in it that compiles anywhere else. What it produces is turned into
// words by `packaging`, which compiles everywhere and is where the tests are.
#[cfg(target_os = "android")]
mod android;
mod checkin;
// The module compiles everywhere, because the check-in asks it on every platform which
// word describes this copy. The command inside it is still desktop only, like the updater
// it serves: on Android and iOS nothing offers an update, so nothing asks how to install
// one.
mod packaging;
// Compiles everywhere although only Android asks it anything, and that is deliberate: the
// parts worth testing are the two that read a configuration block and a manifest, and a
// module gated to Android is a module no `cargo test` on a laptop ever reads.
mod updates;
mod webview2;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Write text to a path the user chose in the save dialog.
///
/// This exists instead of the filesystem plugin because the path is not known in advance
/// and cannot be expressed as a scope: it is whatever the user picked. Inside a Flatpak it
/// is a document portal path, which the portal mounts writable for exactly this purpose,
/// so no filesystem permission is needed either.
///
/// The frontend is the app's own bundled code and no remote content is ever loaded, so an
/// arbitrary path here is the user's choice rather than an opening. If that ever stops
/// being true, this command has to go.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| {
        // The path stays out of the returned message. Inside a Flatpak it is a document
        // portal path that means nothing to whoever reads it, and the frontend already
        // describes the file the same way it does on success. It still belongs in the log.
        log::error!("could not write {path}: {error}");
        error.to_string()
    })
}

/// Whether a native save dialog can actually be opened.
///
/// Registered everywhere the dialog plugin can open one, which is the desktop and
/// Android. It is deliberately NOT registered on iOS, so a rejected call still means
/// "nothing here can open a dialog, use the browser download". A `false` means something
/// else entirely: a dialog exists in principle and would not open, which has to be said
/// out loud rather than discovered.
///
/// It has to be asked before the dialog rather than inferred from its result. The plugin's
/// `blocking_save_file` returns `Option<FilePath>` and has no error channel, and on Linux
/// rfd logs the portal failure, tries zenity, and then returns `None`, which is exactly
/// what a user cancelling looks like. Guessing afterwards would mean ending an export with
/// a stopped spinner, no file and no message.
#[cfg(not(target_os = "ios"))]
#[tauri::command]
async fn save_dialog_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        file_portal_answers().await
    }
    // Windows, macOS and Android open their own, which are part of the system rather
    // than a service that can be absent.
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

/// Ask the XDG desktop portal whether it is there. On Linux the dialog goes through it,
/// because of the xdg-portal feature in Cargo.toml.
#[cfg(target_os = "linux")]
async fn file_portal_answers() -> bool {
    let probe = async {
        let connection = zbus::Connection::session().await.ok()?;
        let proxy = zbus::Proxy::new(
            &connection,
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.FileChooser",
        )
        .await
        .ok()?;
        // Reading a property is what proves the service answers. Building the proxy alone
        // does not: a bus name can be activatable and still fail to start.
        proxy.get_property::<u32>("version").await.ok()
    };

    // Bounded, because a session bus that never answers must not leave an export spinning,
    // which is the exact failure this is here to remove.
    match tokio::time::timeout(std::time::Duration::from_secs(3), probe).await {
        Ok(version) => version.is_some(),
        Err(_) => {
            log::error!("the desktop portal did not answer within 3s");
            false
        }
    }
}

/// Whether this build can schedule a daily reminder.
///
/// Registered on Android only, so a rejected call means every other platform. The desktop
/// is deliberately out: a notification that only fires while the app is running is not a
/// reminder, and nothing on the desktop restores a schedule after a restart.
#[cfg(target_os = "android")]
#[tauri::command]
fn reminders_available() -> bool {
    true
}

/// How this copy got onto the phone, as one of the words in `packaging::android_source`.
///
/// The desktop answers the same question with `install_format`, which reads the stamp the
/// bundler leaves in the binary. No bundler stamps an APK, so here it is the installing
/// package that decides, and the two commands exist separately because they ask the
/// platform different things rather than because the frontend wants two names.
#[cfg(target_os = "android")]
#[tauri::command]
fn install_source() -> &'static str {
    packaging::checkin_source()
}

/// The version Daylo's own update manifest names, or why it is not known.
///
/// Android only, and it exists because the updater plugin does not: it is not built for
/// this platform, and the page cannot ask either, because the app's CSP is
/// `default-src 'none'`. The address is the one in `tauri.conf.json`, the same file and
/// the same line the desktop updater reads, so this adds no address to the app. See the
/// head of src/updates.rs for why that matters beyond tidiness.
///
/// `async`, and that is load bearing rather than style. A Tauri command that is not async
/// runs on the main thread, which on Android is the interface thread, and Android throws
/// NetworkOnMainThreadException at anything that opens a socket there. The request then
/// goes to a blocking thread, because it is a blocking call and the async runtime's
/// workers are not for waiting on networks.
///
/// Returns the version as the manifest spells it and compares nothing. Whether that is
/// newer, and whether this copy should be told at all, are decisions with rules attached
/// and they live on the other side, next to the rest of them.
#[cfg(target_os = "android")]
#[tauri::command]
async fn latest_version(app: tauri::AppHandle) -> Result<String, String> {
    let endpoint = updates::endpoint(app.config().plugins.0.get("updater"))?;

    let manifest = tauri::async_runtime::spawn_blocking(move || {
        android::fetch_text(&endpoint, updates::MANIFEST_LIMIT as i32)
    })
    .await
    .map_err(|_| "the check could not be started".to_string())??;

    updates::version_in(&manifest)
}

/// Whether the reminder will arrive at the time it was set for.
///
/// False means it still arrives, within an hour or so of the time and later than that out
/// of a deep doze, which is what an inexact alarm is. The screen uses this to decide
/// whether to say so and offer the way to change it, not whether to schedule anything.
///
/// Registered either way, and only called while EXACT_ALARMS_DECLARED in
/// src/lib/reminders.ts is on, as it is in 1.5.3: without the permission in the manifest the
/// answer is always no from Android 12 up, and there is nothing to offer.
#[cfg(target_os = "android")]
#[tauri::command]
fn exact_alarms_allowed() -> bool {
    android::exact_alarms_allowed()
}

/// Open the phone's "Alarms & reminders" screen for this app.
///
/// Returns whether it opened, not whether anything was granted: the person decides on
/// that screen and Daylo finds out by asking again when it comes back.
#[cfg(target_os = "android")]
#[tauri::command]
fn ask_for_exact_alarms() -> bool {
    android::ask_for_exact_alarms()
}

/// What a second launch does to the copy that is already running: shows its window, out
/// of the taskbar if it was minimised, and in front. The second launch's arguments and
/// working directory are not used, because Daylo takes none: no deep link, no file to
/// open, nothing on its command line.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn bring_back_the_open_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The name a copy of Daylo owns on the Linux session bus, before the plugin adds
/// `.SingleInstance`. Derived from the identifier the app was built with, so that the lab
/// (com.daylo.lab) owns a name of its own: with a fixed one, the lab's AppImage opened next
/// to the real Daylo would bring the real window forward and close, and could never be
/// tried on the same desktop.
///
/// The released identifier is the one exception. It becomes the Flatpak's app id, because
/// the Flatpak sandbox lets an app own names under its own id and nothing else without a
/// permission: io.github.henfrydls.daylo.SingleInstance needs none, com.daylo.app's would.
/// The deb and the AppImage use the same name, which is what makes two of them one.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn single_instance_bus_id(identifier: &str) -> &str {
    if identifier == "com.daylo.app" {
        "io.github.henfrydls.daylo"
    } else {
        identifier
    }
}

/// Whether the plugin's names on the Linux session bus are ones zbus accepts, built exactly
/// as the plugin builds them: `<bus id>.SingleInstance` as the well-known name, and the same
/// with dots turned into slashes and dashes into underscores as the object path. The plugin
/// unwraps both, and with `panic = "abort"` an identifier that does not fit, one with an
/// element starting with a digit for instance, would end every launch.
#[cfg(target_os = "linux")]
fn single_instance_names_valid(bus_id: &str) -> bool {
    let name = format!("{bus_id}.SingleInstance");
    let mut path = name.replace('.', "/").replace('-', "_");
    if !path.starts_with('/') {
        path = format!("/{path}");
    }
    zbus::names::WellKnownName::try_from(name.as_str()).is_ok()
        && zbus::zvariant::ObjectPath::try_from(path.as_str()).is_ok()
}

/// Whether the plugin can be started without taking the app down with it. Daylo opened
/// before the plugin for everybody, and it still has to.
///
/// On Linux the plugin opens the session bus with `Builder::session().unwrap()`, which is
/// `zbus::Address::session()` and nothing else: DBUS_SESSION_BUS_ADDRESS when it is set
/// and valid Unicode, `unix:path=` under XDG_RUNTIME_DIR (or /run/user/<uid>) when it is
/// not. It fails only when the variable holds something zbus cannot read, `disabled:` or a
/// transport it does not know, and this asks the same function first. A bus that can be
/// read but not reached is fine: the plugin treats that as an error and carries on.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn single_instance_can_start(bus_id: &str) -> bool {
    #[cfg(target_os = "linux")]
    {
        if zbus::Address::session().is_err() {
            log::warn!(
                "the session bus address cannot be read; starting without the single instance"
            );
            return false;
        }
        if !single_instance_names_valid(bus_id) {
            log::warn!("{bus_id} makes no valid bus name; starting without the single instance");
            return false;
        }
        true
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = bus_id;
        true
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before anything else, because everything else assumes a window can exist. Without
    // the WebView2 runtime this app does not fail, it vanishes: no window, a panic with
    // no console to print it, and a person left looking at a desktop where nothing
    // happened. The installer we publish fetches the runtime; the Store package cannot.
    #[cfg(target_os = "windows")]
    if webview2::is_missing() {
        webview2::explain_and_exit();
    }

    let context = tauri::generate_context!();
    let builder = tauri::Builder::default();

    // First, before any other plugin, as the plugin asks: the second copy has to stop here,
    // before anything else of it starts. Somebody who thinks Daylo has not refreshed opens
    // it again, and two windows each holding their own copy of the days meant one of them
    // could save over what was ticked in the other. Now the second launch brings back the
    // window that is already open and goes away. Desktop only: Android and iOS already
    // give an app one instance. See bring_back_the_open_window for what it is handed.
    //
    // Not in a debug build, which is `tauri dev`: it has the released identifier, so it
    // would find the installed Daylo open, bring it forward and close itself.
    //
    // Where it does not hold, all of it measured by nobody yet:
    // - The snap. Strict confinement does not let it own the bus name without a dbus
    //   slot, which snapcraft.yaml does not declare, so each launch there still opens a
    //   window (#250).
    // - On Windows the name is the identifier, so the Store copy and the installer's copy
    //   share it: with one of them open, opening the other brings the first forward, and
    //   that one has its own data. Accepted: having both installed is rare, and the window
    //   that comes forward is a real Daylo, not a lost one.
    // - The focus. Windows lets the first copy come to the front because the second hands
    //   it the right before closing. GNOME on Wayland may refuse a window that raises
    //   itself without the token of the launch that asked, which the plugin does not pass
    //   on; then the window is shown but not in front.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = if cfg!(debug_assertions) {
        builder
    } else {
        // Linux only; Windows and macOS use the identifier as it is.
        let bus_id = single_instance_bus_id(&context.config().identifier);
        if single_instance_can_start(bus_id) {
            builder.plugin(
                tauri_plugin_single_instance::Builder::new()
                    .dbus_id(bus_id)
                    .callback(|app, _argv, _cwd| bring_back_the_open_window(app))
                    .build(),
            )
        } else {
            builder
        }
    };

    let builder = builder.plugin(tauri_plugin_shell::init());

    // The dialog goes everywhere it can open: the desktop and Android. What each platform
    // registers is also what tells the frontend where it is running, so the two sides
    // cannot drift. See chooseSaveTarget() in src/lib/fileSave.ts.
    let builder = builder.plugin(tauri_plugin_dialog::init());

    // The updater and the relaunch that finishes it, desktop only. Not a preference:
    // Tauri's updater does not exist on Android or iOS, where the store is the only route
    // an update can take. Whatever the screen says about updates has to say that too.
    //
    // The request this plugin makes is the second address this app ever contacts, and it
    // is made here, in Rust. The webview cannot make it: the app's CSP is
    // `default-src 'none'` with `connect-src 'self' ipc: tauri:`, so the page can reach no
    // host at all. That sentence is in the privacy policy and it stays true.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            write_text_file,
            save_dialog_available,
            checkin::checkin_fields,
            checkin::send_checkin,
            checkin::send_feedback,
            packaging::install_format
        ]);

    // Android writes through the filesystem plugin rather than through write_text_file:
    // the picker returns a content:// URI and std::fs cannot open one. The notification
    // plugin is here and nowhere else. The daily reminder survives a restart and an update
    // because the patched copy pinned in Cargo.toml stores what it scheduled and re-arms it
    // from a receiver of its own, on BOOT_COMPLETED and on MY_PACKAGE_REPLACED.
    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        // Also here, and not only on the desktop, because the shell plugin's `open` cannot
        // do it: it goes through the `open` crate, which maps Android to its unix module
        // and reaches for `xdg-open`, a program no Android has. The opener plugin has
        // Kotlin of its own and sends an ACTION_VIEW intent, which is how a mailto: finds
        // a mail app there — and how the app learns it did not, because a phone with none
        // rejects with the system's own exception.
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_dialog_available,
            reminders_available,
            latest_version,
            install_source,
            exact_alarms_allowed,
            ask_for_exact_alarms,
            checkin::checkin_fields,
            checkin::send_checkin,
            checkin::send_feedback
        ]);

    // iOS registers neither, so the frontend falls back to the browser download, which is
    // what it has always done there. Nothing about iOS has been tested.
    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![greet]);

    builder
        .run(context)
        .expect("error while running tauri application");
}

/// What `plugins` in tauri.conf.json is checked against, and why getting it wrong is a
/// crash rather than a warning.
///
/// Tauri hands each plugin its own block while the app starts and deserializes it into
/// that plugin's config type: `config.0.get(plugin.name()).cloned().unwrap_or_default()`
/// in tauri's plugin store, then `serde_json::from_value` in the plugin builder. A block
/// the type does not fit is an error, `run()` returns it, the `.expect` above turns it
/// into a panic, and `panic = "abort"` in the release profile turns that into SIGABRT.
/// The app never draws a frame.
///
/// That is not hypothetical. A `plugins.notification` block with an icon in it looked
/// reasonable — the plugin's Android half really does read a config by that name — but
/// its Rust half builds with `Builder::new("notification")`, whose config type is the
/// unit `()`. A phone died twice on "invalid type: map, expected unit" before this
/// existed, and every build check was green, because they all compile and none of them
/// start the app.
#[cfg(test)]
mod plugin_config {
    use serde::de::DeserializeOwned;
    use serde_json::Value;
    use tauri::plugin::TauriPlugin;
    use tauri::Wry;

    /// Every plugin this app registers, on any platform. The list is here so that a block
    /// for something we do not register cannot sit in the config being ignored until the
    /// day somebody registers it.
    const REGISTERED: [&str; 8] = [
        "shell",
        "dialog",
        "opener",
        "fs",
        "notification",
        "updater",
        "process",
        "single-instance",
    ];

    fn conf() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is not valid JSON")
    }

    /// The block Tauri would pass this plugin. Absent means `Value::Null`, which is what
    /// `unwrap_or_default` produces and what a unit config accepts.
    fn block(name: &str) -> Value {
        conf()
            .get("plugins")
            .and_then(|plugins| plugins.get(name))
            .cloned()
            .unwrap_or(Value::Null)
    }

    /// Ask the plugin, not a table in this file: `C` is inferred from the `TauriPlugin`
    /// its own `init()` returns, so if a plugin gains or drops a config in some later
    /// version this follows it without being edited. That is the whole point — the block
    /// that crashed the app was written from the documentation of the half that reads it.
    fn accepts<C: DeserializeOwned>(
        _plugin: &TauriPlugin<Wry, C>,
        name: &str,
    ) -> Result<(), String> {
        serde_json::from_value::<C>(block(name))
            .map(|_| ())
            .map_err(|e| format!("plugins.{name} in tauri.conf.json: {e}"))
    }

    /// The page can reach no host at all, and the check-in's whole argument rests on it.
    ///
    /// Pinned in full rather than checked for `connect-src`, because the interesting
    /// failure is not somebody adding a host: it is somebody loosening `default-src` or
    /// dropping `form-action` while adding something unrelated, and then the check-in
    /// stops being the only thing that can leave. If this test fails, the sentence in the
    /// privacy policy has to be rewritten before the line is.
    #[test]
    fn the_page_may_still_reach_nothing() {
        let csp = conf()
            .get("app")
            .and_then(|app| app.get("security"))
            .and_then(|security| security.get("csp"))
            .and_then(Value::as_str)
            .expect("tauri.conf.json has no app.security.csp")
            .to_string();

        assert_eq!(
            csp,
            concat!(
                "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; ",
                "img-src 'self' data:; font-src 'self'; connect-src 'self' ipc: tauri:; ",
                "form-action 'none'; base-uri 'self'; frame-ancestors 'none'"
            )
        );
    }

    #[test]
    fn every_block_is_one_its_plugin_accepts() {
        let mut refused = Vec::new();
        for result in [
            accepts(&tauri_plugin_shell::init::<Wry>(), "shell"),
            accepts(&tauri_plugin_dialog::init::<Wry>(), "dialog"),
            accepts(&tauri_plugin_opener::init::<Wry>(), "opener"),
            accepts(&tauri_plugin_fs::init::<Wry>(), "fs"),
            accepts(&tauri_plugin_notification::init::<Wry>(), "notification"),
            accepts(
                &tauri_plugin_single_instance::Builder::<Wry>::new().build(),
                "single-instance",
            ),
            // The updater is the only one of these with a block in the config, so it is
            // the only one where "the plugin accepts what we wrote" is a real question
            // rather than a formality.
            accepts(
                &tauri_plugin_updater::Builder::new().build::<Wry>(),
                "updater",
            ),
        ] {
            if let Err(why) = result {
                refused.push(why);
            }
        }
        assert!(
            refused.is_empty(),
            "the app would abort on the first frame:\n  {}",
            refused.join("\n  ")
        );
    }

    /// A block for a plugin nobody registers is dead text today and a crash the day
    /// somebody adds the plugin, which is the worst possible moment to find out.
    #[test]
    fn no_block_belongs_to_a_plugin_the_app_does_not_register() {
        let conf = conf();
        let plugins = conf.get("plugins").and_then(Value::as_object);
        let strangers: Vec<&String> = plugins
            .into_iter()
            .flatten()
            .map(|(name, _)| name)
            .filter(|name| !REGISTERED.contains(&name.as_str()))
            .collect();
        assert!(
            strangers.is_empty(),
            "tauri.conf.json configures plugins this app never registers: {strangers:?}"
        );
    }
}

/// The name the single instance owns on the Linux session bus, and whether zbus accepts
/// it. Both decide whether a second launch brings back the open window or takes the first
/// launch down, and neither can be seen without two copies of the app. The check on the bus
/// address is not here: it is one call to zbus that reads the environment, and a test that
/// changed the environment would race the others running beside it.
#[cfg(all(test, not(any(target_os = "android", target_os = "ios"))))]
mod single_instance {
    use super::single_instance_bus_id;

    #[test]
    fn the_released_copy_owns_a_name_the_flatpak_may_own_without_a_permission() {
        assert_eq!(
            single_instance_bus_id("com.daylo.app"),
            "io.github.henfrydls.daylo"
        );
    }

    #[test]
    fn the_lab_owns_a_name_of_its_own() {
        assert_eq!(single_instance_bus_id("com.daylo.lab"), "com.daylo.lab");
    }

    #[cfg(target_os = "linux")]
    mod bus_names {
        use super::super::{single_instance_bus_id, single_instance_names_valid};

        #[test]
        fn the_released_copy_and_the_lab_make_valid_bus_names() {
            for identifier in ["com.daylo.app", "com.daylo.lab"] {
                let bus_id = single_instance_bus_id(identifier);
                assert!(
                    single_instance_names_valid(bus_id),
                    "{identifier} -> {bus_id}"
                );
            }
        }

        #[test]
        fn an_identifier_with_an_element_starting_with_a_digit_does_not() {
            assert!(!single_instance_names_valid(single_instance_bus_id(
                "1daylo.app"
            )));
            assert!(!single_instance_names_valid(single_instance_bus_id(
                "com.2daylo.app"
            )));
        }
    }
}
