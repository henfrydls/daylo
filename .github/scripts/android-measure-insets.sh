#!/usr/bin/env bash
# Whether Android's navigation bar covers what Daylo pins to the bottom of the screen (#198),
# on the CI emulator, on Android 15 with one navigation mode.
#
# Usage: android-measure-insets.sh <apk> <out-dir> <threebutton|gestural>
#
#   apk  DEBUG build of the branch being measured: the DevTools protocol is how the state
#        is seeded and every reading below is taken.
#
# Why: with targetSdk 36 the app is drawn edge to edge from Android 15, so the system's
# navigation bar sits on top of the WebView instead of below it. With three buttons that
# bar is 48 dp. Nobody had looked at what it covers, and Henfry's phone uses gestures and
# cannot take a debug build without losing its data.
#
# The bar is read from Android, not from the page: the top of the navigationBars inset
# source in `dumpsys window`, in screen pixels, divided by the WebView's devicePixelRatio.
# That way the verdict does not depend on env(safe-area-inset-bottom), which is the very
# thing in question. What env() says is recorded next to it.
#
# Each surface, with the observable named before measuring:
#   S1  The floating button that opens the activities panel: its bottom edge is above the
#       top of the bar.
#   S2  The activities panel (BottomSheet) opened from it: the bottom of the last thing in
#       its list, scrolled to the end, is above the bar.
#   S3  The day sheet opened from "Log today": the bottom of its Done button is above the
#       bar.
#   S4  A toast ("Activity deleted", after S5 is confirmed): the bottom of the toast stack
#       is above the bar.
#   S5  The confirmation dialog, from Delete on an activity in the panel: the bottom of its
#       Cancel button is above the bar.
# A surface whose bottom edge is below the top of the bar, by any amount, is COVERED.
#
# The network rule is measurement A's, from android-measure-common.sh.
#
# Exits 0 when every surface was measured and none is covered, and the network guard held.
# A surface that could not be measured makes it exit 1 and says which.

set -uo pipefail

APK=${1:?the APK is missing}
OUT=${2:?the output directory is missing}
MODE=${3:?the navigation mode is missing (threebutton or gestural)}
PORT=9335
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
# PKG, ACTIVITY, CHECKIN_HOST, log, sh_, devtools_socket, device_ready, network_off and
# checkin_logcat_guard.
. "$HERE/android-measure-common.sh"

[ -f "$APK" ] || { echo "::error::no such APK: $APK"; exit 2; }
case "$MODE" in threebutton | gestural) ;; *) echo "::error::unknown mode $MODE"; exit 2 ;; esac

js() { node "$HERE/cdp-eval.mjs" "$PORT" "$1"; }
shot() { adb exec-out screencap -p >"$OUT/$1.png" 2>/dev/null || true; }

device_ready || exit 1
network_off "before anything is installed" || exit 1
sh_ svc power stayon true >/dev/null 2>&1 || true
sh_ input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
sh_ wm dismiss-keyguard >/dev/null 2>&1 || true

# The navigation mode, set the way Settings sets it, and read back.
sh_ cmd overlay enable-exclusive --category "com.android.internal.systemui.navbar.$MODE" \
  >"$OUT/overlay.txt" 2>&1
sleep 6
NAV_SETTING=$(sh_ settings get secure navigation_mode)
{
  echo "mode asked: $MODE"
  echo "navigation_mode setting: $NAV_SETTING (0 three buttons, 2 gestures)"
  echo "release: $(sh_ getprop ro.build.version.release) sdk: $(sh_ getprop ro.build.version.sdk)"
  echo "screen: $(sh_ wm size)"
  echo "density: $(sh_ wm density)"
  echo "webview: $(sh_ dumpsys webviewupdate | grep -i 'Current WebView package' | head -1)"
} | tee "$OUT/device.txt"
want=0; [ "$MODE" = gestural ] && want=2
if [ "$NAV_SETTING" != "$want" ]; then
  log "the navigation mode did not change to $MODE (setting says $NAV_SETTING); nothing measured"
  exit 1
fi

adb logcat -c
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install "$APK" >"$OUT/install.txt" 2>&1 || { log "install failed"; exit 1; }
sh_ pm grant "$PKG" android.permission.POST_NOTIFICATIONS
sh_ am start -W -n "$ACTIVITY" >/dev/null
sock=$(devtools_socket) || { log "no DevTools socket after 60 s (is this a debug APK?)"; exit 1; }
adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null

