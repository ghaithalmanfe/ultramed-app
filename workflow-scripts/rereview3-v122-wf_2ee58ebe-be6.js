export const meta = {
  name: 'rereview3-v122',
  description: 'Third independent review of the v122 candidate, on what changed since the second review (past-month marks, photo stores and verdicts, screens and backup, chat refresh): 4 area reviewers, each finding checked by a refuter (two for high ones)',
  phases: [
    { title: 'Review', detail: 'four reviewers, one area each, read-only' },
    { title: 'Verify', detail: 'a reproducing refuter per finding; a code-trace refuter too for high ones' },
  ],
}

const WT = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/photo-wt'
const SCRATCH = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/rereview3-v122'
const SECOND = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/tasks/wu1s0gpvj.output'

const CONTEXT = `You are reviewing the next release (v122) of a field-sales web app (a PWA) used every day by two sales reps and a supervisor in Kuwait, often with no signal. The owner's first rule: nothing the team saved may be lost, duplicated or silently reverted, and the screen must never say something that is not true ("saved", "uploaded", "up to date", "lost", "kept on this phone" only when it is so). CLAUDE.md in the worktree explains the layout, storage (Firestore 'state' documents, the outbox, the phone copies um_mirror:*, the delete log, visits = live 'visits' + 'visitsArch:YYYY-MM' + 'visitsIndex'), the tests, and (bullet "Visit photos with no signal (v122)") this release's design.

THE CHANGE UNDER REVIEW
- Worktree (read-only for you): ${WT}  (branch photo-offline-v1, head bf18c1e = the v122 release candidate). The live version is v121 = commit 6840099.
- Two independent reviews ran before. The SECOND one (17 findings, all confirmed) ran on 44591d4; everything since then fixes its findings: \`git -C ${WT} diff 44591d4 bf18c1e -- www tests\` and \`git -C ${WT} log --oneline 44591d4..bf18c1e\` (3d1421f the photo findings; 0c8e91a + merge 178ed06 the chat findings). Its findings with scenarios: ${SECOND} (JSON; list result.survived; read with node). YOUR JOB: (a) check that each of those fixes really holds in every path, and (b) hunt for NEW defects the fixes introduced. Do not re-report a second-review finding that is now fixed; DO report it if the fix does not hold (say so). Defects outside this delta that were present in v121 are out of scope unless the delta makes them worse.
- What the delta does, in short:
  * 04-sync.js — patchVisitPhotosNow no longer takes a month's new index revision as the phone's own (its copy of the month is re-read at the next refresh); the index bump for patched months is owed in _visitsIdxOwed and done by bumpVisitsIndex (end of each patch, an index-only patchVisitPhotos([]) from the settle round, and Pass C of persistVisitsInner, which also clears owed months it wrote); memOnlyLanded says "Saved — it reached the cloud" for a photo only when _memPhotoLanded counts a memory-only photo that landed (memOnlyPhotoLanded, called from photoLanded); cloudGet(key, src) sets src.cloud only when the cloud answered that call.
  * 12-reports.js — photoDb resolves the database, null (no IndexedDB, or it never opened on this phone: localStorage um_idbOk absent) or false (it opened here before but not now: error, missing store, or no answer within 5 s; _photoDbP reset so the next call tries again; a late success is closed); photoReadKept counts false (and a throwing localStorage scan) as not read (_photoRead stays false: no lost verdicts); photoFindKept(id) reads the stores now for one photo (another tab) → record | null | undefined (no answer); settlePhotosOnce: a cloud miss reads the stores again — found → kept and uploaded from here, undefined → no verdict this round, null → lost (_photoLost; the verdict is pushed again every round until it lands); _photoGone: photos let go of this session are never read back from a store whose delete lags (photoForget removes the web-storage copy first); photoMark adds at: Date.now(); photoWaitHTML and the lightbox say a waiting photo's age after PHOTO_STALE_DAYS (3) when this phone does not hold it; loadTeam(keys) returns how each list was read ('cloud' | 'queued' | 'kept' | 'phone'), clears the key's _mirrorUsed/_loadFailed before its read, de-duplicates by id on every read; teamMerge keeps one entry per id from both lists; refreshTeam waits up to 5 s for a save that ran during the read, reads that list again, and says "Up to date" only when every list on screen was just read and nothing of this phone's for it is saving or queued.
  * 13-exports.js — openFullBackup reads this phone's kept photos BEFORE the cloud read (heldAtStart); after the read, a held photo the read did not find and this phone no longer waits on is read again from the cloud and added among the cloud's documents, else kept apart (bkPending(readKeys, held)).
  * 08-team-orders.js — removeEditPhoto calls memOnlyLanded(null) after photoForget (the red bar goes quietly).
  * i18n.js — two PATTERNS for the age texts.
  * tests: tests/e2e/photo-lifecycle.e2e.js (new, port 8274: ARCHREV, ARCHLOSS, IDXFAIL, TABS, IDBERR, IDBNEVER, HANG, LOSTFAIL, AGE, BACKUP, MEMRM), tests/e2e/team-chat.e2e.js (port 8272: RF*, RN*, D*). All 26+1 harnesses and 343 unit tests passed on the parts before the merge.
- Known and accepted (do NOT report): (1) docs/sync-findings.md P1 — a visits save of a stale copy still wins record by record within the refresh window (v121); (2) chat and memory photos are not queued for a later upload; (3) any visit is only in memory for the seconds until its first save attempt settles; (4) an upload that lands after its photo was removed or given up can leave an unused photo:<id> document (also after a failed IndexedDB delete, at the next start); (5) a queued chat message has no "waiting" mark and the offline toast shows at most once a minute (v121); (6) the memories document could one day pass 1 MiB; (7) the weekly deck shows a waiting or lost photo's thumbnail with no note; (8) the "visit not saved" toast on a full phone is Arabic-only (v121); (9) a photo kept only in memory is lost if the app is closed before it uploads (said; afterwards "lost" — or, on a phone that could not keep its device mark, the age note after 3 days); (10) the age note relies on the clock of the phone that took the photo; (11) if a chat read fails and the phone has no copy of the chat, the list on screen is empty (v121); (12) while a queued chat stays stuck, the 20-second refresh only retries the upload and skips the read (v121).

RULES FOR YOU
- Read-only: never edit, commit or push in ${WT} or any other worktree or branch. Write scratch files only under your own folder given below.
- To run a browser harness, run a COPY of it from your scratch folder with its port changed to one of YOUR ports given below and WWW=${WT}/www (helpers: ${WT}/tests/e2e/_env.js, require them by absolute path; require('playwright') works from any directory, never install it). tests/e2e/photo-lifecycle.e2e.js is the best base for photo scenarios (two tabs, IndexedDB probes, a failing index write, backups); tests/e2e/team-chat.e2e.js for chat. Stop servers you start. Never run a committed harness on its own port. No internet; never contact a real service.
- The machine has 4 CPUs shared with other reviewers and a full test run: prefer a focused script over whole harness suites, and allow for slowness before calling something a hang.
- Report only concrete, verified problems: a real path the app takes, with file:line in ${WT}, the exact scenario (which phone, what order of events, what the person sees), how you verified it (script output, or a precise step-by-step trace), and a fix. No style, naming or refactor suggestions. If nothing survives your own checking, return an empty list. Keep within about 40 minutes.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          scenario: { type: 'string' },
          verification: { type: 'string' },
          fix: { type: 'string' },
          second_review_ref: { type: 'string' },
        },
        required: ['title', 'severity', 'file', 'scenario', 'verification'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
    evidence: { type: 'string' },
    severity_if_real: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
  },
  required: ['refuted', 'reasoning'],
}

const AREAS = [
  { key: 'marks-months', ports: '8900-8909', focus: `PAST MONTHS, THE INDEX AND THE SAVE CHAIN: patchVisitPhotos / patchVisitPhotosNow / bumpVisitsIndex / visitsIndexOwed / _visitsIdxOwed / visitDocOf and Pass C of persistVisitsInner in www/js/app/04-sync.js; loadVisits (how a refresh decides which months to read again from visitsIndex revisions, and what it does while a save or patch runs: _visitsSaving, _localGen, _localSaving, holdRefresh); the json restring of _visitsArch[m] after a patch. Hunt for: a month this phone never reads again or reads stale for long; another phone's edit hidden or undone; a visit dropped, doubled or moved by Pass B because the phone's copies of two months disagree; an owed bump lost, repeated forever, or writing a wrong count n; the index-only patch starving or holding the refresh; any new way the 2nd-review ARCHREV / ARCHLOSS / IDXFAIL defects still happen (month rollover, a month that failed to load, two patches in a row, a save and a patch overlapping, the supervisor's phone).` },
  { key: 'stores-verdicts', ports: '8910-8919', focus: `THIS PHONE'S PHOTO STORES AND THE LOST VERDICT: photoDb (null / false / db, um_idbOk, the 5-second limit, the reset of _photoDbP, a late success), photoDbDo, photoKeep, photoForget, photoReadKept, photoFindKept, photoUpload, photoLanded, retryPhotos, settlePhotos / settlePhotosOnce (_photoLanded, _photoChecked, _photoLost, _photoGone, _photoSession, the device look-up) in www/js/app/12-reports.js. Hunt for: a photo called lost while some store or tab of this phone holds it; a photo never called lost that no store holds (a phone without IndexedDB, private mode, a full phone, um_idbOk missing or stale, localStorage throwing); a photo uploaded again and again, or never uploaded, by the first or a second tab; a verdict loop that never settles or that writes every round; photoKeep / photoForget slowed or broken by the new photoDb (every call re-opening a failing database, 5 s waits stacking up on the log-visit path, the "Saving the visit…" lock held long); a landed photo read back into _photoKept; an IndexedDB connection leaked or a versionchange blocked.` },
  { key: 'screens-backup', ports: '8920-8929', focus: `WHAT THE SCREENS SAY AND THE FULL BACKUP: the age note in photoWaitHTML and the lightbox (showLightbox), PHOTO_STALE_DAYS, photoWaitDays, photoStaleText, the two new PATTERNS in www/js/i18n.js (call \`const T = require('${WT}/www/js/i18n.js').tr\` from node to check the real strings, and check how the photo-wait line is split and translated part by part); every other reader of visit photos that the new 'at' field reaches (exports, CSV, the weekly deck, the daily e-mail, backups, restore, the gallery); openFullBackup / bkPending / readCloudForBackup in www/js/app/13-exports.js (heldAtStart, the re-read of a photo that landed, the file's two parts, verifyBackupFile, the pending card's words); memOnlyLanded / memOnlyRecheck / _memPhotoLanded / renderMemOnlyBar in 04-sync.js and removeEditPhoto in 08-team-orders.js. Hunt for: a false or missing "Saved — it reached the cloud"; the red bar left up or gone too early; an age note that is untrue (a photo held on this phone, a photo already uploaded, a lost photo) or English to an Arabic user; a backup file missing, doubling or mislabelling a photo, failing to verify, or waiting forever; any v121 behaviour lost for a visit with no photo.` },
  { key: 'chat-refresh', ports: '8930-8939', focus: `TEAM CHAT AND MEMORIES AFTER THE CHAT FIXES: loadTeam(keys) and its how values, refreshTeam (the wait of up to 5 s, the second read, the toast choice), teamMerge (one entry per id, first copy wins, entries without id), persistTeam / persistTeamNow, sendChat, saveMemory / _memSharing, the 20-second refresh's loadTeam, flushOutbox for 'chat' / 'memories', cloudGet(key, src) and the clearing of _mirrorUsed / _loadFailed for these keys (check every other reader of those flags in 04-sync.js and 03-gate.js still sees the truth, including the daily backup gate and persistNow's guards), in www/js/app/12-reports.js and 04-sync.js. Hunt for: a message or memory lost, doubled, resurrected, or reordered on screen; a toast that says "Up to date", "No connection" or "still uploading" when it is not so; a Refresh that hangs, double-reads in a loop, or overwrites a newer list with an older one; the first copy kept by the de-duplication being the wrong one (an edited or deleted memory, a memory with its photo vs one without); two phones posting at once.` },
]

