#!/usr/bin/env bash
# Whether Android's bars cover what Daylo pins to the top and bottom of the screen, or leave
# empty space there (#198), on the CI emulator, with one navigation mode. Run on Android 15,
# which draws the app edge to edge, and on Android 14, which does not.
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
#   H0  The header: the top of its content is where the status bar ends, in the page.
#
# Each is compared with the free area of the page: what is left of it once the bars that
# lie over it are taken away. Edge to edge (Android 15) that is the screen minus both bars;
# otherwise the page already sits between them and the free area is the whole page.
#
# A surface that reaches into a bar, by any amount, is COVERED. One that is further from the
# edge than the design's own margin (EXPECTED below) plus 2 px is GAP: the inset counted
# twice, or counted where there is no bar, which is the other way to get this wrong.
#
# The network rule is measurement A's, from android-measure-common.sh.
#
# Exits 0 when every surface was measured and is CLEAR, and the network guard held.
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
  // The app flushes its own pending write when the page goes away, which would put the
  // empty state back over this before the reload reads it (it did, once in four runs).
  Storage.prototype.setItem = () => {}
  setTimeout(() => location.reload(), 200)
  return names.length
})()" >"$OUT/seed.txt" 2>&1 || { log "could not seed the state"; exit 1; }
sleep 8
seeded=$(js "JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state?.activities?.length ?? 0" 2>&1)
[ "$seeded" = 12 ] || { log "the seeded activities did not survive the reload ($seeded); nothing measured"; exit 1; }

# The bars, from Android: the insets sources of display 0, in its WindowInsetsStateController
# section. Other windows list sources too (a dialog, the IME, the bar's own windows), and
# taking the last match anywhere in the dump could read one of those.
sh_ dumpsys window >"$OUT/dumpsys-window.txt" 2>&1
source_frame() {
  awk -v want="type=$1 frame=" '
    /^  Display: mDisplayId=/ { d = ($0 ~ /mDisplayId=0 /) }
    /^WINDOW MANAGER / && !/DISPLAY CONTENTS/ { d = 0 }
    d && /WindowInsetsStateController/ { w = 1 }
    d && w && $1 == "InsetsSource" && index($0, want) { print; exit }
  ' "$OUT/dumpsys-window.txt" | grep -oE 'frame=\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]'
}
NAV_FRAME=$(source_frame navigationBars)
STATUS_FRAME=$(source_frame statusBars)
BAR_TOP_PX=$(sed -E 's/frame=\[[0-9]+,([0-9]+)\].*/\1/' <<<"$NAV_FRAME")
STATUS_BOTTOM_PX=$(sed -E 's/.*\]\[[0-9]+,([0-9]+)\]/\1/' <<<"$STATUS_FRAME")
SCREEN_H=$(sh_ wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f2)
[ -n "$BAR_TOP_PX" ] || { log "no navigationBars source for display 0 in dumpsys window; nothing measured"; exit 1; }
[ -n "$STATUS_BOTTOM_PX" ] || { log "no statusBars source for display 0 in dumpsys window; nothing measured"; exit 1; }
log "navigation bar: $NAV_FRAME, top at ${BAR_TOP_PX}px of ${SCREEN_H}px; status bar: $STATUS_FRAME"

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
# Where the page sits on the screen. Edge to edge it fills the screen and starts at its top;
# otherwise it sits between the bars and starts where the status bar ends. Told apart by
# its height, which is the screen's only in the first case.
EDGE=$(awk -v h="$INNER" -v d="$DPR" -v s="$SCREEN_H" 'BEGIN { x = h * d - s; print (x < 3 && x > -3) ? "yes" : "no" }')
PAGE_TOP_PX=0; [ "$EDGE" = no ] && PAGE_TOP_PX=$STATUS_BOTTOM_PX
# The free area, in the page's CSS pixels: below the status bar and above the navigation bar,
# clipped to the page. Named FREE_* rather than BAR_* because that is what is compared.
FREE_TOP=$(awk -v t="$STATUS_BOTTOM_PX" -v o="$PAGE_TOP_PX" -v d="$DPR" 'BEGIN { v = (t - o) / d; if (v < 0) v = 0; printf "%.1f", v }')
FREE_BOTTOM=$(awk -v t="$BAR_TOP_PX" -v o="$PAGE_TOP_PX" -v d="$DPR" -v h="$INNER" 'BEGIN { v = (t - o) / d; if (v > h) v = h; printf "%.1f", v }')
log "edge to edge: $EDGE; in CSS pixels: page ${INNER} tall, free from ${FREE_TOP} to ${FREE_BOTTOM}, env(safe-area-inset-bottom) = ${INSET}"

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
# The design's own distance from the edge of the free area, in CSS pixels, for each surface:
# what it has where there is no bar at all. bottom-6 for the floating button, the panel's
# pb 1.5rem, pb 1rem for the day sheet, the toast stack and the confirmation, and nothing
# for the header, whose padding is the inset alone.
declare -A EXPECTED=([S1]=24 [S2]=24 [S3]=16 [S4]=16 [S5]=16 [H0]=0)
# judge <id> <what> <edge in CSS px> <bottom|top>
judge() {
  local id=$1 what=$2 b=$3 side=${4:-bottom} gap
  if [ -z "$b" ] || [ "$b" = '"none"' ] || [ "$b" = null ]; then
    printf -v "R_$id" '%s' "NOT MEASURED"; printf -v "W_$id" '%s' "$what was not found"
    local r="R_$id" w="W_$id"; log "$id: ${!r} (${!w})"; return
  fi
  if [ "$side" = bottom ]; then
    gap=$(awk -v b="$b" -v t="$FREE_BOTTOM" 'BEGIN { printf "%.1f", t - b }')
  else
    gap=$(awk -v b="$b" -v t="$FREE_TOP" 'BEGIN { printf "%.1f", b - t }')
  fi
  local want=${EXPECTED[$id]}
  local where="$what at $b, the free area ends at $([ "$side" = bottom ] && echo "$FREE_BOTTOM" || echo "$FREE_TOP"); $gap px from it, the design keeps $want"
  if awk -v g="$gap" 'BEGIN { exit !(g < -0.5) }'; then
    printf -v "R_$id" '%s' "COVERED"
  elif awk -v g="$gap" -v w="$want" 'BEGIN { exit !(g > w + 2) }'; then
    printf -v "R_$id" '%s' "GAP"
  else
    printf -v "R_$id" '%s' "CLEAR"
  fi
  printf -v "W_$id" '%s' "$where"
  local r="R_$id" w="W_$id"
  log "$id: ${!r} (${!w})"
}

