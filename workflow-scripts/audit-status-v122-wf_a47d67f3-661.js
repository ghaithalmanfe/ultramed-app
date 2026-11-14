export const meta = {
  name: 'audit-status-v122',
  description: 'Check every finding of the five audit reports against the current app (v122), mark fixed / open with evidence, and write the final status report with a plain Arabic summary for the owner',
  phases: [
    { title: 'Check', detail: 'one reviewer per audit report' },
    { title: 'Report', detail: 'the final status report and the owner summary' },
  ],
}
const A = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/audit'
const REPO = '/home/user/ultramed-app'
const STR = { type: 'string' }
const ROW = { type: 'object', properties: { id: STR, title: STR, severity: STR, status: { type: 'string', enum: ['fixed', 'partly', 'open', 'obsolete', 'coming-v123'] }, evidence: STR, remains: STR, proposal: STR }, required: ['id', 'title', 'severity', 'status', 'evidence'] }
const CHECK_SCHEMA = { type: 'object', properties: { report: STR, rows: { type: 'array', items: ROW }, summaryAr: STR }, required: ['report', 'rows', 'summaryAr'] }
const FINAL_SCHEMA = { type: 'object', properties: { file: STR, ownerSummaryAr: STR, counts: STR, topOpen: { type: 'array', items: STR } }, required: ['file', 'ownerSummaryAr', 'counts'] }

const REPORTS = ['01-architecture.md', '02-database.md', '03-storage-sync.md', '04-auth-permissions.md', '05-features.md']
const CONTEXT = `The UltraMed field-sales app (CLAUDE.md is loaded; it describes every release up to v122 and what each fixed). An audit of the whole app was written for releases v119/v120 in ${A}. Since then v120 (the sales file off the public site), v121 (nameless clinics and lost doctors offered, sync safety three-way merges, security rules, nothing real in the repository, the full backup button) and v122 (visit photos with no signal, overlapping saves kept, chat and memories kept) were released. Coming in v123 (being integrated now, not live): the change log (who changed what and when), the alerts center, and the nightly encrypted backup outside Firebase (GitHub Actions). The current code is ${REPO} (branch claude/hello-0r7ps7 = v122 plus one plan fix; the new main screen is held and NOT part of it). Read-only: do not modify any file in the repository; write only your own output file.`

phase('Check')
const checks = await parallel(REPORTS.map(r => () => agent(`${CONTEXT}

Your report: ${A}/${r}. Read it whole. For EVERY finding in it (its findings section, and any problem or risk the other sections flag), check the current code: is it fixed (where, which release — git log/blame, the harness or unit test that guards it), partly fixed, still open, obsolete (the code it describes is gone), or coming in v123 (one of the three features above, say which)? Evidence = file:line and/or commit, never a guess; if you cannot tell, say so. For what remains open, a concrete proposal (what to change, how big). Then write a 5-8 line plain Arabic summary for the owner (no code words, no file names): what this part of the app is, what was found, what is fixed, what is still open and how serious. Return the structured rows.`, { label: 'check ' + r.replace('.md', ''), phase: 'Check', schema: CHECK_SCHEMA })))
const ok = checks.filter(Boolean)
log('Checked ' + ok.length + ' of ' + REPORTS.length + ' reports, ' + ok.reduce((n, c) => n + c.rows.length, 0) + ' findings')

phase('Report')
const final = await agent(`${CONTEXT}

The five reports were checked finding by finding:
${JSON.stringify(ok, null, 1)}

Write the final status report ${A}/00-status-v122.md (English, for whoever maintains the app): a short opening (what was audited, when, against which release), one table per report (id, finding, severity, status, evidence, what remains), then "Still open, in order of importance" with the proposals and their size, and "Fixed since the audit" grouped by release. Then write the owner's summary in Arabic (plain words, short, no code or file names, the team's terms): what the inspection covered, how many findings, how many are fixed, what is still open and which of those matter most for his data and his team, and what comes in v123. Return the file path, the Arabic summary, the counts (fixed / partly / open / obsolete / coming in v123) and the top open items in one line each.`, { label: 'final status report', phase: 'Report', schema: FINAL_SCHEMA })
return { checks, final }
