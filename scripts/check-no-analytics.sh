#!/usr/bin/env bash
#
# Checks that whatever it is pointed at contains no analytics or telemetry code.
#
# It verifies two claims, and the privacy policy makes the same two in the same words:
#
#   1. The part of the app that draws the screen names no analytics, tracking or
#      error-reporting service, in its code, its dependencies or its built files.
#   2. The native part names no address other than the one the check-in sends to.
#
# Until 1.3 there was one claim and it was shorter: nothing in this repository phones
# home. The check-in made that false on purpose, and a guard that keeps asserting
# something false is worse than no guard, because it goes green anyway once somebody
# widens a pattern to get their branch through. So the promise narrowed to something that
# is still true and still mechanical: exactly one file may name a host, it is
# src-tauri/src/checkin.rs, and the address in it is the one written here. A second URL
# in that file, or a changed one, fails — which is the part that matters, since that file
# is where an address would be changed if anyone wanted to send somewhere else.
#
# It lives in one place on purpose: both the CI of every pull request and the job that
# builds the demo call it, and if the pattern list were duplicated across the two
# workflows they would drift, leaving one of them guaranteeing less than it claims.
#
# Usage: scripts/check-no-analytics.sh [--text-only] <path> [path...]

set -uo pipefail

# The one address the app may contain, character for character. It is also in the privacy
# policy and in src-tauri/src/checkin.rs, and the three have to agree: if this line and
# that file ever disagree, this script is what says so.
CHECKIN_URL='https://checkin.henfrydls.com/api/send'

# The file that address lives in. Everything else under the swept paths is held to the old
# rule, which is why this is a name and not a pattern: a second file could not be given
# the same exemption without editing this line.
CHECKIN_FILE='checkin.rs'

# Hosts data would be sent to. 'analytics' is scoped to a host context: without that, a
# comment saying "no analytics" anywhere in the code breaks the build, and in this
# repository that sentence is likely precisely because of what we are defending.
#
# The bare names carry \b for the same reason, and it is not theoretical: 'rollbar' with no
# boundaries matches inside 'scrollbar', so a 'scrollbar-width: thin' in any stylesheet
# turned every pull request red claiming the app has telemetry. The ones carrying a domain
# (plausible\.io, sentry\.io, amplitude\.com, segment\.(com|io)) are already anchored by the dot.
#
# Our own host is listed explicitly: 'analytics.henfrydls.com' does NOT match the generic
# pattern below, because there 'analytics' is a subdomain and the TLD comes after another
# label. Without this line, pasting the landing page's Umami tag into the app passed the
# check clean: the guard was blind to the one provider we actually use. deploy/build.sh in
# the website repository did list it, and that asymmetry between two lists written for the
# same purpose was the clue.
HOSTS='analytics\.henfrydls\.com'
HOSTS="$HOSTS"'|[a-z0-9-]*analytics\.(com|io|js|net)|\bumami\b|\bgoogle-analytics\b|\bgoogletagmanager\b'
HOSTS="$HOSTS"'|plausible\.io|\bmatomo\b|\bmixpanel\b|segment\.(com|io)|amplitude\.com|sentry\.io'
HOSTS="$HOSTS"'|\bposthog\b|\bhotjar\b|\bfullstory\b|\bdatadoghq\b|\bbugsnag\b|\brollbar\b|\bnewrelic\b'

# Our own check-in host, swept for like any other: checkin.rs is excluded from the sweep,
# so naming it anywhere else — another Rust file, a capability, the webview — fails. It is
# derived from CHECKIN_URL rather than written again, because two copies of an address in
# one file is how the two stop matching.
CHECKIN_HOST=$(printf '%s' "$CHECKIN_URL" | sed -E 's|https?://([^/]+).*|\1|; s|\.|\\.|g')
HOSTS="$HOSTS|$CHECKIN_HOST"

# Page APIs that exist only to measure. Word-bounded, so they do not match inside longer
# identifiers.
APIS='\bgtag\(|\bdataLayer\b|\b_paq\b|\bnavigator\.sendBeacon\b'

# npm package names: an SDK declared as a dependency does not mention its own host in
# package.json, and the names disappear from a minified bundle because imports get
# resolved. Without this, an SDK arriving as a transitive dependency would show up
# nowhere.
PACKAGES='@sentry/|posthog-js|mixpanel-browser|amplitude-js|@amplitude/|plausible-tracker'
PACKAGES="$PACKAGES"'|react-ga|@vercel/analytics|@datadog/|logrocket|@microsoft/clarity'
PACKAGES="$PACKAGES"'|web-vitals'

