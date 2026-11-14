#!/bin/bash
# Re-run every review probe; outputs kept in out/. v123 = the review copy; v122 = the live app's code.
P=/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/rv-work/probes
V122=/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/rv-work/v122/www
cd $P
port=9201
for f in p1-auth-lapse p1b-signout p2-restore-today p3-old-version p4-visit-two-phones p5-restore-partial p6-raced-visits-base p7-new-clinic-paths p8-rename-half p9-snapshot-partial; do
  PORT=$port timeout 500 node $f.e2e.js > out/$f.v123.txt 2>&1; echo "$f v123 rc=$? $(grep -c '^❌' out/$f.v123.txt) problem lines" >> out/_summary.txt; port=$((port+1))
done
for f in p1-auth-lapse p1b-signout p2-restore-today p4-visit-two-phones p5-restore-partial p6-raced-visits-base p7-new-clinic-paths p8-rename-half p9-snapshot-partial; do
  WWW=$V122 PORT=$port timeout 500 node $f.e2e.js > out/$f.v122.txt 2>&1; echo "$f v122 rc=$? $(grep -c '^❌' out/$f.v122.txt) problem lines" >> out/_summary.txt; port=$((port+1))
done
echo DONE >> out/_summary.txt
