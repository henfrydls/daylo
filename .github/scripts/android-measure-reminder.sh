#!/usr/bin/env bash
# Measurement A for #202: is the daily reminder still on the alarm queue after the phone
# restarts, without Daylo being opened? And does an update re-arm it?
#
# Usage: android-measure-reminder.sh <test-apk> <control-apk> <out-dir>
#
#   test-apk     debug build of the branch being measured
#   control-apk  debug build of the commit before the change (the job's control_ref)
#
# Both have to be DEBUG builds: run-as reads the plugin's store and the DevTools protocol
# turns the reminder on, and both need a debuggable APK.
#
# Observables, named before measuring:
#   O1  test:     shared_prefs/NOTIFICATION_STORE.xml holds notification 1 with
#                 allowWhileIdle true and the hour that was set.
#   O2  test:     dumpsys alarm has an RTC_WAKEUP of com.daylo.app on
#                 TimedNotificationPublisher, before the restart.
#   O3  test:     after adb reboot and sys.boot_completed, WITHOUT opening the app, the
#                 alarm is still there.
#   O4  control:  the same with the control, and the alarm is GONE. Without O4 this does
#                 not tell anything apart: if the control keeps it too, O3 proves nothing.
#   O5  update:   adb install -r of the same APK, app not opened. With the test build the
#                 alarm's PendingIntent changes (FLAG_CANCEL_CURRENT makes a new one) or the
#                 log says "will next fire at"; with the control it stays the same. While
#                 the permission is still declared the alarm survives either way, so its
#                 presence tells nothing apart, the hash does. Read at 5, 30 and 60 seconds
#                 after the install, so that the 1.5.4 measurement can see an exact alarm
#                 re-armed and then removed by AlarmManagerService.
#   O6  test:     the restored alarm, after the restart and 60 s after the update, is exact
#                 (window=0 and an exactAllowReason), as the one armed from the open app
#                 is. Informative until that is fixed; O6_COUNTS=1 makes it count.
#
# And one condition that is not an observable of the reminder but decides whether this
# may run at all: not one check-in reaches production. A fresh install turns the check-in
# on and sends one, and an emulator is not a person. The network is cut before anything is
# installed and checked after every boot, and the job reads two records afterwards that
# would show an attempt: the emulator's own packet capture (taken by the emulator on the
# host, outside Android) and logcat. Either one naming the check-in host fails the job.
#
# Exits 0 only when the verdict is "tells apart" with the test build passing O1 to O3, and
# the network guard held.

set -uo pipefail
SEED_LOST=0

TEST_APK=${1:?the test APK is missing}
CONTROL_APK=${2:?the control APK is missing}
OUT=${3:?the output directory is missing}
PKG=com.daylo.app
ACTIVITY="$PKG/.MainActivity"
PORT=9333
# The only host the app sends anything to, src-tauri/src/checkin.rs, const URL.
CHECKIN_HOST=checkin.henfrydls.com
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"

for f in "$TEST_APK" "$CONTROL_APK"; do
  [ -f "$f" ] || { echo "::error::no such APK: $f"; exit 2; }
done

log() { echo "[$(date +%T)] $*" | tee -a "$OUT/log.txt"; }
sh_() { adb shell "$@" | tr -d '\r'; }

# The WebView's DevTools socket for the app's current process, waiting up to 60 s for it.
# A fixed 10 s was not enough in run 43608923559: the control's first start had no socket
# yet, and the whole control phase was lost.
devtools_socket() {
  local pid sock
  for _ in $(seq 1 30); do
    pid=$(sh_ pidof "$PKG")
    if [ -n "$pid" ]; then
      sock=$(sh_ cat /proc/net/unix | grep -o "webview_devtools_remote_$pid" | head -1)
      [ -n "$sock" ] && { echo "$sock"; return 0; }
    fi
    sleep 2
  done
  return 1
}

