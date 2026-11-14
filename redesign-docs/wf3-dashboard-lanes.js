export const meta = {
  name: 'redesign-3-dashboard-lanes',
  description: 'Premium redesign, step 3: the executive dashboard and every module of the app redesigned in three lanes, desktop and phone, English and Arabic',
  phases: [
    { title: 'Dashboard', detail: 'executive overview on desktop, field home on the phone, on the restored main screen' },
    { title: 'Lane A', detail: 'field: visit logging, doctors and prescriptions, calendar, team chat and KPI' },
    { title: 'Lane B', detail: 'accounts and catalog: clinics, ERP account links, products and playbook, sales analysis and coverage' },
    { title: 'Lane C', detail: 'management and admin: reports, ERP import, admin and deck sheet, backups and recovery' },
  ],
}
const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const WT = S + '/redesign-wt'
const SPEC = S + '/redesign-src/unz/ULTRAMED_PREMIUM_REDESIGN.md'
const DOCS = S + '/redesign-docs'
const TRAILER = 'Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE'
const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const BOOL = { type: 'boolean' }
const FOUND = args.foundHead
const FOUND_NOTE = args.foundNote || ''

const BASE = `The UltraMed field-sales PWA (CLAUDE.md is loaded; its house rules decide every doubt). THE OWNER'S REQUEST (13 Nov): "Read ULTRAMED_PREMIUM_REDESIGN.md completely and execute every instruction in it. Do not just create a proposal or describe the changes. Implement the complete redesign directly in the existing codebase. Preserve all existing functionality, data, backend integrations, and business logic. Work autonomously until the redesign is implemented, tested, and the production build succeeds. Do not stop after redesigning the dashboard. Redesign the entire application for desktop and mobile. At the end, show me the actual desktop and mobile results and a detailed implementation report."
THE SPEC (the contract): ${SPEC} — read it completely, then the sections that concern your part again.
The owner's decisions: ${DOCS}/owner-decisions.md (read it: decision 2 renames every "Sales" label that really shows ORDERS LOGGED IN THE APP to "Orders logged in the app" / "الطلبات المسجّلة بالتطبيق" — figures unchanged — wherever your part shows one).
DONE BEFORE YOU (on branch redesign-v1, commit ${FOUND}): the data-safety release v123 + the held main screen restored + the DESIGN SYSTEM and the SHELL (${FOUND_NOTE}). Read first, in the checkout: docs/design/design-system.md (tokens, components, class names, patterns, string rules, the screenshot tool tests/e2e/tools/shots.js — USE these; never invent new colors, sizes, radii or shadows), docs/design/brand-extraction.md, docs/design/ui-inventory.md (§0 rules, §9 your module's files/screens/harnesses/DOM contracts, §10 i18n, §13 lanes and line ranges, §14 risks R1–R34, Appendix B), and ${DOCS}/modules-brief.txt (your module's section).
What the spec does not know about this codebase:
- Vanilla JS, no framework, no lint or type checker (node --check every .js you change). www/index.html = the views' markup and ALL the CSS; www/js/app/*.js render every screen as HTML strings (one global scope; a top-level name declared twice across files breaks the build); www/js/core.js = business logic and figures — NOT edited; www/js/i18n.js = exact-string English→Arabic dictionary (+ PATTERNS): a visible English string you add or reword needs its Arabic (the team's terms) in YOUR block, or English shows on the Arabic screen; harnesses assert many strings word for word (R1–R4, R22). scripts/build.js = the production build.
- Presentation only: markup, CSS, icons, layout, wording that the owner's decisions require. Every field, step, action, permission, figure, save path and message keeps its behaviour. No edits to core.js, 04-sync.js, firestore.rules, scripts/. A logic bug you notice goes in your result (bugsNoticed), unchanged. Truth rules on every figure: only what the existing functions give; a figure that does not exist is said in words; never a made-up value, trend or comparison; no fake data in the app.
- The browser harnesses (tests/e2e/*.e2e.js) must stay green and NOT be weakened: keep ids, inline onclick handlers, data-* hooks, element order and visible texts they rely on (the inventory lists them). A selector or a layout assertion that must change because the design changed: change it on purpose, keep what it verifies, list it in selectorEdits. Never delete or loosen a figure, truth, save or safety check.
- Never push, merge into main or deploy (the owner approves every deploy). Never commit node_modules (add files by path). Commit messages end with:
${TRAILER}
- Browser: Playwright resolves globally (require('playwright'); NODE_PATH=/usr/local/lib/node_modules_global if needed).
- This 4-CPU machine runs other workers at the same time. Run harnesses only shifted, with YOUR offset: one harness ${S}/run-one-shifted.sh <checkout> <offset> <name> [WWW]; a whole suite ${S}/run-shifted.sh <checkout> <offset> <outdir> "" 2 (source) or <checkout>/dist as the 4th argument after node scripts/build.js. A harness that fails: read why; rerun it alone once only to tell a port/timing clash from a real failure.
- Quality bar (spec §1, §2, §13): premium, calm, confident, clinical, unmistakably UltraMed — not a generic admin template, not a spreadsheet, not crowded; green is an accent used with discipline; hierarchy through type, space and alignment; desktop and phone are two designed experiences (desktop uses the width: list + detail, tables with columns, filter bars; phone: one column, stacked rows, large targets, the primary action within reach). Look at your screenshots like the owner will.`

