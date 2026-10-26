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

/// Whether this process is running inside an MSIX package, which is what an install from
/// the Microsoft Store is.
///
/// It has to be asked separately, and the reason is a gap rather than a preference: the
/// MSIX is built by packaging `target/release/Daylo.exe`, the binary as the compiler left
/// it, never the NSIS installer. The bundler's format stamp is applied to the copies
/// inside each bundle and not to that original — measured locally: after building the deb
/// and the AppImage, the binary in target/ still answers None. So a Store install looks
/// exactly like an unpackaged binary to `bundle_type`, and our rule for None is to say
/// there is a new version without offering to install it.
///
/// That rule is right for an unknown desktop format and wrong here. The Store updates
/// these copies itself, so an offer is noise at best, and at worst somebody downloads the
/// .exe and ends up with two Daylos. Henfry asked the question before any of us thought
/// of it.
///
/// `GetCurrentPackageFullName` is how Windows answers it. Outside a package it fails with
/// APPMODEL_ERROR_NO_PACKAGE, and that failure is the answer rather than an error.
#[cfg(target_os = "windows")]
fn inside_a_store_package() -> bool {
    use windows_sys::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut length: u32 = 0;
    // SAFETY: the call is being asked for the length it would need, which is what a null
    // buffer means here. Nothing is written through the pointer.
    let result = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };
    // Anything other than APPMODEL_ERROR_NO_PACKAGE counts as a package, including an
    // error this does not expect, and that lopsidedness is the point. Being wrong here
    // means saying nothing to somebody who could have been told; being wrong the other way
    // means telling somebody to go and install what their store is already installing. Of
    // the two, silence is the one that cannot leave anybody with two Daylos.
    result != APPMODEL_ERROR_NO_PACKAGE
}

/// Whether this copy is running from inside a snap.
///
/// `$SNAP` is the root of the mounted squashfs, and snapd sets it for everything it
/// starts. It is read rather than stamped because nothing stamps it: snapcraft packages
/// what the Tauri bundler already built, so the stamp inside the binary says whichever
/// format it was unpacked from. A copy from the Snap Store would call itself a deb, and
/// the updater would offer to download a replacement into a read-only filesystem for an
/// app the store is already keeping current.
///
/// Takes the value rather than reading it, like everything else here, so the two answers
/// that matter can be pinned by a test. Set and empty counts as not set: `SNAP=` in a
/// shell is a variable that exists and says nothing.
pub fn inside_a_snap(snap: Option<&str>) -> bool {
    matches!(snap, Some(root) if !root.is_empty())
}

/// What the screen asks before offering anything.
///
/// `"store"` means the copy is managed by somebody else and Daylo says nothing at all:
/// not an offer, not a notice. It is the one answer that means silence rather than a
/// different sentence.
///
/// Registered as a command on desktop only, like the updater it serves, but compiled
/// everywhere: the check-in reaches the same fact through `checkin_source`. On Android and
/// iOS it answers None, because no bundler stamps a mobile build.
#[tauri::command]
pub fn install_format() -> Option<&'static str> {
    #[cfg(target_os = "windows")]
    if inside_a_store_package() {
        return Some("store");
    }

    // Before the stamp and not after, for the same reason as the Store check above: the
    // stamp is there and it is wrong. It describes the file snapcraft unpacked, not the
    // door this copy came through.
    #[cfg(target_os = "linux")]
    if inside_a_snap(std::env::var("SNAP").ok().as_deref()) {
        return Some("snap");
    }

    installed_as(tauri::utils::platform::bundle_type())
}

