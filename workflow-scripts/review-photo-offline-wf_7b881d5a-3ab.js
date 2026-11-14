export const meta = {
  name: 'review-photo-offline',
  description: 'Independent review of the offline-photo visit fix (photo-offline-v1 on top of live v121): 5 area reviewers, each finding checked by 2 refuters',
  phases: [
    { title: 'Review', detail: 'five reviewers, one area each, read-only' },
    { title: 'Verify', detail: 'two independent refuters per finding (reproduce, code trace)' },
  ],
}

const WT = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/photo-wt'
const SCRATCH = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/review-photo'

const CONTEXT = `You are reviewing a change to a field-sales web app (a PWA) used every day by two sales reps and a supervisor in Kuwait, often with no signal. The owner's first rule: nothing the team saved may be lost, duplicated or silently reverted, and the screen must never say "saved" when it did not land. CLAUDE.md in the worktree explains the layout, storage (Firestore 'state' documents, the outbox, the phone copies um_mirror:*, the delete log), and the tests.

THE CHANGE UNDER REVIEW
- Worktree (read-only for you): ${WT}  (branch photo-offline-v1, head ef33bf9).
- The live version is v121 = commit 6840099. Review exactly what the photo work adds on top of it: \`git -C ${WT} diff 6840099 ef33bf9 -- www\` and the commits \`git -C ${WT} log --oneline 6840099..ef33bf9\` (0cdbe19 harness, cb810ea already live as 1b5d625, 904b464 settlePhotoMarks, f8056ef double-tap guard, d605321 main fix, 48aed0b Edit visit photos, 88f16e8 chat/memories no hang, ef33bf9 the merge with v121).
- Design as its author describes it: a visit with photos is saved FIRST through the existing persist/outbox path, each photo stored on the visit as {id, thumb, pending:true}; the full photo is kept on the phone (IndexedDB 'um_photos', else localStorage 'um_photo:<id>', else memory only — the toast and the visit say which); uploads run in the background one photo at a time, savePhotoBlob gives up after 20 s (PHOTO_UP_MS); retries run from flushOutbox (start, reconnect, every 20-second refresh); when a photo lands its mark is cleared and saved, and only then is the phone copy dropped; UMCore.settlePhotoMarks in mergeById (visits) means the mark can only go away; the double-tap guard lasts until the save settles; Edit visit → add photo uses the same path; chat and memories give up after 20 s and keep the draft.
- Known and accepted by the author (do NOT report these again): chat and memories photos are not queued for a later upload; for EVERY visit (with or without photos) the visit is only in memory for the ~12 s until the first save attempt settles, so closing the app in those seconds loses it; a timed-out upload that lands later can leave an unused photo:<id> document; a visit restored from the recycle bin after its photo uploaded still says "waiting".
- Harness of the change: tests/e2e/visit-photo-offline.e2e.js (port 8270). Other harnesses: tests/e2e/*.e2e.js (each has its own fixed port).

RULES FOR YOU
- Read-only: never edit, commit or push in ${WT} or any other worktree. Write scratch files only under your own folder given below.
- If you run a browser harness, run a COPY of it from your scratch folder with its port changed to one of YOUR ports given below, with WWW=${WT}/www (the harness helpers are in ${WT}/tests/e2e/_env.js; require them by absolute path from your copy). Delete running servers when done. Never run a committed harness on its own port. No internet needed; never contact any real service.
- Report only concrete, verified problems: a real path the app takes, with file:line in ${WT}, the exact scenario (which phone, what order of events, what the person sees), and how you verified it (script output, or a precise step-by-step trace). No style, naming or refactor suggestions. If nothing survives your own checking, return an empty list.`

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
  { key: 'visit-save', ports: '8280-8283', focus: `THE VISIT SAVE PATH WITH PHOTOS, end to end: saveVisit in www/js/app/06-log-visit.js (order of steps, the busy guard from f8056ef, what happens on every failure branch, what each toast claims), persist/outbox for 'visits', persistVisitsInner in www/js/app/04-sync.js (including the kept-visits change 1b5d625 and the merge with mergeById + settlePhotoMarks), what exactly is written to the cloud documents (visits, visitsArch:YYYY-MM, visitsIndex, photo:<id>). Hunt for: a visit lost at any step (app closed, reload, refresh tick, offline/online flips, a second visit logged meanwhile, the month rollover), a visit duplicated (double tap, retry, outbox flush racing a save), a visit written without its photo forever, a toast that says saved when it is not.` },
  { key: 'photo-store', ports: '8284-8287', focus: `WHERE THE FULL PHOTO LIVES UNTIL IT UPLOADS: IndexedDB 'um_photos', the localStorage fallback 'um_photo:<id>', memory only; the background upload loop and its retry from flushOutbox; PHOTO_UP_MS timeout; a write that lands after the timeout; clearing the mark and only then dropping the phone copy; what happens with IndexedDB unavailable or failing mid-way, a full phone, a photo too large for a cloud document (1 MiB), many photos queued, the app reopened while uploads are pending, two phones (or two tabs) uploading the same photo, a photo whose visit was deleted or moved meanwhile. Hunt for: a photo lost while the visit says it is kept, a phone copy dropped before the cloud confirmed, an upload loop that never ends or never retries, memory or storage growing without bound, a mark cleared while the cloud lacks the photo.` },
  { key: 'cross-phone', ports: '8288-8291', focus: `OTHER PHONES AND OTHER SCREENS: UMCore.settlePhotoMarks (www/js/core.js) and its use in mergeById for visits; a phone that still runs the previous app version (v121 or v120, cached by the service worker until reopened) reading and re-saving visits whose photos carry {pending:true} (does it drop the mark, the thumb, or the photo? does it re-add a cleared mark?); the supervisor's screens and every reader of visit photos: calendar agenda, clinic history, visit log, photo gallery, lightbox, Edit visit, the weekly management deck (UMCore.weeklyReport / weeklyPages and 15-weekly-deck.js), achievement/weekly counts, CSV/exports, the daily e-mail digest (scripts/daily-report), the full device backup and verify/restore scripts, the security rules (firestore.rules: photo:<id> writes and deletes). Hunt for: a screen that breaks or miscounts with a pending photo, an old phone that undoes the new state, a photo counted twice or never, a backup that misses a photo the visit references while saying complete.` },
  { key: 'edit-chat-memories', ports: '8292-8295', focus: `EDIT VISIT AND THE TEAM TAB: www/js/app/08-team-orders.js (Edit visit → add photo, remove photo; 48aed0b) and www/js/app/12-reports.js (chat and memories photos, 88f16e8; persistTeam, memOnly bar and memoryCopy from v121). Hunt for: an edit that hangs, is lost, or is saved without its photo forever; a removed photo that comes back or whose removal is never saved; a chat message or memory lost, duplicated, or posted twice by a double tap; a draft that is said to be kept but is not; an interaction with v121's persistTeam (always queued, honest toast, memOnly bar) that breaks either.` },
  { key: 'honesty-i18n', ports: '8296-8299', focus: `WHAT THE PERSON IS TOLD, IN BOTH LANGUAGES: every new or changed user-visible string in the diff (toasts, labels such as "Photo waiting to upload · kept on this phone", the visit card states, the lightbox, the red bar) must have Arabic in www/js/i18n.js (exact-string keys, or PATTERNS for strings with numbers; tr() strips a leading emoji); strings with names or numbers must still translate; RTL rendering must not garble. Check every message is TRUE in every branch that shows it (e.g. "kept on this phone" only when it really is on the phone; "saved" only when the cloud confirmed; "memory only" when it is). Use node to call the dictionary: \`const T = require('${WT}/www/js/i18n.js').tr\`. Hunt for: a message that is false in some branch, an English string an Arabic user would see, a pattern that never matches its real text.` },
]

