#!/usr/bin/env bash
# The daily reminder's tap and its day (#192), on the CI emulator: does a tap on the
# reminder open today's sheet, with Daylo in memory and with Daylo not running, and does
# logging today move the next ring to tomorrow?
#
# Usage: android-measure-reminder-tap.sh <apk> <out-dir>
#
#   apk  DEBUG build of the branch being measured: the DevTools protocol is how the state is
#        seeded and every reading of the page is taken.
#
# The tap is delivered as the intent the notification plugin builds for it (buildIntent in
# its TauriNotificationManager.kt): MainActivity, ACTION_MAIN, the launcher category, the
# notification's id in the "NotificationId" extra and "tap" in "NotificationUserAction",
# with SINGLE_TOP and CLEAR_TOP. With Daylo in memory Android hands it to the running
# activity (onNewIntent), and the plugin turns it into its actionPerformed event; with
# Daylo stopped it starts the app, and the page asks the launch intent through
# launch_notification. A tap on a notification in the shade sends this same intent through
# its PendingIntent; the shade itself is not driven here.
#
# Observables, named before measuring:
#   C0  A plain launch, from the launcher's intent with no extra, opens no sheet. Without it
#       W1 and K1 tell nothing apart.
#   A1  With nothing logged today, the reminder's alarm is for today at its hour.
#   W1  Daylo in memory, sent home, then the tap: today's sheet is open (its title is
#       today's date).
#   A2  Today ticked in that sheet: the alarm moves to tomorrow at the same hour.
#   A3  The tick taken off again: the alarm is back on today.
#   K1  Daylo force-stopped, then the tap: today's sheet is open.
#   K2  Daylo force-stopped, then a plain launch: no sheet. The launch intent of K1 is not
#       answered twice.
#   N1  The notification channel is called "Daily reminder" in the phone's settings, as far
#       as dumpsys shows it: the first three letters, "Dai", where it used to be "Def".
#   P1  Asking for the notification permission while it is granted gets an answer
#       ("granted") within five seconds. It used to get none, ever.
#
# A1 and A3 need the reminder's hour to still be ahead today. The hour is two after the
# device's clock, so a run after 21:00 on the device cannot say anything about today's
# ring: those two are then NOT MEASURED, and said so, rather than read against tomorrow.
#
# The network rule is measurement A's, from android-measure-common.sh: the radio is off
# before the install and the check-in host must not appear in logcat outside a failed try.
#
# Exits 0 only when every observable that could be measured passed, at least C0, W1, K1,
# K2, A2, N1 and P1 were measured, and the network guard held.

set -uo pipefail

APK=${1:?the APK is missing}
OUT=${2:?the output directory is missing}
PORT=9336
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
# PKG, ACTIVITY, CHECKIN_HOST, log, sh_, devtools_socket, device_ready, network_off and
# checkin_logcat_guard.
. "$HERE/android-measure-common.sh"

[ -f "$APK" ] || { echo "::error::no such APK: $APK"; exit 2; }

js() { node "$HERE/cdp-eval.mjs" "$PORT" "$1"; }
shot() { adb exec-out screencap -p >"$OUT/$1.png" 2>/dev/null || true; }
set_result() { printf -v "R_$1" '%s' "$2"; log "$1: $2"; }

# Connect the DevTools port to whichever process is running now.
attach() {
  local sock
  adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true
  sock=$(devtools_socket) || return 1
  adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null
}

# The tap, as the plugin's content intent carries it.
tap_the_reminder() {
  sh_ am start -W -n "$ACTIVITY" -a android.intent.action.MAIN \
    -c android.intent.category.LAUNCHER -f 0x24000000 \
    --ei NotificationId 1 --es NotificationUserAction tap >>"$OUT/am.txt" 2>&1
}

# What the page shows: whether the day sheet is open, its title, and whether that title is
# today's date as the sheet writes it (date-fns 'MMM d, yyyy', en-US).
SHEET_JS="(() => {
  const m = document.querySelector('[data-testid=\"quicklog-modal\"]')
  const want = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (!m) return { open: false, want }
  const title = (document.getElementById('quicklog-title') || {}).textContent || null
  return { open: true, title, want, today: title === want }
})()"

# Polls for up to `secs` for the sheet to open on today; prints the last reading.
sheet_opens_on_today() {
  local secs=$1 reading=""
  for _ in $(seq 1 "$secs"); do
    reading=$(js "$SHEET_JS" 2>&1)
    grep -q '"today":true' <<<"$reading" && { echo "$reading"; return 0; }
    sleep 1
  done
  echo "$reading"
  return 1
}