/// The one word the check-in carries about where a copy came from.
///
/// Coarser than `installed_as`, and on purpose. The updater has to tell an MSI from an
/// NSIS because it installs them differently; nobody counting which door people came in
/// by cares which of the two a Windows installer was. What is worth telling apart is the
/// Store from everything else on Windows, because that is the question nobody can answer
/// today, and one Linux package from another, because they are installed by different
/// people for different reasons.
///
/// Takes both answers rather than asking for them, so every word can be pinned by a test.
/// `installer` is only ever Some on a phone, and only the Android arm reads it.
pub fn installed_from(format: Option<&str>, installer: Option<&str>) -> &'static str {
    match format {
        // Managed by somebody else, like the Microsoft Store and Google Play, and counted
        // separately because it is a different door and a different kind of person.
        Some("snap") => "snap",
        Some("store") => "store",
        Some("nsis") | Some("msi") => "installer",
        Some("appimage") => "appimage",
        Some("deb") => "deb",
        Some("rpm") => "rpm",
        Some("macos") => "macos",
        // No bundler patches an APK, so there is nothing to read there. Android is the one
        // platform where an unstamped binary is not a development build: it is the only
        // thing we ship for it. Until 1.5 that settled it and the word was always "apk";
        // now there are two doors and the phone is asked which one this copy came through.
        None if cfg!(target_os = "android") => android_source(installer),
        // Everything else: a binary nobody packaged, and a format this version has never
        // heard of. Both are "we do not know", and saying so is better than a guess that
        // would be counted as if it were a fact.
        _ => "unknown",
    }
}

/// Google Play's own installer package, and the only name that means Play.
const PLAY_STORE: &str = "com.android.vending";

/// Which Android door a copy came through, from the package that installed it.
///
/// Android records who installed an app, and from 1.5 that is worth asking: Daylo is on
/// Play and is also a file on the site, and the two are installed by different people for
/// different reasons. Play answers with its own package name. Everything else answers
/// with the name of whatever app put the file there, or with nothing at all, and all of
/// those mean the same thing: a copy somebody installed themselves.
///
/// Takes the answer rather than asking for it, like `installed_from`, so every word is
/// pinned by a test that runs on any machine rather than only on a phone.
pub fn android_source(installer: Option<&str>) -> &'static str {
    match installer {
        Some(PLAY_STORE) => "play",
        _ => "apk",
    }
}

/// Where this copy came from, for the check-in, on every platform.
///
/// The table is reached by the same line of code everywhere, which is the point. The first
/// attempt gated this module to desktop, and the Android build found it in a minute: the
/// code for that platform had been compiled out of it.
///
/// One cfg, and it is in `android_installer` below rather than here: asking a phone who
/// installed it is a question with no meaning off a phone, so the two bodies answer it and
/// the mapping stays one branch for every platform.
pub fn checkin_source() -> &'static str {
    installed_from(install_format(), android_installer().as_deref())
}

/// Who installed this copy, asked of Android. See `crate::android`.
#[cfg(target_os = "android")]
fn android_installer() -> Option<String> {
    crate::android::installer_package_name()
}

