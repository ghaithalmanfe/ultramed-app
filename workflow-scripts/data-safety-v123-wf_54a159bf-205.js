export const meta = {
  name: 'data-safety-v123',
  description: 'Fix the audit\'s open data-safety issues on the live v122 (one refresh at a time, no automatic restores or merges, older copies never undo edits, true save messages, right clinic owner, no data to the dead Netlify address, guarded daily backup), test everything, review adversarially, fix',
  phases: [
    { title: 'Fix', detail: 'two fixers: sync core; messages and data' },
    { title: 'Combine', detail: 'one release (v123), full suites on source and dist, rules tests' },
    { title: 'Review', detail: 'adversarial: try to lose data; owner\'s rules; nothing slower' },
    { title: 'Fix2', detail: 'confirmed findings' },
  ],
}
const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const REPO = '/home/user/ultramed-app'
const REPORT = S + '/audit/00-status-v122.md'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE'
const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const BOOL = { type: 'boolean' }
const FIX_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, items: STRS, checks: STRS, unitPass: BOOL, suites: STR, ownerSteps: STRS, openIssues: STRS, allGreen: BOOL }, required: ['summary', 'head', 'items', 'unitPass', 'suites', 'allGreen'] }
const REL_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, unitPass: BOOL, suitesSource: STR, suitesDist: STR, rules: STR, ownerSteps: STRS, openIssues: STRS, allGreen: BOOL }, required: ['summary', 'head', 'unitPass', 'suitesSource', 'suitesDist', 'rules', 'allGreen'] }
const FINDING = { type: 'object', properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: STR, line: { type: 'number' }, what: STR, evidence: STR, fix: STR }, required: ['severity', 'file', 'what', 'evidence', 'fix'] }
const REVIEW_SCHEMA = { type: 'object', properties: { checked: STRS, findings: { type: 'array', items: FINDING } }, required: ['checked', 'findings'] }

const BASE = `The UltraMed app (CLAUDE.md is loaded; its house rules decide every doubt). The owner's words (13 Nov): "I don't want anyone to complain about losing information under any circumstances", and the app must not be slow to open on a laptop or a phone. His standing rules (12 Nov): zero data loss, no automatic merges of records, nothing changes in the shared data without someone's tap, every deploy approved by him.
An audit re-checked on 13 Nov is in ${REPORT}: read its section "Still open, in order of importance" for the items named below — each gives the rows, what was reproduced, and a proposal. Its probes are in ${S}/arch-status/ (race-products.js, race-restore.js, …) and in the other reviewers' scratch folders it names; turn each reproduction you fix into a harness or unit check that fails before your fix and passes after (keep it).
Base: claude/hello-0r7ps7 at 8670308 = the live v122 plus the "Add to today's plan" fix; the new main screen is HELD (never bring back main-screen-v1 / e40d293); the change log, alerts and nightly backup are on other branches (int-audit, int-alerts, int-backup) for a later release — do not merge them here.
Rules for every worker: work only in your worktree; never push or merge into main; never commit node_modules (add files by path); commit messages end with:
${TRAILER}
Suites while others run theirs: only ${S}/run-shifted.sh <worktree> <your offset> <outdir> "" 2 (source) or with <worktree>/dist as 4th argument after \`node scripts/build.js\`; one harness alone only on your shifted port. A failure only under load is re-run once alone, and you say so; never weaken a check. Keep it lean: no speculative rewrites; every change must make data safer or messages truer without slowing the app's opening or its saves.`

