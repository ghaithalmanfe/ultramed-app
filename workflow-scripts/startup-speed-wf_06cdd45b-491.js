export const meta = {
  name: 'startup-speed',
  description: 'Measure how fast the app opens on a laptop and a phone (daily open and first open, a year of invented data), find what slows it, fix it without weakening any data protection, review independently',
  phases: [
    { title: 'Measure', detail: 'a startup harness with a year of invented data; profiles; the bottlenecks' },
    { title: 'Fix', detail: 'remove the bottlenecks, keep every safety harness green, budgets in the harness' },
    { title: 'Review', detail: 'independent: nothing lost, nothing slower, the numbers true' },
    { title: 'Fix2', detail: 'confirmed review findings' },
  ],
}
const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const WT = S + '/perf-wt'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EpSEKiFexe1n6qZfArrfpE'
const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const BOOL = { type: 'boolean' }
const ROWT = { type: 'object', properties: { scenario: STR, device: STR, shellMs: { type: 'number' }, dataShownMs: { type: 'number' }, cloudDoneMs: { type: 'number' }, notes: STR }, required: ['scenario', 'device', 'dataShownMs'] }
const MEASURE_SCHEMA = { type: 'object', properties: { summary: STR, harness: STR, dataset: STR, timings: { type: 'array', items: ROWT }, bottlenecks: STRS, proposals: STRS }, required: ['summary', 'harness', 'timings', 'bottlenecks', 'proposals'] }
const FIX_SCHEMA = { type: 'object', properties: { summary: STR, head: STR, before: { type: 'array', items: ROWT }, after: { type: 'array', items: ROWT }, changes: STRS, budgets: STRS, unitPass: BOOL, suitesSource: STR, suitesDist: STR, allGreen: BOOL, openIssues: STRS }, required: ['summary', 'head', 'before', 'after', 'changes', 'unitPass', 'suitesSource', 'suitesDist', 'allGreen'] }
const FINDING = { type: 'object', properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, file: STR, line: { type: 'number' }, what: STR, evidence: STR, fix: STR }, required: ['severity', 'file', 'what', 'evidence', 'fix'] }
const REVIEW_SCHEMA = { type: 'object', properties: { checked: STRS, timingsConfirmed: STR, findings: { type: 'array', items: FINDING } }, required: ['checked', 'timingsConfirmed', 'findings'] }

const BASE = `The UltraMed field-sales app (CLAUDE.md is loaded; its house rules decide every doubt). The owner's words (13 Nov): "I don't want the app to be slow to open — neither on the laptop nor on the mobile — and I don't want anyone to complain about losing information under any circumstances." Speed may NEVER be bought with safety: every protection of v121/v122 stays (the offline queue in memory and on the phone, three-way merges against the confirmed base, the refresh counter and holdRefresh, the visits archives and index, photo marks and their stores, the delete log, chat and memories unions, the full backup) and every harness that guards them stays green and unweakened.
Where: the worktree ${WT} (branch perf-v1 at 8670308 = the live v122 plus one plan fix; the new main screen is held and not part of it — never bring it back). Never push or merge into main; never commit node_modules (add files by path); commit messages end with:
${TRAILER}
What the published site is: \`node scripts/build.js\` → dist/ (the js/app files inlined into one index.html, the service worker sw.js caching the shell). Phones open the published site; measure that (dist), and the source too where useful.
Other workers run browser suites at the same time on this 4-CPU machine, so wall-clock numbers are noisy: take each timing several times and keep the median and the minimum, check \`uptime\` load, re-measure when the machine is quieter, and rely on CPU profiles (shares of time) to find causes. Run whole suites only with ${S}/run-shifted.sh <worktree> 1000 <outdir> "" 2 (source) or with <worktree>/dist as the 4th argument after a build; your own harness on port 8279.`

phase('Measure')
const measure = await agent(`${BASE}

Your part: MEASURE how fast the app opens, and find what makes it slow.
1. Invented data equal to a heavy year for the team (in tests/e2e/fixtures/, invented names only — tests/confidential.test.js must stay green): 3 people, about 300 clinics with doctors, 12 months of visits (several thousand, in visitsArch:YYYY-MM documents with the visitsIndex, the running month in visits), tasks, day plans, events, targets, products, 12 months of ERP sales files (tens of thousands of lines in erpRows chunks, generated like tests/e2e/fixtures/make-sales-xlsx.js does), chat and memories with a few hundred entries, some photo marks, the recycle bin and delete log.
2. A harness tests/e2e/startup-speed.e2e.js (port 8279, fake cloud as the other harnesses do it, fixed clock) that opens the BUILT site (dist) and measures, for a rep and for the supervisor: (a) the DAILY OPEN — the app was opened on this device before: the service worker is installed and the phone's copies (um_mirror:* etc.) are present; (b) the FIRST OPEN on a new device — nothing cached, then sign-in. Each on a LAPTOP profile (1440x900, no throttling) and a PHONE profile (390x844, CPU throttled 4x through CDP, and the fake cloud answering with 4G-like latency and bandwidth: a delay per read plus one proportional to the document's size). Times from navigation start: the shell painted, the person's own data visible on the Today screen (from the phone's copy on a daily open), the cloud's data merged and on screen. Also count the cloud reads, the bytes read, the work done in the browser's main thread (long tasks over 50 ms).
3. CPU profiles (CDP Profiler) of both opens on the phone profile: where the time goes (script parse/compile of the inlined page, JSON.parse of the phone copies, the boot sequence in 14-ui-boot.js / 04-sync.js, first renders, the sales files' rows, the photo store read at start, i18n, the service worker).
4. Return: the timings table (median of at least 3 runs per row, plus the minimum in notes), the dataset in one line, the bottlenecks ranked by time with evidence, and concrete proposals (each: what to change, the expected gain, and why it cannot lose or hide data).
Commit the harness and fixture on perf-v1 (the harness at this stage REPORTS the numbers and checks only correctness: the right person's data shown, no page errors; budgets come with the fixes).`, { label: 'measure startup', phase: 'Measure', schema: MEASURE_SCHEMA })
if (!measure) return { stopped: 'measure' }
log('Baseline: ' + measure.timings.map(t => t.scenario + '/' + t.device + ' ' + Math.round(t.dataShownMs) + ' ms').join(' · '))

