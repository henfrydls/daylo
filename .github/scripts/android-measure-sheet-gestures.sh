#!/usr/bin/env bash
# The Activities sheet's gestures (#232) in Android's own WebView, on the CI emulator.
#
# Usage: android-measure-sheet-gestures.sh <apk> <out-dir>
#
#   apk  DEBUG build of the branch being measured: the DevTools protocol is how the state
#        is seeded and how every reading below is taken, and only a debuggable WebView
#        offers it.
#
# Why: everything #232 measured was Chromium with touches sent over CDP. Two things are
# not known in Android's WebView: whether the page is handed the moves that fall inside
# Android's touch slop (Chromium on a desktop hands over nothing in the first ~15 px), and
# whether the list stretches under a sheet being pulled down. Henfry's phone cannot be
# used: a test build means uninstalling Daylo, and that deletes his data. The emulator is
# a real Android WebView.
#
# The touches come from Android, not from the page: `input motionevent DOWN/MOVE/UP` and
# `input tap`, one pointer, in screen pixels. Where a CSS pixel lands on the screen is
# measured, not assumed: two taps at known screen points before anything opens, read back
# by the page as clientX/clientY.
#
# Each gesture, with the observable named before measuring (the numbers are #232's list):
#   probe  How far a finger has to go down before the page sees its first touchmove.
#          Informative. If it is 8 px or more, the "leaning down" case of #232 never
#          happens on Android, because axisOf has decided by then.
#   G1  A tremble down and then up, without lifting, from the top of the list: the list
#       scrolls, and the sheet never moves (its furthest offset stays 0).
#   G2  A clear pull of 5 cm from the top of the list: the sheet closes. Whether the list
#       stretches underneath cannot be read through DevTools; a screenshot half way down
#       is kept, with how many touchmoves the sheet held back from the browser.
#   G3  Sideways over a row: the sheet stays where it is and the list does not scroll; and
#       an ordinary swipe up straight after still scrolls the list.
#   G4  Pulled past a third, and without lifting, the notification shade comes down: if
#       Android cancels the touch (touchcancel reaches the page), the sheet goes back to
#       rest. If no cancel arrives, this gesture is not measured, and says so.
#   G4b The same pull ended by `input motionevent CANCEL`: Android's own cancel, delivered
#       for certain. Informative.
#   G5  A second finger: `input` drives one pointer only. Not measured.
#   G6  A tap just above the sheet's top edge, in the strip the handle owns: the sheet
#       closes.
#   G7  A thumb on the handle and a finger on the list: two pointers. Not measured.
#
# The network rule is measurement A's: off before anything is installed, seen to be off
# (airplane mode and failing pings), the packet capture read by the workflow, and logcat
# read here for the check-in host. Either record naming it fails the job.
#
# Exits 0 only when G1, G2, G3 and G6 were all measured, no measured gesture failed, and
# the network guard held.

set -uo pipefail

APK=${1:?the APK is missing}
OUT=${2:?the output directory is missing}
PORT=9334
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
# PKG, ACTIVITY, CHECKIN_HOST, log, sh_, devtools_socket, device_ready, network_off and
# checkin_logcat_guard.
. "$HERE/android-measure-common.sh"

[ -f "$APK" ] || { echo "::error::no such APK: $APK"; exit 2; }

# Evaluates an expression in the WebView and prints its value as JSON.
js() { node "$HERE/cdp-eval.mjs" "$PORT" "$1"; }
# One field of a JSON value, with jq.
field() { jq -r "$2" <<<"$1"; }
shot() { adb exec-out screencap -p >"$OUT/$1.png" 2>/dev/null || true; }

# Screen pixels for a CSS pixel, from the calibration below.
SX=1 SY=1 OX=0 OY=0
sx() { awk -v c="$1" -v s="$SX" -v o="$OX" 'BEGIN { printf "%d", o + c * s + 0.5 }'; }
sy() { awk -v c="$1" -v s="$SY" -v o="$OY" 'BEGIN { printf "%d", o + c * s + 0.5 }'; }
# Arithmetic on CSS pixels, which are not whole numbers.
calc() { awk "BEGIN { printf \"%.1f\", $1 }"; }

