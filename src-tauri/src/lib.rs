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
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| format!("{path}: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // Desktop only, and deliberately: on Android and iOS the export keeps the browser
    // download path, so shipping a dialog plugin that nothing calls would only grow the
    // app. See isTauriDesktop() in src/lib/fileSave.ts, which decides the same thing on
    // the other side.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    builder
        .invoke_handler(tauri::generate_handler![greet, write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
