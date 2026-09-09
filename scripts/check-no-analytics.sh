#!/usr/bin/env bash
#
# Checks that whatever it is pointed at contains no analytics or telemetry code.
#
# Daylo promises that the user's data never leaves their device, and that promise rests
# entirely on this repository containing nothing that phones home. This script is what
# turns the promise into something verified on every change, instead of depending on
# somebody remembering to look for it during review.
#
# It lives in one place on purpose: both the CI of every pull request and the job that
# builds the demo call it, and if the pattern list were duplicated across the two
# workflows they would drift, leaving one of them guaranteeing less than it claims.
#
# Usage: scripts/check-no-analytics.sh [--text-only] <path> [path...]

set -uo pipefail

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
  grep -rInE "$PATTERNS" "$target"
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
  echo "::error::Daylo promises that the user's data never leaves their device, and that"
  echo "::error::only holds if this repository contains none of this."
  echo "::error::The landing page's analytics script is injected when the website is"
  echo "::error::deployed, over the already built artifact, not here."
  exit 1
fi

echo "No analytics or telemetry in: $*"