const lens = kind => kind === 'reproduce'
  ? `Try to REPRODUCE this reported defect for real: the smallest scenario that shows it — a node script against ${WT}/www/js/core.js for pure parts, or a copy of a harness in your scratch folder (your port below, WWW=${WT}/www) driving the real app with a fake cloud. Default to refuted=true if you cannot make it happen, or if the code does not take that path. If it happens, say exactly what you ran and saw, and the realistic severity.`
  : `Try to REFUTE this reported defect by tracing the code precisely: read every function on the claimed path in ${WT} (file:line) and check each step against what the code really does, including guards, timeouts, retries and the order of awaits. Default to refuted=true if any step is wrong or the scenario cannot happen in real use. If every step holds, give the file:line chain and the realistic severity.`

const results = await pipeline(
  AREAS,
  (a) => agent(`${CONTEXT}

YOUR AREA: ${a.focus}

Your scratch folder: ${SCRATCH}/${a.key}/ (create it). Your ports for harness copies: ${a.ports}.
Return every verified problem in your area as structured findings, most severe first.`, { label: `review:${a.key}`, phase: 'Review', schema: FINDINGS }),
  (rev, a, ai) => parallel(((rev && rev.findings) || []).map((f, fi) => () => {
    const kinds = f.severity === 'high' ? ['reproduce', 'code-trace'] : ['reproduce']
    return parallel(kinds.map((kind, ki) => () => agent(`${CONTEXT}

A reviewer reported this defect in the release candidate:
TITLE: ${f.title}
SEVERITY CLAIMED: ${f.severity}
WHERE: ${f.file}${f.line ? ':' + f.line : ''}
SCENARIO: ${f.scenario}
HOW THE REVIEWER VERIFIED IT: ${f.verification}
${f.fix ? 'SUGGESTED FIX: ' + f.fix : ''}
${f.second_review_ref ? 'SECOND-REVIEW REFERENCE: ' + f.second_review_ref : ''}

${lens(kind)}

Your scratch folder: ${SCRATCH}/verify-${a.key}-${fi}-${kind}/ (create it). Your one port for a harness copy: ${8950 + ai * 12 + (fi % 6) * 2 + ki}.`, { label: `verify:${a.key}#${fi}:${kind}`, phase: 'Verify', schema: VERDICT })))
      .then(vs => ({ area: a.key, finding: f, verdicts: vs.filter(Boolean) }))
  }))
)

const all = results.filter(Boolean).flat().filter(Boolean)
const kept = all.filter(x => x.verdicts.length === 0 || x.verdicts.some(v => !v.refuted))
const dropped = all.filter(x => !kept.includes(x))
log(`${all.length} findings reported, ${kept.length} survive verification, ${dropped.length} refuted`)
return {
  survived: kept.map(x => ({ area: x.area, title: x.finding.title, severity: x.finding.severity, file: x.finding.file, line: x.finding.line, scenario: x.finding.scenario, verification: x.finding.verification, fix: x.finding.fix || '', ref: x.finding.second_review_ref || '', verdicts: x.verdicts.map(v => ({ refuted: v.refuted, severity: v.severity_if_real || '', reasoning: v.reasoning, evidence: v.evidence || '' })) })),
  refuted: dropped.map(x => ({ area: x.area, title: x.finding.title, why: x.verdicts.map(v => v.reasoning).join(' | ').slice(0, 800) })),
}
