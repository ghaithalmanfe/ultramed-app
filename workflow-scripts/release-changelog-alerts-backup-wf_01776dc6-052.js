export const meta = {
  name: 'release-changelog-alerts-backup',
  description: 'Bring the change log, the alerts center and the nightly encrypted backup onto the live v122, combine them into one release (v123), test everything, review independently, fix',
  phases: [
    { title: 'Integrate', detail: 'each feature merged onto v122 in its own worktree' },
    { title: 'Combine', detail: 'one release branch, v123, full suites on source and dist, screenshots' },
    { title: 'Review', detail: 'two independent reviewers: data safety and truth; roles, regressions, language, rules' },
    { title: 'Fix', detail: 'fix confirmed findings with checks, full suites again' },
  ],
}

const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const REPO = '/home/user/ultramed-app'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE'
const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const BOOL = { type: 'boolean' }
const INT_SCHEMA = { type: 'object', properties: { summary: STR, branch: STR, head: STR, conflicts: STRS, decisions: STRS, unitPass: BOOL, suites: STR, allGreen: BOOL, openIssues: STRS }, required: ['summary', 'branch', 'head', 'unitPass', 'suites', 'allGreen'] }
const REL_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, unitPass: BOOL, suitesSource: STR, suitesDist: STR, rulesScan: STR, screenshots: STRS, ownerSteps: STRS, openIssues: STRS, allGreen: BOOL }, required: ['summary', 'head', 'unitPass', 'suitesSource', 'suitesDist', 'rulesScan', 'allGreen'] }
const FINDING = { type: 'object', properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: STR, line: { type: 'number' }, what: STR, evidence: STR, fix: STR }, required: ['severity', 'file', 'what', 'evidence', 'fix'] }
const REVIEW_SCHEMA = { type: 'object', properties: { checked: STRS, findings: { type: 'array', items: FINDING } }, required: ['checked', 'findings'] }
const FIX_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, results: STRS, unitPass: BOOL, suitesSource: STR, suitesDist: STR, screenshots: STRS, openIssues: STRS, allGreen: BOOL }, required: ['summary', 'head', 'results', 'unitPass', 'suitesSource', 'suitesDist', 'allGreen'] }

const BASE = `The UltraMed app (CLAUDE.md is loaded; its house rules decide every doubt). The live app is v122 (branch main = a7c21d7). The working branch claude/hello-0r7ps7 is at 8670308: exactly v122 plus one fix (the clinic card's "Add to today's plan", check in kpi.e2e.js) — the new main screen (v123 build) is HELD there until the owner approves its look; never bring it back (do not merge or cherry-pick main-screen-v1 / e40d293 or anything from it).
Rules for every worker: work only in the worktree you are given; never push, never merge into main, never touch claude/hello-0r7ps7; never commit node_modules (add files by path); every commit message ends with:
${TRAILER}
Browser harnesses need no node_modules (Playwright resolves globally; the default Chromium launch works). Other workers run harnesses at the same time: run the whole suite only with ${S}/run-shifted.sh <worktree> <your port offset> <outdir> "" 2 (the 4th argument empty = the source; for the built site run \`node scripts/build.js\` first and pass <worktree>/dist), and a single harness only on your own shifted port. A harness that fails only under machine load is re-run once alone, and you say so; never weaken a check.`

