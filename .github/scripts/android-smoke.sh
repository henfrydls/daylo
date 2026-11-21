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
#
# Named through the environment so the same script can be run more than once in one
# emulator session without each run erasing the evidence of the last. Unset, which is
# every use on a pull request, the names are what they have always been.
LOG="${SMOKE_LOG:-smoke-logcat.txt}"
SHOT="${SMOKE_SHOT:-smoke-screenshot.png}"

# Anything that ends this script without going through fail() is a bug in the script, not
# a verdict on the app, and it has to say so out loud. One run suspended with Daylo alive
# and painting because `[ -n "$x" ] && echo` returned non-zero on an empty string and
# set -e took the whole script with it; all the runner could say was "failed with exit
# code 1", and the app wore the blame for a shell mistake. exit does not raise ERR, so
# this fires only on the unplanned kind.
trap 'echo "::error::The smoke script itself failed at line $LINENO. That is a bug in this script, not a finding about the app."' ERR

# The lines that say what went wrong, wherever they are in the log, and only then the
# end of it.
#
# It used to print the last 200 lines and nothing else, which is the part of a crash log
# least likely to contain the crash: the process dies, Android goes on logging, and by
# the time the job reads the file the abort is thousands of lines back. One run cost us
# an evening for exactly that. The panic and the signal were in the artifact all along,
# 964 lines from the end, while the job's own output began after the app was already
# dead and said nothing about why.
# One pattern, used by the check that decides and by the message that explains, because
# two of them drift and the drift is invisible: the deciding one would fire and the
# explaining one would print nothing, which is how the first version of this read a log
# full of FORTIFY aborts and showed only "beginning of crash".
#
# The level letter is what makes it general. logcat marks fatal lines with F in the column
# after the pids, and that catches what libc writes on an abort, what DEBUG writes for a
# tombstone, and whatever Android marks fatal next year without anybody adding it here.
# The named ones stay because a Rust panic is logged at I by wry's stdout bridge, which no
# level filter would ever find.
#
# And whose lines they are is a second question, which this did not ask and had to learn
# to: logcat is the whole phone's log. A run was failed because Gmail crashed on the
# emulator over a missing GMS provider, while Daylo had started, stayed up and painted.
# The pattern and the ownership both live in fatal-lines.sh now, so that the check that
# decides and the message that explains cannot answer them differently.
fatal_lines() {
  bash .github/scripts/fatal-lines.sh "$PKG" "$LOG" 2>/dev/null | head -40
}

fail() {
  echo "::error::$*"
  local fatal
  fatal=$(fatal_lines)
  if [ -n "$fatal" ]; then
    echo "--- what logcat calls fatal, by line number ---"
    printf '%s\n' "$fatal"
  else
    echo "--- nothing in logcat is marked fatal; here is the end of it ---"
    tail -n 200 "$LOG" 2>/dev/null || echo "(no logcat captured)"
  fi
  echo "--- the whole log is in the android-smoke-evidence artifact ---"
  exit 1
}

