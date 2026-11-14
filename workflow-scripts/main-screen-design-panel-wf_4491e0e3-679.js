export const meta = {
  name: 'main-screen-design-panel',
  description: 'Three independent design proposals for the supervisor main screen (laptop + mobile, Arabic), judged by three reviewers with different eyes, then the winner refined with the best ideas of the others',
  phases: [
    { title: 'Design', detail: 'three designers, one concept each: a self-contained responsive HTML mockup and its pictures' },
    { title: 'Judge', detail: 'three judges score all proposals against the brief, each through one lens' },
    { title: 'Refine', detail: 'the winner polished with the judges\' fixes and the best ideas of the others; the runner-up kept as the alternative' },
  ],
}

const D = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/design'
const BRIEF = D + '/brief.md'

const COMMON = `Read the brief first, all of it: ${BRIEF}. Open the two pictures of the app as it is today (the Read tool shows PNG files) and skim the <style> block the brief points to, so your proposal is the same app grown up.

Rules:
- Write only inside your own folder (given below). Do not touch any git repository or worktree; this is design work only.
- The mockup is ONE self-contained file: inline CSS and inline SVG, no script needed, no web requests (fonts only from the local files the brief gives). Arabic, right to left. Use the brief's sample values exactly.
- Render with the helper the brief names, then OPEN your pictures and judge them as the owner would on his laptop and on his phone. Iterate until they are clean: nothing cut off, overlapping or misaligned; no horizontal overflow (the helper warns); no text under 11 px; the numbers exactly as listed; one obvious reading order; generous but not wasteful spacing. At least three render-and-look rounds.
- The laptop picture (1440 × 900) should tell the month's story on the first screen (the "-laptop-fold.png" picture) — scrolling below it is fine for the day's work lists. The mobile first screen ("-mobile-fold.png") must answer: where are we against the target, and what needs me today.
- Everything the main screen has today stays somewhere (today's plan, follow-ups due, tasks, latest visits, the doctor-cards nudge, the navigation) — rearranged, never dropped.
- Other machines' work runs here too: render one page at a time, do not start servers.`

const CONCEPTS = [
  { key: 'a-glance', name: 'The month at a glance', angle: `YOUR CONCEPT — "the month at a glance" (calm executive summary). One hero block says the month in a sentence and a picture: invoiced sales against the target with the pace (are we ahead of the working-days line?), what is left, what each remaining working day needs, and the month-end projection — then a quiet strip of the secondary figures, the three people side by side, and one trend chart. Few colours, large clear numerals, lots of calm. On the laptop: a slim navigation rail on the right (the page is right-to-left), the hero and the people across the top, the trend and the brands beside them, the day's work in a side column. On the phone: the hero first, then swipe-free stacked cards in priority order.` },
  { key: 'b-action', name: 'What needs me today', angle: `YOUR CONCEPT — "what needs me today" (attention first). The screen opens with a verdict line in words (for example: ahead of the pace, 15 working days left, 938 د.ك a day needed) and a short ranked list of what needs the supervisor's action now — who is furthest from her target, overdue follow-ups, customers that stopped buying, a high-potential clinic with no invoice — each with its number and one tap to the detail; the figures support the verdict rather than lead. On the laptop: three columns — the verdict and key figures, the people and brands, the action list and the day's work. On the phone: the verdict and the action list above the fold, figures in compact tiles below.` },
  { key: 'c-grid', name: 'The control panel', angle: `YOUR CONCEPT — "the control panel" (a tidy business-intelligence grid). A row of KPI tiles with tiny trend marks (sales, achievement with a bar, remaining, needed per working day, projection, against last month), then a row of charts (the month day by day against the target line; the people as bars against their targets; the brands against theirs), then a row of compact tables (top customers; customers to act on; follow-ups due) and the day's work. Dense but ordered: a strict 12-column grid on the laptop with a top bar for navigation and the month / person / brand filters; on the phone the tiles become a 2-column grid and the charts and tables become a segmented control (figures · charts · customers · today) so nothing is a long scroll.` },
]

const DESIGN_DONE = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    html: { type: 'string' },
    pictures: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
    self_critique: { type: 'string' },
  },
  required: ['ok', 'html', 'pictures', 'rationale'],
}

phase('Design')
const designs = (await parallel(CONCEPTS.map(c => () => agent(`You are a senior product designer proposing a redesign of one screen of a field-sales web app: the supervisor's main screen, now carrying the management summary, with a real laptop layout and a real mobile layout. Two other designers are working on different concepts at the same time; the owner will choose from the pictures.

${COMMON}

YOUR FOLDER: ${D}/${c.key}/ (create it). Your key for the render helper: ${c.key}

${c.angle}

Stay true to your concept — it should be clearly different from the other two — but the brief's rules and its judging criteria come first.

Return: the path of your index.html, the paths of your four pictures, a short rationale (what the owner sees first, second, third on each device and why), and an honest self-critique (what is still weak).`, { label: `design:${c.key}`, phase: 'Design', schema: DESIGN_DONE }).then(r => r ? Object.assign({ key: c.key, name: c.name }, r) : null)))).filter(Boolean)