# The touches of a gesture are queued and sent in one adb shell, by flush. One adb call
# per move put a round trip between each, and a finger that stays inside the touch slop
# for 400 ms is a long press to Chromium: on an activity's name that selects the text,
# which no person trembling or pulling would have done. flush wherever the finger has to
# stay down while something is read.
PENDING=
down() { PENDING+="input motionevent DOWN $1 $2;"; }
move() { PENDING+="input motionevent MOVE $1 $2;"; }
up() { PENDING+="input motionevent UP $1 $2;"; }
flush() {
  [ -n "$PENDING" ] && sh_ "$PENDING" >/dev/null
  PENDING=
}

# The finger moved from where it is to (x1, y1), screen pixels, in n equal steps.
FX=0 FY=0
glide() {
  local x1=$1 y1=$2 n=$3 i x0=$FX y0=$FY
  for i in $(seq 1 "$n"); do
    move $(( x0 + (x1 - x0) * i / n )) $(( y0 + (y1 - y0) * i / n ))
  done
  FX=$x1 FY=$y1
}
press() { FX=$1 FY=$2; down "$1" "$2"; }
lift() { up "$FX" "$FY"; flush; }

# The sheet open with every activity shown and the list at the top, and recording reset.
# Prints the state, or nothing when it could not be opened.
open_sheet() {
  local s
  s=$(js "window.__gesture.ensureOpen()") || return 1
  [ "$(field "$s" .open)" = true ] && [ "$(field "$s" .activities)" = "$ACTIVITIES" ] || return 1
  echo "$s"
}

# What a gesture left: its state, its summary and its raw events, all to the artifact.
readout() {
  local tag=$1
  js "window.__gesture.state()" >"$OUT/$tag-after.json" 2>&1
  js "window.__gesture.summary()" >"$OUT/$tag-summary.json" 2>&1
  js "window.__gesture.log" >"$OUT/$tag-events.json" 2>&1
  shot "$tag-after"
}
after() { jq -r "$2" "$OUT/$1-after.json" 2>/dev/null; }
summ() { jq -r "$2" "$OUT/$1-summary.json" 2>/dev/null; }

result() { printf -v "R_$1" '%s' "$2"; printf -v "W_$1" '%s' "$3"; log "$1: $2 ($3)"; }

# --- Ready the device, install, seed ------------------------------------------------

device_ready || exit 1
network_off "before anything is installed" || exit 1
# Awake and unlocked for the whole run: a screen that sleeps in the middle takes the
# touches with it.
sh_ svc power stayon true >/dev/null 2>&1 || true
sh_ input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
sh_ wm dismiss-keyguard >/dev/null 2>&1 || true
{
  echo "screen: $(sh_ wm size)"
  echo "density: $(sh_ wm density)"
} | tee -a "$OUT/device.txt"
DENSITY=$(sh_ wm density | grep -o '[0-9]*' | tail -1)
SCREEN_H=$(sh_ wm size | grep -o '[0-9]*x[0-9]*' | tail -1 | cut -dx -f2)

adb logcat -c
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install "$APK" >"$OUT/install.txt" 2>&1 || { log "install failed"; exit 1; }
# Granted before the first start so no permission dialog can sit over the WebView.
sh_ pm grant "$PKG" android.permission.POST_NOTIFICATIONS
sh_ am start -W -n "$ACTIVITY" >/dev/null
sock=$(devtools_socket) || { log "no DevTools socket after 60 s (is this a debug APK?)"; exit 1; }
adb forward "tcp:$PORT" "localabstract:$sock" >/dev/null

# Eight activities, as many as #232's list asks for: more than the five shown before
# "Show all", and enough that the list scrolls on a phone. The check-in off and every
# notice seen, so nothing opens on top. Written, then every later write by the app turned
# into nothing, then the page reloaded: the app still holds its own state in memory and
# would write all of it as the page goes away.
ACTIVITIES=8
now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
js "(() => {
  const names = ['Read 20 minutes', 'Walk', 'Meditate', 'Drink water', 'Study English',
                 'No sugar', 'Sleep before 11', 'Stretch']
  localStorage.setItem('simple-calendar-storage', JSON.stringify({ version: 0, state: {
    activities: names.map((name, i) => ({ id: 'g' + i, name, color: '#10B981',
                                          createdAt: '$now', updatedAt: '$now' })),
    logs: [], yearMode: 'byActivity',
    reminderEnabled: false, reminderHour: 20, reminderMinute: 0,
    reminderTimeChosen: false, reminderOffered: true,
    firstOpenedAt: '$now', feedbackInviteSeen: true, storeReviewOffered: true,
    checkinEnabled: false, checkinId: null,
    checkinLastAttempt: null, updateNoticeSeenFor: null, updatesEnabled: false } }))
  Storage.prototype.setItem = () => {}
  setTimeout(() => location.reload(), 200)
  return names.length
})()" >"$OUT/seed.txt" 2>&1 || { log "could not seed the state"; exit 1; }
sleep 8

