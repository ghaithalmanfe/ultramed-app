export const meta = {
  name: 'review-v120',
  description: 'Adversarial review of the v120 start-up repair and lost-doctor naming before deploy',
  phases: [{ title: 'Review', detail: 'three independent reviewers, one dimension each' }, { title: 'Verify', detail: 'each finding checked by a skeptic' }],
}
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'scenario'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'reason'] }
const SCR = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const COMMON = `Repository: /home/user/ultramed-app. You are READ-ONLY: never edit, create, commit or push files in the repository (scratch files only under ${SCR}/review-v120/). Do not run the e2e test suites (another run is in progress). The change under review is commit fccf65a (release v120) on top of dceecfd (v119): run \`git show fccf65a\` and read the touched functions in their full context. Background: a field-sales PWA; www/js/app/*.js are classic scripts sharing one global scope; www/js/core.js is pure (UMCore). v120 (1) at app start, on the clinic owner's and the supervisor's phones, gives hidden nameless placeholder clinics ("⚠️ Restored clinic — rename me") the name the app's own follow-up tasks recorded for the same clinic id — merging into an existing same-name same-owner clinic, else naming it only if no ERP sales line would then count for another person; (2) adds a "Doctors without a name" sheet so owners can name doctors that visits reference but the clinic no longer lists. Report only REAL defects with a concrete failure scenario (inputs/state → wrong outcome). No style nits, no speculation without a path through the code.`
const DIMS = [
  { key: 'data-safety', prompt: `${COMMON}\nYour dimension: shared-data safety. Focus on restoreLostDoctors in www/js/app/04-sync.js and repointClinic / nameNamelessClinic / nameLostDoctor in www/js/app/07-clinics.js, plus persist/persistFor/sentSince/storageUpdate/moveToBin/tomb/hidePlaceholderClinics/storedClinics/persistVisits. Find ways this can lose, duplicate or corrupt clinics, visits (including month archive documents), tasks, dayPlans, recycleBin, tombs or repairLog on real phones: two phones running the repair at the same time, a save that fails or is only queued offline, a phone with stale local data, merge-safe list writes (read-merge-write, local wins), the hidden placeholder list, the day-key change (um_lostDocsDay → um_repairDay), toasts that claim "saved" when it did not land, exceptions that abort the pass half-way.` },
  { key: 'sales-figures', prompt: `${COMMON}\nYour dimension: sales-figure integrity. Focus on UMCore.erpAddClinicMoves, clinicNamesFromTasks and lostDoctors in www/js/core.js. Prove or disprove that erpAddClinicMoves' shortcut (skip an account when the returning clinic shares no normalized word and no de-spaced containment with it; check every account when the returning clinic joins an existing branch family) gives EXACTLY the same result as comparing matchCustomer before/after for every account. Read matchCustomer, normClinicName, clinicFamilies, familyOfTie, familyTypeSig, erpRepOfMatch, clinicRepOn, clinicSharedOn, erpEachLine, erpMatcher. Also: cache reuse across calls (restoreLostDoctors passes a base list and one cache), the combined check of several accepted clinics, and whether any person's month figure (CLAUDE.md: closed months never move; figures only via monthAchievement/erpRowRep) could change silently when the check says no move. You may write node scripts under ${SCR}/review-v120/ that require('/home/user/ultramed-app/www/js/core.js') to test claims.` },
  { key: 'ui-truth', prompt: `${COMMON}\nYour dimension: what people see and can do. Focus on renderNamelessCard, lostDoctorsLine, openLostDoctors, nameLostDoctor, openNamelessClinics (the recorded-name suggestion, "Use this name", the moves note) in www/js/app/07-clinics.js and the new entries in www/js/i18n.js. Check: a rep can only name for her own clinics (supervisor for all); HTML/attribute injection through clinic, doctor or task names (esc and data-* usage, onclick strings); every new English string rendered has an exact-match Arabic entry or a pattern (the translator matches whole text nodes); renderNamelessCard now runs UMCore.lostDoctors on every clinic-list render — cost with ~5000 visits and ~300 clinics on a phone; the Done/Save flows reopen the right sheet; anything shown that is not true (CLAUDE.md: never report "saved" when it did not land, never show a figure that cannot be explained).` },
]
const CAP = 3
phase('Review')
const results = await pipeline(DIMS,
  d => agent(d.prompt, { label: 'review:' + d.key, phase: 'Review', schema: FINDINGS }),
  (rev, d) => {
    const order = { high: 0, medium: 1, low: 2 }
    const fs = ((rev && rev.findings) || []).slice().sort((a, b) => order[a.severity] - order[b.severity])
    if (fs.length > CAP) log(`${d.key}: ${fs.length - CAP} lower-ranked finding(s) not verified (returned as unverified)`)
    return parallel(fs.slice(0, CAP).map(f => () => agent(`${COMMON}\nA reviewer claims this defect in the v120 change. Try hard to REFUTE it by tracing the actual code paths (you may run node snippets against www/js/core.js; scratch files only under ${SCR}/review-v120/). Answer real=true only if the failure scenario truly happens; default to real=false when uncertain. If real, give the smallest correct fix.\nClaim: ${f.title}\nSeverity claimed: ${f.severity}\nWhere: ${f.file}${f.line ? ':' + f.line : ''}\nScenario: ${f.scenario}\nSuggested fix: ${f.fix || '-'}`,
      { label: 'verify:' + d.key, phase: 'Verify', schema: VERDICT }).then(v => Object.assign({}, f, { dim: d.key, verdict: v }))))
      .then(vs => vs.concat(fs.slice(CAP).map(f => Object.assign({}, f, { dim: d.key, verdict: null }))))
  })
const all = results.flat().filter(Boolean)
return {
  confirmed: all.filter(f => f.verdict && f.verdict.real),
  unverified: all.filter(f => !f.verdict).map(f => ({ title: f.title, file: f.file, severity: f.severity, scenario: f.scenario })),
  rejected: all.filter(f => f.verdict && !f.verdict.real).map(f => ({ title: f.title, reason: f.verdict.reason })),
}