log(designs.length + ' of 3 proposals delivered: ' + designs.map(d => d.key).join(', '))
if(designs.length < 2) return { designs, stopped: 'fewer than two proposals: nothing to compare' }

const SCORES = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          score: { type: 'number' },
          strengths: { type: 'string' },
          weaknesses: { type: 'string' },
          fixes: { type: 'array', items: { type: 'string' } },
          ideas_worth_stealing: { type: 'string' },
        },
        required: ['key', 'score', 'strengths', 'weaknesses', 'fixes'],
      },
    },
    ranking: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
  },
  required: ['scores', 'ranking', 'why'],
}

const LENSES = [
  { key: 'owner', text: `Judge as THE OWNER would: a busy managing dentist-businessman who opens this on his laptop in the morning and on his phone during the day, reads Arabic, and asked for something "tidy, showing the required details briefly". For each proposal look at the first screen of each device for five seconds, then say what you understood: where the month stands against the target, whether the pace is enough, who is behind, what needs action. Then read the rest. Reward clarity, calm and obvious hierarchy; punish clutter, tiny text, jargon, anything he would have to work to understand, and awkward or unnatural Arabic wording.` },
  { key: 'craft', text: `Judge as A DESIGN LEAD checking craft on both devices: does the laptop layout truly use a 1440-px screen (not a stretched phone) and does the first screen tell the month's story without scrolling? Is the mobile layout a real phone layout (thumb reach, targets at least 44 px, no horizontal scroll, the fixed bottom navigation not covering content)? Alignment to a grid, consistent spacing and type scale, contrast (text on the dark green and on the mint cards), charts that are honest and readable (labelled axes, direct labels, a sensible direction in a right-to-left page, no decoration that distorts), status colours never carrying meaning alone, right-to-left correctness (mirrored layout, numerals and "د.ك" placed naturally, mixed Arabic and Latin names not jumbled). Open every picture, zoom into details by reading the HTML where needed.` },
  { key: 'truth', text: `Judge as THE PRODUCT'S OWN RULES would, and as the engineer who must build it: does every figure match the brief's sample values exactly and consistently (re-add the parts: people, brands and days must each sum to 6,930; percentages must match)? Does each KPI have a visible "how it was calculated" affordance and does the summary say its sources (ERP files to 8 October, targets from the DSR)? Is the not-measured state shown honestly ("the same month last year": no sales file — a dash and the reason, never 0)? Are orders logged in the app clearly not called sales? Is everything the main screen has today still there? Does it keep the app's identity (compare with the two pictures of today's app)? Can it be built in plain HTML, CSS and inline SVG with only the data listed? Read the HTML as well as the pictures.` },
]

phase('Judge')
const listing = designs.map(d => `- ${d.key} — "${d.name}": ${d.html}; pictures: ${d.pictures.join(', ')}\n  the designer's rationale: ${d.rationale}`).join('\n')
const verdicts = (await parallel(LENSES.map(l => () => agent(`You are judging design proposals for one screen of a field-sales web app (the supervisor's main screen with the management summary; laptop and mobile; Arabic). Read the brief first: ${BRIEF} — its last section gives the judging criteria and their weights. Open the pictures of the app as it is today too.

The proposals (open every picture with the Read tool; "-fold" pictures are the first screen, the others the full page):
${listing}

YOUR LENS: ${l.text}

Score each proposal from 1 to 10 for the brief's weighted criteria AS SEEN THROUGH YOUR LENS, with its real strengths and weaknesses, the concrete fixes it needs (most important first, each one specific enough to carry out: which element, what change), and any idea in it worth carrying into the winner. Then rank them best first and say why in two or three sentences. Be demanding: the owner will build from the winner. Do not edit any file.`, { label: `judge:${l.key}`, phase: 'Judge', schema: SCORES }).then(r => r ? Object.assign({ lens: l.key }, r) : null)))).filter(Boolean)