phase('Fix')
const fix = await agent(`${BASE}

Your part: make the app OPEN FAST on the laptop and the phone, from the measurements below, without weakening any protection.
The measurement report:
${JSON.stringify(measure, null, 1)}

Targets (on the harness's PHONE profile, the published site): a daily open shows the person's own data within about 1.5 s and stays responsive (no main-thread task over ~200 ms in the first 3 s); a first open shows the sign-in screen within about 2 s and the person's data within about 5 s after signing in with a year of data. On the LAPTOP profile, about half those times. If a target cannot be met safely, say exactly what stands in the way.
Do:
1. Fix the ranked bottlenecks, biggest first. Ideas to weigh (only where the measurements show they matter, and only when nothing can be lost or shown wrong): show the phone's copy of the person's own data before the cloud answers (as v122 already does where it does); read less at start (do not parse what the first screen does not need; defer the sales rows, the archives of past months, the photo store, chat, until after the first paint or until a screen needs them, keeping every figure correct when it is shown); split long main-thread work; cache parsed copies; make the service worker serve the shell at once and update in the background (without breaking the "open twice" update or serving a mix of old and new files); trim the inlined page (e.g. load rarely used code — like the weekly deck already is — on demand). A deferred read must never let a save write over data it did not read: the save paths and merges keep working on complete data (load what a save needs before it saves), and the harnesses prove it.
2. The startup harness gets budgets as checks, generous enough to pass on GitHub's runners (which are slower and noisier than this machine) but failing on a clear regression; each budget check fails when you reintroduce the bottleneck (try it).
3. \`npm test\` green; every harness green on the source and the built site (\`${S}/run-shifted.sh ${WT} 1000 ${S}/suite-perf-src "" 2\`; after \`node scripts/build.js\`, \`${S}/run-shifted.sh ${WT} 1100 ${S}/suite-perf-dist ${WT}/dist 2\`); the rules scan (\`cd tests/rules && npm run scan\`).
4. CLAUDE.md: a short "Startup speed" bullet (what loads first, what is deferred and why it is safe, the budgets, the harness).
5. Commit on perf-v1. Return before/after timings (same scenarios), the changes, the budgets, the suites.`, { label: 'fix startup speed', phase: 'Fix', schema: FIX_SCHEMA })
if (!fix) return { stopped: 'fix', measure }

phase('Review')
const review = await agent(`Independent review of the UltraMed startup-speed changes before they go to the owner (CLAUDE.md is loaded; its house rules are the standard). The owner's words: the app must not be slow to open on a laptop or a phone, and no one may ever lose information. You did not write this code: be skeptical; report only what you confirm.
The code: ${WT} (branch perf-v1; compare with claude/hello-0r7ps7: \`git -C ${WT} diff claude/hello-0r7ps7...perf-v1\`). Do NOT modify that checkout: copy it (\`cp -r\` without node_modules and dist) to ${S}/review-perf and run there, with port offset 1200 (\`${S}/run-shifted.sh ${S}/review-perf 1200 ${S}/suite-review-perf "" 2\`).
The fix report: ${JSON.stringify(fix)}
Check: (1) NOTHING CAN BE LOST OR SHOWN WRONG because of a deferred or skipped read — a save made right after opening (before the deferred data arrived) on a slow phone, offline at open, a refresh racing the deferred load, two phones, a past month edited, a photo taken at once, the full backup taken right after opening, a sign-out/sign-in on a shared device; every figure on any screen opened early is right (never a partial month shown as the month). (2) The numbers are true: re-run the startup harness yourself (several runs, quiet machine if you can) and say whether the before/after timings hold. (3) The service worker: an update still arrives and never serves a mix of old and new files. (4) No harness weakened. For each problem: reproduce it and give the evidence; ranked findings with file:line and the fix.`, { label: 'review: no loss, really faster', phase: 'Review', schema: REVIEW_SCHEMA })
if (!review || !review.findings.length) return { measure, fix, review, fix2: null }

phase('Fix2')
const fix2 = await agent(`${BASE}

Fix the confirmed findings of the independent review of perf-v1:
${JSON.stringify(review.findings, null, 1)}
For each: check it is real (if not, say why); reproduce it with a check that fails before the fix; fix the root cause (safety first: if a speed-up cannot be made safe, take it out). Then \`npm test\`, the startup harness, and every harness on the source and the built site (offsets 1000 and 1100 as before), the rules scan. Commit on perf-v1. Return the structured result with the final before/after timings.`, { label: 'fix review findings', phase: 'Fix2', schema: FIX_SCHEMA })
return { measure, fix, review, fix2 }