wait_for_boot() {
  # Bounded: run 43602238149 hung here for 42 minutes after a reboot until the job was
  # cancelled, and nothing it measured could be read.
  timeout 300 adb wait-for-device || return 1
  for _ in $(seq 1 240); do
    [ "$(timeout 10 adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] && return 0
    sleep 1
  done
  return 1
}

NETWORK_GUARD=held
# The network is off, and seen to be off. Called before the first install and after every
# boot. Airplane mode alone is not trusted: the reading of the setting and a failed ping
# have to agree.
network_off() {
  local where=$1
  sh_ cmd connectivity airplane-mode enable >/dev/null 2>&1 || true
  sh_ svc wifi disable >/dev/null 2>&1 || true
  sh_ svc data disable >/dev/null 2>&1 || true
  sleep 3
  local airplane
  airplane=$(sh_ settings get global airplane_mode_on)
  {
    echo "== $where"
    echo "airplane_mode_on=$airplane"
    sh_ ping -c 1 -W 3 8.8.8.8 && echo "PING 8.8.8.8 ANSWERED" || echo "ping 8.8.8.8 failed"
    sh_ ping -c 1 -W 3 "$CHECKIN_HOST" && echo "PING $CHECKIN_HOST ANSWERED" \
      || echo "ping $CHECKIN_HOST failed"
  } >>"$OUT/network.txt" 2>&1
  if [ "$airplane" != 1 ] || grep -q ANSWERED "$OUT/network.txt"; then
    log "the network is not off ($where): stopping before the app can reach it"
    NETWORK_GUARD=broken
    return 1
  fi
}

# Daylo's block in dumpsys alarm: the Alarm{...} line and the eight after it.
daylo_block() { grep -A8 "Alarm{.*$PKG" "$1" || true; }
# The operation=PendingIntent{hash...} line: the only thing that tells a new registration
# from a reused one.
pending_intent() { daylo_block "$1" | grep -m1 -o "PendingIntent{[0-9a-f]*" || true; }
# Exact: the block says window=0 and carries an exactAllowReason. An inexact one shows a
# window (+1h0m0s0ms for setAndAllowWhileIdle this far ahead) and no reason.
is_exact() {
  local b
  b=$(daylo_block "$1")
  grep -q "window=0 " <<<"$b" && grep -q "exactAllowReason=" <<<"$b"
}
exactness() {
  if ! has_alarm "$1"; then echo no-alarm; elif is_exact "$1"; then echo exact; else echo inexact; fi
}
# The plugin's own account of each decision (debug builds), one line per alarm armed.
decisions() {
  { echo "== $2"; grep -h "exact-alarm decision" "$1" || echo "(no decision line)"; } \
    >>"$OUT/$3-decisions.txt"
}
has_alarm() {
  local b
  b=$(daylo_block "$1")
  grep -q TimedNotificationPublisher <<<"$b" && grep -q RTC_WAKEUP <<<"$b"
}
set_result() { printf -v "R_$1_$2" '%s' "$3"; }

booted=$(sh_ getprop sys.boot_completed)
[ "$booted" = 1 ] || wait_for_boot || { log "the emulator never booted"; exit 1; }
{
  echo "release=$(sh_ getprop ro.build.version.release) sdk=$(sh_ getprop ro.build.version.sdk)"
  echo "abilist=$(sh_ getprop ro.product.cpu.abilist)"
  echo "device clock=$(sh_ date)"
} | tee "$OUT/device.txt"

network_off "before anything is installed" || exit 1

# Three hours after the device's clock, on the hour, so it cannot fire while measuring.
H=$(( ( 10#$(sh_ date +%H) + 3 ) % 24 ))
log "reminder at $H:00"

# One phase: install, turn on, look, restart, look, update, look.
phase() {
  local tag=$1 apk=$2
  log "=== phase $tag: $apk"
  # Uninstalled rather than cleared: that takes the package's alarms, its store and its
  # app ops with it, and the two APKs carry different debug keys, so one could not be
  # installed over the other anyway.
  adb uninstall "$PKG" >/dev/null 2>&1 || true

  adb install "$apk" >"$OUT/$tag-0-install.txt" 2>&1 || { log "install failed"; return 1; }
  sh_ pm grant "$PKG" android.permission.POST_NOTIFICATIONS
  sh_ appops set "$PKG" SCHEDULE_EXACT_ALARM allow
  # AppOpsService writes appops.xml up to 30 minutes after a change. Run 43606830927 restarted
  # a minute later and booted with "No existing app ops /data/system/appops.xml; starting
  # empty", so the grant was gone and every restored alarm came back inexact. On a phone the
  # grant made in Settings is on disk long before any restart; here it has to be flushed.
  sh_ appops write-settings
  sh_ appops get "$PKG" SCHEDULE_EXACT_ALARM >"$OUT/$tag-0-appops.txt"

  # First start, only so there is a WebView to talk to.
  sh_ am start -W -n "$ACTIVITY" >/dev/null
  local pid sock
  sock=$(devtools_socket) || { log "no DevTools socket after 60 s (is this a debug APK?)"; return 1; }
  adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null

  # Somebody with one activity and the reminder on, written where the app reads it. The
  # check-in off and every notice seen, so nothing opens on top.
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  node "$HERE/cdp-eval.mjs" "$PORT" "(() => {
    localStorage.setItem('simple-calendar-storage', JSON.stringify({ version: 0, state: {
      activities: [{ id: 'measure-a', name: 'Measure A', color: '#22c55e',
                     createdAt: '$now', updatedAt: '$now' }],
      logs: [], yearMode: 'byActivity',
      reminderEnabled: true, reminderHour: $H, reminderMinute: 0,
      reminderTimeChosen: true, reminderOffered: true,
      firstOpenedAt: '$now', feedbackInviteSeen: true, storeReviewOffered: true,
      checkinEnabled: false, checkinNoticeSeen: true, checkinId: null,
      checkinLastAttempt: null, updateNoticeSeenFor: null, updatesEnabled: false } }));
    const written = localStorage.getItem('simple-calendar-storage').length
    // The app still holds its own state in memory and writes all of it on its next change.
    // From here on nothing it does may land over the seed.
    Storage.prototype.setItem = () => {}
    return written
  })()" >"$OUT/$tag-0-seed.txt" 2>&1 || { log "could not seed the state"; return 1; }
  adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true

  # WebView commits localStorage to disk in batches, seconds after the write. The first run
  # of this job force-stopped one second after seeding and the seed never reached the disk:
  # the app opened again with no activity and took the reminder down. Wait for the commit.
  sleep 20

  # force-stop so that no write the app has pending lands over what was seeded, then open
  # it again: opening is what calls refreshReminder, which calls show. Opening also takes
  # the app out of the stopped state, without which BOOT_COMPLETED would not reach it. No
  # force-stop after this one.
  sh_ am force-stop "$PKG"
  sh_ am start -W -n "$ACTIVITY" >/dev/null
  sleep 15

  # Did the seed survive into the app that schedules? Without this, a lost seed reads as
  # "the change does not work" when nothing was ever turned on.
  sock=$(devtools_socket) || sock=
  if [ -n "$sock" ]; then
    adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null
    node "$HERE/cdp-eval.mjs" "$PORT" "(() => {
      const s = JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state || {}
      return { activities: (s.activities || []).length, reminderEnabled: !!s.reminderEnabled,
               reminderHour: s.reminderHour }
    })()" >"$OUT/$tag-0-seed-reopened.txt" 2>&1
    adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true
  fi
  if ! grep -q '"activities":1' "$OUT/$tag-0-seed-reopened.txt" 2>/dev/null \
     || ! grep -q '"reminderEnabled":true' "$OUT/$tag-0-seed-reopened.txt" 2>/dev/null; then
    log "$tag: the seeded state did not survive the restart of the app; nothing was measured"
    SEED_LOST=1
  fi
  sh_ input keyevent KEYCODE_HOME

  # O1
  sh_ run-as "$PKG" cat shared_prefs/NOTIFICATION_STORE.xml >"$OUT/$tag-1-store.xml" 2>&1
  if grep -q 'allowWhileIdle&quot;:true' "$OUT/$tag-1-store.xml" \
     && grep -q "hour&quot;:$H[,}]" "$OUT/$tag-1-store.xml"; then
    set_result "$tag" O1 yes
  else
    set_result "$tag" O1 no
  fi

  # O2
  sh_ dumpsys alarm >"$OUT/$tag-2-alarms-before.txt"
  if has_alarm "$OUT/$tag-2-alarms-before.txt"; then set_result "$tag" O2 yes; else set_result "$tag" O2 no; fi
  daylo_block "$OUT/$tag-2-alarms-before.txt" >"$OUT/$tag-2-block-before.txt"

  # O3 / O4: restart and do not open.
  adb logcat -d >"$OUT/$tag-2-logcat.txt" 2>&1
  decisions "$OUT/$tag-2-logcat.txt" "opened by hand (show)" "$tag"
  adb logcat -c
  log "$tag: restarting"
  adb reboot
  sleep 5
  if ! wait_for_boot; then
    log "$tag: could not restart (no sys.boot_completed)"
    set_result "$tag" O3 no-restart
    return 1
  fi
  network_off "$tag, after the restart" || return 1
  sh_ appops get "$PKG" SCHEDULE_EXACT_ALARM >"$OUT/$tag-3-appops.txt"
  # BOOT_COMPLETED reaches receivers a few seconds after boot_completed.
  sleep 45
  sh_ dumpsys alarm >"$OUT/$tag-3-alarms-after-restart.txt"
  daylo_block "$OUT/$tag-3-alarms-after-restart.txt" >"$OUT/$tag-3-block-after-restart.txt"
  adb logcat -d >"$OUT/$tag-3-logcat-restart.txt" 2>&1
  decisions "$OUT/$tag-3-logcat-restart.txt" "after the restart (restore)" "$tag"
  sh_ run-as "$PKG" cat shared_prefs/NOTIFICATION_STORE.xml >"$OUT/$tag-3-store.xml" 2>&1
  sh_ ps -A | grep "$PKG" >"$OUT/$tag-3-processes.txt" || true
  if has_alarm "$OUT/$tag-3-alarms-after-restart.txt"; then set_result "$tag" O3 yes; else set_result "$tag" O3 no; fi
  set_result "$tag" O6restart "$(exactness "$OUT/$tag-3-alarms-after-restart.txt")"

  # O5: install the same APK over itself, without opening.
  local before after
  before=$(pending_intent "$OUT/$tag-3-alarms-after-restart.txt")
  adb logcat -c
  adb install -r "$apk" >"$OUT/$tag-5-reinstall.txt" 2>&1
  local s
  for s in 5 30 60; do
    sleep $(( s == 5 ? 5 : (s == 30 ? 25 : 30) ))
    sh_ dumpsys alarm >"$OUT/$tag-5-alarms-${s}s.txt"
    daylo_block "$OUT/$tag-5-alarms-${s}s.txt" >"$OUT/$tag-5-block-${s}s.txt"
  done
  sh_ appops get "$PKG" SCHEDULE_EXACT_ALARM >"$OUT/$tag-5-appops.txt"
  sh_ dumpsys alarm | grep -A12 "Removal history" >"$OUT/$tag-5-removal-history.txt" || true
  adb logcat -d >"$OUT/$tag-5-logcat-update.txt" 2>&1
  decisions "$OUT/$tag-5-logcat-update.txt" "after the update (restore)" "$tag"
  set_result "$tag" O6update "$(exactness "$OUT/$tag-5-alarms-60s.txt")"
  after=$(pending_intent "$OUT/$tag-5-alarms-60s.txt")
  {
    echo "before=$before"
    for s in 5 30 60; do echo "${s}s=$(pending_intent "$OUT/$tag-5-alarms-${s}s.txt")"; done
  } >"$OUT/$tag-5-pendingintent.txt"
  if [ -n "$after" ] && { [ "$before" != "$after" ] \
       || grep -q "will next fire at" "$OUT/$tag-5-logcat-update.txt"; }; then
    set_result "$tag" O5 rearmed
  elif [ -n "$after" ]; then
    set_result "$tag" O5 same
  else
    set_result "$tag" O5 no-alarm
  fi
  log "phase $tag done"
}