phase('Integrate')
const FEATURES = [
  { key: 'audit', wt: S + '/int-audit', branch: 'int-audit', src: 'audit-trail-v1', off: 300, what: `the CHANGE LOG ("سجل التغييرات", More → Change log, www/js/app/17-audit-log.js; month documents auditLog:YYYY-MM, already allowed by firestore.rules; unit tests in tests/core.test.js, harness tests/e2e/audit-log.e2e.js on port 8241). It was built on v120 (c9d5eda) and never released or reviewed as a whole. Since then v121 and v122 changed many of the save paths it hooks into (04-sync.js persist/persistFor/persistVisits and the three-way merges, 06-log-visit.js with the photo marks and the per-form save guard, 07-clinics.js, 08-team-orders.js, 12-reports.js photos and chat, 13-exports.js restores and the full backup, 09-admin.js nameless clinics / lost doctors / repointClinic …). Resolve every conflict keeping BOTH v122's behaviour and the log. Then list every place in v122 where shared data is changed by a person's tap and make sure each one that belongs in the change log (by the branch's own scope: who changed what, when, with the true outcome) records it — including the flows v121/v122 added (naming a nameless clinic, naming a lost doctor and re-pointing visits, the clinic recovery bring-back, the whole-day restore with its new refusals, visit photos landing or lost if the scope says so). The log must never block or slow a save, never record a password or a secret, never claim a save that did not land, and a rep sees only her own entries.` },
  { key: 'alerts', wt: S + '/int-alerts', branch: 'int-alerts', src: 'alerts-v1', off: 400, what: `the ALERTS CENTER (the bell in the header → openAlerts, www/js/app/19-alerts.js; pure rules UMCore.alertsFor in core.js; harness tests/e2e/alerts.e2e.js on port 8243). Built on v120 (c9d5eda), never released or reviewed. Resolve every conflict keeping v122's behaviour. Then bring its rules up to v122: follow-ups, targets and sync — the sync alerts must say exactly what v122's own bars and notes say (the queued keys, a key served from memory, visit photos waiting / only in the app's memory / lost, and the 3-day age note for another phone's photo), from the same functions, never a second rule; every alert says its reason and is true; a rep sees only her own alerts; the bell's count matches the sheet.` },
  { key: 'backup', wt: S + '/int-backup', branch: 'int-backup', src: 'autobackup-v1', off: 500, what: `the NIGHTLY ENCRYPTED BACKUP outside Firebase (.github/workflows/backup.yml, scripts/backup/*, tests/backup.test.js against a local fake Firestore and identitytoolkit, docs/backup.md). Built on v120 (c9d5eda), never released or reviewed. Resolve every conflict. Check it against v122's storage: every document of the state collection is copied whole (including visitsArch:YYYY-MM, visitsIndex, photo:<id>, erpRows:…, auditLog:YYYY-MM, chat and memories), the restore script puts back exactly what was saved, a run without its secrets says "not configured", keeps nothing and stays green, and nothing in the log ever prints an e-mail address, a passphrase or a token (the repository is public). The secrets it reads: BACKUP_PASSPHRASE (required), BACKUP_LOGIN_EMAIL / BACKUP_LOGIN_PASSWORD (else REPORT_LOGIN_*). Keep docs/backup.md accurate, with its Arabic summary for the owner.` },
]
const ints = await parallel(FEATURES.map(F => () => agent(`${BASE}

Your part: ${F.what}

Where: the worktree ${F.wt} (branch ${F.branch}, at 8670308). Merge ${F.src} into it (\`git merge ${F.src}\`, a merge commit). Port offset for your suites: +${F.off}.
Then: \`npm test\` green; the feature's own harness green on your shifted port; every harness on the source green (\`${S}/run-shifted.sh ${F.wt} ${F.off} ${S}/suite-${F.key} "" 2\`); the feature's CLAUDE.md bullet accurate for what it now does on v122. Prove each fix you make with a check that fails before it. Commit on ${F.branch}. Return the structured result: the conflicts and how you resolved each, your decisions, the suites, what is left open.`, { label: 'integrate: ' + F.key, phase: 'Integrate', schema: INT_SCHEMA })))
const okInts = ints.filter(Boolean)
log('Integrated: ' + okInts.map(r => r.branch + ' ' + (r.allGreen ? 'green' : 'NOT green')).join(', '))
if (okInts.length < FEATURES.length) return { stopped: 'integrate', ints }

phase('Combine')
const rel = await agent(`${BASE}

Your part: combine the three integrated features into ONE release, v123 (the change log, the alerts center, the nightly encrypted backup — the main screen stays held).
Reports of the three integrators:
${JSON.stringify(ints, null, 1)}

Do:
1. Create the worktree: \`git -C ${REPO} worktree add ${S}/rel-wt -b rel-v123 8670308\`, then merge int-audit, int-alerts and int-backup into it (merge commits). Resolve their conflicts with each other (index.html header and script tags in number order — 17-audit-log.js and 19-alerts.js, 18 stays free for the unreleased management sheet —, More tiles, i18n.js, CLAUDE.md, core.js exports, tests/core.test.js).
2. Make them work together: what the change log records about alerts settings, the alerts about the change log or the backup if their scopes say so, nothing counted twice.
3. Bump APP_REV (www/js/app/01-config.js) and the service-worker CACHE (www/sw.js) to v123.
4. Run \`npm test\`; the rules scan (\`cd tests/rules && npm run scan\`, no emulator: every write target must be known to firestore.rules — a NEW key or prefix would be refused in production; if one appears, add it to firestore.rules as team- or supervisor-written as fits, and say so in ownerSteps because the owner must paste the rules into the Firebase console); if the Firestore and Auth emulators can run here, also the rules tests in tests/rules; then every harness on the source and on the built site: \`${S}/run-shifted.sh ${S}/rel-wt 600 ${S}/suite-rel-src "" 2\` and, after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${S}/rel-wt 700 ${S}/suite-rel-dist ${S}/rel-wt/dist 2\`. Fix every failure at its root.
5. Screenshots for the owner, Arabic, invented data, deviceScaleFactor 2, into ${S}/rel-shots/: the change log on a phone (390x844) and on a laptop (1440x900) as the supervisor, the same as a rep (only her own), the alerts bell and sheet on a phone and a laptop. LOOK at them and fix anything cut off, untranslated or untrue.
6. CLAUDE.md: the change log, alerts and backup bullets say what v123 does; the held main screen's note stays.
7. Commit on rel-v123.
Return the structured result; in ownerSteps list, in plain English, what only the owner can do for these features to work (for example the GitHub secrets for the backup, a rules paste if a new key appeared).`, { label: 'combine v123 + full suites', phase: 'Combine', schema: REL_SCHEMA })
if (!rel) return { stopped: 'combine', ints, rel }
log('Release v123: unit ' + (rel.unitPass ? 'green' : 'NOT green') + ' · source: ' + rel.suitesSource + ' · dist: ' + rel.suitesDist)