shot 00-month
judge H0 "the top of the header's content" "$(js "(() => { const h = document.querySelector('header'); const c = h && h.firstElementChild
  return c ? c.getBoundingClientRect().top : 'none' })()" 2>/dev/null)" top
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
  # Scrolled to the very end of the sheet, the way a thumb leaves it, and not with
  # scrollIntoView: that lines Done up with the bottom edge and leaves out the space the
  # sheet keeps under it, which is exactly what is being measured.
  b=$(js "(() => { const d = document.querySelector('[data-testid=\"quicklog-done-button\"]')
                    const sheet = document.querySelector('[data-testid=\"quicklog-modal\"]')
                    sheet.scrollTop = sheet.scrollHeight
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
  echo "bars: navigation $NAV_FRAME, status $STATUS_FRAME, screen ${SCREEN_H}px tall"
  echo "edge to edge: $EDGE; in CSS pixels the page is ${INNER} tall and the free area runs from ${FREE_TOP} to ${FREE_BOTTOM}"
  echo "env(safe-area-inset-bottom) in the WebView: ${INSET}px"
  echo "network guard: $($guard_ok && echo held || echo BROKEN)"
  echo
  for id in H0 S1 S2 S3 S4 S5; do r="R_$id" w="W_$id"; printf '%-3s %-13s %s\n' "$id" "${!r:-NOT MEASURED}" "${!w:-}"; done
} | tee "$OUT/summary.txt"

$guard_ok || exit 1
for id in H0 S1 S2 S3 S4 S5; do r="R_$id"; [ "${!r:-}" = CLEAR ] || exit 1; done
exit 0
