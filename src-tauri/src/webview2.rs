//! Telling somebody their Windows is missing the piece Daylo draws itself with.
//!
//! Without the WebView2 runtime the app does not fail, it vanishes: the window never
//! opens, `run()` returns an error, `.expect` panics, and the release profile has no
//! console for the panic to reach. A person double clicks Daylo and nothing happens at
//! all, which is indistinguishable from an app that is simply broken.
//!
//! It has not mattered until now because the installer we publish downloads the runtime
//! while installing. The Store package cannot: an MSIX runs no installer of its own, and
//! the machines that still lack the runtime are exactly the ones that would find Daylo
//! there.

/// Whether the version string in the registry means the runtime is installed.
///
/// Microsoft's own instructions are to read `pv` under the runtime's client key and to
/// treat a missing key, an empty value and `0.0.0.0` as "not installed". The three cases
/// are why this is a function with a test rather than a truthiness check at the call
/// site: two of them are a key that exists.
///
/// Not behind a `cfg`, so it is compiled and tested everywhere. The registry and the
/// window below cannot be, and are the parts no test here can reach.
// Nothing calls it off Windows, and that is the point: it is the half of this file that
// a machine without Windows can still check.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn looks_installed(pv: Option<&str>) -> bool {
    match pv {
        Some(version) => !version.is_empty() && version != "0.0.0.0",
        None => false,
    }
}

#[cfg(target_os = "windows")]
pub use windows_only::*;

#[cfg(target_os = "windows")]
mod windows_only {
    use super::looks_installed;

    /// The runtime's own client id, which is not ours to choose and does not change.
    const CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    /// Where the download page lives, said once.
    const GET_IT: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

    /// All three places the runtime records itself: per machine on 64 bit Windows, per
    /// machine on 32 bit, and per user. Any one of them counts, because any one of them
    /// means a runtime this app can use.
    pub fn is_missing() -> bool {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;

        let places = [
            (
                HKEY_LOCAL_MACHINE,
                format!("SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
            ),
            (
                HKEY_LOCAL_MACHINE,
                format!("SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
            ),
            (
                HKEY_CURRENT_USER,
                format!("Software\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
            ),
        ];

        !places.iter().any(|(root, path)| {
            let value = RegKey::predef(*root)
                .open_subkey(path)
                .ok()
                .and_then(|key| key.get_value::<String, _>("pv").ok());
            looks_installed(value.as_deref())
        })
    }

    /// Say it in the only way that can be said at this point: a system window, before
    /// there is an app to put anything in.
    pub fn explain_and_exit() -> ! {
        let answer = rfd::MessageDialog::new()
            .set_title("Daylo needs one more thing")
            .set_description(
                "Daylo draws its window with a Windows component called WebView2, and this PC \
                 does not have it. Install it from Microsoft, then open Daylo again.",
            )
            .set_buttons(rfd::MessageButtons::OkCancelCustom(
                "Get WebView2".to_owned(),
                "Close".to_owned(),
            ))
            .show();

        if answer == rfd::MessageDialogResult::Custom("Get WebView2".to_owned()) {
            // Through the shell, because there is no webview to navigate and no plugin
            // yet: nothing has been built at this point in the start up.
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", GET_IT])
                .spawn();
        }

        std::process::exit(0)
    }
}

#[cfg(test)]
mod tests {
    use super::looks_installed;

    /// The two shapes that are a key with nothing in it. Both are documented as meaning
    /// the runtime is not there, and both would read as installed to anybody checking
    /// only whether the value exists.
    #[test]
    fn an_empty_version_is_not_a_runtime() {
        assert!(!looks_installed(None), "no key at all");
        assert!(
            !looks_installed(Some("")),
            "the key exists and says nothing"
        );
        assert!(
            !looks_installed(Some("0.0.0.0")),
            "the key exists and says zero"
        );
    }

    #[test]
    fn a_real_version_is() {
        assert!(looks_installed(Some("139.0.3405.102")));
        assert!(looks_installed(Some("86.0.616.0")));
    }
}
