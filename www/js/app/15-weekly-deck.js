// Weekly management deck: the Thursday PowerPoint built in the browser from the app's own data
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// Figures come from UMCore.weeklyReport (the same rules as the Today card and
// the reports); this file only lays them out. The PowerPoint library is loaded
// on demand from js/vendor, so the rest of the app never pays for it.
const WD = {
  dk: '022917', green: '0B3D22', soft: '9ED0AF', paper: 'EBF2EC', mint: 'D6ECDD', gold: 'C9A664', goldInk: '7A5C22',
  ink: '1C1C1E', muted: '4E5A53', pos: '1B7A36', line: 'D9E2DC', white: 'FFFFFF',
  head: 'Cambria', body: 'Calibri',
};
const WD_BRANDS = { philips: 'Philips Sonicare', waterpik: 'Waterpik', intensiv: 'Intensiv', 'b&l biotech': 'B&L Biotech', bundles: 'Kits & bundles',
  flash: 'Flash', 'the breath co': 'The Breath Co.', scheu: 'SCHEU', tepe: 'TePe', hismile: 'Hismile', undo: 'UNDO', 'beverly hills': 'BHF',
  eversmile: 'EverSmile', shenzhen: 'Shenzhen', univet: 'Univet', silonn: 'Silonn' };