# Wait for Android to finish starting before anything else happens on it.
#
# The emulator action hands over as soon as sys.boot_completed is 1, and that is not the
# end of booting: user 0 is not unlocked yet, BOOT_COMPLETED has not been posted, and
# WebViewUpdateService has not had its onUnlockedUser. Measured in the logcats of seven
# smoke runs, Start proc com.daylo.app against "Posting BOOT_COMPLETED user #0":
#
#   run 44913059310, painted                       unlocked before the start
#   run 44827727373 attempt 3, painted             unlocked before the start
#   run 44827731906, painted                       started 1.2 s before the unlock
#   run 44827727373 attempt 1, blank               started 3.9 s before
#   run 44827727373 attempt 2, FORTIFY abort       started 3.4 s before
#   run 44957853399, blank                         started 5.9 s before
#   run 44913787883, blank                         started 7.2 s before
#
# In the three blank runs Daylo's process never logs WebViewFactory at all: started that
# early it never gets a WebView, and no amount of waiting for the paint fixes it. So the
# app is started only once the user is unlocked, and after the broadcasts of the unlock,
# BOOT_COMPLETED among them, have drained.
READY_TIMEOUT="${SMOKE_READY_TIMEOUT:-120}"
echo "::group::Wait for Android to finish starting"
ready_from=$SECONDS
boot_state=""
user_state=""
while :; do
  waited=$((SECONDS - ready_from))
  now_boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  # am get-started-user-state answers RUNNING_LOCKED, RUNNING_UNLOCKING or
  # RUNNING_UNLOCKED. If an image does not know the command, the same word is in the
  # user list of dumpsys activity.
  now_user=$(adb shell am get-started-user-state 0 2>/dev/null | tr -d '\r' \
    | grep -oE "RUNNING_[A-Z_]+" | head -1 || true)
  if [ -z "$now_user" ]; then
    now_user=$(adb shell dumpsys activity users 2>/dev/null | tr -d '\r' \
      | grep -oE "RUNNING_[A-Z_]+" | head -1 || true)
  fi
  # Printed when either one changes, so the run shows when each became true.
  if [ "$now_boot" != "$boot_state" ] || [ "$now_user" != "$user_state" ]; then
    echo "${waited}s: sys.boot_completed=${now_boot:-(empty)}, user 0 ${now_user:-(state unknown)}"
    boot_state="$now_boot"
    user_state="$now_user"
  fi
  if [ "$boot_state" = 1 ] && [ "$user_state" = RUNNING_UNLOCKED ]; then
    break
  fi
  if [ "$waited" -ge "$READY_TIMEOUT" ]; then
    echo "::endgroup::"
    echo "::error::The emulator never finished starting: after $READY_TIMEOUT s sys.boot_completed was"
    echo "::error::${boot_state:-(empty)} and user 0 was ${user_state:-(state unknown)}. Daylo was not started,"
    echo "::error::because an app started before the user is unlocked gets no WebView. This says"
    echo "::error::nothing about the app."
    exit 1
  fi
  sleep 2
done

# The unlock posts BOOT_COMPLETED to about a hundred receivers, and they take another ten
# seconds or so to run. Not a condition for starting, which is the unlock; waited for so
# that the app does not start in the middle of them. Absent or stuck, it costs nothing
# but a warning.
idle_left=$((READY_TIMEOUT - (SECONDS - ready_from)))
if [ "$idle_left" -lt 30 ]; then idle_left=30; fi
if timeout "$idle_left" adb shell am wait-for-broadcast-idle > /dev/null 2>&1; then
  echo "$((SECONDS - ready_from))s: broadcast queues idle"
else
  echo "::warning::am wait-for-broadcast-idle did not finish in ${idle_left}s or is not on this image."
  echo "::warning::Going ahead: user 0 is unlocked, and that is the condition that matters."
fi

# What the phone's own log says about the same moments, while the boot log is still in
# the buffer (it is cleared before the start). These are the lines the table above was
# read from, so a run that goes wrong can be put in it.
adb logcat -d -b main,system 2>/dev/null \
  | grep -E "Posting BOOT_COMPLETED|onUnlockedUser.*WebViewUpdateService|Finished processing BOOT_COMPLETED" \
  | head -5 || true
echo "WebView after the unlock: $(adb shell dumpsys webviewupdate 2>/dev/null \
  | grep -m1 "Current WebView package" | tr -d '\r' || true)"
echo "::endgroup::"

# No network for the emulator, before the app is ever started.
#
# Since 1.3 a fresh profile is a new installation: the app turns the check-in on and sends
# one, and this job installs a fresh profile every time it runs. The server counted a
# runner as a person more than once before anybody noticed. The desktop jobs set
# DAYLO_DISABLE_CHECKIN, which an Android app cannot read: it is started by the zygote and
# inherits nothing from this shell. Cutting the radio is the lever that does exist here.
#
# It also buys something the job did not have: the app is now shown to start with no
# network at all, which is how a phone opens it in a lift.
echo "::group::Cut the network"
adb shell cmd connectivity airplane-mode enable || true
adb shell svc wifi disable || true
adb shell svc data disable || true
echo "airplane_mode_on=$(adb shell settings get global airplane_mode_on | tr -d '\r')"
echo "::endgroup::"

echo "::group::Install"
adb install -r "$APK"
echo "::endgroup::"