phase('Fix')
const fixers = await parallel([
  () => agent(`${BASE}

Your part — SYNC CORE, in the worktree ${S}/safe-a (branch safe-a at 8670308), port offset +300:
- Item 2 "One refresh at a time, and retire the old start-up repairs": (a) one loadAll at a time (the tick skips; a second caller gets the running promise), (b) each run's own read-failed and phone-copy flags used by readOk, the repairs and the save guards, (c) a factory default written only from the supervisor's phone and only after a server read says the document does not exist — never from a phone with no copy of that key, (d) retire restoreOrphanClinics, autoRestoreWipe and deepRestoreSweep (their work was done in Aug–Sep; nothing may write at start without a tap — the owner's rule), checkWipeBanner once per phone per day and only for an account that ever had 15+ clinics, (e) the race probes as a harness, (f) one refresh when the app comes back on screen, through the same single path.
- Item 6 "Older copies undo other people's edits": delete-log entries kept 120 days; day plans keep their base while queued and after an offline start; visits merged three-way against a per-document base (as clinics/tasks/events since v121); whole documents saved by compare-and-set against the exact string this phone loaded, refused with "changed on another device — reopen" (never landing late and blind); the recycle bin through storageUpdate + a merge; the phone-copy restore shows per-clinic differences and applies only ticked rows (or retire it if "Clinics without a name" covers it — say which and why).
- Item 11 "Whole-day Restore still replaces instead of adding": the small fix the item proposes now.
Then: \`npm test\`; the new checks; every harness on the source (\`${S}/run-shifted.sh ${S}/safe-a 300 ${S}/suite-safe-a "" 2\`). Commit on safe-a. Return the structured result (items done with their checks; owner steps if any; what is left).`, { label: 'fix: sync core', phase: 'Fix', schema: FIX_SCHEMA }),
  () => agent(`${BASE}

Your part — MESSAGES AND DATA, in the worktree ${S}/safe-b (branch safe-b at 8670308), port offset +400:
- Item 4 "Never promise an upload that cannot happen, never say saved when it did not land": a save the rules refuse is never queued — "Not allowed, not saved (ask the supervisor)", outcome {ok:false, refused:true}, flushOutbox drops a refused key, cloudGet says "no access"; "too large" is a distinct error, never queued, with a lasting banner naming the month and what to do, the visit screen saying "not saved", the same byte check on clinics, tasks, events, day plans, chat and memories saves, memories capped, the bin pruned on every write; every save action whose message ignores the outcome (the item lists the v122 ones; about 37 — use persistTold + saveToast) tells the truth; a unit scan that fails on an \`await persist(…)\` whose result is unused before a success message.
- Item 3, the code part: maybeSnapshot measures the bytes; above about 900 KB the daily backup keeps visits without thumbnails (photo ids kept) and the whole-day Restore keeps the current thumbnail for those ids; after a failure it waits an hour; "too large" is said (where the app shows such things today). The rules part of item 3 (read-only logins for the e-mail and backup jobs, mailLog, only today's backup creatable by the team): write it in firestore.rules with tests in tests/rules (the emulators run here), and list the paste in ownerSteps.
- Item 5 "The automatic doctor merge at start": stop the silent collapse — keep both records; list possible duplicates for the supervisor to merge by tap (like "Doctors without a name"); no clinic rewrite on refreshes with no edit (check: no clinic write during 3 refreshes).
- Item 8 "Sales credited to the wrong person": the clinic a rep adds with (+) belongs to her by default, never to another rep (and whatever else the item lists).
- Item 10 "The Assistant still sends team data to the dead Netlify address": nothing is ever sent there (the assistant is inactive: hide or disable it honestly).
- Item 9 "Publishing waits for the browser tests": GitHub Pages publishes only after the browser tests of that commit pass (pages.yml / tests.yml), without breaking the publish of a green commit.
Then: \`npm test\`; the new checks; every harness on the source (\`${S}/run-shifted.sh ${S}/safe-b 400 ${S}/suite-safe-b "" 2\`); \`cd tests/rules && npm run scan\` and the rules emulator tests. Commit on safe-b. Return the structured result.`, { label: 'fix: messages and data', phase: 'Fix', schema: FIX_SCHEMA }),
])
if (!fixers[0] || !fixers[1]) return { stopped: 'fix', fixers }
log('Fixers: sync core ' + (fixers[0].allGreen ? 'green' : 'NOT green') + ' · messages and data ' + (fixers[1].allGreen ? 'green' : 'NOT green'))

