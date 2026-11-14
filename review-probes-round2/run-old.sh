#!/bin/bash
# Re-run the earlier review's probes against review2-safe (the fixed code), one at a time.
P=/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-work/probes
cd $P
: > out/_old.txt
port=9701
for f in p1-auth-lapse p1b-signout p2-restore-today p3-old-version p4-visit-two-phones p5-restore-partial p6-raced-visits-base p7-new-clinic-paths p8-rename-half p9-snapshot-partial; do
  PORT=$port timeout 600 node $f.e2e.js > out/$f.txt 2>&1; echo "$f rc=$? ok=$(grep -c '^✅' out/$f.txt) bad=$(grep -c '^❌' out/$f.txt)" >> out/_old.txt; port=$((port+1))
done
echo DONE >> out/_old.txt
