#!/usr/bin/env bash
# Measurement B for 1.5.4 (#245): the Google Play build, installed clean, with the reminder
# turned on. Does it arm the reminder without exact alarms, say so in the app, and keep
# away from GitHub?
#
# Usage: android-measure-play-build.sh <apks> <bundletool-jar> <out-dir>
#
#   apks            the universal APK set bundletool built from the Play AAB (release,
#                   ORG_GRADLE_PROJECT_dayloPlay=true), signed with the job's own key
#   bundletool-jar  the pinned bundletool the build job checked, which installs it
#
# It is a RELEASE build, because the Play overlay is merged into the release build type
# only (src-tauri/gen/android/app/build.gradle.kts). Three things follow:
#   - run-as does not work on it, so nothing reads the plugin's store.
#   - The fork's "exact-alarm decision" line is not logged: it goes through Tauri's
#     Logger.debug, which is gated on BuildConfig.DEBUG. The decision is read instead from
#     its inputs and its result: what the installed package requests (the same
#     PackageManager list the fork reads), and which AlarmManager call made the alarm.
#   - The WebView is expected to be inspectable all the same, though no run has shown it
#     yet: the emulator image is userdebug (run 43606830927's fingerprint ends
#     12077443:userdebug/dev-keys), and Android's WebView turns DevTools on for every app
#     on a userdebug or eng system. If it is not, the script says so and stops, rather
#     than reading nothing as a pass.
#
# Observables, named before measuring. From API 31 (S) on, which is the Play case:
#   P1  alarm:    dumpsys alarm has Daylo's RTC_WAKEUP on TimedNotificationPublisher at the
#                 hour set, with no exactAllowReason, a window that is not 0, and the
#                 allow-while-idle flag: 0x4 as asked, or 0x20, which is how Android 12+
#                 records an inexact setAndAllowWhileIdle (measured in run 43606830927:
#                 "window=+1h0m0s0ms ... flags=0x20" for the restored inexact alarm).
#   P2  decision: the inexact branch. The installed package requests no
#                 SCHEDULE_EXACT_ALARM (dumpsys package), the app's own read of the same
#                 list says requested=false (exact_alarms), and P1's alarm is the one
#                 setAndAllowWhileIdle makes. The exact-alarm appop is set to allow before
#                 the app starts, so an inexact alarm cannot be put down to a missing grant.
#                 If a decision line is in logcat after all, it has to say
#                 declaresExactAlarms=false and exact=false.
#   P3  screen:   Settings shows "It arrives around this time. Android picks the exact
#                 moment." under the reminder, and no "Allow on-time reminders" row.
#   P4  updates:  no update notice on the page, no "Check for updates" row in Settings,
#                 and, from a recording of every command the page sends while it starts,
#                 no latest_version and nothing of the updater plugin. The recording has to
#                 show install_source, or it recorded nothing and P4 is not measured.
#                 The packet capture is read by the workflow for GitHub as well.
#   P5  source:   checkin_fields, the command that says what a check-in would carry without
#                 sending one, says source=play, and so does install_source.
#
# Below API 31 (an informative pass on API 30): every build arms an exact alarm there, the
# Play one included (Arming.kt, armsExact: sdk < S), so P1 expects window=0 and P3 expects
# "Android may deliver it a few minutes late." with no row. P2, P4 and P5 are the same.
#
# The network rule is measurement A's: off before anything is installed, seen to be off,
# logcat read here for the check-in host, and the packet capture read by the workflow for
# the check-in host and GitHub. Either record naming one fails the job.
#
# Exits 0 only when every P line passed and the network guard held.

set -uo pipefail

APKS=${1:?the APK set is missing}
BUNDLETOOL=${2:?bundletool is missing}
OUT=${3:?the output directory is missing}
PORT=9335
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
# PKG, ACTIVITY, CHECKIN_HOST, log, sh_, devtools_socket, device_ready, network_off and
# checkin_logcat_guard.
. "$HERE/android-measure-common.sh"

for f in "$APKS" "$BUNDLETOOL"; do
  [ -f "$f" ] || { echo "::error::no such file: $f"; exit 2; }
done