# Twelve activities, so the panel's list is longer than the panel and has to be scrolled to
# its end, and the day sheet's Done sits as low as it can.
now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
js "(() => {
  const names = ['Read 20 minutes', 'Walk', 'Meditate', 'Drink water', 'Study English',
                 'No sugar', 'Sleep before 11', 'Stretch', 'Journal', 'Call family',
                 'Practice guitar', 'Floss']
  localStorage.setItem('simple-calendar-storage', JSON.stringify({ version: 0, state: {
    activities: names.map((name, i) => ({ id: 'i' + i, name, color: '#10B981',
                                          createdAt: '$now', updatedAt: '$now' })),
    logs: [], currentView: 'month', yearMode: 'byActivity',
    reminderEnabled: false, reminderHour: 20, reminderMinute: 0,
    reminderTimeChosen: false, reminderOffered: true,
    firstOpenedAt: '$now', feedbackInviteSeen: true, storeReviewOffered: true,
    checkinEnabled: false, checkinNoticeSeen: true, checkinId: null,
    checkinLastAttempt: null, updateNoticeSeenFor: null, updatesEnabled: false } }))
  setTimeout(() => location.reload(), 200)
  return names.length
})()" >"$OUT/seed.txt" 2>&1 || { log "could not seed the state"; exit 1; }
sleep 8
seeded=$(js "JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state?.activities?.length ?? 0" 2>&1)
[ "$seeded" = 12 ] || { log "the seeded activities did not survive the reload ($seeded); nothing measured"; exit 1; }

# The bar, from Android. The last navigationBars source with a frame is the one in use.
sh_ dumpsys window >"$OUT/dumpsys-window.txt" 2>&1
BAR_TOP_PX=$(grep -oE 'type=navigationBars frame=\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' "$OUT/dumpsys-window.txt" \
  | tail -1 | sed -E 's/.*frame=\[[0-9]+,([0-9]+)\].*/\1/')
SCREEN_H=$(sh_ wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f2)
[ -n "$BAR_TOP_PX" ] || { log "no navigationBars frame in dumpsys window; nothing measured"; exit 1; }
log "navigation bar: top at ${BAR_TOP_PX}px of ${SCREEN_H}px, $(( SCREEN_H - BAR_TOP_PX ))px tall"

# What the page knows about itself. env() is read through a probe, because computed style
# is the only way to see what the WebView substitutes for it.
js "(() => {
  const p = document.createElement('div')
  p.style.cssText = 'position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom,0px);'
  document.body.appendChild(p)
  const inset = parseFloat(getComputedStyle(p).paddingBottom)
  p.remove()
  return { inset, innerHeight, dpr: devicePixelRatio,
           visual: window.visualViewport ? visualViewport.height : null,
           screenH: screen.height }
})()" >"$OUT/page.json" 2>&1 || { log "could not read the page"; exit 1; }
cat "$OUT/page.json" | tee -a "$OUT/log.txt"
DPR=$(jq -r .dpr "$OUT/page.json")
INNER=$(jq -r .innerHeight "$OUT/page.json")
INSET=$(jq -r .inset "$OUT/page.json")
# The top of the bar in CSS pixels, measured from the top of the WebView, which in edge to
# edge starts at the top of the screen. If the WebView ends above the bar (not edge to
# edge), the bar is below the page and covers nothing; that is what min() expresses.
BAR_TOP_CSS=$(awk -v t="$BAR_TOP_PX" -v d="$DPR" -v h="$INNER" 'BEGIN { v = t / d; if (v > h) v = h; printf "%.1f", v }')
log "in CSS pixels: page ${INNER} tall, bar from ${BAR_TOP_CSS}, env(safe-area-inset-bottom) = ${INSET}"

# The bottom edge of one element, in CSS pixels, or "none".
bottom_of() {
  js "(() => { const e = document.querySelector('$1'); if (!e) return 'none'
               const r = e.getBoundingClientRect(); return r.height ? r.bottom : 'none' })()" 2>/dev/null
}
waitfor() {
  local i
  for i in $(seq 1 20); do
    [ "$(js "!!document.querySelector('$1')" 2>/dev/null)" = true ] && return 0
    sleep 0.5
  done
  return 1
}
judge() {
  local id=$1 what=$2 b=$3
  if [ -z "$b" ] || [ "$b" = '"none"' ] || [ "$b" = null ]; then
    printf -v "R_$id" '%s' "NOT MEASURED"; printf -v "W_$id" '%s' "$what was not found"
  elif awk -v b="$b" -v t="$BAR_TOP_CSS" 'BEGIN { exit !(b <= t + 0.5) }'; then
    printf -v "R_$id" '%s' "CLEAR"; printf -v "W_$id" '%s' "$what ends at $b, the bar starts at $BAR_TOP_CSS"
  else
    printf -v "R_$id" '%s' "COVERED"; printf -v "W_$id" '%s' "$what ends at $b, $(awk -v b="$b" -v t="$BAR_TOP_CSS" 'BEGIN { printf "%.1f", b - t }') px under the bar starting at $BAR_TOP_CSS"
  fi
  local r="R_$id" w="W_$id"
  log "$id: ${!r} (${!w})"
}