js "JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}').state?.activities?.length ?? 0" \
  >"$OUT/seed-reloaded.txt" 2>&1
if [ "$(cat "$OUT/seed-reloaded.txt")" != "$ACTIVITIES" ]; then
  log "the seeded activities did not survive the reload ($(cat "$OUT/seed-reloaded.txt")); nothing measured"
  exit 1
fi
shot 00-seeded

# --- Where a CSS pixel lands on the screen ------------------------------------------
#
# Two taps, with every touch, pointer, mouse and click event stopped at the window before
# the app can see it, so tapping the calendar opens nothing. The page reads where each
# tap landed; two points give the scale and the offset on both axes.
W=$(sh_ wm size | grep -o '[0-9]*x[0-9]*' | tail -1 | cut -dx -f1)
TX1=$(( W * 3 / 10 )) TY1=$(( SCREEN_H * 45 / 100 ))
TX2=$(( W * 7 / 10 )) TY2=$(( SCREEN_H * 65 / 100 ))
js "(() => {
  const seen = []
  const stop = (e) => {
    if (e.type === 'touchstart') seen.push([e.changedTouches[0].clientX, e.changedTouches[0].clientY])
    if (e.cancelable) e.preventDefault()
    e.stopImmediatePropagation()
  }
  const types = ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup',
                 'mousedown', 'mouseup', 'click']
  for (const t of types) window.addEventListener(t, stop, { capture: true, passive: false })
  window.__calibration = () => {
    for (const t of types) window.removeEventListener(t, stop, { capture: true })
    return seen
  }
  return true
})()" >/dev/null 2>&1 || { log "could not install the calibration listener"; exit 1; }
sh_ input tap "$TX1" "$TY1"
sleep 1
sh_ input tap "$TX2" "$TY2"
sleep 1
CAL=$(js "window.__calibration()" 2>&1)
echo "taps at ($TX1,$TY1) and ($TX2,$TY2) screen; page saw $CAL" | tee "$OUT/calibration.txt"
if [ "$(jq 'length' <<<"$CAL" 2>/dev/null)" != 2 ]; then
  log "calibration: the page did not see both taps; nothing measured"
  exit 1
