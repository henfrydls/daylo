mod checkin;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // The dialog goes everywhere it can open: the desktop and Android. What each platform
    // registers is also what tells the frontend where it is running, so the two sides
    // cannot drift. See chooseSaveTarget() in src/lib/fileSave.ts.
    let builder = builder.plugin(tauri_plugin_dialog::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder =
        builder
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                greet,
                write_text_file,
                save_dialog_available,
                checkin::checkin_fields,
                checkin::send_checkin
            ]);

    // Android writes through the filesystem plugin rather than through write_text_file:
    // the picker returns a content:// URI and std::fs cannot open one. The notification
    // plugin is here and nowhere else: it is what survives a reboot, because it persists
    // what it scheduled and re-arms it from a BOOT_COMPLETED receiver of its own.
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
            checkin::checkin_fields,
            checkin::send_checkin
        ]);

    // iOS registers neither, so the frontend falls back to the browser download, which is
    // what it has always done there. Nothing about iOS has been tested.
    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![greet]);

    builder
        .run(tauri::generate_context!())
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
    const REGISTERED: [&str; 5] = ["shell", "dialog", "opener", "fs", "notification"];

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