const lens = (f, kind) => kind === 'reproduce'
  ? `Try to REPRODUCE this reported defect for real. Build the smallest scenario that shows it: a node script against ${WT}/www/js/core.js for pure parts, or a copy of a harness in your scratch folder (port given below, WWW=${WT}/www) driving the real app with a fake cloud. Default to refuted=true if you cannot make it happen, or if the code does not take that path. If it does happen, say exactly what you ran and what you saw, and give the realistic severity.`
  : `Try to REFUTE this reported defect by tracing the code precisely: read every function on the claimed path in ${WT} (file:line), check each step of the scenario against what the code really does, including guards, timeouts, retries and the order of awaits. Default to refuted=true if any step of the claim is wrong or the scenario cannot happen with real app behaviour. If every step holds, say so with the file:line chain, and give the realistic severity.`

let vport = 8300
const results = await pipeline(
  AREAS,
  (a) => agent(`${CONTEXT}

YOUR AREA: ${a.focus}

Your scratch folder: ${SCRATCH}/${a.key}/ (create it). Your ports for harness copies: ${a.ports}.
Return every verified problem in your area as structured findings (most severe first). Be thorough: read the whole diff for your area, then the surrounding code it relies on.`, { label: `review:${a.key}`, phase: 'Review', schema: FINDINGS }),
  (rev, a, ai) => parallel(((rev && rev.findings) || []).map((f, fi) => () => parallel(['reproduce', 'code-trace'].map((kind, ki) => () => {
    const port = 8300 + ai * 20 + (fi % 10) * 2 + ki
    return agent(`${CONTEXT}

A reviewer reported this defect in the change:
TITLE: ${f.title}
SEVERITY CLAIMED: ${f.severity}
WHERE: ${f.file}${f.line ? ':' + f.line : ''}
SCENARIO: ${f.scenario}
HOW THE REVIEWER VERIFIED IT: ${f.verification}
${f.fix ? 'SUGGESTED FIX: ' + f.fix : ''}

${lens(f, kind)}

Your scratch folder: ${SCRATCH}/verify-${a.key}-${fi}-${kind}/ (create it). Your one port for a harness copy: ${port}.`, { label: `verify:${a.key}#${fi}:${kind}`, phase: 'Verify', schema: VERDICT })
  })).then(vs => ({ area: a.key, finding: f, verdicts: vs.filter(Boolean) }))))
)

const all = results.filter(Boolean).flat().filter(Boolean)
const kept = all.filter(x => x.verdicts.length === 0 || x.verdicts.some(v => !v.refuted))
const dropped = all.filter(x => !kept.includes(x))
log(`${all.length} findings reported, ${kept.length} survive verification, ${dropped.length} refuted by both verifiers`)
return {
  survived: kept.map(x => ({ area: x.area, title: x.finding.title, severity: x.finding.severity, file: x.finding.file, line: x.finding.line, scenario: x.finding.scenario, fix: x.finding.fix || '', verdicts: x.verdicts.map(v => ({ refuted: v.refuted, severity: v.severity_if_real || '', reasoning: v.reasoning, evidence: v.evidence || '' })) })),
  refuted: dropped.map(x => ({ area: x.area, title: x.finding.title, why: x.verdicts.map(v => v.reasoning).join(' | ').slice(0, 600) })),
}