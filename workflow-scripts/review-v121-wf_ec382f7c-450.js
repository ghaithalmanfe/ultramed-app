export const meta = {
  name: 'review-v121',
  description: 'Independent review of release v121 (nameless clinics and doctors as suggestions + tap) before it is published',
  phases: [{ title: 'Review', detail: 'three reviewers, one lens each' }, { title: 'Verify', detail: 'a skeptic re-checks each finding' }],
}
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'scenario'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'reason'] }
const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const COMMON = `Repository: the git worktree ${S}/hotfix (branch hotfix-v120). READ-ONLY: never edit, commit, push, checkout, stash or reset there or in /home/user/ultramed-app; scratch files only under ${S}/review-v121/. Do not run the full browser suites; you may run \`node --test tests/core.test.js\`, node snippets requiring that worktree's www/js/core.js, and at most one small Playwright script of your own on a port in 8270-8279 (copy the setup of tests/e2e/clinic-recovery.e2e.js). The change under review is \`git diff c9d5eda..aeec22b\` = release v121 of the UltraMed Field Ops PWA (read CLAUDE.md in the worktree for the code map and house rules). v121 removes the old start-up repair: NOTHING is written at app start; the "Clinics without a name" sheet (openNamelessClinics / nameNamelessClinic / restoredFromCopy / repointClinic / askInCard in www/js/app/07-clinics.js; phoneCopyClinics / phoneCopyDoctors in www/js/app/04-sync.js) and the "Doctors without a name" sheet (openLostDoctors / nameLostDoctor / visitsNaming) OFFER names (this phone's copy, the app's own follow-up tasks via UMCore.clinicNamesFromTasks, names visits recorded) and a tap applies one; a merge into an existing clinic/doctor, or a name that would make ERP lines count for another person (UMCore.erpAddClinicMoves), is ASKED first in the card and applied only on the second tap. The owner's absolute rules: zero data loss, no automatic merges, never report "saved" when it did not land, closed months never move silently. Report only REAL defects with a concrete path through the code (inputs/state → wrong outcome); no style nits.`
const DIMS = [
  { key: 'data', prompt: `${COMMON}\nLENS: shared-data safety — ways the taps can lose, duplicate or corrupt clinics, visits (incl. month archive documents), tasks, dayPlans, recycleBin, tombs: a failed or queued recycle-bin write during a confirmed merge, a stale second tap after another phone already named or merged the record (the sheet re-rendered, data refreshed in the background), restoredFromCopy overwriting newer fields, mergeDoctorLists dropping or doubling a doctor, remapVisitDoctors touching other clinics' visits, persist ordering, toasts that claim success for a queued save.` },
  { key: 'figures', prompt: `${COMMON}\nLENS: the pure helpers clinicNamesFromTasks, erpAddClinicMoves and lostDoctors in www/js/core.js and how nameNamelessClinic uses erpAddClinicMoves. Prove or disprove that erpAddClinicMoves equals a full before/after comparison of matchCustomer + erpRepOfMatch over every account (shortcut: skip accounts sharing no normalized word and no de-spaced containment with the returning clinic; check all when it joins a branch family) with a randomized script: branch families, handovers (prevRep/repSince), shared accounts (sharedSince), erpMap overrides, channel and internal accounts. Check clinicNamesFromTasks against the task shapes the app writes and lostDoctors against visit shapes (doctorId, doctorIds, doctorNames, rx[].doctorId).` },
  { key: 'ui', prompt: `${COMMON}\nLENS: what people see and can do — a rep can only act on her own clinics in UI AND in the functions; HTML/attribute injection through clinic, doctor or task names (quotes, <, &, Arabic, emoji) in the suggestion buttons and askInCard; every new English string rendered has an exact-match Arabic entry (the translator matches whole text nodes, span by span); the confirm step asks before any change and Cancel changes nothing; double taps cannot apply twice; renderNamelessCard runs UMCore.lostDoctors on every clinic-list render — measure with ~6000 visits / ~300 clinics; phone width 390px has no horizontal scroll in the sheets.` },
]
const CAP = 3
phase('Review')
const results = await pipeline(DIMS,
  d => agent(d.prompt, { label: 'review:' + d.key, phase: 'Review', schema: FINDINGS }),
  (rev, d) => {
    const order = { high: 0, medium: 1, low: 2 }
    const fs = ((rev && rev.findings) || []).slice().sort((a, b) => order[a.severity] - order[b.severity])
    if (fs.length > CAP) log(`${d.key}: ${fs.length - CAP} lower-ranked finding(s) returned unverified`)
    return parallel(fs.slice(0, CAP).map(f => () => agent(`${COMMON}\nA reviewer claims this defect. Try hard to REFUTE it by tracing the real code paths (node snippets allowed). real=true only if the failure truly happens; default real=false when unsure; if real, give the smallest correct fix.\nClaim: ${f.title}\nSeverity: ${f.severity}\nWhere: ${f.file}${f.line ? ':' + f.line : ''}\nScenario: ${f.scenario}\nSuggested fix: ${f.fix || '-'}`,
      { label: 'verify:' + d.key, phase: 'Verify', schema: VERDICT }).then(v => Object.assign({}, f, { dim: d.key, verdict: v }))))
      .then(vs => vs.concat(fs.slice(CAP).map(f => Object.assign({}, f, { dim: d.key, verdict: null }))))
  })
const all = results.flat().filter(Boolean)
return {
  confirmed: all.filter(f => f.verdict && f.verdict.real),
  unverified: all.filter(f => !f.verdict).map(f => ({ title: f.title, file: f.file, line: f.line, severity: f.severity, scenario: f.scenario, fix: f.fix })),
  rejected: all.filter(f => f.verdict && !f.verdict.real).map(f => ({ title: f.title, reason: f.verdict.reason })),
}
