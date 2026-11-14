export const meta = {
  name: 'exec-dashboard-build',
  description: 'Management dashboard (v123): one worker completes the figures in core.js, one builds the supervisor screen with its harness, then one integrates both, wires the new figures in, runs every test and takes screenshots',
  phases: [
    { title: 'Build', detail: 'the figures (core.js + unit tests) and the screen (new app file, Arabic, harness), in two worktrees' },
    { title: 'Integrate', detail: 'merge both, wire the new figures into the screen, every unit test and browser harness on source and built site, screenshots' },
  ],
}

const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const SPEC = S + '/dash-spec.md'

const RULES = `GROUND RULES (all of them matter)
- The contract for this work is ${SPEC} — read it fully first, then CLAUDE.md in your worktree (the project's rules: truth on screen, one path for month figures, tests, Arabic, nothing real in the repository).
- Work ONLY in your own worktree given below. Never edit, commit or push in /home/user/ultramed-app or in any other worktree. Never push to main or claude/hello-0r7ps7, never open a pull request, never change APP_REV or www/sw.js's CACHE.
- The machine can restart without warning and unpushed work is then at risk: commit and push to YOUR branch after every milestone that passes its tests (retry a push up to 4 times on a network error).
- Every commit message says what the team will see or what the code now guarantees, and ends with exactly these two lines:
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE
- Invented names and numbers only (tests/confidential.test.js is part of npm test and must pass). Never print or write an e-mail address at a real domain.
- Reproduce a defect with a test or harness check before you fix it, and keep the check. A check must fail when the thing it guards is broken — try it.
- Browser harnesses have fixed ports and other workers run on this machine (4 CPUs): never run a harness on its own port, run a copy placed next to it with its port(s) moved by YOUR offset given below, at most 2 browsers at a time, and delete the copy afterwards. require('playwright') works from any directory (never install it); there is no node_modules folder and none is needed.
- No internet in tests; never contact a real service.
- Return the structured result at the end: the commit hash on your branch, what you built, the exact test results you saw, and anything you noticed but did not do.`

const DONE = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commit: { type: 'string' },
    summary: { type: 'string' },
    tests: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['ok', 'commit', 'summary', 'tests'],
}

const CORE = `You are completing the FIGURES of a management dashboard for a field-sales web app (a PWA used by two sales reps and a supervisor in Kuwait). Pure functions in www/js/core.js with unit tests; no screen work.

${RULES}

YOUR WORKTREE: ${S}/dash-core-wt (local branch exec-dash-core, at commit 686c97a). Push with: git -C ${S}/dash-core-wt push -u origin exec-dash-core:claude/wip-exec-dash-core
YOUR FILES: www/js/core.js and tests/core.test.js only (another worker is building the screen in other files at the same time; a third merges you both afterwards — keep to these two files so the merge is clean).
YOUR HARNESS PORT OFFSET (only if you really need a browser): +700.

WHAT TO DO
1. Read the "management dashboard" block of www/js/core.js (execMonthFigures, execTargetOf, execDashboard, monthWorkdays, the reps/brand options of monthCustomerSales) and its 13 unit tests. It is an unreviewed draft from an interrupted session. Check every block against the house rules and against the code paths it claims to follow at THIS commit (monthAchievement, erpMtd, erpMonthLines, monthCustomerSales, monthlyTrend, erpWinsInRange, targetOf, followStatus, isFieldVisit, repWasThere, centsSplit, workingDaysBetween): wrong people, wrong cut-off day, a 0 where nothing was measured, parts that do not add up, a target of another month taken as this month's, a handed-over or shared clinic counted for the wrong person, a brand filter that changes the people measured, rounding that drifts from the Today card or the Months report. Fix what is wrong, each with a unit test that fails before the fix.
2. Add the core additions of the contract (section "Core additions"): forecast, lastYear, daily, activity, customers.accounts[i].cls, UMCore.execDrill, and the speed guard — exact field names as written there, each with unit tests on invented data that prove the reconciliation the contract names (the forecast against the management report's formula in www/js/app/13-exports.js "tstats"; the days, brands, products, invoices and accounts adding up to the figure as shown; lastYear and sameDays built the same way).
3. Keep every existing unit test passing (npm test: 356 pass at the start) and add yours. Keep the function fast: measure one call on about 30,000 invented lines over 12 months for a team of 3 and report the time.
4. Update the block's header comment so it describes every field the function now returns, in the plain style of the file.

Return the structured result. In "notes", list every defect you found in the draft (and whether you fixed it), any field of the contract you changed or could not deliver as written (the screen worker reads the contract, so say exactly what differs), and the measured time.`