# The control first, then the test build, each from a fresh install.
phase control "$CONTROL_APK"
[ "$NETWORK_GUARD" = held ] && phase test "$TEST_APK"

# The check-in host in logcat, from every phase. A fresh install sends its first check-in
# on the first start, before anything can be seeded, so the app does try once per phase;
# what matters is that the try failed. The app logs every failure as "check-in did not go
# through", and with the radio off the reason is a DNS failure: that line is the record
# that nothing left. Any other line naming the host means the guard did not hold.
#
# grep over the files, not `cat | grep -q`: under pipefail, grep -q exits on the first match,
# cat dies of SIGPIPE, and the pipeline reports failure exactly when the host is found. The
# first run of this job said "held" over a logcat that named the host.
grep -h "$CHECKIN_HOST" "$OUT"/*logcat*.txt >"$OUT/checkin-lines.txt" 2>/dev/null || true
blocked=$(grep -c "did not go through" "$OUT/checkin-lines.txt" || true)
other=$(grep -vc "did not go through" "$OUT/checkin-lines.txt" || true)
echo "logcat lines naming $CHECKIN_HOST: ${blocked:-0} failed attempts, ${other:-0} other" >>"$OUT/network.txt"
if [ "${other:-0}" -gt 0 ]; then
  log "logcat names $CHECKIN_HOST outside a failed attempt"
  NETWORK_GUARD=broken
fi

v() { local n="R_$1_$2"; echo "${!n:-no data}"; }
verdict() { [ "$1" = "$2" ] && echo PASS || echo FAIL; }
o3() {
  case "$1" in
    no-restart) echo "could not restart" ;;
    *) verdict "$1" "$2" ;;
  esac
}
DISTINGUISHES=no
if [ "$NETWORK_GUARD" = held ] && [ "$(v test O1)" = yes ] && [ "$(v test O2)" = yes ] \
   && [ "$(v test O3)" = yes ] && [ "$(v control O2)" = yes ] && [ "$(v control O3)" = no ]; then
  DISTINGUISHES=yes
fi
# O6 is informative until the restored alarm is fixed to be exact; then run with
# O6_COUNTS=1 (or change the default) and it is required for the verdict.
O6_COUNTS=${O6_COUNTS:-0}
if [ "$O6_COUNTS" = 1 ] && { [ "$(v test O6restart)" != exact ] || [ "$(v test O6update)" != exact ]; }; then
  DISTINGUISHES=no
fi
[ "$SEED_LOST" = 1 ] && DISTINGUISHES=no
{
  echo "Measurement A of #202, $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "device: $(head -1 "$OUT/device.txt")"
  echo "reminder at $H:00"
  [ "$SEED_LOST" = 1 ] && echo "SEED LOST: the seeded state did not survive reopening the app in some phase (see *-0-seed-reopened.txt); nothing below measures the change."
  echo "network guard: $NETWORK_GUARD (see network.txt; the packet capture is checked by the workflow)"
  echo
  echo "O1 test: store holds allowWhileIdle and the hour      $(verdict "$(v test O1)" yes)  ($(v test O1))"
  echo "O2 test: RTC_WAKEUP before the restart                $(verdict "$(v test O2)" yes)  ($(v test O2))"
  echo "O3 test: alarm still there after restart, unopened    $(o3 "$(v test O3)" yes)  ($(v test O3))"
  echo "O4 control: alarm gone after the restart              $(o3 "$(v control O3)" no)  (alarm after restart: $(v control O3))"
  echo "O5 test: re-armed by the update                       $(verdict "$(v test O5)" rearmed)  ($(v test O5))"
  echo "O5 control (informative, expected no-alarm or same):  $(v control O5)"
  if [ "$O6_COUNTS" = 1 ]; then o6note="counts"; else o6note="informative"; fi
  echo "O6 test: restored alarm is exact, after the restart   $(verdict "$(v test O6restart)" exact)  ($(v test O6restart); $o6note)"
  echo "O6 test: restored alarm is exact, 60 s after update   $(verdict "$(v test O6update)" exact)  ($(v test O6update); $o6note)"
  echo "(The decision lines behind each alarm are in test-decisions.txt and control-decisions.txt.)"
  echo
  echo "Control before the restart, to show it was turned on: O1=$(v control O1) O2=$(v control O2)"
  echo "(The control's O1 is expected to be no: without the change nothing writes the store.)"
  echo
  if [ "$DISTINGUISHES" = yes ]; then
    echo "VERDICT: tells apart. The test build keeps the alarm and the control loses it."
  elif [ "$(v test O3)" = no-restart ] || [ "$(v control O3)" = no-restart ]; then
    echo "VERDICT: could not restart the emulator. Neither pass nor fail."
  else
    echo "VERDICT: inconclusive. Read the files in this folder before concluding anything."
  fi
} | tee "$OUT/summary.txt"

[ "$DISTINGUISHES" = yes ]
