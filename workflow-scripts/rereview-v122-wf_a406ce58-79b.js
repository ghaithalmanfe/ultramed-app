export const meta = {
  name: 'rereview-v122',
  description: 'Second independent review of the v122 release candidate (offline photos, overlapping saves, chat and memories): 5 area reviewers, each finding checked by a refuter (two for high ones)',
  phases: [
    { title: 'Review', detail: 'five reviewers, one area each, read-only' },
    { title: 'Verify', detail: 'a reproducing refuter per finding; a code-trace refuter too for high ones' },
  ],
}

const WT = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/photo-wt'
const SCRATCH = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/rereview-v122'
const FIRST = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/tasks/wyebwlkcy.output'

const CONTEXT = `You are reviewing the next release (v122) of a field-sales web app (a PWA) used every day by two sales reps and a supervisor in Kuwait, often with no signal. The owner's first rule: nothing the team saved may be lost, duplicated or silently reverted, and the screen must never say something that is not true ("saved", "uploaded", "up to date", "kept on this phone" only when it is so). CLAUDE.md in the worktree explains the layout, storage (Firestore 'state' documents, the outbox, the phone copies um_mirror:*, the delete log), the tests, and (bullet "Visit photos with no signal (v122)") this release's design.

THE CHANGE UNDER REVIEW
- Worktree (read-only for you): ${WT}  (branch photo-offline-v1, head 44591d4 = the v122 release candidate).
- The live version is v121 = commit 6840099. The whole release: \`git -C ${WT} diff 6840099 44591d4 -- www\`; commits: \`git -C ${WT} log --oneline 6840099..44591d4\`.
- A first independent review (24 findings, all confirmed) was run on ef33bf9; everything since ef33bf9 fixes those findings: \`git -C ${WT} diff ef33bf9 44591d4 -- www\` (d021e8a the save and mark life cycle; 8fe4251 + ca0f031 team chat and memories; 5e3ff29 what the screens say; c1336b7 the merge and two joins; 44591d4 the version). The first review's findings, with scenarios: ${FIRST} (JSON, list result.survived; read with node). Check that those fixes really hold, and hunt for NEW defects the fixes introduced. Do not re-report a first-review finding that is now fixed; DO report it if the fix does not hold (say so).
- Design in short: a visit is saved first and never waits for an upload; each photo is {id, thumb, pending:true, dev} on the visit (photoMark; dev = this phone's um_device); the full photo is kept on the phone (_photoKept: IndexedDB um_photos, else localStorage um_photo:<id>, else memory only) and uploaded in the background to photo:<id>, retried from flushOutbox (every 20-second refresh). When it lands the phone drops its copy and settlePhotos clears THAT mark only via patchVisitPhotos (04-sync.js: a transaction on the document holding the visit, in the visits save chain; a month archive also moves its visitsIndex revision). Marks only move forward: waiting → lost → uploaded (UMCore.settlePhotoMark / settlePhotoMarks, also inside mergeById). Each round the phone also settles marks it still owes: a landing whose patch did not land, "waiting" put back by an older app version, and its own waiting photo it no longer holds (looked up once per session in the cloud: there → uploaded, absent → lost). persistVisitsInner records what it stored as the exact string each transaction committed (writtenStr). Log visit: the double-tap guard belongs to the form (_logFormGen bumped by prepLogView); the form being saved is locked ("Saving the visit…"), a new form saves at once, the end of a save moves to Today only from that same form. Team chat and memories: per-list save counters (_teamGen/_teamSaving) so a refresh never drops a list with a save on its way or queued; a save never puts back the copy it took; a share guarded per memory clears only its own sheet; honest toasts. Screens: per-photo counts under thumbnails, lost notes, gallery badges, lightbox fallback to the enlarged thumbnail with a note, red bar while a photo is only in memory, flush toast only when the queue is empty and naming photos still on their way, full backup carrying photos still kept on the phone.
- Known and accepted (do NOT report): (1) docs/sync-findings.md P1 — a visits save of a stale copy still wins record by record (v121; a photo landing no longer triggers it); (2) chat and memory photos are not queued for a later upload (the send gives up after 20 s and keeps the draft); (3) any visit is only in memory for the seconds until its first save attempt settles; (4) an upload that lands after its photo was removed, or after a give-up, can leave an unused photo:<id> document; (5) a queued chat message has no "waiting" mark and the offline toast shows at most once a minute (v121); (6) the memories document could one day pass 1 MiB with many inline thumbnails; (7) the weekly deck shows a waiting or lost photo's thumbnail with no note; (8) the "visit not saved" toast on a full phone is Arabic-only (v121); (9) a photo kept only in memory is lost if the app is closed before it uploads (the toast and the red bar say so; afterwards the visit says "lost").
- Harnesses of this release: tests/e2e/visit-photo-offline.e2e.js (8270), visit-photo-sync.e2e.js (8271), team-chat.e2e.js (8272), photo-honesty.e2e.js (8273); all 26 harnesses and 343 unit tests pass on source and on the built site (node scripts/build.js → dist).

RULES FOR YOU
- Read-only: never edit, commit or push in ${WT} or any other worktree or branch. Write scratch files only under your own folder given below.
- To run a browser harness, run a COPY of it from your scratch folder with its port changed to one of YOUR ports given below and WWW=${WT}/www (helpers: ${WT}/tests/e2e/_env.js, require them by absolute path; require('playwright') works from any directory, never install it). Stop servers you start. Never run a committed harness on its own port. No internet; never contact a real service.
- The machine has 4 CPUs shared with other reviewers: prefer a focused script over running whole harness suites.
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
          first_review_ref: { type: 'string' },
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
  { key: 'visit-save', ports: '8700-8709', focus: `THE VISIT SAVE AND ITS COMMIT RECORD: persistVisitsInner (writtenStr / committedStr, Pass A, A2, B, C) and patchVisitPhotos / patchVisitPhotosNow / visitDocOf in www/js/app/04-sync.js; saveVisit / saveVisitNow / setLogFormBusy / prepLogView / visitSaveMsg in www/js/app/06-log-visit.js and the lock's CSS in www/index.html; keepVisitPhotos started alongside the save and photoUpload after it; Edit visit (saveEditVisit, addEditPhoto, removeEditPhoto in 08-team-orders.js) while another visits save or a mark patch is committing. Hunt for: a visit or an edit lost, doubled, or said saved when not; a form that stays locked or unlocks too early; a new form refused or reset; a visit lost because the person navigated during a save; a patch that writes more than its mark or writes a month it could not read; the stored strings (_visitsLoaded, _visitsArch[m].json/rev) drifting from what the cloud holds so that a change is skipped.` },
  { key: 'photo-lifecycle', ports: '8710-8719', focus: `THE PHOTO MARK LIFE CYCLE: photoLanded, retryPhotos, settlePhotos / settlePhotosOnce (landed set, the device look-up, lost), photoDevice, photoMark, _photoSession, photoReadKept (no IndexedDB), photoKeep / photoForget / photoUpload in www/js/app/12-reports.js; UMCore.settlePhotoMark / settlePhotoMarks / photoMarkState in www/js/core.js and their use in mergeById; patchVisitPhotos results ('done' / 'missing' / 'failed'). Hunt for: a photo called lost while it is on its way or kept (two tabs, a slow IndexedDB, a restart mid-upload, the supervisor logging for a rep, a phone shared by two people, um_device missing or changed); a mark that never settles or flips back; a refresh starved by repeated patches (_localGen / _localSaving bumps); a look-up loop that downloads photos again and again; a month rollover between saving and landing; a visit deleted, moved to another month, or restored from the recycle bin while its photo waits.` },
  { key: 'cross-phone', ports: '8720-8729', focus: `OTHER PHONES, OLDER VERSIONS AND EVERY READER: a phone still on v121 (cached by the service worker until reopened) reading and re-saving visits whose photos carry pending / lost / dev; mergeById with settlePhotoMarks on v122; every reader of visit photos — calendar agenda, clinic history, visit log, photo gallery (09-admin.js), lightbox, Edit visit, the weekly management deck (core weeklyReport / weeklyPages, 15-weekly-deck.js), exports / CSV (13-exports.js), the daily e-mail digest (scripts/daily-report), the full backup and its verify / restore (13-exports.js, restoreSnapshotNow), the security rules (firestore.rules: photo:<id>, visits, visitsArch:*, visitsIndex). Hunt for: a screen that breaks, miscounts or lies with a waiting or lost photo; an older phone that undoes the new state for good; a backup that misses or doubles a photo while saying complete; a restore that brings back stale marks the phone then mis-settles.` },
  { key: 'chat-memories', ports: '8730-8739', focus: `TEAM CHAT AND MEMORIES: loadTeam, teamList, setTeamList, teamMerge, persistTeam / persistTeamNow, _teamGen / _teamSaving, sendChat, pickMemoryPhoto, saveMemory, _memSharing, memSheetShown, refreshTeam in www/js/app/12-reports.js; their interplay with flushOutbox, the outbox, the phone copies, memoryCopy and the red bar in 04-sync.js; two phones posting at once; the 300-message cap; the refresh while a save is on its way or queued. Hunt for: a message or memory lost, doubled, resurrected after it scrolled off the cap, or said shared/sent/up to date when it is not; a draft cleared that was not sent; a sheet closed that belonged to another memory; a queue entry removed before everything landed, or never removed.` },
  { key: 'honesty-regression', ports: '8740-8749', focus: `WHAT EVERY SCREEN SAYS, AND EVERYTHING ELSE THE RELEASE TOUCHES: every new or changed user-visible string must have Arabic in www/js/i18n.js (exact keys, or PATTERNS for counts; tr() keeps a leading emoji) — call \`const T = require('${WT}/www/js/i18n.js').tr\` from node to check real strings — and must be TRUE in every branch that shows it: photoWaitHTML counts, lost notes, the lightbox fallback and its tap token, the gallery line and badges, the red bar (MEMONLY_PHOTO, the 1-second recheck, memOnlyLanded and its "Saved" toast), the flush toast, visitSaveMsg, "Photo removed", the backup card, "Refresh messages". Then REGRESSION: a visit with no photo must behave exactly as in v121 (writes, toasts, order on screen); Edit visit without photos; deleting and restoring a visit; the build (scripts/build.js inlines www/js/app into one script — check dist works); the service worker (sw.js v122, SHELL); the cost of the 20-second round (settle loops, look-ups, the 1-second bar timer) on a phone with a year of visits. Hunt for: a false message, an English string an Arabic user sees, a pattern that never matches its real text, and any behaviour v121 had that v122 lost.` },
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
${f.first_review_ref ? 'FIRST-REVIEW REFERENCE: ' + f.first_review_ref : ''}