js() { node "$HERE/cdp-eval.mjs" "$PORT" "$1"; }
# Daylo's first alarm in dumpsys alarm, from its Alarm{...} line to the next alarm's. Not a
# fixed number of lines: Android 11 prints five per alarm and 14 prints seven, so a fixed
# count would read the next app's window and flags on one of them.
daylo_block() { awk -v pkg="$PKG" 'f && /Alarm\{/ { exit } /Alarm\{/ && index($0, pkg) { f = 1 } f' "$1"; }
set_result() { printf -v "R_$1" '%s' "$2"; }
r() { local n="R_$1"; echo "${!n:-not measured}"; }

device_ready || exit 1
SDK=$(sh_ getprop ro.build.version.sdk)
echo "build type=$(sh_ getprop ro.build.type) debuggable=$(sh_ getprop ro.debuggable)" | tee -a "$OUT/device.txt"
network_off "before anything is installed" || exit 1

# Three hours after the device's clock, on the hour, so it cannot fire while measuring.
H=$(( ( 10#$(sh_ date +%H) + 3 ) % 24 ))
HH=$(printf '%02d' "$H")
log "API $SDK, reminder at $HH:00"

measure() {
  adb uninstall "$PKG" >/dev/null 2>&1 || true
  # bundletool, not adb install: the AAB is what goes to Play, and an .apks set made from it
  # is the closest a device gets to what Play would hand it.
  if ! java -jar "$BUNDLETOOL" install-apks --apks="$APKS" --adb="$(command -v adb)" \
       >"$OUT/install.txt" 2>&1; then
    log "bundletool could not install the APK set (install.txt)"
    return 1
  fi
  sh_ pm list packages "$PKG" | grep -qx "package:$PKG" || { log "installed, but $PKG is not there"; return 1; }

  sh_ dumpsys package "$PKG" >"$OUT/package.txt"
  # Granted before the first start, so nothing asks on screen. Below 33 there is no such
  # permission and the grant fails, which is fine.
  sh_ pm grant "$PKG" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
  # The exact-alarm grant, made on purpose for a build that does not ask for it: if the
  # alarm comes out exact anyway, the build's manifest is not what decides it. Flushed to
  # disk for the same reason as in measurement A, though nothing here restarts the device.
  sh_ appops set "$PKG" SCHEDULE_EXACT_ALARM allow >/dev/null 2>&1 || true
  sh_ appops write-settings >/dev/null 2>&1 || true
  sh_ appops get "$PKG" SCHEDULE_EXACT_ALARM >"$OUT/appops.txt" 2>&1

  # First start, only so there is a WebView to talk to.
  sh_ am start -W -n "$ACTIVITY" >/dev/null
  local sock
  if ! sock=$(devtools_socket); then
    log "no DevTools socket after 60 s: this release WebView is not inspectable on this image ($(sh_ getprop ro.build.type)); nothing below could be measured"
    return 1
  fi
  adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null

  # Somebody with one activity and the reminder on. Updates are left on, as a fresh install
  # has them: with them off the Play build would not look for an update whatever its
  # channel, and P4 would prove nothing. The check-in is off and every notice seen, so
  # nothing opens on top.
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  js "(() => {
    localStorage.setItem('simple-calendar-storage', JSON.stringify({ version: 0, state: {
      activities: [{ id: 'measure-b', name: 'Measure B', color: '#22c55e',
                     createdAt: '$now', updatedAt: '$now' }],
      logs: [], yearMode: 'byActivity',
      reminderEnabled: true, reminderHour: $H, reminderMinute: 0,
      reminderTimeChosen: true, reminderOffered: true,
      firstOpenedAt: '$now', feedbackInviteSeen: true, storeReviewOffered: true,
      checkinEnabled: false, checkinNoticeSeen: true, checkinId: null,
      checkinLastAttempt: null, updateNoticeSeenFor: null, updatesEnabled: true } }));
    const written = localStorage.getItem('simple-calendar-storage').length
    // The app still holds its own state in memory and writes all of it on its next change.
    Storage.prototype.setItem = () => {}
    return written
  })()" >"$OUT/seed.txt" 2>&1 || { log "could not seed the state"; return 1; }
  adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true

  # WebView commits localStorage in batches, seconds after the write (measurement A lost
  # its first seed to a force-stop one second later).
  sleep 20
  sh_ am force-stop "$PKG"
  adb logcat -c
  sh_ am start -W -n "$ACTIVITY" >/dev/null
  sleep 15

  sock=$(devtools_socket) || { log "no DevTools socket after reopening"; return 1; }
  adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null

  js "(() => {
    const s = JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state || {}
    return { activities: (s.activities || []).length, reminderEnabled: !!s.reminderEnabled,
             reminderHour: s.reminderHour, updatesEnabled: !!s.updatesEnabled }
  })()" >"$OUT/seed-reopened.txt" 2>&1
  if ! grep -q '"activities":1' "$OUT/seed-reopened.txt" \
     || ! grep -q '"reminderEnabled":true' "$OUT/seed-reopened.txt"; then
    log "the seeded state did not survive reopening the app; nothing was measured"
    SEED_LOST=1
    return 1
  fi

  # P4, the recording: the app starts again with every command it sends written down.
  node "$HERE/cdp-record-commands.mjs" "$PORT" 20 >"$OUT/commands.json" 2>&1
  log "commands sent while starting: $(cat "$OUT/commands.json")"

  # P2 and P5, the app's own answers, asked the way the page asks.
  js "(async () => {
    const ask = (name) => window.__TAURI_INTERNALS__.invoke(name).then(
      (value) => value, (error) => ({ error: String(error) }))
    return { exact_alarms: await ask('exact_alarms'), install_source: await ask('install_source'),
             checkin_fields: await ask('checkin_fields') }
  })()" >"$OUT/answers.json" 2>&1
  log "answers: $(cat "$OUT/answers.json")"

  # P3 and P4 on the page: open Settings the way a person does on a phone, and read it.
  js "(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const shown = (el) => el !== null && el.getClientRects().length > 0
    const notice = document.querySelectorAll('[data-testid=\"update-notice\"]').length
    const gear = document.querySelector('[data-testid=\"settings-button\"]')
    if (shown(gear)) {
      gear.click()
    } else {
      const more = Array.from(document.querySelectorAll('[aria-label^=\"More options\"]')).find(shown)
      if (!more) return { error: 'neither the gear nor More options is on screen' }
      ;(more.closest('button') || more).click()
      await wait(800)
      const item = Array.from(document.querySelectorAll('[role=\"menuitem\"]'))
        .find((el) => el.textContent.trim() === 'Settings')
      if (!item) return { error: 'no Settings in the menu' }
      item.click()
    }
    let details = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      details = document.querySelector('[data-testid=\"reminder-details\"]')
      if (details && /Android/.test(details.textContent)) break
    }
    return {
      updateNoticeBefore: notice,
      updateNoticeNow: document.querySelectorAll('[data-testid=\"update-notice\"]').length,
      settingsOpen: !!document.querySelector('[data-testid=\"settings-surface\"]'),
      reminderSwitch: document.querySelector('[data-testid=\"reminder-switch\"]')?.getAttribute('aria-checked') ?? null,
      details: details ? details.textContent.trim() : null,
      exactRow: document.querySelectorAll('[data-testid=\"reminder-exact\"]').length,
      checkRow: document.querySelectorAll('[data-testid=\"settings-check\"]').length,
      updateRow: document.querySelectorAll('[data-testid=\"settings-update\"]').length,
      isOut: /is out\\./.test(document.body.textContent),
    }
  })()" >"$OUT/screen.json" 2>&1
  log "screen: $(cat "$OUT/screen.json")"
  adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true
  adb exec-out screencap -p >"$OUT/settings.png" 2>/dev/null || true
  # A second reading of the same screen, from Android's accessibility tree rather than the
  # page. Informative: what WebView exposes there depends on its version.
  sh_ uiautomator dump /sdcard/m.xml >/dev/null 2>&1 && adb pull /sdcard/m.xml "$OUT/screen-uiautomator.xml" >/dev/null 2>&1

  sh_ input keyevent KEYCODE_HOME
  sleep 5
  sh_ dumpsys alarm >"$OUT/alarms.txt"
  daylo_block "$OUT/alarms.txt" >"$OUT/alarm-block.txt"
  adb logcat -d >"$OUT/logcat.txt" 2>&1
  { grep -h "exact-alarm decision" "$OUT/logcat.txt" \
      || echo "(no decision line: a release build does not log it, Logger.debug is gated on BuildConfig.DEBUG)"; } \
    >"$OUT/decisions.txt"
  return 0
}