const UI = `You are building the SCREEN of a management dashboard for a field-sales web app (a PWA used by two sales reps and a supervisor in Kuwait, in Arabic and English, mostly on phones).

${RULES}

YOUR WORKTREE: ${S}/dash-ui-wt (local branch exec-dash-ui, at commit 686c97a). Push with: git -C ${S}/dash-ui-wt push -u origin exec-dash-ui:claude/wip-exec-dash-ui
YOUR FILES: the new www/js/app/18-exec-dashboard.js; www/index.html (its script tag, and CSS only if inline styles cannot do it); www/js/app/05-today-calendar.js (the More tile only); www/js/i18n.js; the new tests/e2e/exec-dashboard.e2e.js (and a fixture under tests/e2e/fixtures only if needed). Do NOT edit www/js/core.js or tests/core.test.js: another worker is extending them at the same time (forecast, lastYear, daily, activity, customers.accounts[i].cls, UMCore.execDrill — see the contract), and a third worker merges you both and wires those in.
YOUR HARNESS PORT OFFSET: +600 (your harness's own port in the file is 8276; run a copy on 8876).

WHAT TO DO
1. Learn the house style before writing: openMonthByMonth and openKpiScorecard (www/js/app/16-kpi.js) for a supervisor sheet; the More menu (05-today-calendar.js); the Today target card and team line (bestMonthRevenue and the team total in www/js/app/11-erp.js, and where 05-today-calendar.js draws them); the Clinics screen's ERP card (erpDashData / erpDashReconHTML, 07-clinics.js); how text becomes Arabic (www/js/i18n.js, trOf / UMI18N in 14-ui-boot.js, data-notr, PATTERNS, how names, months, money and numbers are written in Arabic elsewhere in the app); downloadXlsx (13-exports.js); showModal; how scripts/build.js inlines the app files and what it refuses; tests/e2e/kpi.e2e.js and tests/e2e/clinics-vs-today.e2e.js as harness models (fake cloud, fixed clock, the synthetic ERP file of tests/e2e/fixtures/make-sales-xlsx.js).
2. Build the screen exactly as the contract's sections A–E describe, on the fields UMCore.execDashboard returns today. For the fields the other worker is adding, read them defensively (a missing field hides its tile, chart or list — never a crash, never a made-up number) and leave each place clearly marked for the integration step. Charts are inline SVG with the app's own CSS colours: load the "dataviz" skill for the method (which form for which question, marks, labels, accessibility) before writing chart code, but keep the app's palette and typography, not the skill's. Every string a person can see goes through the app's translation with real Arabic in i18n.js (the team's terms: مبيعات مفوترة، المستهدف، المحقق، المتبقي، أيام العمل … — read how existing screens say them and stay consistent).
3. Truth on screen: a value that is not measured shows "—" and why, in words; an order logged in the app is never called a sale; a filtered table says how many of how many and its subtotal; the ⓘ of each tile shows the source, the formula and this view's numbers; nothing claims to equal another screen unless your harness proves it.
4. Write tests/e2e/exec-dashboard.e2e.js with the checks the contract lists (those that depend on the new core fields are added at integration). Try each check against a deliberately broken copy to see it fail. Also run a copy of tests/e2e/smoke-all.e2e.js and tests/e2e/kpi.e2e.js on shifted ports to see nothing else broke, then node scripts/build.js and your harness against the built site (WWW=<worktree>/dist), and npm test.
5. Look at your own screen as a person would: take screenshots at 390 px wide in English and in Arabic (deviceScaleFactor 2) into ${S}/dash-shots-ui/ and read them — fix what is cramped, cut off, mis-ordered right-to-left, or unclear.

Return the structured result. In "notes", list the data-kpi ids and any hook the integration step needs, what you left marked for the new core fields, and anything in the contract you did differently and why.`

phase('Build')
const built = await parallel([
  () => agent(CORE, { label: 'figures (core.js)', phase: 'Build', schema: DONE }),
  () => agent(UI, { label: 'screen (18-exec-dashboard.js)', phase: 'Build', schema: DONE }),
])
const core = built[0], ui = built[1]
log('figures: ' + (core ? (core.ok ? 'done ' : 'NOT ok ') + core.commit : 'no result') + ' · screen: ' + (ui ? (ui.ok ? 'done ' : 'NOT ok ') + ui.commit : 'no result'))
if(!core || !ui) return { core, ui, integrate: null, stopped: 'a build worker returned nothing: integration not started' }

