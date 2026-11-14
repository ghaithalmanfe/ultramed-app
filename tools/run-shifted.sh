#!/bin/bash
# Run every browser harness of a checkout on shifted ports (others run the same harnesses at the same time).
# usage: run-shifted.sh <checkout> <offset> <outdir> [WWW-override] [parallel]
REPO="$1"; OFF="$2"; OUT="$3"; WWWO="$4"; PAR="${5:-5}"
mkdir -p "$OUT"; rm -f "$OUT"/*.out
cd "$REPO/tests/e2e" || exit 2
files=$(ls *.e2e.js | grep -v '^_')
run_one(){
  f="$1"; base="${f%.e2e.js}"
  ports=$(grep -o 'PORT *= *[0-9]\{4\}\|localhost:[0-9]\{4\}\|listen([0-9]\{4\}' "$f" | grep -o '[0-9]\{4\}' | sort -u)
  tmp="_sh-$base.e2e.js"; cp "$f" "$tmp"
  for p in $ports; do sed -i "s/\b$p\b/$((p+OFF))/g" "$tmp"; done
  t0=$(date +%s)
  if [ -n "$WWWO" ]; then WWW="$WWWO" timeout 900 node "$tmp" > "$OUT/$base.out" 2>&1; else timeout 900 node "$tmp" > "$OUT/$base.out" 2>&1; fi
  rc=$?; rm -f "$tmp"
  ok=$(grep -c '^✅' "$OUT/$base.out"); bad=$(grep -c '^❌' "$OUT/$base.out")
  pass=$(grep -q 'ALL CHECKS PASSED' "$OUT/$base.out" && [ $rc -eq 0 ] && echo PASS || echo FAIL)
  echo "$pass $base ($ok ok, $bad failed, rc=$rc, $(( $(date +%s)-t0 ))s)" >> "$OUT/_summary.txt"
}
export -f run_one; export OFF OUT WWWO
: > "$OUT/_summary.txt"
echo "$files" | xargs -P "$PAR" -I{} bash -c 'run_one {}'
sort "$OUT/_summary.txt"
