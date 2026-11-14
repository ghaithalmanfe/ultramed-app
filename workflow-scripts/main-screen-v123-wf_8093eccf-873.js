export const meta = {
  name: 'main-screen-v123',
  description: 'Build the calm main screen for the supervisor and each rep (laptop + phone) on finished management figures, integrate, test everything, review independently, fix',
  phases: [
    { title: 'Build', detail: 'figures in core.js and the main screen, side by side' },
    { title: 'Integrate', detail: 'merge, wire, full suites on source and dist, screenshots' },
    { title: 'Review', detail: 'two independent reviewers: truth of figures; roles, regressions, layout, language' },
    { title: 'Fix', detail: 'fix confirmed findings with checks, full suites again' },
  ],
}

const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const CORE_WT = S + '/dash-core-wt'
const HOME_WT = S + '/home-wt'
const SPEC_CORE = S + '/dash-spec.md'
const SPEC_HOME = S + '/main-screen-spec.md'
const DESIGN = S + '/design/d-calm'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE'

const STR = { type: 'string' }
const STRS = { type: 'array', items: { type: 'string' } }
const CORE_SCHEMA = { type: 'object', properties: { summary: STR, commits: STRS, api: STRS, testDecisions: STRS, speedMs: { type: 'number' }, unitPass: { type: 'boolean' }, openIssues: STRS }, required: ['summary', 'commits', 'api', 'unitPass', 'testDecisions'] }
const SCREEN_SCHEMA = { type: 'object', properties: { summary: STR, commits: STRS, harnessChecks: { type: 'number' }, suites: STR, screenshots: STRS, coreNeeds: STRS, openIssues: STRS, allGreen: { type: 'boolean' } }, required: ['summary', 'commits', 'suites', 'coreNeeds', 'allGreen'] }
const INT_SCHEMA = { type: 'object', properties: { summary: STR, commits: STRS, unitPass: { type: 'boolean' }, suitesSource: STR, suitesDist: STR, screenshots: STRS, openIssues: STRS, allGreen: { type: 'boolean' } }, required: ['summary', 'commits', 'unitPass', 'suitesSource', 'suitesDist', 'allGreen'] }
const FINDING = { type: 'object', properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: STR, line: { type: 'number' }, what: STR, evidence: STR, fix: STR }, required: ['severity', 'file', 'what', 'evidence', 'fix'] }
const REVIEW_SCHEMA = { type: 'object', properties: { checked: STRS, findings: { type: 'array', items: FINDING } }, required: ['checked', 'findings'] }
const FIX_SCHEMA = { type: 'object', properties: { summary: STR, commits: STRS, results: STRS, unitPass: { type: 'boolean' }, suitesSource: STR, suitesDist: STR, screenshots: STRS, openIssues: STRS, allGreen: { type: 'boolean' } }, required: ['summary', 'commits', 'results', 'unitPass', 'suitesSource', 'suitesDist', 'allGreen'] }