# Daylo's alarm on TimedNotificationPublisher, as dumpsys alarm lists it.
alarm_block() {
  sh_ dumpsys alarm >"$OUT/dumpsys-alarm-$1.txt" 2>&1
  grep -A8 "Alarm{.*$PKG" "$OUT/dumpsys-alarm-$1.txt" | tee "$OUT/alarm-$1.txt"
}
# Whether that alarm is for `day` at the reminder's hour. On API 34 the hour is on the
# "origWhen=" field (on 30 it is "when="; this runs on 34).
alarm_at() {
  local tag=$1 day=$2 b
  b=$(alarm_block "$tag")
  grep -q TimedNotificationPublisher <<<"$b" || return 2
  grep -Eq "(origWhen|when)=$day $HH:00:00" <<<"$b"
}
# Poll alarm_at for up to 15 s: the re-arm goes through the page, the plugin and AlarmManager.
alarm_moves_to() {
  local tag=$1 day=$2
  for _ in $(seq 1 15); do
    alarm_at "$tag" "$day" && return 0
    sleep 1
  done
  return 1
}

device_ready || exit 1
network_off "before anything is installed" || exit 1
sh_ svc power stayon true >/dev/null 2>&1 || true
sh_ input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
sh_ wm dismiss-keyguard >/dev/null 2>&1 || true

TODAY=$(sh_ date +%Y-%m-%d)
TOMORROW=$(date -d "$TODAY + 1 day" +%Y-%m-%d)
HOUR_NOW=$(( 10#$(sh_ date +%H) ))
H=$(( (HOUR_NOW + 2) % 24 ))
HH=$(printf '%02d' "$H")
TODAY_MEASURABLE=yes
[ "$HOUR_NOW" -ge 21 ] && TODAY_MEASURABLE=no
log "device day $TODAY, hour $HOUR_NOW; reminder at $HH:00; today's ring measurable: $TODAY_MEASURABLE"

adb logcat -c
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install "$APK" >"$OUT/install.txt" 2>&1 || { log "install failed"; exit 1; }
sh_ pm grant "$PKG" android.permission.POST_NOTIFICATIONS

# First start, only so there is a WebView to talk to, then one activity and the reminder on,
# with every notice seen and the check-in off so nothing opens on top.
sh_ am start -W -n "$ACTIVITY" >/dev/null
attach || { log "no DevTools socket after 60 s (is this a debug APK?)"; exit 1; }
now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
js "(() => {
  localStorage.setItem('simple-calendar-storage', JSON.stringify({ version: 0, state: {
    activities: [{ id: 'tap-192', name: 'Measure 192', color: '#10B981',
                   createdAt: '$now', updatedAt: '$now' }],
    logs: [], yearMode: 'byActivity',
    reminderEnabled: true, reminderHour: $H, reminderMinute: 0,
    reminderTimeChosen: true, reminderOffered: true,
    firstOpenedAt: '$now', feedbackInviteSeen: true, storeReviewOffered: true,
    checkinEnabled: false, checkinNoticeSeen: true, checkinId: null,
    checkinLastAttempt: null, updateNoticeSeenFor: null, updatesEnabled: false } }))
  // The app still holds its own state in memory and writes all of it on its next change.
  Storage.prototype.setItem = () => {}
  return true
})()" >"$OUT/seed.txt" 2>&1 || { log "could not seed the state"; exit 1; }
# WebView commits localStorage in batches, seconds after the write.
sleep 20
sh_ am force-stop "$PKG"

# C0: a plain launch.
sh_ am start -W -n "$ACTIVITY" >/dev/null
attach || { log "no DevTools socket after reopening"; exit 1; }
sleep 8
js "(() => { const s = JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state || {}
             return { activities: (s.activities || []).length, reminderEnabled: !!s.reminderEnabled } })()" \
  >"$OUT/seed-reopened.txt" 2>&1
if ! grep -q '"activities":1' "$OUT/seed-reopened.txt" || ! grep -q '"reminderEnabled":true' "$OUT/seed-reopened.txt"; then
  log "the seeded state did not survive reopening the app; nothing measured"
  exit 1
fi
reading=$(js "$SHEET_JS" 2>&1)
shot 00-plain-launch
if grep -q '"open":false' <<<"$reading"; then set_result C0 "PASS  (no sheet: $reading)"
else set_result C0 "FAIL  (a plain launch opened: $reading)"; fi

# A1: nothing logged today, so the ring is today's.
if [ "$TODAY_MEASURABLE" = yes ]; then
  if alarm_moves_to a1 "$TODAY"; then set_result A1 "PASS  (today, $TODAY $HH:00)"
  else set_result A1 "FAIL  (not on $TODAY $HH:00; see alarm-a1.txt)"; fi
else
  set_result A1 "NOT MEASURED  (the device's hour is past 21:00)"
fi

# W1: in memory, sent home, then the tap.
sh_ input keyevent KEYCODE_HOME
sleep 3
tap_the_reminder
attach || true
if reading=$(sheet_opens_on_today 10); then set_result W1 "PASS  ($reading)"
else set_result W1 "FAIL  ($reading)"; fi
shot 01-warm-tap

