#!/bin/bash
# Run ONE harness of a checkout alone on its shifted ports: run-one-shifted.sh <checkout> <offset> <name> [WWW-override]
REPO="$1"; OFF="$2"; NAME="$3"; WWWO="$4"
cd "$REPO/tests/e2e" || exit 2
f="$NAME.e2e.js"; tmp="_sh1-$NAME.e2e.js"; cp "$f" "$tmp"
ports=$(grep -o 'PORT *= *[0-9]\{4\}\|localhost:[0-9]\{4\}\|listen([0-9]\{4\}' "$f" | grep -o '[0-9]\{4\}' | sort -u)
for p in $ports; do sed -i "s/\b$p\b/$((p+OFF))/g" "$tmp"; done
if [ -n "$WWWO" ]; then WWW="$WWWO" timeout 900 node "$tmp"; else timeout 900 node "$tmp"; fi
rc=$?; rm -f "$tmp"; echo "rc=$rc"; exit $rc