const CORE_PROMPT = `You finish the management figures in www/js/core.js of the UltraMed app (CLAUDE.md is loaded; its house rules decide every doubt).

Where: the git worktree ${CORE_WT} (branch exec-dash-core). Work only there. Never commit node_modules (a symlink; add files by path). No push, no merge into main.

What exists: UMCore.execDashboard / UMCore.monthWorkdays — a draft from an interrupted session (commit 686c97a, 13 unit tests in tests/core.test.js, describe "management dashboard (v121)"), the fixture made invented (de92093), and f242bb8 = an interrupted worker's unfinished changes to core.js (+385/-159), never reviewed: 4 of the 13 dashboard tests now fail (a closed month; one brand; field work as logged; monthCustomerSales options). Read \`git show 686c97a\`, \`git show f242bb8\` and the code carefully.

The contract: ${SPEC_CORE}, section "Core additions" (items 1-7: forecast, lastYear, daily, activity, customers.accounts[i].cls, UMCore.execDrill, the speed guard) and its rules at the top. Keep the field names and shapes exactly as written there: the main screen is being built against them at the same time; if a shape truly must differ, say so in your report.

Do:
1. Verify every block of execDashboard / monthWorkdays / execDrill (draft and unfinished changes) against the house rules: the ERP files are the only measure of achieved (UMCore.monthAchievement / erpRowRep, handovers by repSince, shared accounts by salesman), the DSR gives targets only, a month no file covers has no figure (never a made-up 0), a person no file holds is said, parts shown add up to the total shown (centsSplit), visits and app orders are never sales, a joint visit counts for each person and once for the team. Fix what is wrong.
2. For each of the 4 failing tests decide, by those rules, whether the code or the test is wrong; fix the wrong one; give the decision and why. Never weaken a test to make it pass.
3. Finish items 1-7 with unit tests on invented data only (tests/confidential.test.js must stay green). Each test must fail when what it guards is broken (try it).
4. \`npm test\` all green; \`node scripts/build.js\` succeeds.
5. Commit on exec-dash-core, message ending with:
${TRAILER}

Return: the final API of execDashboard's fields and execDrill (name -> shape, one line each), the decisions on the 4 tests, the measured time of the speed case, the commits, anything left open.`

const SCREEN_PROMPT = `You build the new main screen (the Today view) of the UltraMed app for both roles (CLAUDE.md is loaded; its house rules decide every doubt).

Where: the git worktree ${HOME_WT} (branch main-screen-v1, based on f242bb8, which carries an unfinished draft of UMCore.execDashboard). Work only there. No push, no merge into main.

Read first:
- The contract: ${SPEC_HOME} (who sees what, each figure's one code path, what the Today screen keeps, the layouts, the harness, where the code goes).
- The design the owner was shown (calm and airy; he rejected a dense one as "too cluttered, not comfortable for the eye"): ${DESIGN}/index.html (supervisor), ${DESIGN}/rep.html (a rep), ${DESIGN}/calm.css. LOOK at the pictures ${DESIGN}/board/d-calm-board-sup.png and ${DESIGN}/board/d-calm-board-rep.png (and ${DESIGN}/d-calm-laptop-fold.png, d-calm-mobile-fold.png, d-calm-rep-laptop-fold.png, d-calm-rep-mobile-fold.png). The brief behind it: ${S}/design/brief.md.
- The current Today screen: www/js/app/05-today-calendar.js (renderToday, renderTargetCard, renderPlanList, ...) and its markup in www/index.html (#view-today).

Build:
- The supervisor's main screen (the team and each person of REPS, himself included; the person switch opens that person's own screen) and each rep's own main screen (her figures only, never the team or another person): the laptop layout at >= 1024 px (the side rail instead of the bottom bar, the cards in rows) and the phone layout at <= 600 px (cards stacked, the rest as one-tap rows, the bottom bar with log-a-visit easy to reach), sound in between too; Arabic (right to left) and English.
- Every figure from its one code path as the contract says. execDashboard's newer fields (forecast, daily, ...) are being finished in core.js by another worker right now: do NOT edit www/js/core.js; read the fields defensively (missing -> that part hidden, never a crash) and list what you need from core in coreNeeds.
- Keep everything the Today screen has (the contract's list), including #targetCard and its text, which six harnesses read.
- The harness tests/e2e/main-screen.e2e.js (port 8277) as the contract says; every check must fail when what it guards is broken (try it).
- Run \`npm test\`; your harness; then every harness on the source: \`${S}/run-shifted.sh ${HOME_WT} 500 ${S}/suite-home 2\`. Fix what you broke at its root; never weaken a check. (Other workers run harnesses at the same time: use only your offset.)
- Screenshots of the real app (fake cloud, invented data, fixed clock, Arabic): the supervisor and a rep, laptop 1440x900 and phone 390x844, first screen, deviceScaleFactor 2, saved as ${S}/home-shots/sup-laptop.png, sup-phone.png, rep-laptop.png, rep-phone.png. LOOK at them, compare with the design, fix what is off.
- Commit on main-screen-v1 (files by path; never node_modules), message ending with:
${TRAILER}

Return the structured result.`