shot 00-month
judge S1 "the floating button" "$(bottom_of '[data-testid="fab-button"]')"

# S2: the panel, scrolled to the end of its list.
js "document.querySelector('[data-testid=\"fab-button\"]').click(), true" >/dev/null 2>&1
if waitfor '[data-testid="bottom-sheet"]'; then
  sleep 1.5
  b=$(js "(() => { const s = document.querySelector('[data-testid=\"bottom-sheet\"]')
                    const list = s.querySelector('.overflow-y-auto') || s
                    list.scrollTop = list.scrollHeight
                    return new Promise((ok) => setTimeout(() => {
                      const kids = list.querySelectorAll('button, a, input, p, li, h2, h3, div')
                      let last = 0
                      for (const k of kids) { const r = k.getBoundingClientRect()
                        if (r.height && getComputedStyle(k).visibility !== 'hidden') last = Math.max(last, r.bottom) }
                      ok(Math.min(last, list.getBoundingClientRect().bottom))
                    }, 600)) })()" 2>/dev/null)
  shot 02-panel-end
  judge S2 "the end of the activities panel" "$b"
  js "document.querySelector('[data-testid=\"bottom-sheet-backdrop\"]').click(), true" >/dev/null 2>&1
  sleep 1.5
else
  judge S2 "the activities panel" ""
fi

# S3: the day sheet from "Log today".
js "document.querySelector('button[aria-label^=\"Log today\"]').click(), true" >/dev/null 2>&1
if waitfor '[data-testid="quicklog-done-button"]'; then
  sleep 1.5
  b=$(js "(() => { const d = document.querySelector('[data-testid=\"quicklog-done-button\"]')
                    d.scrollIntoView({ block: 'end' })
                    return new Promise((ok) => setTimeout(() => ok(d.getBoundingClientRect().bottom), 400)) })()" 2>/dev/null)
  shot 03-day-sheet
  judge S3 "the day sheet's Done" "$b"
  js "document.querySelector('[data-testid=\"quicklog-done-button\"]').click(), true" >/dev/null 2>&1
  sleep 1.5
else
  judge S3 "the day sheet's Done" ""
fi

# S5 and then S4, along the one path that shows both without leaving the app: Delete on an
# activity in the panel opens the confirmation, and confirming it shows "Activity deleted".
js "document.querySelector('[data-testid=\"fab-button\"]').click(), true" >/dev/null 2>&1
waitfor '[data-testid="bottom-sheet"] button[aria-label^="Delete "]' || true
sleep 1.5
js "(() => { const b = document.querySelector('[data-testid=\"bottom-sheet\"] button[aria-label^=\"Delete \"]')
             if (b) b.click(); return b ? b.getAttribute('aria-label') : null })()" >"$OUT/s5-delete.txt" 2>&1
if waitfor '[data-testid="confirm-dialog-cancel"]'; then
  sleep 1
  b=$(bottom_of '[data-testid="confirm-dialog-cancel"]')
  shot 05-confirm
  judge S5 "the confirmation's Cancel" "$b"
  js "document.querySelector('[data-testid=\"confirm-dialog-confirm\"]').click(), true" >/dev/null 2>&1
else
  shot 05-no-confirm
  judge S5 "the confirmation's Cancel" ""
fi
if waitfor '[aria-label="Notifications"] > *'; then
  sleep 0.5
  b=$(bottom_of '[aria-label="Notifications"]')
  shot 04-toast
  judge S4 "the toast" "$b"
else
  shot 04-no-toast
  judge S4 "the toast" ""
fi

guard_ok=true
checkin_logcat_guard || guard_ok=false

{
  echo "Navigation bar over the bottom of the screen (#198), $(date -u '+%Y-%m-%d %H:%M UTC')"
  cat "$OUT/device.txt"
  echo "bar: top at ${BAR_TOP_PX}px of ${SCREEN_H}px; in CSS pixels the page is ${INNER} tall and the bar starts at ${BAR_TOP_CSS}"
  echo "env(safe-area-inset-bottom) in the WebView: ${INSET}px"
  echo "network guard: $($guard_ok && echo held || echo BROKEN)"
  echo
  for id in S1 S2 S3 S4 S5; do r="R_$id" w="W_$id"; printf '%-3s %-13s %s\n' "$id" "${!r:-NOT MEASURED}" "${!w:-}"; done
} | tee "$OUT/summary.txt"

$guard_ok || exit 1
for id in S1 S2 S3 S4 S5; do r="R_$id"; [ "${!r:-}" = CLEAR ] || exit 1; done
exit 0