fi
read -r SX SY OX OY < <(jq -r --argjson t "[$TX1,$TY1,$TX2,$TY2]" '
  ((($t[2] - $t[0]) / (.[1][0] - .[0][0]))) as $sx |
  ((($t[3] - $t[1]) / (.[1][1] - .[0][1]))) as $sy |
  "\($sx) \($sy) \($t[0] - .[0][0] * $sx) \($t[1] - .[0][1] * $sy)"' <<<"$CAL")
echo "screen = $OX + css * $SX across, $OY + css * $SY down" | tee -a "$OUT/calibration.txt"

# Listening from here on. The reload took every listener of the page with it, so this is
# installed after it.
js "$(cat "$HERE/sheet-gestures-page.js")" >"$OUT/instrument.txt" 2>&1 \
  || { log "could not install the listeners"; exit 1; }
DPR=$(js "window.devicePixelRatio")
# The two taps have to agree with the page about its own scale, or every coordinate below
# lands somewhere else.
if ! awk -v a="$SX" -v b="$SY" -v d="$DPR" 'BEGIN { exit !(a/d > 0.95 && a/d < 1.05 && b/d > 0.95 && b/d < 1.05) }'; then
  log "calibration: scale $SX x $SY against devicePixelRatio $DPR; nothing measured"
  exit 1
fi

S=$(open_sheet) || { log "the Activities sheet would not open with $ACTIVITIES activities; nothing measured"; shot 00-not-open; exit 1; }
echo "$S" >"$OUT/00-open.json"
shot 00-open
VW=$(field "$S" .viewportWidth)
SCROLLS=$(field "$S" 'if .scrollHeight > .clientHeight + 20 then "yes" else "no" end')
log "sheet open: $(field "$S" '"top \(.sheetTop), height \(.sheetHeight), list \(.clientHeight) of \(.scrollHeight)"')"

# --- probe: where the first touchmove arrives, going down ---------------------------

S=$(open_sheet) || S=
if [ -n "$S" ]; then
  x=$(sx "$(calc "$VW / 2")")
  y=$(sy "$(calc "$(field "$S" .listTop) + 40")")
  press "$x" "$y"
  # One CSS pixel at a time, rounded to the screen's: 24 steps.
  for i in $(seq 1 24); do move "$x" "$(sy "$(calc "$(field "$S" .listTop) + 40 + $i")")"; done
  FY=$(sy "$(calc "$(field "$S" .listTop) + 64")")
  # Back where it started before lifting, so the drag it became ends at rest.
  glide "$x" "$y" 4
  lift
  sleep 1.2
  readout probe
  PROBE="first touchmove $(summ probe .firstMoveDy) px down (css), $(summ probe .touchmove) moves, $(summ probe .prevented) held back"
else
  PROBE="not measured: the sheet would not open"
fi
log "probe: $PROBE"

# --- G1: tremble, then up ------------------------------------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  result G1 "not measured" "the sheet would not open"
elif [ "$SCROLLS" != yes ]; then
  result G1 "not measured" "with $ACTIVITIES activities the list has nothing to scroll on this screen"
else
  x=$(sx "$(calc "$VW / 2")")
  y0=$(field "$S" "(.listTop + .listHeight * 0.6)")
  travel=$(field "$S" "([200, .listHeight * 0.6 - 20] | min)")
  press "$x" "$(sy "$y0")"
  for d in 1 2 3 4; do move "$x" "$(sy "$(calc "$y0 + $d")")"; done
  FY=$(sy "$(calc "$y0 + 4")")
  glide "$x" "$(sy "$(calc "$y0 - $travel")")" 14
  lift
  sleep 1.5
  readout G1
  if [ "$(after G1 .open)" = true ] && [ "$(after G1 .translateY)" = 0 ] \
     && [ "$(after G1 '.maxTranslateY < 1')" = true ] && [ "$(after G1 '.scrollTop > 0')" = true ]; then
    result G1 PASS "list scrolled to $(after G1 .scrollTop), sheet never moved; first touchmove at $(summ G1 .firstMoveDy) px"
  else
    result G1 FAIL "open=$(after G1 .open) translateY=$(after G1 .translateY) furthest=$(after G1 .maxTranslateY) scrollTop=$(after G1 .scrollTop); first touchmove at $(summ G1 .firstMoveDy) px"
  fi
fi

# --- G3: sideways over a row, then an ordinary scroll --------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  result G3 "not measured" "the sheet would not open"
else
  rowY=$(field "$S" "(.rows[1].top + .rows[1].height / 2)")
  x0=$(calc "$VW * 0.2")
  press "$(sx "$x0")" "$(sy "$rowY")"
  glide "$(sx "$(calc "$x0 + 150")")" "$(sy "$rowY")" 12
  lift
  sleep 1.2
  readout G3-across
  across_ok=no
  if [ "$(after G3-across .open)" = true ] && [ "$(after G3-across .translateY)" = 0 ] \
     && [ "$(after G3-across '.maxTranslateY < 1')" = true ] && [ "$(after G3-across .scrollTop)" = 0 ]; then
    across_ok=yes
  fi
  # The next gesture is an ordinary swipe up on the list, which has to scroll it.
  js "window.__gesture.reset()" >/dev/null 2>&1
  x=$(sx "$(calc "$VW / 2")")
  sh_ input swipe "$x" "$(sy "$(field "$S" "(.listTop + .listHeight * 0.75)")")" \
    "$x" "$(sy "$(field "$S" "(.listTop + .listHeight * 0.25)")")" 400
  sleep 1.5
  readout G3-then-scroll
  if [ "$across_ok" = yes ] && [ "$(after G3-then-scroll '.scrollTop > 0')" = true ]; then
    result G3 PASS "nothing moved going across; the swipe after it scrolled to $(after G3-then-scroll .scrollTop)"
  elif [ "$across_ok" = yes ] && [ "$SCROLLS" != yes ]; then
    result G3 PASS "nothing moved going across; the list has nothing to scroll, so the swipe after it was not checked"
  else
    result G3 FAIL "across: open=$(after G3-across .open) translateY=$(after G3-across .translateY) furthest=$(after G3-across .maxTranslateY) scrollTop=$(after G3-across .scrollTop); swipe after: scrollTop=$(after G3-then-scroll .scrollTop)"
  fi
fi

# --- G2: a clear pull of 5 cm from the top ------------------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  result G2 "not measured" "the sheet would not open"
else
  x=$(sx "$(calc "$VW / 2")")
  y=$(sy "$(field "$S" "(.listTop + 30)")")
  # 5 cm in screen pixels, from the density the screen reports. Kept on the screen.
  pull=$(awk -v d="$DENSITY" 'BEGIN { printf "%d", 5 / 2.54 * d }')
  end=$(( y + pull ))
  [ "$end" -lt $(( SCREEN_H - 4 )) ] || end=$(( SCREEN_H - 4 ))
  press "$x" "$y"
  glide "$x" $(( y + (end - y) / 2 )) 6
  flush
  sleep 0.5
  shot G2-halfway
  js "window.__gesture.state()" >"$OUT/G2-halfway.json" 2>&1
  glide "$x" "$end" 6
  lift
  sleep 1.2
  readout G2
  overscroll="half way down: translateY $(jq -r .translateY "$OUT/G2-halfway.json" 2>/dev/null), list scrollTop $(jq -r .scrollTop "$OUT/G2-halfway.json" 2>/dev/null); $(summ G2 .prevented) of $(summ G2 .touchmove) touchmoves held back ($(summ G2 .cancelable) cancelable); stretch not readable by DevTools, see G2-halfway.png"
  if [ "$(after G2 .open)" = false ]; then
    result G2 PASS "closed after $pull px (5 cm); $overscroll"
  else
    result G2 FAIL "still open, translateY=$(after G2 .translateY); $overscroll"
  fi
fi

# --- G6: a tap just above the top edge ----------------------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  result G6 "not measured" "the sheet would not open"
else
  tx=$(calc "$VW * 0.25")
  ty=$(field "$S" "(.sheetTop - 8)")
  hit=$(js "(() => { const el = document.elementFromPoint($tx, $ty); const t = el && el.closest('[data-testid]'); return t ? t.dataset.testid : (el && el.tagName) })()" 2>&1 | jq -r . 2>/dev/null)
  sh_ input tap "$(sx "$tx")" "$(sy "$ty")"
  sleep 1.2
  readout G6
  if [ "$(after G6 .open)" = false ]; then
    result G6 PASS "closed; the point tapped belongs to $hit, pressed on $(summ G6 .pressedOn)"
  else
    result G6 FAIL "still open; the point tapped belongs to $hit, pressed on $(summ G6 .pressedOn)"
  fi
fi

# The pull both cancellations start from: from the top of the list, down 40% of the sheet,
# past the 30% that would close it on release. Leaves the finger down.
pull_past_a_third() {
  local s=$1 x y
  x=$(sx "$(calc "$VW / 2")")
  y=$(sy "$(field "$s" "(.listTop + 30)")")
  press "$x" "$y"
  glide "$x" "$(sy "$(field "$s" "(.listTop + 30 + .sheetHeight * 0.4)")")" 8
  flush
  sleep 0.5
}

# --- G4b: Android's own cancel ------------------------------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  R4B="not measured: the sheet would not open"
else
  pull_past_a_third "$S"
  js "window.__gesture.state()" >"$OUT/G4b-pulled.json" 2>&1
  if sh_ input motionevent CANCEL "$FX" "$FY" 2>&1 | grep -qi "error\|unknown\|usage"; then
    lift
    R4B="not measured: this input has no CANCEL"
  else
    sleep 1.2
    readout G4b
    R4B="pulled to $(jq -r .translateY "$OUT/G4b-pulled.json" 2>/dev/null); touchcancel $(summ G4b .touchcancel), then open=$(after G4b .open) translateY=$(after G4b .translateY)"
    if jq -e '.translateY > 0' "$OUT/G4b-pulled.json" >/dev/null 2>&1 \
       && [ "$(summ G4b .touchcancel)" -ge 1 ] 2>/dev/null && [ "$(after G4b .open)" = true ] \
       && [ "$(after G4b .translateY)" = 0 ]; then
      R4B="PASS, $R4B"
    else
      R4B="FAIL, $R4B"
    fi
  fi
fi
log "G4b: $R4B"

# --- G4: the notification shade in the middle of a pull ------------------------------

S=$(open_sheet) || S=
if [ -z "$S" ]; then
  result G4 "not measured" "the sheet would not open"
else
  pull_past_a_third "$S"
  js "window.__gesture.state()" >"$OUT/G4-pulled.json" 2>&1
  sh_ cmd statusbar expand-notifications
  sleep 2
  shot G4-shade
  readout G4-shade
  lift
  sleep 1
  sh_ cmd statusbar collapse
  sleep 1.5
  readout G4-final
  pulled=$(jq -r .translateY "$OUT/G4-pulled.json" 2>/dev/null)
  if ! jq -e '.translateY > 0' "$OUT/G4-pulled.json" >/dev/null 2>&1; then
    # A cancel of a pull that never moved the sheet would say nothing about putting it back.
    result G4 FAIL "the pull past a third did not move the sheet (translateY $pulled)"
  elif [ "$(summ G4-shade .touchcancel)" -ge 1 ] 2>/dev/null; then
    if [ "$(after G4-shade .open)" = true ] && [ "$(after G4-shade .translateY)" = 0 ] \
       && [ "$(after G4-final .open)" = true ]; then
      result G4 PASS "touchcancel arrived; pulled to $pulled, back to 0 and still open after lifting"
    else
      result G4 FAIL "touchcancel arrived; pulled to $pulled, then open=$(after G4-shade .open) translateY=$(after G4-shade .translateY), after lifting open=$(after G4-final .open)"
    fi
  else
    result G4 "not measured" "no touchcancel when the shade came down (pointercancel $(summ G4-shade .pointercancel)); pulled to $pulled, after lifting open=$(after G4-final .open)"
  fi
fi

result G5 "not measured" "input drives one pointer; left to the phone with 1.5.3 published"
result G7 "not measured" "two pointers, as G5"

adb forward --remove "tcp:$PORT" >/dev/null 2>&1 || true
adb logcat -d >"$OUT/logcat.txt" 2>&1
checkin_logcat_guard

# --- Summary --------------------------------------------------------------------------

# A long press is the one thing the touches here could do that a person would not have
# meant: it selects the text under the finger. Any gesture that had one is named.
LONG_PRESSES=$(for f in "$OUT"/*-summary.json; do
  [ "$(jq -r '.contextmenu // 0' "$f" 2>/dev/null)" -gt 0 ] 2>/dev/null && basename "$f" -summary.json
done | paste -sd' ')

v() { local n="R_$1"; echo "${!n:-not measured}"; }
why() { local n="W_$1"; echo "${!n:-}"; }
VERDICT=pass
for gesture in G1 G2 G3 G4 G5 G6 G7; do
  [ "$(v $gesture)" = FAIL ] && VERDICT=fail
done
for gesture in G1 G2 G3 G6; do
  [ "$(v $gesture)" = "not measured" ] && [ "$VERDICT" = pass ] && VERDICT=incomplete
done
[ "$NETWORK_GUARD" = held ] || VERDICT=network
{
  echo "The Activities sheet's gestures (#232) in Android's WebView, $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "device: $(head -1 "$OUT/device.txt"); $(grep screen "$OUT/device.txt"); $(grep density "$OUT/device.txt")"
  echo "$ACTIVITIES activities, Show all; list scrolls: $SCROLLS"
  echo "network guard: $NETWORK_GUARD (see network.txt; the packet capture is checked by the workflow)"
  echo
  echo "long presses (contextmenu) during: ${LONG_PRESSES:-none}"
  echo
  echo "probe (informative): $PROBE"
  echo "G1 tremble, then up:              $(v G1)  $(why G1)"
  echo "G2 a 5 cm pull from the top:      $(v G2)  $(why G2)"
  echo "G3 sideways over a row:           $(v G3)  $(why G3)"
  echo "G4 shade in the middle of a pull: $(v G4)  $(why G4)"
  echo "G4b input CANCEL (informative):   $R4B"
  echo "G5 a second finger:               $(v G5)  $(why G5)"
  echo "G6 a tap just above the edge:     $(v G6)  $(why G6)"
  echo "G7 thumb on the bar, finger on the list: $(v G7)  $(why G7)"
  echo
  case "$VERDICT" in
    pass) echo "VERDICT: every gesture measured passed." ;;
    fail) echo "VERDICT: a measured gesture failed. Read its *-events.json and screenshots before concluding anything." ;;
    incomplete) echo "VERDICT: incomplete. G1, G2, G3 and G6 have to be measured for a verdict." ;;
    network) echo "VERDICT: the network guard did not hold. Nothing here counts until that is understood." ;;
  esac
} | tee "$OUT/summary.txt"

[ "$VERDICT" = pass ]
