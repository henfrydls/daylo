//! How this copy of Daylo was installed, which the app has to know before it offers to
//! update itself.
//!
//! On Linux the reason is sharp. The updater's manifest has one entry per platform and
//! `linux-x86_64` is one platform, while Daylo is published as both a `.deb` and an
//! AppImage. Whichever of the two the manifest points at, the other one would be offered
//! an update, download it, and fail at the last step: the installer checks the format of
//! what arrived and refuses it. An update offered and broken is worse than no update, and
//! much worse in the app whose argument is that it does nothing strange.
//!
//! So the screen has to be able to ask. `bundle_type` is the same function the updater
//! plugin itself uses to decide how to install, so the answer here and the behaviour there
//! cannot drift: if this says Deb, that is what the plugin will try.
//!
//! The value comes from a string the bundler patches into the binary when it packages it,
//! which is why an unpackaged binary answers None. That is not an error case to hide: a
//! binary nobody packaged was not installed either, and it has nothing to update.

use tauri::utils::config::BundleType;

/// The packaging, as a word the frontend can compare, or None if this binary was never
/// packaged.
///
/// Words and not the enum, because this crosses to JavaScript and the names on that side
/// should not move when a Rust type is renamed upstream.
pub fn installed_as(bundle: Option<BundleType>) -> Option<&'static str> {
    match bundle? {
        BundleType::Deb => Some("deb"),
        BundleType::Rpm => Some("rpm"),
        BundleType::AppImage => Some("appimage"),
        BundleType::Msi => Some("msi"),
        BundleType::Nsis => Some("nsis"),
        BundleType::App | BundleType::Dmg => Some("macos"),
    }
}

/// What the screen asks before offering anything.
#[tauri::command]
pub fn install_format() -> Option<&'static str> {
    installed_as(tauri::utils::platform::bundle_type())
}

#[cfg(test)]
mod tests {
    use super::{installed_as, BundleType};

    /// The mapping, spelled out. It exists so that a rename upstream is a compile error
    /// here rather than a word quietly changing under the frontend's feet.
    #[test]
    fn every_packaging_has_a_word() {
        assert_eq!(installed_as(Some(BundleType::Deb)), Some("deb"));
        assert_eq!(installed_as(Some(BundleType::Rpm)), Some("rpm"));
        assert_eq!(installed_as(Some(BundleType::AppImage)), Some("appimage"));
        assert_eq!(installed_as(Some(BundleType::Msi)), Some("msi"));
        assert_eq!(installed_as(Some(BundleType::Nsis)), Some("nsis"));
        assert_eq!(installed_as(Some(BundleType::App)), Some("macos"));
        assert_eq!(installed_as(Some(BundleType::Dmg)), Some("macos"));
    }

    /// A binary nobody packaged, which is what a `cargo run` and the smoke run in CI are.
    /// It has no install to update, and saying so is the honest answer rather than
    /// guessing a format.
    #[test]
    fn an_unpackaged_binary_says_nothing() {
        assert_eq!(installed_as(None), None);
    }
}
