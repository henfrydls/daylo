Download the installer for your platform below.
What changed in this version: [CHANGELOG](https://github.com/henfrydls/daylo/blob/main/CHANGELOG.md).

| Platform | File | Notes |
|----------|------|-------|
| Windows | `.exe` | Installer. Pick x64 unless you know your PC is ARM. |
| macOS | `.dmg` | Disk image. Apple Silicon (M1 and later) or Intel. |
| Linux | `.deb`, `.AppImage` | Debian package or portable AppImage, for Intel and AMD computers. |
| Android | `.apk` | Direct install. Works on phones and tablets from about 2017 onwards. |

The list below also has files ending in `.sig` and `.app.tar.gz`. Those are for the updater inside Daylo, not for you: pick the file from the table above.

### First time opening Daylo

Daylo is not yet registered with Apple, Microsoft or Google, so each system shows a warning the first time. It is the same warning any small independent app gets. Here is how to get past it once:

**Windows.** If SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway**.

**macOS.** Open the `.dmg`, drag Daylo to Applications and open it. macOS will say it could not verify the app. Click **Done** (not Move to Trash), then open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only do this once.

**Android.** Download `Daylo-android-arm64.apk` on your phone and open it. If Play Protect warns about an unknown developer, tap **More details** and then the small **Install anyway** link. Installing over Daylo 1.1.1 or later keeps your data.

**Linux.** The `.deb` installs with your package manager. The AppImage needs to be made executable first (right-click → Properties → allow executing, or `chmod +x`).

Your data stays on your device. Daylo has no account, and no server stores your habits or the days you marked. One thing leaves your device unless you turn it off: an anonymous daily check-in that tells us the app is still in use. It carries a random number, the app version, your system, how it was installed and the date, and nothing else. The app tells you the first time it opens, and you can turn it off from the menu at any time.