function wdBrand(b){ return WD_BRANDS[b] || String(b || '—').replace(/\b[a-z]/g, m => m.toUpperCase()); }
function wdKD(n, dec){ const v = Number(n) || 0; return 'KD ' + v.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
function wdPct(x){ return x == null ? '—' : Math.round(x * 100) + '%'; }
function wdDay(d){ return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function wdRange(a, b){
  const A = new Date(a + 'T00:00:00'), B = new Date(b + 'T00:00:00');
  const same = A.getMonth() === B.getMonth();
  return (same ? A.getDate() : wdDay(a)) + ' – ' + wdDay(b) + ' ' + B.getFullYear();
}
function wdCut(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function loadPptxLib(){
  if(window.PptxGenJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/pptxgen.bundle.js';
    s.onload = () => window.PptxGenJS ? resolve() : reject(new Error('PowerPoint library did not start'));
    s.onerror = () => reject(new Error('Could not load the PowerPoint library — check the connection and retry'));
    document.head.appendChild(s);
  });
}

function openWeeklyDeck(){
  if(currentUser.role !== 'supervisor'){ showToast('The weekly management deck is a supervisor tool'); return; }
  showModal(`
    <h3 style="margin-top:0;">${I('chart')} Weekly management deck</h3>
    <div style="color:var(--muted); font-size:12.5px; margin:-4px 0 12px;">A PowerPoint for the Thursday meeting: an executive summary first, then every achievement of the week in the appendix — built from the ERP files, the DSR targets and the visits in the app. Upload this week's sales files first.</div>
    <label style="font-size:12.5px; font-weight:700;">Week ending</label>
    <input type="date" id="wdEnd" value="${todayStr()}" max="${todayStr()}" style="margin:4px 0 12px;">
    <div id="wdStatus" style="font-size:12.5px; color:var(--muted); min-height:18px;"></div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn" onclick="downloadWeeklyDeck()">⬇️ Download PowerPoint</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
}
async function downloadWeeklyDeck(){
  const st = document.getElementById('wdStatus');
  const say = (t, bad) => { if(st){ st.textContent = t; st.style.color = bad ? 'var(--coral-ink)' : 'var(--muted)'; } };
  try{
    say('Building the presentation…');
    const end = (document.getElementById('wdEnd') || {}).value || todayStr();
    const pres = await buildWeeklyDeck(end);
    await pres.writeFile({ fileName: `UltraMed-Weekly-Update-${end}.pptx` });
    say('✅ Downloaded — open it in PowerPoint.');
  }catch(e){ console.error('weekly deck', e); say('❌ ' + (e && e.message ? e.message : e), true); }
}
function weeklyDeckData(end){
  return UMCore.weeklyReport(Object.assign(digestData(), { today: todayStr() }), { end, reps: REPS.slice() });
}

// ---- the deck ----
async function buildWeeklyDeck(end){
  await loadPptxLib();
  const W = weeklyDeckData(end);
  const pres = new window.PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';            // 13.33 × 7.5 in
  pres.author = currentUser.name || 'Ultramed GCC';
  pres.company = 'Ultramed GCC';
  pres.title = 'Field team weekly update – ' + wdRange(W.from, W.to);
  pres.theme = { headFontFace: WD.head, bodyFontFace: WD.body };
  const weekLbl = wdRange(W.from, W.to);
  pres.defineSlideMaster({ title: 'UM_TITLE', background: { color: WD.dk },
    objects: [{ image: { path: 'icons/icon-512.png', x: 0.6, y: 0.55, w: 0.75, h: 0.75 } }] });
  pres.defineSlideMaster({ title: 'UM_CONTENT', background: { color: WD.white }, margin: [0.5, 0.6, 0.7, 0.6],
    objects: [
      { rect: { x: 0, y: 7.05, w: 13.33, h: 0.45, fill: { color: WD.paper } } },
      { text: { text: 'Ultramed GCC · Field team weekly update · ' + weekLbl, options: { x: 0.6, y: 7.1, w: 9, h: 0.35, fontSize: 9, color: WD.muted, fontFace: WD.body } } },
      { image: { path: 'icons/logo-green.png', x: 11.25, y: 7.12, w: 1.4, h: 0.315 } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 0.75, fontFace: WD.head, fontSize: 26, bold: true, color: WD.dk, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    ],
    slideNumber: { x: 12.75, y: 7.12, w: 0.4, h: 0.3, fontSize: 9, color: WD.muted, fontFace: WD.body } });

  const R = W.reps, P = W.perRep, team = W.team;
  const content = (title, section) => { const s = pres.addSlide({ masterName: 'UM_CONTENT', sectionTitle: section }); s.addText(title, { placeholder: 'title' }); return s; };
  const txt = (s, t, o) => s.addText(t, Object.assign({ fontFace: WD.body, color: WD.ink, margin: 0, isTextBox: true }, o));
  const card = (s, x, y, w, h, fill) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill || WD.paper }, line: { color: fill || WD.paper } });
  const up = (a, b) => b > 0 ? (a - b) / b : null;
  const wins = W.wins;
  const nWins = wins.newAccounts.length + wins.reactivated.length + wins.placements.length + wins.samples.length;
  const sorted = R.slice().sort((a, b) => P[b].week - P[a].week);

  // 1 — title
  pres.addSection({ title: 'Summary' });
  let s = pres.addSlide({ masterName: 'UM_TITLE', sectionTitle: 'Summary' });
  txt(s, 'Field Team Weekly Update', { x: 0.6, y: 2.2, w: 12, h: 1.0, fontFace: WD.head, fontSize: 44, bold: true, color: WD.white });
  txt(s, 'Week of ' + weekLbl, { x: 0.6, y: 3.25, w: 12, h: 0.6, fontSize: 24, color: WD.gold });
  txt(s, 'Kuwait clinical sales · ' + R.join(' · '), { x: 0.6, y: 3.95, w: 12, h: 0.5, fontSize: 16, color: WD.soft });
  txt(s, 'Prepared by ' + (currentUser.name || 'the supervisor') + ' · Ultramed GCC', { x: 0.6, y: 6.3, w: 9, h: 0.4, fontSize: 13, color: WD.white });
  txt(s, 'Generated ' + wdDay(todayStr()) + ' from the UltraMed Field Ops app', { x: 0.6, y: 6.7, w: 9, h: 0.35, fontSize: 10, color: WD.soft });
  s.addNotes(`Week of ${weekLbl}. Sales this week ${wdKD(team.week)}; month to date ${wdKD(team.mtd)} of ${wdKD(team.target)}.`);

  // 2 — the week at a glance
  s = content('The week at a glance', 'Summary');
  const tiles = [];
  const wkUp = up(team.week, team.prevWeek);
  tiles.push({ big: W.salesCovered ? wdKD(team.week) : '—', label: 'Invoiced this week (ERP)',
    sub: !W.salesCovered ? 'No sales file for this week uploaded yet' : (wkUp != null && wkUp > 0 ? '▲ ' + wdPct(wkUp) + ' on the week before' : 'Week before: ' + wdKD(team.prevWeek)), good: wkUp != null && wkUp > 0 });
  const dayN = parseInt(W.to.slice(8, 10), 10), dimN = UMCore.getMonthDates(W.to).length;
  tiles.push({ big: team.target ? wdPct(team.mtd / team.target) : wdKD(team.mtd), label: 'Of the month\'s target achieved',
    sub: wdKD(team.mtd) + ' of ' + wdKD(team.target) + ' · day ' + dayN + ' of ' + dimN, good: false });
  const tv = R.reduce((a, r) => a + P[r].fieldVisits, 0), tc = R.reduce((a, r) => a + P[r].clinics, 0), td = R.reduce((a, r) => a + P[r].doctorsMet, 0);
  tiles.push({ big: String(tv), label: 'Field visits', sub: tc + ' clinic' + (tc === 1 ? '' : 's') + ' · ' + td + ' doctor' + (td === 1 ? '' : 's') + ' met', good: false });
  tiles.push({ big: String(nWins), label: 'Wins this week', sub: `${wins.newAccounts.length} new · ${wins.reactivated.length} back · ${wins.placements.length} new products · ${wins.samples.length} sampled`, good: nWins > 0 });
  tiles.forEach((t, i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.35, 2.88, 2.05);
    txt(s, t.big, { x: x + 0.25, y: 1.5, w: 2.4, h: 0.85, fontFace: WD.head, fontSize: t.big.length > 9 ? 28 : 36, bold: true, color: WD.dk, fit: 'shrink' });
    txt(s, t.label, { x: x + 0.25, y: 2.35, w: 2.45, h: 0.4, fontSize: 13, bold: true, color: WD.green });
    txt(s, t.sub, { x: x + 0.25, y: 2.75, w: 2.45, h: 0.55, fontSize: 11, color: t.good ? WD.pos : WD.muted, valign: 'top' });
  });
  const hl = [];
  if(W.salesCovered && sorted.length && P[sorted[0]].week > 0) hl.push(`${sorted[0]} led the week with ${wdKD(P[sorted[0]].week)} invoiced (${P[sorted[0]].invoices} invoice${P[sorted[0]].invoices === 1 ? '' : 's'}).`);
  if(wins.newAccounts.length) hl.push(`${wins.newAccounts.length} new account${wins.newAccounts.length === 1 ? '' : 's'} placed a first order: ${wins.newAccounts.slice(0, 3).map(x => x.account).join(', ')}${wins.newAccounts.length > 3 ? '…' : ''}.`);
  if(wins.placements.length) hl.push(`${wins.placements.length} new product placement${wins.placements.length === 1 ? '' : 's'} in existing accounts — e.g. ${wdCut(wins.placements[0].product, 40)} at ${wins.placements[0].account}.`);
  if(wins.reactivated.length) hl.push(`${wins.reactivated.length} account${wins.reactivated.length === 1 ? '' : 's'} back after 60+ days without an order: ${wins.reactivated.slice(0, 3).map(x => x.account).join(', ')}.`);
  const aT = R.reduce((a, r) => a + P[r].aTotal, 0), aV = R.reduce((a, r) => a + P[r].aVisited, 0);
  if(aT) hl.push(`Key (A) accounts visited this month: ${aV} of ${aT}.`);
  if(wins.invoices.length && wins.invoices[0].net > 0) hl.push(`Largest invoice of the week: ${wdKD(wins.invoices[0].net, 2)} — ${wins.invoices[0].account} (${wins.invoices[0].rep}).`);
  txt(s, 'Highlights', { x: 0.6, y: 3.75, w: 6, h: 0.4, fontFace: WD.head, fontSize: 18, bold: true, color: WD.dk });
  const hlRuns = (hl.length ? hl.slice(0, 5) : ['Upload this week\'s sales files and log the visits to see the week\'s highlights here.']).map((t, i, a) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < a.length - 1, paraSpaceAfter: 6 } }));
  txt(s, hlRuns, { x: 0.6, y: 4.2, w: 12.1, h: 2.6, fontSize: 15, color: WD.ink, valign: 'top' });
  s.addNotes(hl.join('\n'));

  // 3 — month to date against target
  s = content('Month to date against target', 'Sales');
  const withT = R.filter(r => P[r].target);
  if(withT.length){
    s.addChart(pres.charts.BAR, [
      { name: 'Achieved', labels: withT.map(r => r), values: withT.map(r => Math.round(P[r].mtd)) },
      { name: 'Target', labels: withT.map(r => r), values: withT.map(r => Math.round(P[r].target)) }],
      { x: 0.6, y: 1.3, w: 6.2, h: 5.4, barDir: 'col', barGrouping: 'clustered', chartColors: [WD.dk, WD.soft],
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '#,##0;-#,##0;;', dataLabelFontSize: 10, dataLabelColor: WD.ink,
        catAxisLabelColor: WD.ink, catAxisLabelFontSize: 12, valAxisLabelColor: WD.muted, valAxisLabelFontSize: 9, valAxisLabelFormatCode: '#,##0',
        valGridLine: { color: 'E6ECE8', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 't', legendFontSize: 11,
        catAxisLabelFontFace: WD.body, valAxisLabelFontFace: WD.body, legendFontFace: WD.body, dataLabelFontFace: WD.body });
  } else txt(s, 'No targets uploaded for this month yet (DSR file).', { x: 0.6, y: 1.5, w: 6, h: 0.5, fontSize: 14, color: WD.muted });
  const hdr = (t) => ({ text: t, options: { bold: true, color: WD.white, fill: { color: WD.dk }, fontSize: 11, align: 'center', valign: 'middle' } });
  const cell = (t, o) => ({ text: String(t), options: Object.assign({ fontSize: 11, color: WD.ink, valign: 'middle' }, o || {}) });
  const tRows = [[hdr('Person'), hdr('This week'), hdr('Month to date'), hdr('Target'), hdr('Achieved'), hdr('On pace for')]];
  R.forEach((r, i) => { const f = { fill: { color: i % 2 ? WD.white : WD.paper } };
    tRows.push([cell(r, Object.assign({ bold: true }, f)), cell(wdKD(P[r].week), Object.assign({ align: 'right' }, f)), cell(wdKD(P[r].mtd), Object.assign({ align: 'right' }, f)),
      cell(P[r].target ? wdKD(P[r].target) : '—', Object.assign({ align: 'right' }, f)), cell(wdPct(P[r].pct), Object.assign({ align: 'center', bold: true, color: WD.dk }, f)), cell(wdPct(P[r].pace), Object.assign({ align: 'center' }, f))]); });
  tRows.push([cell('Team', { bold: true, fill: { color: WD.mint } }), cell(wdKD(team.week), { align: 'right', bold: true, fill: { color: WD.mint } }), cell(wdKD(team.mtd), { align: 'right', bold: true, fill: { color: WD.mint } }),
    cell(wdKD(team.target), { align: 'right', bold: true, fill: { color: WD.mint } }), cell(team.target ? wdPct(team.mtd / team.target) : '—', { align: 'center', bold: true, color: WD.dk, fill: { color: WD.mint } }), cell('', { fill: { color: WD.mint } })]);
  s.addTable(tRows, { x: 7.05, y: 1.45, w: 5.65, colW: [1.15, 0.95, 1.05, 0.95, 0.8, 0.75], rowH: 0.42, fontFace: WD.body, border: { type: 'solid', pt: 0.5, color: WD.line } });
  txt(s, `Achieved = ERP invoices to ${wdDay(W.to)} (each sale counts for the clinic's owner; shared accounts for whoever invoiced). Targets: the month's DSR. "On pace for" = month-to-date sales projected to the month's end.`,
    { x: 7.05, y: 1.45 + 0.42 * tRows.length + 0.25, w: 5.65, h: 0.9, fontSize: 10, color: WD.muted, valign: 'top' });

  // 4 — week by week
  s = content('Week by week this month', 'Sales');
  if(W.weeks.length && R.length){
    s.addChart(pres.charts.BAR, R.map(r => ({ name: r, labels: W.weeks.map(w => wdRange(w.from, w.to).replace(/ \d{4}$/, '')), values: W.weeks.map(w => Math.round(w.byRep[r])) })),
      { x: 0.6, y: 1.3, w: 12.1, h: 5.0, barDir: 'col', barGrouping: 'clustered', chartColors: [WD.dk, WD.gold, '5FA77E', WD.soft].slice(0, Math.max(1, R.length)),
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '#,##0;-#,##0;;', dataLabelFontSize: 10, dataLabelColor: WD.ink,
        catAxisLabelColor: WD.ink, catAxisLabelFontSize: 12, valAxisLabelColor: WD.muted, valAxisLabelFontSize: 9, valAxisLabelFormatCode: '#,##0',
        valGridLine: { color: 'E6ECE8', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 't', legendFontSize: 11,
        catAxisLabelFontFace: WD.body, valAxisLabelFontFace: WD.body, legendFontFace: WD.body, dataLabelFontFace: WD.body });
  }
  txt(s, 'KD invoiced per week (ERP). Weeks run Sunday to Saturday; the first and last are cut at the month\'s edges.', { x: 0.6, y: 6.45, w: 12.1, h: 0.4, fontSize: 10, color: WD.muted });

  // 5 — brands
  s = content('Brands this week and this month', 'Sales');
  const bWeek = W.brands.filter(b => b.week > 0).slice(0, 8);
  if(bWeek.length){
    s.addChart(pres.charts.BAR, [{ name: 'This week', labels: bWeek.map(b => wdBrand(b.brand)), values: bWeek.map(b => Math.round(b.week)) }],
      { x: 0.6, y: 1.3, w: 6.0, h: 5.4, barDir: 'bar', chartColors: [WD.dk], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '#,##0', dataLabelFontSize: 10,
        catAxisOrientation: 'maxMin', catAxisLabelColor: WD.ink, catAxisLabelFontSize: 11, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
        showTitle: true, title: 'KD invoiced this week, by brand', titleFontSize: 13, titleColor: WD.dk, showLegend: false,
        catAxisLabelFontFace: WD.body, titleFontFace: WD.body, dataLabelFontFace: WD.body });
  } else txt(s, 'No brand sales in this week\'s files yet.', { x: 0.6, y: 1.5, w: 6, h: 0.5, fontSize: 14, color: WD.muted });
  const bT = W.brands.filter(b => b.target).sort((a, b) => (b.mtd / b.target) - (a.mtd / a.target)).slice(0, 9);
  const bRows = [[hdr('Brand'), hdr('Month to date'), hdr('Target'), hdr('Achieved')]];
  bT.forEach((b, i) => { const f = { fill: { color: i % 2 ? WD.white : WD.paper } };
    bRows.push([cell(wdBrand(b.brand), Object.assign({ bold: true }, f)), cell(wdKD(b.mtd), Object.assign({ align: 'right' }, f)), cell(wdKD(b.target), Object.assign({ align: 'right' }, f)), cell(wdPct(b.mtd / b.target), Object.assign({ align: 'center', bold: true, color: WD.dk }, f))]); });
  if(bT.length) s.addTable(bRows, { x: 7.0, y: 1.45, w: 5.7, colW: [2.0, 1.35, 1.25, 1.1], rowH: 0.42, fontFace: WD.body, border: { type: 'solid', pt: 0.5, color: WD.line } });
  txt(s, 'Brands ordered by progress toward their monthly target (DSR brand targets of the whole team).', { x: 7.0, y: 6.35, w: 5.7, h: 0.45, fontSize: 10, color: WD.muted });

  // 6 — field work
  pres.addSection({ title: 'Field work' });
  s = content('Field work this week', 'Field work');
  const tf = { visits: tv, doctors: td, prods: R.reduce((a, r) => a + P[r].productsPresented, 0), orders: R.reduce((a, r) => a + P[r].orders, 0) };
  [[String(tf.visits), 'field visit' + (tf.visits === 1 ? '' : 's')], [String(td), 'doctor' + (td === 1 ? '' : 's') + ' met'], [String(tf.prods), 'product' + (tf.prods === 1 ? '' : 's') + ' presented'], [String(tf.orders), 'order' + (tf.orders === 1 ? '' : 's') + ' logged in the app']].forEach((t, i) => {
    const x = 0.6 + i * 3.08; card(s, x, 1.3, 2.88, 1.25);
    txt(s, t[0], { x: x + 0.25, y: 1.38, w: 2.4, h: 0.7, fontFace: WD.head, fontSize: 32, bold: true, color: WD.dk });
    txt(s, t[1], { x: x + 0.25, y: 2.05, w: 2.45, h: 0.4, fontSize: 12, color: WD.green, bold: true });
  });
  const fRows = [[hdr('Person'), hdr('Field visits'), hdr('Clinics'), hdr('Doctors met'), hdr('Products shown'), hdr('Joint visits'), hdr('Calls'), hdr('Orders (KD)'), hdr('Follow-ups set'), hdr('A-accounts this month')]];
  R.forEach((r, i) => { const p = P[r], f = { fill: { color: i % 2 ? WD.white : WD.paper }, align: 'center' };
    fRows.push([cell(r, Object.assign({}, f, { align: 'left', bold: true })), cell(p.fieldVisits, f), cell(p.clinics, f), cell(p.doctorsMet, f), cell(p.productsPresented, f), cell(p.joint, f), cell(p.calls + (p.phoneOrders ? ' + ' + p.phoneOrders + ' tel. orders' : ''), f),
      cell(p.orders ? p.orders + ' · ' + wdKD(p.orderValue) : '—', f), cell(p.followUps, f), cell(p.aTotal ? p.aVisited + ' of ' + p.aTotal : '—', f)]); });
  s.addTable(fRows, { x: 0.6, y: 2.85, w: 12.1, colW: [1.5, 1.05, 0.9, 1.1, 1.25, 1.05, 1.55, 1.35, 1.15, 1.2], rowH: 0.45, fontFace: WD.body, border: { type: 'solid', pt: 0.5, color: WD.line } });
  txt(s, 'A joint visit counts for both people who were there; orders and follow-ups for the person who logged the visit. Every visit is listed in the appendix.', { x: 0.6, y: 6.45, w: 12.1, h: 0.4, fontSize: 10, color: WD.muted });

  // KPI scorecard — month to date (the same scores as the KPI screen)
  if(typeof UMCore.kpiScorecard === 'function'){
    s = content('KPI scorecard – month to date', 'Field work');
    const kd = Object.assign(digestData(), { today: todayStr() }), krows = UMCore.erpAttributedRows(kd), kS = (typeof kpiSettings === 'function') ? kpiSettings() : {};
    const K = R.map(r => UMCore.kpiScorecard(kd, { rep: r, from: W.monthStart, to: W.to, settings: kS, rows: krows }));
    const sc = x => x == null ? '—' : Math.round(x * 100) + '%';
    const fillOf = x => x == null ? WD.white : x >= 0.85 ? 'DDF1E3' : x >= 0.6 ? 'FFF1D6' : 'FBE3E2';
    const kRows = [[hdr('KPI'), hdr('Weight')].concat(K.map(k => hdr(k.rep)))];
    kRows.push([cell('Total score', { bold: true, fill: { color: WD.mint } }), cell('100%', { align: 'center', fill: { color: WD.mint } })].concat(K.map(k => cell(k.total == null ? '—' : k.total + ' / 100', { align: 'center', bold: true, fontSize: 13, color: WD.dk, fill: { color: WD.mint } }))));
    (K[0] ? K[0].items : []).forEach((it, i) => kRows.push([cell(it.label), cell(it.weight + '%', { align: 'center', color: WD.muted })].concat(K.map(k => cell(sc(k.items[i].score), { align: 'center', bold: true, fill: { color: fillOf(k.items[i].score) } })))));
    kRows.push([cell('Stands (tracked) – active · checked', { color: WD.muted }), cell('', {})].concat(K.map(k => cell(k.stands.active + ' · ' + k.stands.checked, { align: 'center', color: WD.muted }))));
    const pw = Math.min(2.2, (12.1 - 4.3 - 0.8) / Math.max(1, R.length));
    s.addTable(kRows, { x: 0.6, y: 1.3, w: 4.3 + 0.8 + pw * R.length, colW: [4.3, 0.8].concat(R.map(() => pw)), rowH: 0.36, fontFace: WD.body, fontSize: 11, border: { type: 'solid', pt: 0.5, color: WD.line } });
    txt(s, `Scores from ${wdRange(W.monthStart, W.to)}: sales on pace and brands on track; field visits a day; plan saved before the first visit and complete visit reports; doctors met and decision makers known; invoices within the discount limits; escalations and returns; My Fatoorah growth; government accounts visited each week; new products and accounts; client requests answered on time. A measure with nothing to count yet is left out of the total.`,
      { x: 0.6, y: 6.15, w: 12.1, h: 0.7, fontSize: 9.5, color: WD.muted, valign: 'top' });
  }

  // 7 — wins
  s = content('Wins of the week', 'Field work');
  const boxes = [
    ['New accounts', 'first order ever in our files', wins.newAccounts.map(x => [x.account, x.rep + ' · ' + wdKD(x.net)])],
    ['Back after 60+ days', 'accounts that ordered again', wins.reactivated.map(x => [x.account, x.rep + ' · last order ' + wdDay(x.lastBefore)])],
    ['New products placed', 'first time an account buys the product', wins.placements.map(x => [wdCut(x.product, 34) + ' — ' + x.account, x.rep + ' · ' + wdKD(x.net)])],
    ['Largest invoices', 'this week', wins.invoices.filter(i => i.net > 0).slice(0, 6).map(i => [i.account, i.rep + ' · ' + wdKD(i.net, 2)])]];
  boxes.forEach((b, i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.3 + Math.floor(i / 2) * 2.75;
    card(s, x, y, 5.95, 2.6);
    txt(s, [{ text: b[0] + '  ', options: { bold: true, fontFace: WD.head, fontSize: 17, color: WD.dk } }, { text: String(b[2].length), options: { bold: true, fontSize: 17, color: WD.gold } }], { x: x + 0.25, y: y + 0.15, w: 5.4, h: 0.45 });
    txt(s, b[1], { x: x + 0.25, y: y + 0.58, w: 5.4, h: 0.3, fontSize: 10, color: WD.muted });
    const items = b[2].slice(0, 4);
    const runs = items.length ? items.map((it, k) => ({ text: it[0] + '  ', options: { bold: true, breakLine: false } })).reduce((acc, r, k) => acc.concat([r, { text: items[k][1], options: { color: WD.muted, breakLine: k < items.length - 1 } }]), [])
      : [{ text: 'None this week', options: { color: WD.muted, italic: true } }];
    if(b[2].length > 4) runs.push({ text: '', options: { breakLine: true } }, { text: '+ ' + (b[2].length - 4) + ' more in the appendix', options: { color: WD.goldInk, italic: true } });
    txt(s, runs, { x: x + 0.25, y: y + 0.95, w: 5.5, h: 1.55, fontSize: 12, valign: 'top', paraSpaceAfter: 3 });
  });
  if(wins.samples.length) txt(s, `Also: samples handed out at ${wins.samples.length} account${wins.samples.length === 1 ? '' : 's'} (listed in the appendix).`, { x: 0.6, y: 6.75, w: 12.1, h: 0.3, fontSize: 10, color: WD.muted });

  // 8 — next week
  s = content('Next week: the plan (' + wdRange(W.nextFrom, W.nextTo).replace(/ \d{4}$/, '') + ')', 'Field work');
  const colW = (12.1 - 0.25 * (R.length - 1)) / Math.max(1, R.length);
  R.forEach((r, i) => {
    const n = W.next[r], x = 0.6 + i * (colW + 0.25);
    card(s, x, 1.3, colW, 4.9);
    txt(s, r, { x: x + 0.25, y: 1.42, w: colW - 0.5, h: 0.45, fontFace: WD.head, fontSize: 18, bold: true, color: WD.dk });
    const lines = [];
    lines.push({ text: n.planned.length + ' planned visit' + (n.planned.length === 1 ? '' : 's'), options: { bold: true, color: WD.green, breakLine: true } });
    n.planned.slice(0, 5).forEach(p => lines.push({ text: new Date(p.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }) + ' · ' + wdCut(p.clinic, 30), options: { breakLine: true } }));
    if(n.planned.length > 5) lines.push({ text: '+ ' + (n.planned.length - 5) + ' more', options: { color: WD.muted, breakLine: true } });
    lines.push({ text: ' ', options: { breakLine: true } });
    lines.push({ text: n.followUps.length + ' follow-up' + (n.followUps.length === 1 ? '' : 's') + ' due', options: { bold: true, color: WD.green, breakLine: true } });
    n.followUps.slice(0, 3).forEach(p => lines.push({ text: wdDay(p.date) + ' · ' + wdCut(p.clinic, 30), options: { breakLine: true } }));
    lines.push({ text: ' ', options: { breakLine: true } });
    lines.push({ text: 'Key accounts still to visit this month', options: { bold: true, color: WD.green, breakLine: true } });
    (n.aMissing.length ? n.aMissing.slice(0, 4) : [P[r].aTotal ? 'All visited ✓' : 'No key (A) accounts assigned']).forEach((c, k, a) => lines.push({ text: wdCut(c, 34), options: { breakLine: k < a.length - 1 } }));
    txt(s, lines, { x: x + 0.25, y: 1.95, w: colW - 0.45, h: 4.1, fontSize: 12, valign: 'top', fit: 'shrink' });
  });

  // appendix — every detail, in plain tables
  pres.addSection({ title: 'Appendix' });
  const table = (title, head, rows, colWs, emptyMsg) => {
    const per = 13, pages = Math.max(1, Math.ceil(rows.length / per));
    for(let pg = 0; pg < pages; pg++){
      const sl = content(title + (pages > 1 ? ` (${pg + 1}/${pages})` : ''), 'Appendix');
      const chunk = rows.slice(pg * per, pg * per + per);
      if(!chunk.length){ txt(sl, emptyMsg, { x: 0.6, y: 1.5, w: 12, h: 0.5, fontSize: 14, color: WD.muted }); continue; }
      sl.addTable([head.map(h => ({ text: h, options: { bold: true, color: WD.white, fill: { color: WD.dk }, fontSize: 10 } }))]
        .concat(chunk.map((r, i) => r.map((c, j) => ({ text: String(c == null ? '' : c), options: { fontSize: 9.5, color: WD.ink, fill: { color: i % 2 ? WD.white : WD.paper }, align: typeof c === 'number' || /^KD /.test(String(c)) ? 'right' : 'left' } })))),
        { x: 0.6, y: 1.3, w: 12.1, colW: colWs, rowH: 0.38, fontFace: WD.body, valign: 'middle', border: { type: 'solid', pt: 0.5, color: WD.line } });
    }
  };
  const winRows = []
    .concat(wins.newAccounts.map(x => [wdDay(x.date), 'New account', x.account, x.rep, 'first order in our files', wdKD(x.net, 2)]))
    .concat(wins.reactivated.map(x => [wdDay(x.date), 'Back after 60+ days', x.account, x.rep, 'previous order ' + wdDay(x.lastBefore), '']))
    .concat(wins.placements.map(x => [wdDay(x.date), 'New product placed', x.account, x.rep, wdCut(x.product, 48) + (x.brand ? ' (' + x.brand + ')' : ''), wdKD(x.net, 2)]))
    .concat(wins.samples.map(x => [wdDay(x.date), 'Samples', x.account, x.rep, wdCut(x.items.join(', '), 60), '']));
  table('Appendix – every win of the week', ['Date', 'Type', 'Account', 'Person', 'Detail', 'KD'], winRows, [0.8, 1.6, 3.0, 1.3, 4.2, 1.2], 'No wins recorded in this week\'s files.');
  table('Appendix – every invoice of the week', ['Date', 'Person', 'Invoice', 'Account', 'Brands', 'Lines', 'KD'],
    wins.invoices.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : b.net - a.net).map(i => [wdDay(i.date), i.rep, i.doc, wdCut(i.account, 40), wdCut(i.brands.map(wdBrand).join(', '), 40), i.lines, wdKD(i.net, 2)]),
    [0.8, 1.3, 1.4, 3.4, 3.0, 0.7, 1.5], 'No sales file for this week uploaded yet.');
  table('Appendix – every visit and call of the week', ['Date', 'Person', 'Clinic', 'Type', 'Doctors met', 'Products', 'Order', 'Follow-up'],
    W.visits.map(v => [wdDay(v.date), v.rep + (v.withRep ? ' + ' + v.withRep : ''), wdCut(v.clinic, 36), v.type, wdCut(v.doctors.join(', ') || '—', 34), v.products || '—', v.order ? wdKD(v.order, 2) : '—', v.followUp ? wdDay(v.followUp) : '—']),
    [0.8, 1.8, 2.9, 1.0, 2.4, 0.8, 1.2, 1.2], 'No visits logged this week.');
  // how the figures are built
  s = content('How these figures are built', 'Appendix');
  txt(s, [
    { text: 'Sales: ', options: { bold: true } }, { text: `the ERP sales files uploaded to the app (this week: ${W.salesCovered ? 'covered' : 'no file yet'}; history in the app from ${W.historyFrom ? wdDay(W.historyFrom) : '—'}). A sale counts for the clinic's owner in the app, whoever invoiced it; a shared account (hospitals, MOH) counts for whoever invoiced.`, options: { breakLine: true } },
    { text: 'Targets: ', options: { bold: true } }, { text: 'the month\'s DSR file (per person and per brand).', options: { breakLine: true } },
    { text: 'Wins: ', options: { bold: true } }, { text: '"new account" = no earlier invoice in the files in the app; "back" = no order for 60 days or more; "new product placed" = first invoice of that product to an account that bought before; samples = zero-value invoice lines.', options: { breakLine: true } },
    { text: 'Field work: ', options: { bold: true } }, { text: 'visits, calls and phone orders as logged in the app; doctors met and products presented as recorded on each visit.', options: { breakLine: true } },
    { text: 'Period: ', options: { bold: true } }, { text: `${wdRange(W.from, W.to)} (Sunday to the chosen day), compared with ${wdRange(W.prevFrom, W.prevTo)}. Month to date ${wdRange(W.monthStart, W.to)}.` }],
    { x: 0.6, y: 1.4, w: 12.1, h: 5.2, fontSize: 14, valign: 'top', paraSpaceAfter: 10 });
  return pres;
}