phase('Build')
const [core, screen] = await parallel([
  () => agent(CORE_PROMPT, { label: 'figures (core.js)', phase: 'Build', schema: CORE_SCHEMA }),
  () => agent(SCREEN_PROMPT, { label: 'main screen (Today view)', phase: 'Build', schema: SCREEN_SCHEMA }),
])
if (!core || !screen) {
  log('A build worker returned nothing; stopping before integration (resume later).')
  return { stopped: 'build', core, screen }
}
log('Figures: ' + (core.unitPass ? 'unit tests green' : 'unit tests NOT green') + ' · Screen: ' + (screen.allGreen ? 'green' : 'not all green'))

phase('Integrate')
const INT_PROMPT = `You integrate two finished pieces of the UltraMed main-screen release (CLAUDE.md is loaded; its house rules decide every doubt).

Where: ${HOME_WT} (branch main-screen-v1). No push, no merge into main, no release (do not bump APP_REV).
- The figures: branch exec-dash-core (worktree ${CORE_WT}), finished by a worker whose report is:
${JSON.stringify(core, null, 1)}
- The main screen: already on main-screen-v1, built by a worker whose report is:
${JSON.stringify(screen, null, 1)}
The contracts: ${SPEC_HOME} and ${SPEC_CORE} (Core additions).

Do:
1. Merge exec-dash-core into main-screen-v1 (a merge commit). core.js comes from exec-dash-core (the main screen did not edit it); resolve any other conflict keeping both sides' intent.
2. Wire what the screen needs from core (its coreNeeds) to the finished fields; keep every "not measured" state.
3. Prove the figures agree: the main screen's numbers = execDashboard's for the same view = the Today card / Months report / KPI scorecard where the contract says so; add the missing checks to tests/e2e/main-screen.e2e.js.
4. Run \`npm test\`; then every harness on the source and on the built site: \`${S}/run-shifted.sh ${HOME_WT} 300 ${S}/suite-int-src 2\` and, after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${HOME_WT} 400 ${S}/suite-int-dist ${HOME_WT}/dist 2\`. Fix every failure at its root; never weaken a check (a timing failure is re-run once alone to tell a real failure from machine load; say so).
5. Retake the four screenshots in ${S}/home-shots/ (same names) and look at them.
6. Add the CLAUDE.md bullet for the main screen (what each role sees, each figure's one code path, the harness), marked as not yet released.
7. Commit (files by path; never node_modules), message ending with:
${TRAILER}

Return the structured result.`
const integ = await agent(INT_PROMPT, { label: 'integrate + full suites', phase: 'Integrate', schema: INT_SCHEMA })
if (!integ) {
  log('Integration returned nothing; stopping (resume later).')
  return { stopped: 'integrate', core, screen, integ }
}
log('Integration: unit ' + (integ.unitPass ? 'green' : 'NOT green') + ' · source: ' + integ.suitesSource + ' · dist: ' + integ.suitesDist)