phase('Review')
const LENSES = [
  { key: 'safety', off: 800, lens: 'DATA SAFETY AND TRUTH. The change log: no save path is blocked, slowed or changed by logging (offline, a refused or failed save, two phones at once, a month document growing to its cap, a log write that fails); it never records a password, a passphrase, a token or a full e-mail body; every entry states the true outcome (a failed save is never "saved"); entries are never lost or doubled by the merge/refresh logic; month documents and the cap behave. The alerts: every alert is true and has its reason; nothing alarming that is not so; the sync alerts agree exactly with v122\'s own bars and notes; no alert computes a figure by a second rule (month figures only through UMCore.monthAchievement). The backup: every state document copied whole and restorable exactly, the encryption sound (passphrase never logged or stored, a wrong passphrase fails clearly), a run without secrets green and saying "not configured", nothing personal printed in the public log, artifacts\' retention as documented.' },
  { key: 'roles', off: 900, lens: 'ROLES, REGRESSIONS, LANGUAGE, RULES. A rep sees only her own change-log entries and her own alerts, in English and Arabic, in the DOM as well as on screen, whatever the UI or a console call sends; the supervisor sees everyone. Everything v122 did still works the same (compare every changed harness with claude/hello-0r7ps7; none weakened). The rules scan and, if possible, the rules tests: every new write target known to firestore.rules with the right writer. Arabic complete and right to left (no English left on the new screens), layout at 390, 768 and 1440 px with nothing cut off or overlapping, thumb targets of 44 px on the phone. Speed: the log and the alerts never slow the screens or the saves noticeably on a phone. No page errors. tests/confidential.test.js green (nothing real); CLAUDE.md accurate.' },
]
const reviews = await parallel(LENSES.map(L => () => agent(`Independent review of the UltraMed release v123 (the change log, the alerts center and the nightly encrypted backup, added to the live v122) before it goes to the owner (CLAUDE.md is loaded; its house rules are the standard). You did not write this code: be skeptical and report only what you have confirmed.

The code: ${S}/rel-wt (branch rel-v123; the live app is claude/hello-0r7ps7 = v122 + one plan fix: \`git -C ${S}/rel-wt diff claude/hello-0r7ps7...rel-v123\`). Do NOT modify that checkout. To run or probe, copy it (\`cp -r\` without node_modules and without dist) to ${S}/review-${L.key} and run harnesses only there, with port offset ${L.off} (\`${S}/run-shifted.sh ${S}/review-${L.key} ${L.off} ${S}/suite-review-${L.key} "" 2\`, or shift one harness's port by hand).
The combine report: ${JSON.stringify(rel)}

Your lens: ${L.lens}

For each problem: reproduce it in your copy (a unit test, a harness check or a node script) and give the evidence. Return the findings ranked by severity with file:line, what is wrong, the evidence and the fix you propose, and the list of what you checked.`, { label: 'review: ' + L.key, phase: 'Review', schema: REVIEW_SCHEMA })))
const findings = reviews.filter(Boolean).flatMap((r, i) => (r.findings || []).map(f => Object.assign({ lens: LENSES[i].key }, f)))
log('Review: ' + findings.length + ' finding(s)')
if (!findings.length) return { ints, rel, reviews, findings, fix: null }

phase('Fix')
const fix = await agent(`${BASE}

Fix the confirmed review findings of release v123 in ${S}/rel-wt (branch rel-v123). Findings from two independent reviewers:
${JSON.stringify(findings, null, 1)}
For each finding: first check it is real (if not, say why and skip it); reproduce it with a harness or unit check that fails before your fix and passes after (keep the check); fix the root cause. Then \`npm test\`, the rules scan (\`cd tests/rules && npm run scan\`), and every harness on the source and the built site: \`${S}/run-shifted.sh ${S}/rel-wt 600 ${S}/suite-fix-src "" 2\`; after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${S}/rel-wt 700 ${S}/suite-fix-dist ${S}/rel-wt/dist 2\`. Retake the screenshots in ${S}/rel-shots/ that your fixes change, and look at them. Commit on rel-v123. Return the structured result, one line per finding in results (fixed / not real and why).`, { label: 'fix findings', phase: 'Fix', schema: FIX_SCHEMA })
return { ints, rel, findings, fix }
