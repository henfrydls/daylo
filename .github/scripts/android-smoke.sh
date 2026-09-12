#!/usr/bin/env bash
#
# Install Daylo on the emulator and find out whether it is still there a moment later.
#
# This exists because compiling is not starting. Two APKs that compiled everywhere and
# passed every check died before drawing a frame — one to R8 stripping a constructor the
# notification plugin looks up by reflection, one to a `plugins` block in tauri.conf.json
# that the plugin's Rust half refuses. Both times the person who found out was holding
# the phone.
#
# What it claims: the process is alive, its own activity is the one in front, Android
# recorded no crash for it, and the webview painted something other than one flat colour.
# What it does not claim: that any of the app works. That is still a person's job.

set -euo pipefail

PKG=com.daylo.app
ACTIVITY="$PKG/.MainActivity"
APK="${SMOKE_APK:?SMOKE_APK is not set: the signing step should have put it in GITHUB_ENV}"

# Kept next to the screenshot so a failure can be read without re-running anything.
LOG=smoke-logcat.txt
SHOT=smoke-screenshot.png

fail() {
  echo "::error::$*"
  echo "--- last 200 lines of logcat ---"
  tail -n 200 "$LOG" 2>/dev/null || echo "(no logcat captured)"
  exit 1
}

echo "::group::Install"
adb install -r "$APK"
echo "::endgroup::"

# From here on, everything in the log belongs to this run.
adb logcat -c
adb shell am start -W -n "$ACTIVITY"

# Thirty seconds to reach the foreground. A Tauri app on a cold emulator takes a few
# seconds; a crash loop takes none, and the checks below are what tell them apart.
resumed=""
for _ in $(seq 1 30); do
  sleep 1
  if adb shell dumpsys activity activities 2>/dev/null \
      | grep -E "mResumedActivity|topResumedActivity" | grep -q "$PKG"; then
    resumed=yes
    break
  fi
done

# Ten seconds more before looking. A process that aborts on its first frame can still be
# caught mid-start by the loop above, and a panic inside run() takes a moment to land.
sleep 10
adb logcat -d > "$LOG" || true

echo "::group::Android's own account of why anything died"
if exits=$(adb shell dumpsys activity exit-info "$PKG" 2>&1); then
  echo "${exits:-(nothing recorded)}"
  if grep -q "CRASH" <<< "$exits"; then
    echo "::endgroup::"
    fail "Android recorded a crash for $PKG. Its own words are in the group above."
  fi
else
  # Said out loud rather than swallowed: without this the strongest check in the script
  # would be skipped and the job would still go green.
  echo "::warning::dumpsys activity exit-info is not available on this image."
  echo "::warning::Falling back on the process and logcat checks alone."
fi
echo "::endgroup::"

if [ -z "$resumed" ]; then
  fail "$ACTIVITY never reached the foreground within 30 seconds."
fi

if ! adb shell pidof "$PKG" > /dev/null 2>&1; then
  fail "$PKG started and was gone again before it could be looked at."
fi

# Belt and braces: exit-info is the reliable channel, but a Rust panic reaches logcat
# through tao's stdout pipe under this tag whether or not the process is recorded as
# crashed, and it is the one line that says what actually went wrong.
if grep -qE "FATAL EXCEPTION|RustStdoutStderr.*panicked at" "$LOG"; then
  echo "::group::What logcat says went wrong"
  grep -E "FATAL EXCEPTION|RustStdoutStderr|Fatal signal" -A5 "$LOG" | head -60
  echo "::endgroup::"
  fail "The app logged a fatal error while starting."
fi

# The webview is the part none of the above can see: a Tauri app whose frontend failed to
# load is a live process with its activity in front and a blank rectangle on screen.
adb shell screencap -p /data/local/tmp/smoke.png
adb pull /data/local/tmp/smoke.png "$SHOT"

# But first, whose browser is this? An emulator image carries a WebView baked in and has
# no Play Store to update it, so the image decides the engine — and on a real phone
# WebView comes from the Play Store and is current. The first run of this job was on an
# image with WebView 83, from 2020, and Daylo's stylesheet opens with `@layer`, which
# Chromium learned in 99: every rule was skipped and the app painted an unstyled page
# that sailed through the check below. So: if the engine is older than the stylesheet
# needs, the screenshot is not evidence about anything and this says so instead of
# scoring it. The floor is 111, which is where oklch() and color-mix() arrived; the
# stylesheet uses both, and @layer at 99 is already covered by it.
MIN_CHROMIUM=111
webview=$(adb shell dumpsys webviewupdate 2>/dev/null \
  | grep -m1 "Current WebView package" || true)
engine=$(grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" <<< "$webview" | head -1)
echo "WebView: ${webview:-(could not be read)}"

if [ -z "$engine" ]; then
  # The check below still runs: a blank screen is a blank screen on any engine. What is
  # lost is knowing whether a screen that is not blank was drawn by a browser anyone has.
  echo "::warning::Could not read the emulator's WebView version. The screenshot check"
  echo "::warning::below still runs, but it cannot tell an unstyled page from a styled one."
elif [ "${engine%%.*}" -lt "$MIN_CHROMIUM" ]; then
  echo "::warning::This image ships Chromium ${engine%%.*}, older than the $MIN_CHROMIUM"
  echo "::warning::Daylo's stylesheet needs, so it renders unstyled here and the"
  echo "::warning::screenshot says nothing about the app. No phone runs this engine."
  echo "::warning::Raise api-level in the workflow rather than trusting this."
  echo "Skipping the screenshot check. The app started, stayed up, and did not crash."
  exit 0
fi

# The status bar has content of its own, so it is cut off before counting: without that,
# a completely blank app still scores a few dozen colours and this check says nothing.
# ImageMagick 7 renamed the command and keeps `convert` only as a compatibility shim,
# which some images drop.
IM=$(command -v magick || command -v convert)
"$IM" "$SHOT" -gravity North -chop 0x150 cropped.png
colours=$(identify -format '%k' cropped.png)
echo "the screen below the status bar has $colours distinct colours"

# A blank webview is one colour, or two or three with a bar drawn across it. Daylo's year
# view is a grid of tinted cells and runs to the hundreds. Twenty is far enough from both.
if [ "$colours" -lt 20 ]; then
  fail "The app is running but the screen is blank ($colours colours). The webview did not paint."
fi

echo "Daylo installed, started, stayed up, and painted something."