# From here on, everything in the log belongs to this run.
adb logcat -c
# The phone's own clock, not the runner's: the exit records below are stamped by the
# phone, and on an emulator the two drift. Read before the start so that nothing this run
# does can land before it.
started_at=$(adb shell date "+%Y-%m-%d %H:%M:%S" | tr -d '\r')
# The runner's clock, for how long the paint is given. Only ever compared with itself.
launched=$SECONDS
# A line of its own in the phone's log, so that the order is there to read: the boot
# lines above, then this, then Start proc com.daylo.app.
adb shell log -t DayloSmoke "starting com.daylo.app now" || true
echo "starting $PKG at $started_at (phone clock)"
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

# The log and the picture, taken again on every attempt below so that the artifact holds
# the last of each.
#
# The default buffer set already includes crash on these images, and the abort that cost
# us an evening was in this file. It is named anyway, so that the file does not depend on
# a default: a log without the crash buffer would look exactly like an app that died
# quietly.
#
# The picture comes before anything can fail. It is the cheapest evidence there is and a
# failing run is exactly when it is wanted: the first time this job suspended, it did so
# before the capture and the artifact arrived with a log and no screen. If the process is
# already gone this captures whatever is behind it, which is itself worth seeing.
capture() {
  adb logcat -d -b main,system,crash > "$LOG" || true
  adb shell screencap -p /data/local/tmp/smoke.png || true
  adb pull /data/local/tmp/smoke.png "$SHOT" > /dev/null || true
}

# Did the app die? Asked on every attempt, and answered with a failure on the spot: a
# crash is not something to wait out. Each signature keeps its own message, and none of
# them is the message for a screen that has not painted yet.
#
# The first time it is asked it prints Android's whole account. After that only when
# there is something in it to fail on, so that a slow paint does not print the same dump
# a dozen times.
crash_checks() {
  local verbose="$1" exits="" asked_ok="" mine exit_reason
  if exits=$(adb shell dumpsys activity exit-info "$PKG" 2>&1); then
    asked_ok=yes
  elif [ -n "$verbose" ]; then
    # Said out loud rather than swallowed: without this one of the checks below would be
    # skipped and the job would still go green.
    echo "::warning::dumpsys activity exit-info is not available on this image."
    echo "::warning::Falling back on the process and logcat checks alone."
  fi

  # What Android calls the exit and what actually happened are not always the same word.
  # A process that aborts inside libc during teardown has been recorded here as
  # EXIT_SELF, with the abort itself only in logcat. So this reports the reason rather
  # than deciding on it, and the logcat check below is what rules.
  #
  # Taken from the start of the field to the next one rather than by shape: the name has
  # parentheses of its own, "APP CRASH(NATIVE)", and a pattern that stopped at the first
  # closing bracket read the subreason instead and reported an exit as UNKNOWN while
  # Android was calling it a native crash.
  #
  # Judged on this run's records for this process, though the whole dump is printed. The
  # dump answers "how has anything under this package ended, lately", and the question
  # here is "did THIS app die just now". Two differences, and each one has already made
  # this job say something false.
  #
  # Time: the records go back about sixteen entries. Greping the whole dump for CRASH
  # asks whether the package has ever crashed on this device. In the slow start job one
  # real abort was re-reported in the eight runs after it, and stopped only when the
  # record aged out of the buffer; one of those runs was failed for a crash stamped three
  # seconds before it started.
  #
  # Process: the WebView runs isolated and its records are filed under the app, so the
  # newest record is routinely the helper's. The EXIT_SELF abort this job exists to
  # explain was headlined "reason=13 (OTHER KILLS BY SYSTEM)", which was the helper being
  # reclaimed 82ms later. The app's own record, one line below it, said reason=1
  # (EXIT_SELF).
  # Through bash, like every other script in this directory: none of them carries the
  # executable bit in the index, and a bit set in a working tree does not travel.
  mine=$(bash .github/scripts/exits-since.sh "$started_at" "$PKG" <<< "${exits:-}")
  exit_reason=$(sed -n 's/.* \(reason=[0-9]\+ .*\) subreason=.*/\1/p' <<< "$mine" | head -1)

  if [ -n "$verbose" ] || grep -q "CRASH" <<< "$mine"; then
    echo "::group::Android's own account of why anything died"
    if [ -n "$asked_ok" ]; then echo "${exits:-(nothing recorded)}"; fi
    echo "::endgroup::"
    if [ -n "$exit_reason" ]; then
      echo "Android's word for the last exit: $exit_reason"
    elif [ -n "$asked_ok" ]; then
      # Only when the question was actually asked. Without this guard an image that
      # cannot answer would be reported as an image that answered "nothing died", which
      # is the difference between knowing and not asking.
      echo "Android recorded no exit for $PKG since this run started it."
    fi
  fi

  if grep -q "CRASH" <<< "$mine"; then
    # Android's own record says a crash, and `fail` digs the lines out of logcat rather
    # than printing the end of it. Those lines are the whole difference between "it died"
    # and knowing what killed it: exit-info records `trace=null` for a native abort, so
    # without them this check reports a crash and no cause.
    fail "Android recorded a crash for $PKG ($exit_reason). Its own words are in the group above."
  fi

  # A native abort is not a Java exception and not a Rust panic, and until a run produced
  # one this looked only for those two. libc writes its own epitaph and logcat marks the
  # spot: "--------- beginning of crash", then an F line. FORTIFY aborts land here, and
  # so does any signal.
  if [ -n "$(fatal_lines)" ]; then
    echo "::group::What logcat says went wrong"
    fatal_lines
    echo "::endgroup::"
    fail "The app logged a fatal error. The lines are in the group above and the whole log is in the artifact."
  fi

  if [ -z "$resumed" ]; then
    fail "$ACTIVITY never reached the foreground: 30 seconds of dumpsys and it was never the resumed activity."
  fi

  local pid
  if pid=$(adb shell pidof "$PKG" 2>/dev/null) && [ -n "$pid" ]; then
    if [ -n "$verbose" ]; then echo "still running as pid $pid"; fi
  else
    fail "$PKG started and was gone again: pidof returned nothing. Android's word for the last exit was ${exit_reason:-(nothing recorded)}."
  fi
}

