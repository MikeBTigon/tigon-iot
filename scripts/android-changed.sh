#!/usr/bin/env bash
# Prints "true" when the Android app must be rebuilt between two commits, otherwise "false".
# Usage: scripts/android-changed.sh <base-sha> <head-sha>
#
# Rebuild when any of these changed:
#   - frontend/android/**                (native code, gradle, manifest, icons)
#   - frontend/capacitor.config.ts       (native app settings)
#   - scripts/build-android.sh           (how the APK is built / versioned)
#   - the version of any native plugin in frontend/package-lock.json (@capacitor*, @capawesome*, …)
# An unknown base (first push of a branch, force-push) counts as "changed".
set -euo pipefail
BASE="${1:-}"
HEAD="${2:-HEAD}"

if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo true; exit 0
fi

if git diff --name-only "$BASE" "$HEAD" | grep -qE '^(frontend/android/|frontend/capacitor\.config\.ts$|scripts/build-android\.sh$)'; then
  echo true; exit 0
fi

# Native plugin versions (from the lock file) at both commits.
plugins() {
  git show "$1:frontend/package-lock.json" 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let pk = {}; try { pk = JSON.parse(s).packages || {}; } catch { /* missing */ }
      const out = Object.keys(pk).filter((k) => /^node_modules\/@(capacitor|capawesome|capacitor-firebase|capacitor-community)\//.test(k))
        .sort().map((k) => k + "@" + pk[k].version);
      console.log(out.join("\n"));
    });'
}
if [ "$(plugins "$BASE")" != "$(plugins "$HEAD")" ]; then
  echo true; exit 0
fi
echo false