${lens(kind)}

Your scratch folder: ${SCRATCH}/verify-${a.key}-${fi}-${kind}/ (create it). Your one port for a harness copy: ${8760 + ai * 20 + (fi % 10) * 2 + ki}.`, { label: `verify:${a.key}#${fi}:${kind}`, phase: 'Verify', schema: VERDICT })))
      .then(vs => ({ area: a.key, finding: f, verdicts: vs.filter(Boolean) }))
  }))
)

const all = results.filter(Boolean).flat().filter(Boolean)
const kept = all.filter(x => x.verdicts.length === 0 || x.verdicts.some(v => !v.refuted))
const dropped = all.filter(x => !kept.includes(x))
log(`${all.length} findings reported, ${kept.length} survive verification, ${dropped.length} refuted`)
return {
  survived: kept.map(x => ({ area: x.area, title: x.finding.title, severity: x.finding.severity, file: x.finding.file, line: x.finding.line, scenario: x.finding.scenario, verification: x.finding.verification, fix: x.finding.fix || '', ref: x.finding.first_review_ref || '', verdicts: x.verdicts.map(v => ({ refuted: v.refuted, severity: v.severity_if_real || '', reasoning: v.reasoning, evidence: v.evidence || '' })) })),
  refuted: dropped.map(x => ({ area: x.area, title: x.finding.title, why: x.verdicts.map(v => v.reasoning).join(' | ').slice(0, 800) })),
}