# Ten seconds more before the first look. A process that aborts on its first frame can
# still be caught mid-start by the loop above, and a panic inside run() takes a moment to
# land. This is also the least the app is asked to stay up, and the attempts below only
# ever add to it: the first one is taken here, as the single screenshot always was.
sleep 10
capture
crash_checks verbose

# But first, whose browser is this? An emulator image carries a WebView baked in and has
# no Play Store to update it, so the image decides the engine, and on a real phone
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

# The screenshot is scored by a script rather than here, because what it has to tell
# apart, a page with Daylo's stylesheet and a page without it, cannot be read off a
# colour count, and the script is the part that can be run against known-good and
# known-bad images on a laptop.
#
# Scored again every few seconds until one passes, because one picture at a fixed moment
# judged the emulator's speed as much as the app. On ec12baa (run 44913787883) a slow
# emulator showed a white page under the status bar sixteen seconds in, with nothing
# fatal in logcat, and the same code painted in run 44913059310. The crash checks run
# before every score, so an app that dies while being waited for fails at once with its
# own message, not with this one.
PAINT_WINDOW="${SMOKE_PAINT_WINDOW:-60}"
PAINT_EVERY="${SMOKE_PAINT_EVERY:-5}"
attempt=1
while :; do
  elapsed=$((SECONDS - launched))
  # Captured, not printed, because its verdict lines are ::error:: annotations and an
  # attempt that has not painted yet is not an error. Only the last one's are shown.
  if verdict=$(python3 .github/scripts/screen-check.py "$SHOT" 2>&1); then
    echo "attempt $attempt, ${elapsed}s after launch: $(head -1 <<< "$verdict")"
    break
  fi
  echo "attempt $attempt, ${elapsed}s after launch: $(head -1 <<< "$verdict")"
  if [ "$elapsed" -ge "$PAINT_WINDOW" ]; then
    echo "::error::The app is running and did not crash, but no screenshot passed in $PAINT_WINDOW s"
    echo "::error::($attempt attempts). The last one, ${elapsed}s after launch: $(head -1 <<< "$verdict")"
    # The screen check's own words for the last attempt: blank, or painted without the
    # stylesheet. Those two are different findings and it is the one that can tell.
    tail -n +2 <<< "$verdict"
    echo "::error::The last screenshot is in the android-smoke-evidence artifact. Look at it."
    exit 1
  fi
  sleep "$PAINT_EVERY"
  attempt=$((attempt + 1))
  capture
  crash_checks ""
done

echo "Daylo installed, started, stayed up, and painted its own colours."
