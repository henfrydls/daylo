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
                save_dialog_available
            ]);

    // Android writes through the filesystem plugin rather than through write_text_file:
    // the picker returns a content:// URI and std::fs cannot open one.
    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, save_dialog_available]);

    // iOS registers neither, so the frontend falls back to the browser download, which is
    // what it has always done there. Nothing about iOS has been tested.
    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![greet]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