const MOD_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, screensDone: STRS, renamedSalesLabels: STRS, selectorEdits: STRS, stringsAdded: STR, harnesses: STR, fullSuite: STR, screenshots: STRS, bugsNoticed: STRS, openIssues: STRS, allGreen: BOOL }, required: ['summary', 'head', 'screensDone', 'selectorEdits', 'harnesses', 'screenshots', 'allGreen'] }

const DASH = { key: 'dashboard', title: 'the executive dashboard (Today) — desktop executive overview and phone field home', off: 2300 }
const LANES = [
  { key: 'A', title: 'field', section: 'LANE A: field', off: 2500, wt: S + '/rd-laneA-wt', branch: 'redesign-laneA', mods: [
    { key: 'visit', title: 'Visit logging — the 7-step log form, call log, order only, edit visit, history, delete, photos and lightbox, the full visit log and photo gallery, follow-up sheets', spec: '§6.2 and §7.3' },
    { key: 'doctors', title: 'Doctors and prescriptions — the database, the prescriptions growth tab, doctor profile, records, data entry, contact import, prescription types editor, decision map', spec: '§6.4' },
    { key: 'calendar', title: 'Calendar and planner — month and week views, agenda (the phone default), date-range insights, events, the date planner, week/month plan', spec: '§6.7 and §7.5' },
    { key: 'team-kpi', title: 'Team chat and memories; KPI scorecard and KPI settings; Month by month; Requests, escalations and stands', spec: '§6.6 (and the extra areas in ui-inventory §8)' },
  ] },
  { key: 'B', title: 'accounts and catalog', section: 'LANE B: accounts & catalog', off: 2700, wt: S + '/rd-laneB-wt', branch: 'redesign-laneB', mods: [
    { key: 'clinics', title: 'Clinics — the clinics dashboard and list, search and filters, the clinic card/profile with its doctors, visits, orders, follow-ups and ERP accounts, add/edit clinic, clinics without a name, doctors without a name, deleted/re-create, add to plan, delete, missing and manage clinics', spec: '§6.3 and §7.4' },
    { key: 'erplinks', title: 'ERP account links — the editor, "Check before saving" preview, save and undo, the accounts list', spec: '§6.8 (sources) and ui-inventory §8' },
    { key: 'products-playbook', title: 'Products and catalog tools (list, add product, product detail and materials, edit product, catalog gaps, duplicate SKUs, category guides) and the Selling playbook', spec: '§6.5 and §6.9' },
    { key: 'analysis-coverage', title: 'Clinic sales analysis (target share, purchase history, next-product recommendations only where they exist, filters and dates) and the Coverage board', spec: '§6.8' },
  ] },
  { key: 'C', title: 'management and admin', section: 'LANE C: management & admin', off: 2900, wt: S + '/rd-laneC-wt', branch: 'redesign-laneC', mods: [
    { key: 'reports', title: 'Reports — the Report view with week/month/quarter/all-time/custom ranges, coverage, compare, sales coach, every metric and chart, team comparison, top products, no-order reasons, performance evaluation, month reports and month close, the pro report overlay and its documents, export/share/PDF/print', spec: '§6.10' },
    { key: 'erp', title: 'ERP import, DSR targets, salesmen map, returns policy, reconciliation, product movement', spec: 'ui-inventory §8 (extra areas)' },
    { key: 'admin-deck', title: 'Admin panel — team, targets and benchmarks, territory (shared/gov chips, distribution upload), catalog prices, data health and recycle bin, e-mail reports, staff form — and the weekly management deck sheet (the sheet only; the PptxGenJS builder is untouched)', spec: 'ui-inventory §8 (extra areas)' },
    { key: 'backups', title: 'Export, automatic backups, full backup, find missing clinics, restore, device copy', spec: 'ui-inventory §8 (extra areas)' },
  ] },
]