phase('Combine')
const rel = await agent(`${BASE}

Combine the two fixers' work into ONE release, v123 "data safety".
Reports: ${JSON.stringify(fixers, null, 1)}
Do: \`git -C ${REPO} worktree add ${S}/safe-wt -b safety-v123 8670308\`; merge safe-a and safe-b (merge commits), resolving their conflicts (04-sync.js above all) so both sides' protections hold together; bump APP_REV (www/js/app/01-config.js) and the service-worker CACHE (www/sw.js) to v123; CLAUDE.md bullets for what changed (and the held main screen's note stays, now saying it returns after this release). Run \`npm test\`; \`cd tests/rules && npm run scan\` and the rules emulator tests; every harness on the source and the built site: \`${S}/run-shifted.sh ${S}/safe-wt 600 ${S}/suite-safe-src "" 2\` and, after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${S}/safe-wt 700 ${S}/suite-safe-dist ${S}/safe-wt/dist 2\`. Fix every failure at its root. Measure that opening is not slower: time the daily open (phone copy present) on the built site before (claude/hello-0r7ps7) and after, a few runs each, with the startup harness if ${S}/perf-wt/tests/e2e/startup-speed.e2e.js exists (copy it in temporarily, do not commit it), else a simple timing; report both. Commit on safety-v123. Return the structured result; ownerSteps in plain English (for example pasting the updated rules).`, { label: 'combine v123 + full suites', phase: 'Combine', schema: REL_SCHEMA })
if (!rel) return { stopped: 'combine', fixers, rel }
log('v123: unit ' + (rel.unitPass ? 'green' : 'NOT green') + ' · source: ' + rel.suitesSource + ' · dist: ' + rel.suitesDist)

phase('Review')
const review = await agent(`Independent, adversarial review of the UltraMed release v123 "data safety" before it goes to the owner (CLAUDE.md is loaded; its house rules are the standard). The owner's words: nobody may ever lose information; the app must not be slow to open; no automatic merges; nothing changes in the shared data without a tap. You did not write this code. Your job is to make data get lost or shown wrong, and to prove it.
The code: ${S}/safe-wt (branch safety-v123; the live app is claude/hello-0r7ps7 = v122: \`git -C ${S}/safe-wt diff claude/hello-0r7ps7...safety-v123\`). Do NOT modify it: copy it (\`cp -r\` without node_modules and dist) to ${S}/review-safe and work there with port offset 800 (\`${S}/run-shifted.sh ${S}/review-safe 800 ${S}/suite-review-safe "" 2\`).
The audit it answers: ${REPORT} (items 2–6, 8–11). The combine report: ${JSON.stringify(rel)}
Try at least: overlapping refreshes on slow and failing reads (the audit's race probes and variations), a phone offline for days then back, two and three phones editing the same visit / day plan / clinic / task, deletes on two phones, a save refused by the rules, a document at its size limit, an older app version still open after the release, the whole-day restore and the phone-copy restore, the supervisor's duplicate doctors, a rep adding a clinic with (+), the daily backup at its size limit, a sign-out and sign-in on a shared phone — and that the release opens no slower than v122. For each problem: reproduce it and give the evidence; return ranked findings with file:line and the fix, plus the list of what you tried.`, { label: 'review: try to lose data', phase: 'Review', schema: REVIEW_SCHEMA })
if (!review || !review.findings.length) return { fixers, rel, review, fix2: null }

phase('Fix2')
const fix2 = await agent(`${BASE}

Fix the confirmed findings of the adversarial review of release v123 "data safety", in ${S}/safe-wt (branch safety-v123):
${JSON.stringify(review.findings, null, 1)}
For each: check it is real (if not, say why); reproduce it with a check that fails before the fix; fix the root cause. Then \`npm test\`, the rules scan and emulator tests, and every harness on the source and the built site (offsets 600 and 700 as in the combine step). Commit on safety-v123. Return the structured result.`, { label: 'fix review findings', phase: 'Fix2', schema: FIX_SCHEMA })
return { fixers, rel, review, fix2 }