SEED_LOST=0
MEASURED=no
measure && MEASURED=yes
checkin_logcat_guard

# ── Reading what was measured ─────────────────────────────────────────────────────────
answers=$(cat "$OUT/answers.json" 2>/dev/null || echo '{}')
screen=$(cat "$OUT/screen.json" 2>/dev/null || echo '{}')
commands=$(cat "$OUT/commands.json" 2>/dev/null || echo '[]')
jqr() { jq -r "$2" <<<"$1" 2>/dev/null || echo "unreadable"; }
block=$(cat "$OUT/alarm-block.txt" 2>/dev/null || true)

if [ "$SDK" -ge 31 ]; then
  WANT_WINDOW=inexact
  WANT_TEXT='It arrives around this time. Android picks the exact moment.'
else
  WANT_WINDOW=exact
  WANT_TEXT='Android may deliver it a few minutes late.'
fi

# Read only when the run got to the end: a reading of files that were never written
# would turn "not measured" into a list of failures that did not happen.
read_results() {
  # P1. Read from the whole block, not one line: from Android 12 window, exactAllowReason
  # and flags share the type= line, and on 11 window and flags have a line of their own and
  # the hour is "when=" rather than "origWhen=".
  flags=$(grep -o "flags=0x[0-9a-f]*" <<<"$block" | head -1 | cut -d= -f2)
  window=$(grep -o "window=[^ ]*" <<<"$block" | head -1 | cut -d= -f2)
  if ! grep -q "RTC_WAKEUP.*Alarm{" <<<"$block" || ! grep -q TimedNotificationPublisher <<<"$block"; then
    set_result P1 "FAIL  (no RTC_WAKEUP alarm of $PKG on TimedNotificationPublisher)"
  else
    why=()
    grep -Eq "(origWhen|when)=[0-9]{4}-[0-9]{2}-[0-9]{2} $HH:00:00" <<<"$block" || why+=("not at $HH:00")
    if [ $(( ${flags:-0} & 0x24 )) -eq 0 ]; then why+=("no allow-while-idle flag (flags=${flags:-none})"); fi
    if [ "$WANT_WINDOW" = inexact ]; then
      grep -q "exactAllowReason=" <<<"$block" && why+=("has an exactAllowReason")
      [ "$window" = 0 ] && why+=("window=0")
    else
      [ "$window" = 0 ] || why+=("window=${window:-none}, not 0")
    fi
    if [ ${#why[@]} -eq 0 ]; then
      set_result P1 "PASS  ($WANT_WINDOW: window=$window flags=$flags, at $HH:00)"
    else
      set_result P1 "FAIL  ($(IFS=';'; echo "${why[*]}"); see alarm-block.txt)"
    fi
  fi

  # P2
  declared=$(grep -c "android.permission.SCHEDULE_EXACT_ALARM\|android.permission.USE_EXACT_ALARM" "$OUT/package.txt" 2>/dev/null || true)
  requested=$(jqr "$answers" '.exact_alarms.requested')
  decision_lines=$(grep -c "exact-alarm decision" "$OUT/decisions.txt" 2>/dev/null || true)
  why=()
  [ "${declared:-0}" -eq 0 ] || why+=("dumpsys package names an exact-alarm permission")
  [ "$requested" = false ] || why+=("exact_alarms.requested=$requested")
  if [ "$SDK" -ge 31 ]; then
    case "$(r P1)" in PASS*) ;; *) why+=("the alarm is not the inexact one setAndAllowWhileIdle makes") ;; esac
  fi
  if [ "${decision_lines:-0}" -gt 0 ]; then
    grep "exact-alarm decision" "$OUT/decisions.txt" | grep -vq "declaresExactAlarms=false" \
      && why+=("a decision line says declaresExactAlarms=true")
    if [ "$SDK" -ge 31 ] && grep "exact-alarm decision" "$OUT/decisions.txt" | grep -q "exact=true"; then
      why+=("a decision line says exact=true")
    fi
  fi
  branch=$([ "$SDK" -ge 31 ] && echo inexact || echo "exact, as below S for every build")
  if [ ${#why[@]} -eq 0 ]; then
    set_result P2 "PASS  (declaresExactAlarms=false, $branch; decision lines in logcat: ${decision_lines:-0})"
  else
    set_result P2 "FAIL  ($(IFS=';'; echo "${why[*]}"))"
  fi

  # P3
  details=$(jqr "$screen" '.details')
  exact_row=$(jqr "$screen" '.exactRow')
  if [[ "$details" == *"$WANT_TEXT"* ]] && [ "$exact_row" = 0 ]; then
    set_result P3 "PASS  (\"$WANT_TEXT\", no row to the system screen)"
  else
    set_result P3 "FAIL  (details: $details; rows to the system screen: $exact_row; error: $(jqr "$screen" '.error // "none"'))"
  fi

  # P4
  why=()
  if ! jq -e 'type == "array"' <<<"$commands" >/dev/null 2>&1; then
    why+=("the recording did not run: $(head -c 200 <<<"$commands")")
  elif jq -e 'any(.[]; startswith("!"))' <<<"$commands" >/dev/null; then
    why+=("the recording did not take: $(jq -c '[.[] | select(startswith("!"))]' <<<"$commands")")
  elif ! jq -e 'any(.[]; . == "install_source")' <<<"$commands" >/dev/null; then
    why+=("the recording holds no install_source, so it saw nothing")
  elif jq -e 'any(.[]; . == "latest_version" or startswith("plugin:updater"))' <<<"$commands" >/dev/null; then
    why+=("the page asked for an update: $(jq -c '[.[] | select(. == "latest_version" or startswith("plugin:updater"))]' <<<"$commands")")
  fi
  for k in updateNoticeBefore updateNoticeNow checkRow updateRow; do
    v=$(jqr "$screen" ".$k")
    [ "$v" = 0 ] || why+=("$k=$v")
  done
  [ "$(jqr "$screen" '.isOut')" = false ] || why+=("the page says a version is out")
  if [ ${#why[@]} -eq 0 ]; then
    set_result P4 "PASS  (no notice, no check row, $(jq 'length' <<<"$commands") commands and none for an update)"
  else
    set_result P4 "FAIL  ($(IFS=';'; echo "${why[*]}"))"
  fi

  # P5
  source_checkin=$(jqr "$answers" '.checkin_fields.source')
  source_install=$(jqr "$answers" '.install_source')
  if [ "$source_checkin" = play ] && [ "$source_install" = play ]; then
    set_result P5 "PASS  (checkin_fields.source=play, install_source=play, nothing sent)"
  else
    set_result P5 "FAIL  (checkin_fields: $(jqr "$answers" '.checkin_fields | tostring'); install_source: $source_install)"
  fi
}
[ "$MEASURED" = yes ] && read_results

OK=yes
[ "$MEASURED" = yes ] && [ "$SEED_LOST" = 0 ] && [ "$NETWORK_GUARD" = held ] || OK=no
for p in P1 P2 P3 P4 P5; do
  case "$(r $p)" in PASS*) ;; *) OK=no ;; esac
done

{
  echo "Measurement B of #245, the Google Play build installed clean, $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "device: $(head -1 "$OUT/device.txt")"
  echo "reminder at $HH:00"
  [ "$SEED_LOST" = 1 ] && echo "SEED LOST: the seeded state did not survive reopening the app (seed-reopened.txt); nothing below measures the build."
  echo "network guard: $NETWORK_GUARD (see network.txt; the packet capture is checked by the workflow for the check-in host and GitHub)"
  echo
  echo "P1 alarm: RTC_WAKEUP at the hour, allow-while-idle, $WANT_WINDOW   $(r P1)"
  echo "P2 decision: no exact-alarm permission, the $( [ "$SDK" -ge 31 ] && echo inexact || echo exact ) branch      $(r P2)"
  echo "P3 screen: the line under the reminder, nothing to press          $(r P3)"
  echo "P4 updates: no notice, no check, no request (#200)                $(r P4)"
  echo "P5 source: what a check-in would say, without sending it         $(r P5)"
  echo "(alarm-block.txt, decisions.txt, package.txt, answers.json, screen.json, commands.json and settings.png hold what each line read.)"
  echo
  if [ "$OK" = yes ]; then
    echo "VERDICT: PASS. The Play build arms the reminder as it should on API $SDK, says so, and never looks for an update."
  elif [ "$MEASURED" != yes ]; then
    echo "VERDICT: inconclusive. The measurement did not run to the end; read log.txt before concluding anything."
  else
    echo "VERDICT: FAIL. Read the lines above and the files beside them."
  fi
} | tee "$OUT/summary.txt"

[ "$OK" = yes ]