# Rust crates. Adding src-tauri/ to the targets is not enough on its own: npm package names
# do not match cargo ones, since a Rust SDK is declared as 'sentry' and not as '@sentry/',
# so without this list the door to the bundled binary, which is exactly what the promise
# protects, was left open. Word-bounded so they do not match inside longer identifiers.
CRATES='\bsentry\b|\bsentry-core\b|\bopentelemetry\b|\baptabase\b|\bposthog-rs\b'
CRATES="$CRATES"'|\btauri-plugin-aptabase\b|\bmixpanel\b|\bsegment-rs\b'

# Two modes, and the distinction matters:
#
#   (default)      hosts + APIs + package and crate names
#   --text-only    hosts + APIs only
#
# The second exists for package-lock.json and for dist/. The lock file holds the COMPLETE
# dependency tree, devDependencies included and with their optional peers:
# '@opentelemetry/api' appears there as a peer of vitest, is not installed and never reaches
# the bundle. Searching for package names in the lock gives that false positive on day one.
#
# What actually covers the risk of an SDK arriving as a transitive dependency is searching
# for its HOSTS in dist/: package names disappear on minification because imports get
# resolved, but URL strings do not get minified. If the SDK is used, its host is in the
# bundle; if it is not used, there is no risk to cover.
if [ "${1:-}" = "--text-only" ]; then
  PATTERNS="$HOSTS|$APIS"
  shift
else
  PATTERNS="$HOSTS|$APIS|$PACKAGES|$CRATES"
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 [--text-only] <path> [path...]" >&2
  exit 2
fi

found=0
for target in "$@"; do
  [ -e "$target" ] || continue
  # -I skips binaries: without it, a binary file under dist/ prints "Binary file matches"
  # with no line number, which diagnoses nothing.
  #
  # grep's exit code is checked explicitly rather than with `if grep ...`: 0 means found,
  # 1 means nothing found, and anything else means grep could not do its job. Folding that
  # third case into "nothing found" is how a guard reports clean on a file it never read.
  # The one file allowed to name a host is excluded here and checked below instead.
  grep -rInE --exclude="$CHECKIN_FILE" "$PATTERNS" "$target"
  status=$?
  case $status in
    0) found=1 ;;
    1) ;;  # nothing found: the only acceptable outcome
    *) echo "::error::grep could not read $target (exit $status); cannot claim it is clean" >&2
       exit 2 ;;
  esac
done

if [ "$found" -eq 1 ]; then
  echo "::error::Analytics or telemetry code was found in the application."
  echo "::error::Daylo promises that nothing about a person leaves their device, and that"
  echo "::error::only holds if this repository contains none of this."
  echo "::error::The one exception is the anonymous check-in, and it lives in exactly one"
  echo "::error::file: src-tauri/src/$CHECKIN_FILE. Nothing else may name a host."
  echo "::error::The landing page's analytics script is injected when the website is"
  echo "::error::deployed, over the already built artifact, not here."
  exit 1
fi

# The second claim. Exactly one address in that file, and it is the one written above.
# Checked wherever the file turns up under the given paths rather than at a fixed path, so
# that pointing this script at a copy of the tree checks that copy, which is how it is
# tested.
checked=0
for target in "$@"; do
  [ -e "$target" ] || continue
  while IFS= read -r file; do
    checked=$((checked + 1))
    urls=$(grep -oE 'https?://[^"[:space:]]+' "$file" || true)
    count=$(printf '%s' "$urls" | grep -c . || true)

    if [ "$count" -ne 1 ] || [ "$urls" != "$CHECKIN_URL" ]; then
      echo "::error::$file must contain exactly one address, and it must be $CHECKIN_URL"
      echo "::error::What it contains instead:"
      printf '%s\n' "${urls:-(no address at all)}" | sed 's/^/::error::  /'
      echo "::error::This file is the whole of what Daylo ever sends anywhere, and the"
      echo "::error::privacy policy names that address. Changing it here changes where"
      echo "::error::people's check-ins go, so it cannot be changed here alone."
      exit 1
    fi
  done < <(find "$target" -type f -name "$CHECKIN_FILE")
done

if [ "$checked" -gt 0 ]; then
  echo "The check-in sends to $CHECKIN_URL and nowhere else."
fi

echo "No analytics or telemetry in: $*"