const INTEGRATE = `You are integrating the two halves of a management dashboard for a field-sales web app (a PWA used by two sales reps and a supervisor in Kuwait) and making it release-ready. Two workers have just finished:
- FIGURES — local branch exec-dash-core (worktree ${S}/dash-core-wt), commit ${core.commit}. Their report: ${JSON.stringify(core.summary)}. Tests: ${JSON.stringify(core.tests)}. Notes (defects found in the draft, contract differences, speed): ${JSON.stringify(core.notes || '')}
- SCREEN — local branch exec-dash-ui (worktree ${S}/dash-ui-wt), commit ${ui.commit}. Their report: ${JSON.stringify(ui.summary)}. Tests: ${JSON.stringify(ui.tests)}. Notes (hooks, places left marked for the new figures, contract differences): ${JSON.stringify(ui.notes || '')}

${RULES}

YOUR WORKTREE: ${S}/dash-wt (local branch exec-dash-v2, at 686c97a — both branches start there). Push with: git -C ${S}/dash-wt push -u origin exec-dash-v2:claude/wip-exec-dash-v2
YOUR HARNESS PORT OFFSET: +300. For the whole suite use the shifted runner: bash ${S}/run-shifted.sh ${S}/dash-wt 300 <an output folder under ${S}> "" 2   (4th argument: a www folder to test instead of the source, e.g. ${S}/dash-wt/dist after node scripts/build.js; last argument: how many at a time — keep 2). Its summary lists PASS/FAIL per harness; every one must be PASS with "ALL CHECKS PASSED".

WHAT TO DO
1. In your worktree: git merge --no-ff exec-dash-core, then git merge --no-ff exec-dash-ui (resolve any conflict by keeping both sides' intent). npm test must pass.
2. Wire the new figures into the screen (www/js/app/18-exec-dashboard.js): the forecast tile, the "same month last year" tile, the day-by-day chart from daily, the customer-activity tile and lists, the class chips from customers.accounts[i].cls, and the two drill-downs through UMCore.execDrill (a customer → what it bought and its invoices; a product → who bought it). Follow the contract and the screen's existing style; each ⓘ shows the source, the formula and this view's numbers; Arabic for every new string in www/js/i18n.js.
3. Complete tests/e2e/exec-dashboard.e2e.js with every check the contract's "Harness" section lists, including the ones that needed the new figures: the forecast equals the management report's formula for the same people; the drill-downs add up to their row; the day-by-day chart's last point equals the sales tile; last year with no sales file says so (never 0, never a percentage); the export carries the same figures; in Arabic no English text is left in the sheet; browsing writes nothing to the cloud; opening the sheet on a year of invented lines stays fast (measure it and keep a generous limit). Try each new check against a broken copy to see it fail.
4. Read the whole screen critically once more against the contract and the house rules as the supervisor would on his phone, in Arabic: is anything untrue, unexplained, cramped or mis-ordered? Fix it.
5. Add one bullet to CLAUDE.md's Layout list, in the style of the others ("Management dashboard (More → …, supervisor; v123): …" — the functions, the rules a later change must not break, the harness). Do not change APP_REV or sw.js (the release step does that after the owner approves).
6. Run everything: npm test; the whole browser suite on the source; node scripts/build.js; the whole suite on the built site. All must pass. If a harness that this work does not touch fails, run it again alone once: if it passes alone say so with the output of both runs, otherwise find the cause.
7. Take the screenshots the owner will see, at 390 px wide, deviceScaleFactor 2, with the harness's invented data, into ${S}/dash-shots/: the dashboard top in Arabic (filters + tiles), the charts in Arabic, the people and customers tables in Arabic, one "How it is calculated" sheet in Arabic, one drill-down in Arabic, and the top in English. Name them 01-…png in reading order. Look at each one before you finish.
8. Commit and push.

Return the structured result. In "notes": the list of screenshot files (full paths), anything the contract asks for that is not delivered and why, anything you saw that looks wrong but did not fix, and the measured opening time on a year of lines.`

phase('Integrate')
const integ = await agent(INTEGRATE, { label: 'integrate + test + screenshots', phase: 'Integrate', schema: DONE })
return { core, ui, integrate: integ }