function modulePrompt(lane, m, i) {
  const first = i === 0, last = i === lane.mods.length - 1
  return `${BASE}

YOUR PART: lane ${lane.key} (${lane.title}), module ${i + 1} of ${lane.mods.length}: ${m.title} (spec ${m.spec}).
Your module's files and line ranges: docs/design/ui-inventory.md §9 and §13 (lane ${lane.key}) and ${DOCS}/modules-brief.txt — ranges owned by another lane or by the dashboard in the same file are not yours: never edit them (the lanes are merged later; overlapping edits break the merge). Your CSS only inside /* === ${lane.section} === */ … its END line in www/index.html; your Arabic only in the lane ${lane.key} block of www/js/i18n.js (shared component classes live in the design system — if one is missing, write a lane-local class in your section and say so in openIssues, never edit the design system's rules).
${first ? `Where: create your lane's worktree first: git -C ${WT} worktree add ${lane.wt} -b ${lane.branch} ${FOUND} (from the foundation commit, NOT from the branch tip — the dashboard is being built on redesign-v1 at the same time).` : `Where: your lane's worktree ${lane.wt} (branch ${lane.branch}) — the previous module of this lane is committed there; build on it.`}
Do: redesign EVERY screen, sheet, form, table/list, chart, menu, empty, loading and error state of this module on the design system — desktop (1024–1920) and phone (360–430), English and Arabic (RTL), rep and supervisor where they differ: spec §${m.spec} names what must be preserved and what to improve; the spec's §7.4 (lists and tables on the phone), §8 (responsive), §10 (accessibility: labels for icon-only controls, focus, status not by color alone) and §3.5 (one icon family) apply everywhere. Inline styles and hard-coded colors in your ranges move to classes and tokens; emoji used as interface icons become the app's line icons (keeping the translations working, R3). Apply the owner's decision 2 wherever your module labels app-logged orders as sales (list each in renamedSalesLabels; update a harness string that asserts the old wording on purpose).
Verify: npm test; node --check on every changed .js; node scripts/build.js; the harnesses that touch your module (ui-inventory §9 / Appendix A) one by one with ${S}/run-one-shifted.sh ${lane.wt} ${lane.off} <name>, and smoke-all; screenshots with tests/e2e/tools/shots.js of every screen and sheet of your module at 1440 and 390 (the module's main screen also at 360, 430, 768, 1024 and 1920), English and Arabic, rep and supervisor where they differ, into ${S}/redesign-shots/lane${lane.key}-${m.key}/ — LOOK at every one and fix what is off (overflow, clipping, misalignment, weak hierarchy, contrast, small targets, untranslated strings, old-look leftovers) before you commit.${last ? `
You are the LAST module of lane ${lane.key}: after your commit, run the whole suite on the source of ${lane.wt} (${S}/run-shifted.sh ${lane.wt} ${lane.off} ${S}/rd-lane${lane.key}-src "" 2) — every harness green (fix what your lane broke; a harness your lane did not touch that fails: rerun alone once, then report) — and record it in fullSuite.` : ''}
Commit by path (one or more commits). Return the structured result.`
}

