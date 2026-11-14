#!/bin/bash
# The re-review's own probes (review2): fixed code (review2-safe) and, where it matters, the pre-review v123 (6da0b15).
P=/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-work/probes
PRE=/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review2-work/pre/www
cd $P; mkdir -p out; : > out/_new.txt
port=9751
for f in q10-r6-root q11-held-republish q11b-held-visit q11c-control-online q14-restore-twice q15-parked-stale q15b-toolarge-stale q16-restore-today-after-backup q17-rename-late q18-calllog-new-clinic q19-slow-access-check; do
  PORT=$port timeout 600 node $f.e2e.js > out/$f.txt 2>&1; echo "$f fixed rc=$? ok=$(grep -c '^✅' out/$f.txt) bad=$(grep -c '^❌' out/$f.txt)" >> out/_new.txt; port=$((port+1))
done
for f in q11-held-republish q11b-held-visit q15-parked-stale; do
  WWW=$PRE PORT=$port timeout 600 node $f.e2e.js > out/$f.pre.txt 2>&1; echo "$f pre-review rc=$? ok=$(grep -c '^✅' out/$f.pre.txt) bad=$(grep -c '^❌' out/$f.pre.txt)" >> out/_new.txt; port=$((port+1))
done
node q13-revoff.js > out/q13-revoff.txt 2>&1; echo "q13-revoff rc=$? ok=$(grep -c '^✅' out/q13-revoff.txt) bad=$(grep -c '^❌' out/q13-revoff.txt)" >> out/_new.txt
echo DONE >> out/_new.txt