# A2 and A3: tick today in that sheet, then take it off.
js "(() => { const c = document.querySelector('[data-testid=\"quicklog-activity-checkbox\"]')
             if (!c) return 'no checkbox'; c.click(); return 'ticked' })()" >"$OUT/tick.txt" 2>&1
if grep -q ticked "$OUT/tick.txt" && alarm_moves_to a2 "$TOMORROW"; then
  set_result A2 "PASS  (tomorrow, $TOMORROW $HH:00)"
else
  set_result A2 "FAIL  (not on $TOMORROW $HH:00: $(cat "$OUT/tick.txt"); see alarm-a2.txt)"
fi
shot 02-ticked
js "(() => { const c = document.querySelector('[data-testid=\"quicklog-activity-checkbox\"]')
             if (!c) return 'no checkbox'; c.click(); return 'unticked' })()" >"$OUT/untick.txt" 2>&1
if [ "$TODAY_MEASURABLE" = yes ]; then
  if grep -q unticked "$OUT/untick.txt" && alarm_moves_to a3 "$TODAY"; then
    set_result A3 "PASS  (back on today, $TODAY $HH:00)"
  else
    set_result A3 "FAIL  (not back on $TODAY $HH:00: $(cat "$OUT/untick.txt"); see alarm-a3.txt)"
  fi
else
  set_result A3 "NOT MEASURED  (the device's hour is past 21:00)"
fi

# N1 and P1, while the app is up.
sh_ dumpsys notification >"$OUT/dumpsys-notification.txt" 2>&1
# dumpsys cuts a channel's name to its first three letters ("mName=Dai...", seen in the first
# run of this job), so "Dai" is what tells "Daily reminder" from "Default". Read from
# Daylo's own AppSettings block, the line after it, because other packages have a channel
# with the id "default" too.
grep -A1 "AppSettings: $PKG " "$OUT/dumpsys-notification.txt" >"$OUT/channel.txt" || true
if grep -q "mId='default', mName=Dai" "$OUT/channel.txt"; then
  set_result N1 "PASS  ($(grep -o "mName=[^,]*" "$OUT/channel.txt" | head -1), not Def...)"
else
  set_result N1 "FAIL  (Daylo's default channel is not Dai...; see channel.txt)"
fi
answer=$(js "Promise.race([
  window.__TAURI_INTERNALS__.invoke('plugin:notification|request_permission').then(String, (e) => 'error: ' + e),
  new Promise((ok) => setTimeout(() => ok('NO ANSWER in 5 s'), 5000)),
])" 2>&1)
if [ "$answer" = '"granted"' ]; then set_result P1 "PASS  (answered $answer)"
else set_result P1 "FAIL  (answered $answer)"; fi

# K1: stopped, then the tap.
sh_ am force-stop "$PKG"
sleep 2
tap_the_reminder
if attach; then
  if reading=$(sheet_opens_on_today 20); then set_result K1 "PASS  ($reading)"
  else set_result K1 "FAIL  ($reading)"; fi
else
  set_result K1 "FAIL  (no DevTools socket after the tap)"
fi
shot 03-cold-tap

# K2: stopped, then a plain launch.
sh_ am force-stop "$PKG"
sleep 2
sh_ am start -W -n "$ACTIVITY" >/dev/null
if attach; then
  sleep 10
  reading=$(js "$SHEET_JS" 2>&1)
  if grep -q '"open":false' <<<"$reading"; then set_result K2 "PASS  (no sheet: $reading)"
  else set_result K2 "FAIL  ($reading)"; fi
else
  set_result K2 "FAIL  (no DevTools socket after the launch)"
fi
shot 04-plain-after-stop

adb logcat -d >"$OUT/logcat.txt" 2>&1 || true
guard_ok=true
checkin_logcat_guard || guard_ok=false
[ "$NETWORK_GUARD" = held ] || guard_ok=false

ALL="C0 A1 W1 A2 A3 K1 K2 N1 P1"
{
  echo "The reminder's tap and its day (#192), $(date -u '+%Y-%m-%d %H:%M UTC')"
  cat "$OUT/device.txt"
  echo "reminder at $HH:00, device day $TODAY"
  echo "network guard: $($guard_ok && echo held || echo BROKEN)"
  echo
  for id in $ALL; do r="R_$id"; printf '%-3s %s\n' "$id" "${!r:-NOT MEASURED}"; done
} | tee "$OUT/summary.txt"

$guard_ok || exit 1
for id in C0 W1 A2 K1 K2 N1 P1; do r="R_$id"; [[ "${!r:-}" == PASS* ]] || exit 1; done
for id in A1 A3; do r="R_$id"; [[ "${!r:-}" == PASS* || "${!r:-}" == NOT\ MEASURED* ]] || exit 1; done
exit 0
