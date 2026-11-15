# Shared by the emulator measurements: android-measure-reminder.sh (measurement A of
# #202), android-measure-sheet-gestures.sh and android-measure-play-build.sh (#245).
# Sourced, not run.
#
# The caller sets OUT (the folder everything measured goes to) before sourcing this, and
# reads NETWORK_GUARD at the end: "held" unless network_off or checkin_logcat_guard saw
# the network up or the check-in host named outside a failed attempt.

PKG=com.daylo.app
ACTIVITY="$PKG/.MainActivity"
# The only host the app sends anything to, src-tauri/src/checkin.rs, const URL.
CHECKIN_HOST=checkin.henfrydls.com

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

# Booted, and what it is written to device.txt.
device_ready() {
  local booted
  booted=$(sh_ getprop sys.boot_completed)
  [ "$booted" = 1 ] || wait_for_boot || { log "the emulator never booted"; return 1; }
  {
    echo "release=$(sh_ getprop ro.build.version.release) sdk=$(sh_ getprop ro.build.version.sdk)"
    echo "abilist=$(sh_ getprop ro.product.cpu.abilist)"
    echo "device clock=$(sh_ date)"
  } | tee "$OUT/device.txt"
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

# The check-in host in logcat, from every *logcat*.txt in $OUT. A fresh install sends its
# first check-in on the first start, before anything can be seeded, so the app does try
# once per install; what matters is that the try failed. The app logs every failure as
# "check-in did not go through", and with the radio off the reason is a DNS failure: that
# line is the record that nothing left. Any other line naming the host means the guard
# did not hold.
#
# grep over the files, not `cat | grep -q`: under pipefail, grep -q exits on the first match,
# cat dies of SIGPIPE, and the pipeline reports failure exactly when the host is found. The
# first run of measurement A said "held" over a logcat that named the host.
checkin_logcat_guard() {
  local blocked other
  grep -h "$CHECKIN_HOST" "$OUT"/*logcat*.txt >"$OUT/checkin-lines.txt" 2>/dev/null || true
  blocked=$(grep -c "did not go through" "$OUT/checkin-lines.txt" || true)
  other=$(grep -vc "did not go through" "$OUT/checkin-lines.txt" || true)
  echo "logcat lines naming $CHECKIN_HOST: ${blocked:-0} failed attempts, ${other:-0} other" >>"$OUT/network.txt"
  if [ "${other:-0}" -gt 0 ]; then
    log "logcat names $CHECKIN_HOST outside a failed attempt"
    NETWORK_GUARD=broken
  fi
}
