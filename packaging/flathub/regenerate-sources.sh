#!/usr/bin/env bash
#
# Regenerates the vendored source lists that let the Flatpak build run offline, which
# Flathub requires. Run it from the repository root after any change to Cargo.lock or
# package-lock.json, and commit the result alongside the lockfiles.
#
#   packaging/flathub/regenerate-sources.sh
#
# Needs 'uv' and nothing else: both generators declare their own dependencies, so this
# does not install anything into the system Python.

set -euo pipefail
cd "$(dirname "$0")/../.."

FBT="git+https://github.com/flatpak/flatpak-builder-tools"
OUT="packaging/flathub"

# Cargo needs no network: the checksums are already in Cargo.lock and the generator only
# turns them into URLs. It takes about a second for 491 crates.
echo "==> cargo-sources.json"
curl -sSLf -o /tmp/flatpak-cargo-generator.py \
  "https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py"
uv run --quiet /tmp/flatpak-cargo-generator.py src-tauri/Cargo.lock -o "$OUT/cargo-sources.json"

# npm does query the registry, so this one takes minutes.
echo "==> node-sources.json"
uvx --quiet --from "$FBT#subdirectory=node" \
  flatpak-node-generator npm package-lock.json -o "$OUT/node-sources.json"

# Playwright's browser downloads are dropped. They are 479 MB of Chrome, Firefox, WebKit
# and ffmpeg that Flathub's builders would fetch on every build, and the Flatpak build
# never runs the end to end tests that use them. The playwright npm package itself stays,
# because npm ci installs the dependency tree from the lockfile and would fail without it;
# what goes is only the browsers its postinstall would download, and the manifest sets
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 so nothing asks for them.
#
# Measured, so the next person does not have to wonder whether it is worth it:
#   chrome-linux64                167 MB
#   chrome-headless-shell         110 MB
#   firefox                        99 MB
#   webkit                         99 MB
#   ffmpeg                          2 MB
echo "==> dropping Playwright browser archives"
python3 - "$OUT/node-sources.json" <<'PY'
import json, sys
path = sys.argv[1]
sources = json.load(open(path, encoding="utf-8"))
kept = [s for s in sources if not str(s.get("url", "")).startswith("https://cdn.playwright.dev/")]
dropped = len(sources) - len(kept)
if dropped == 0:
    print("    nothing to drop: check whether playwright is still a dependency")
json.dump(kept, open(path, "w", encoding="utf-8"), indent=4)
open(path, "a", encoding="utf-8").write("\n")
print(f"    dropped {dropped} browser archives, {len(kept)} sources left")
PY

echo
echo "Done. Commit $OUT/cargo-sources.json and $OUT/node-sources.json with the lockfiles."