/// Nothing to ask: no other platform records who installed anything, and the arm of the
/// table that reads this one is Android's.
#[cfg(not(target_os = "android"))]
fn android_installer() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::{android_source, inside_a_snap, installed_as, installed_from, BundleType};

    /// Every word the check-in can carry, and what it is for. A panel that counts these is
    /// only as good as the day somebody adds a format and forgets this line.
    #[test]
    fn every_way_in_has_a_word() {
        assert_eq!(installed_from(Some("snap"), None), "snap");
        assert_eq!(installed_from(Some("store"), None), "store");
        assert_eq!(installed_from(Some("nsis"), None), "installer");
        assert_eq!(installed_from(Some("msi"), None), "installer");
        assert_eq!(installed_from(Some("appimage"), None), "appimage");
        assert_eq!(installed_from(Some("deb"), None), "deb");
        assert_eq!(installed_from(Some("rpm"), None), "rpm");
        assert_eq!(installed_from(Some("macos"), None), "macos");
    }

    /// The two Windows installers answer the same thing, which is the whole reason this
    /// mapping exists apart from the updater's.
    #[test]
    fn windows_installers_are_one_door() {
        assert_eq!(
            installed_from(Some("nsis"), None),
            installed_from(Some("msi"), None)
        );
        assert_ne!(
            installed_from(Some("nsis"), None),
            installed_from(Some("store"), None)
        );
    }

    /// A snap says so in the environment, and that is the only way to know.
    ///
    /// Nothing is stamped into the binary: snapcraft takes what the Tauri bundler built
    /// and the stamp that comes with it says `deb`, which is the format it was unpacked
    /// from and not the one somebody installed. Reading that would have the updater offer
    /// a download to a copy the Snap Store keeps current, inside a read-only squashfs
    /// where nothing could be written anyway.
    #[test]
    fn a_snap_is_known_by_its_environment() {
        assert!(inside_a_snap(Some("/snap/daylo/x1")));
        assert!(!inside_a_snap(None));
    }

    /// Set and empty is not set. `SNAP=` in a shell is a variable that exists and answers
    /// nothing, and treating that as yes would call a developer's terminal a snap.
    #[test]
    fn an_empty_variable_is_not_a_snap() {
        assert!(!inside_a_snap(Some("")));
    }

    /// Android has two doors now, and only one of them has a name.
    ///
    /// Play's installer package is `com.android.vending` and nothing else is. Everything
    /// else that can put an APK on a phone leaves either its own name here (a browser, a
    /// file manager, the system installer) or nothing at all (adb), and all of those are
    /// the same fact: somebody installed a file themselves. Folding them together is the
    /// answer rather than a shortcut, because the question the panel asks is which door
    /// people came in by, not which app held it open.
    #[test]
    fn play_is_the_only_android_door_with_a_name() {
        assert_eq!(android_source(Some("com.android.vending")), "play");
        assert_eq!(android_source(None), "apk");
        assert_eq!(android_source(Some("com.android.chrome")), "apk");
        assert_eq!(
            android_source(Some("com.google.android.packageinstaller")),
            "apk"
        );
        assert_eq!(android_source(Some("org.fdroid.fdroid")), "apk");
    }

    /// The word is Play's package name and not a prefix of it. A phone that answers with
    /// something merely similar is answering something else.
    #[test]
    fn only_that_exact_package_is_play() {
        assert_eq!(android_source(Some("com.android.vending.fake")), "apk");
        assert_eq!(android_source(Some("vending")), "apk");
        assert_eq!(android_source(Some("")), "apk");
    }

    /// A word this version does not know is not silently folded into one it does.
    #[test]
    fn an_unknown_format_says_unknown() {
        assert_eq!(installed_from(Some("flatpak"), None), "unknown");
    }

    /// Nothing packaged it. On Android that is every copy; everywhere else it is a build
    /// somebody made themselves.
    #[test]
    fn nothing_packaged_it() {
        let expected = if cfg!(target_os = "android") {
            "apk"
        } else {
            "unknown"
        };
        assert_eq!(installed_from(None, None), expected);
    }

    /// The table is where the installer is read, and only where it can mean anything.
    ///
    /// On Android an unstamped binary is every copy, so the installer decides the word.
    /// Everywhere else an unstamped binary is a build somebody made themselves, and no
    /// installer name can turn it into a copy from Play: a desktop that somehow answered
    /// `com.android.vending` would still be "unknown", which is the honest word for it.
    #[test]
    fn the_installer_is_read_where_it_means_something() {
        if cfg!(target_os = "android") {
            assert_eq!(installed_from(None, Some("com.android.vending")), "play");
            assert_eq!(installed_from(None, Some("com.android.chrome")), "apk");
            assert_eq!(installed_from(None, None), "apk");
        } else {
            assert_eq!(installed_from(None, Some("com.android.vending")), "unknown");
            assert_eq!(installed_from(None, None), "unknown");
        }
    }

    /// A packaged copy is packaged whatever the phone says installed it. Nothing on the
    /// desktop supplies this argument today, and the day something does, a .deb does not
    /// become a copy from Play because a package manager had a name.
    #[test]
    fn the_installer_cannot_overrule_a_format() {
        assert_eq!(
            installed_from(Some("deb"), Some("com.android.vending")),
            "deb"
        );
        assert_eq!(
            installed_from(Some("store"), Some("com.android.vending")),
            "store"
        );
    }

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

    /// The Store's copy is not one of the words above and is not the absence of one
    /// either: it is its own answer, and the only one that means the screen says nothing
    /// at all. Pinned here because the mapping cannot say it — the Store install has no
    /// bundle type to map, which is exactly the problem it solves.
    #[test]
    fn a_store_install_is_not_a_missing_answer() {
        assert_ne!(installed_as(Some(BundleType::Msi)), Some("store"));
        assert_ne!(installed_as(Some(BundleType::Nsis)), Some("store"));
        assert_ne!(installed_as(None), Some("store"));
    }

    /// A binary nobody packaged, which is what a `cargo run` and the smoke run in CI are.
    /// It has no install to update, and saying so is the honest answer rather than
    /// guessing a format.
    #[test]
    fn an_unpackaged_binary_says_nothing() {
        assert_eq!(installed_as(None), None);
    }
}