function dashPrompt() {
  return `${BASE}

YOUR PART: ${DASH.title} — spec §5 (desktop executive overview: §5.1 header with the existing reporting periods, §5.2 KPI area from existing data only, §5.3 analytics, §5.4 Action Center, §5.5 recent activity and today's plan, §5.6 composition) and §6.1 + §7.2 (the phone home: today's plan and next appointment, quick Log visit, follow-ups due, the sales/target summary, recent activity, then secondary analytics — not the desktop in a narrow column). Both roles: a rep sees only her own figures and work; the supervisor sees the team (one row per person of REPS, himself included when he sells) with the person switch (the restored main screen already has it).
Where: the main worktree ${WT} (branch redesign-v1, at ${FOUND}); the lanes work in their own worktrees from the same commit — you own the Today screen: 05-today-calendar.js's Today part (not the calendar ranges 1-281 and 832-976, which belong to lane A), the dashboard ranges of 10-doctors-products.js and 12-reports.js named in ui-inventory §13, the Today markup in index.html, /* === DASHBOARD === */ for CSS and the dashboard block of i18n.js.
Data: the restored main screen (ui-inventory §12; core functions UMCore.execDashboard, execWeek, execDrill, planVisitKeys, kpiScorecard, monthlyTrend, crossInvoices, missedPlans; app functions bestMonthRevenue, teamTargetNow, visibleDueClinics, renderPlanList …) already computes every figure with the house's truth rules and was reviewed twice — KEEP its figures, its words for what is not measured, its "How it is calculated" sheets and its person switch; redesign its presentation into the spec's hierarchy: the most important KPI group first (sales vs target with pace, the figures the data supports: visits, clinics covered, contacts seen, orders logged in the app (owner's decision: never called sales), overdue follow-ups), the main analytics second (sales over time and the team comparison from existing data — e.g. execWeek / monthlyTrend; draw charts with the app's own SVG helpers, unique gradient ids R23, clear labels and units, an empty state when there is no data), the Action Center and recent activity third (overdue follow-ups, missed planned visits, tasks due today, clinics needing coverage, customers to act on from execDashboard().act — each item opens its existing screen or sheet; urgency colors used sparingly, never color alone), today's plan easy to find with Plan today. Keep every element the harnesses read (#targetCard and its text order §12.5, #planList, #missedList, #dueList, #taskList with the quick add, #recentVisits with See all, #erpNudge, #visitsNudge, #occasionsCard, #docCardsNudge, the ms* ids and data-ms keys) — restyled, not removed; render under 150 ms (R28).
Verify: npm test; node --check; node scripts/build.js; main-screen and main-screen-cases (their layout checks re-specified on purpose for the new shell; every figure, truth and leak check kept — list the edits), the six target-card harnesses (audit-fixes, clinics-vs-today, hardening, rollover, seller-parity, shared-accounts), kpi and smoke-all, each with ${S}/run-one-shifted.sh ${WT} ${DASH.off} <name>; then the whole suite on source (${S}/run-shifted.sh ${WT} ${DASH.off} ${S}/rd-dash-src "" 2). Screenshots with tests/e2e/tools/shots.js: Today for the supervisor (team and one person) and for a rep, at 1920, 1440, 1280, 1024, 768, 430, 390, 360, English and Arabic, plus the How-it-is-calculated sheet and the Action Center list, into ${S}/redesign-shots/dashboard/ — LOOK at every one and refine until it reads like a premium executive product at a glance.
Commit by path. Return the structured result.`
}

async function runLane(lane) {
  const out = []
  for (let i = 0; i < lane.mods.length; i++) {
    const m = lane.mods[i]
    const r = await agent(modulePrompt(lane, m, i), { label: `lane ${lane.key}: ${m.key}`, phase: `Lane ${lane.key}`, schema: MOD_SCHEMA })
    if (!r) { log(`lane ${lane.key} stopped at ${m.key} (no result)`); out.push({ key: m.key, stopped: true }); break }
    log(`lane ${lane.key} · ${m.key}: ${r.allGreen ? 'green' : 'NOT green'} — ${r.head}`)
    out.push(Object.assign({ key: m.key }, r))
  }
  return { lane: lane.key, wt: lane.wt, branch: lane.branch, results: out }
}

const [dash, laneA, laneB, laneC] = await parallel([
  () => agent(dashPrompt(), { label: 'dashboard', phase: 'Dashboard', schema: MOD_SCHEMA }),
  () => runLane(LANES[0]),
  () => runLane(LANES[1]),
  () => runLane(LANES[2]),
])
return { dash, lanes: [laneA, laneB, laneC] }