phase('Review')
const LENSES = [
  { key: 'truth', off: 600, lens: 'THE FIGURES ARE TRUE. Every number on the main screen, for the supervisor (team and each person) and for a rep: does it come from its one code path (bestMonthRevenue / UMCore.monthAchievement; targets / teamTargetNow / staleTargetNote; execDashboard achievement, remaining, perDay, forecast, sameDays, act, daily; UMCore.kpiScorecard); does the team equal the sum of its people as shown; are a month with no sales file, a person no file holds and a target of an earlier month said in words (never a made-up 0, never hidden); are orders logged in the app never called sales; do visits count field visits only (a joint visit for each person, once for the team); does each explanation (how it is calculated) show this view\'s own numbers and the right formula. And the core additions themselves: forecast = the management report\'s formula (13-exports.js tstats); lastYear built like sameDays; daily adds up to the month as shown; activity; accounts cls; execDrill totals; handovers (prevRep / repSince) and shared accounts (erpRowRep); month boundaries, the 1st of a month, a month with no working day left, the last day of a month.' },
  { key: 'roles', off: 700, lens: 'ROLES, REGRESSIONS, LAYOUT, LANGUAGE. A rep never sees the team or another person\'s name or figure on her main screen, in English and in Arabic, in the DOM as well as on screen, whatever the switch or a console call sends (ownRepOnly); a supervisor with sells:false; the person switch shows exactly what that person sees. Everything the old Today screen had still renders and works (plan, missed plans, follow-ups, tasks with quick add and import, recent visits, nudges, occasions, the target card\'s text and cross-invoice notice, the Months button, alert dots, navigation on every view at laptop width). No existing harness was weakened (compare each changed harness with claude/hello-0r7ps7). Layout at 390, 600, 768, 1024 and 1440 px: no horizontal scroll, nothing cut off or overlapping, bottom bar on the phone, rail on the laptop, thumb targets >= 44 px; Arabic complete (no English left in the Arabic UI), right to left correct, Latin names and amounts not garbled. Speed of renderToday with a year of invented data (it runs on every refresh). Viewing writes nothing to the cloud. No page errors. tests/confidential.test.js green; the new CLAUDE.md bullet accurate.' },
]
const reviews = await parallel(LENSES.map(L => () => agent(`Independent review of the UltraMed main-screen release before it goes to the owner (CLAUDE.md is loaded; its house rules are the standard). You did not write this code: be skeptical, and report only what you have confirmed.

The code: ${HOME_WT} (branch main-screen-v1; the released app is claude/hello-0r7ps7: \`git -C ${HOME_WT} diff claude/hello-0r7ps7...main-screen-v1\`). Do NOT modify that checkout. To run or probe, copy it first (\`cp -r\` without node_modules, then \`ln -s /home/user/ultramed-app/node_modules\`) to ${S}/review-${L.key} and run harnesses there only with port offset ${L.off} (\`${S}/run-shifted.sh ${S}/review-${L.key} ${L.off} ${S}/suite-review-${L.key} 2\`, or shift one harness's port by hand).
The contracts it was built to: ${SPEC_HOME} and ${SPEC_CORE} (Core additions). The integration report: ${JSON.stringify(integ)}

Your lens: ${L.lens}

For each problem: reproduce it (a probe in your copy: a unit test, a harness check or a node script against UMCore) and give the evidence. Return the findings ranked by severity with file:line, what is wrong, the evidence and the fix you propose, and the list of what you checked.`, { label: 'review: ' + L.key, phase: 'Review', schema: REVIEW_SCHEMA })))
const findings = reviews.filter(Boolean).flatMap((r, i) => (r.findings || []).map(f => Object.assign({ lens: LENSES[i] ? LENSES[i].key : '?' }, f)))
const checked = reviews.filter(Boolean).flatMap(r => r.checked || [])
log('Review: ' + findings.length + ' finding(s) from ' + reviews.filter(Boolean).length + ' reviewer(s)')
if (!findings.length) return { core, screen, integ, reviews, findings, fix: null }

phase('Fix')
const fix = await agent(`Fix the confirmed review findings of the UltraMed main-screen release (CLAUDE.md is loaded; its house rules decide every doubt).
Where: ${HOME_WT} (branch main-screen-v1). No push, no merge into main, no release.
Findings from two independent reviewers:
${JSON.stringify(findings, null, 1)}
For each finding: first check it is real (if not, say why and skip it); reproduce it with a harness or unit check that fails before your fix and passes after (keep the check); fix the root cause. Then run \`npm test\`, and every harness on the source and the built site: \`${S}/run-shifted.sh ${HOME_WT} 300 ${S}/suite-fix-src 2\`; after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${HOME_WT} 400 ${S}/suite-fix-dist ${HOME_WT}/dist 2\`. Retake the four screenshots in ${S}/home-shots/ and look at them. Commit (files by path; never node_modules), message ending with:
${TRAILER}
Return the structured result, one line per finding in results (fixed / not real and why).`, { label: 'fix findings', phase: 'Fix', schema: FIX_SCHEMA })
return { core, screen, integ, checked, findings, fix }