// Borda-style total: sum of scores; ties broken by the owner's lens
const total = {}
designs.forEach(d => { total[d.key] = 0 })
verdicts.forEach(v => (v.scores || []).forEach(s => { if(s.key in total) total[s.key] += Number(s.score) || 0 }))
const ownerRank = ((verdicts.find(v => v.lens === 'owner') || {}).ranking || [])
const order = designs.map(d => d.key).sort((a, b) => (total[b] - total[a]) || (ownerRank.indexOf(a) - ownerRank.indexOf(b)))
const winner = designs.find(d => d.key === order[0]), runner = designs.find(d => d.key === order[1])
log('scores: ' + order.map(k => k + ' ' + total[k].toFixed(1)).join(' · ') + ' → winner ' + winner.key + ', alternative ' + runner.key)

const notesFor = key => verdicts.map(v => { const s = (v.scores || []).find(x => x.key === key); return s ? `[${v.lens} judge — ${s.score}/10]\nStrengths: ${s.strengths}\nWeaknesses: ${s.weaknesses}\nFixes: ${(s.fixes || []).map((f, i) => (i + 1) + '. ' + f).join(' ')}\nWorth carrying over: ${s.ideas_worth_stealing || '—'}` : '' }).filter(Boolean).join('\n\n')
const stealFrom = designs.filter(d => d.key !== winner.key).map(d => `From "${d.name}" (${d.html}):\n` + verdicts.map(v => { const s = (v.scores || []).find(x => x.key === d.key); return s && s.ideas_worth_stealing ? `- (${v.lens}) ${s.ideas_worth_stealing}` : '' }).filter(Boolean).join('\n')).join('\n\n')

const REFINE_DONE = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    html: { type: 'string' },
    pictures: { type: 'array', items: { type: 'string' } },
    changes: { type: 'string' },
    open_points: { type: 'string' },
  },
  required: ['ok', 'html', 'pictures', 'changes'],
}

phase('Refine')
const refined = await parallel([
  () => agent(`You are the design lead finishing the WINNING proposal for the supervisor's main screen of a field-sales web app (laptop and mobile layouts, Arabic). Read the brief: ${BRIEF}. The owner will be shown your pictures and will decide from them, so they must be right.

${COMMON}

The winner: "${winner.name}" — ${winner.html} (pictures: ${winner.pictures.join(', ')}). Its designer's self-critique: ${winner.self_critique || '—'}

What three judges said about it:
${notesFor(winner.key)}

Ideas the judges thought worth carrying over from the other proposals (open those files and pictures to see them):
${stealFrom}

YOUR FOLDER: ${D}/final/ (create it; copy the winner's index.html there and work on the copy). Your key for the render helper: final

Carry out the judges' fixes (all that are right; say which you declined and why), graft the best ideas of the others where they make the screen clearer without clutter, re-check every number against the brief (the people, the brands and the days each sum to 6,930), and polish both layouts until the pictures are release-quality. Open your pictures after every round; at least three rounds. Also render two extra pictures the owner will find useful, with these exact names in your folder: "final-laptop-fold.png" and "final-mobile-fold.png" are made by the helper already — additionally make "final-mobile-part2.png": the mobile page scrolled to the second screen (a 390 × 844 viewport picture starting where the first screen ended; write a tiny Playwright script for it, device scale 2, no network).

Return the path of the final index.html, every picture path, what you changed, and any open point the owner should decide.`, { label: 'refine:winner', phase: 'Refine', schema: REFINE_DONE }),
  () => agent(`You are a designer tidying the RUNNER-UP proposal for the supervisor's main screen of a field-sales web app (laptop and mobile layouts, Arabic), so the owner has a clean alternative to compare with the winner. Read the brief: ${BRIEF}.

${COMMON}

The runner-up: "${runner.name}" — ${runner.html} (pictures: ${runner.pictures.join(', ')}). Its designer's self-critique: ${runner.self_critique || '—'}

What three judges said about it:
${notesFor(runner.key)}

YOUR FOLDER: ${D}/alt/ (create it; copy the runner-up's index.html there and work on the copy). Your key for the render helper: alt

Keep its concept (it must stay clearly different from the winner, "${winner.name}"), carry out the judges' fixes that are right, re-check every number against the brief, and polish both layouts. Open your pictures after every round; at least two rounds.

Return the path of the index.html, every picture path, what you changed, and any open point.`, { label: 'refine:alternative', phase: 'Refine', schema: REFINE_DONE }),
])

return {
  order, total,
  winner: { key: winner.key, name: winner.name, rationale: winner.rationale },
  runner: { key: runner.key, name: runner.name, rationale: runner.rationale },
  judges: verdicts.map(v => ({ lens: v.lens, ranking: v.ranking, why: v.why, scores: (v.scores || []).map(s => ({ key: s.key, score: s.score, strengths: s.strengths, weaknesses: s.weaknesses })) })),
  final: refined[0], alt: refined[1],
  all: designs.map(d => ({ key: d.key, name: d.name, html: d.html, pictures: d.pictures })),
}
