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
// Month labels for the trend charts: "Aug", "Sep", "Oct (to 8th)".
function wdMonth(row, withYear){
  const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(row.month.slice(5, 7), 10) - 1] + (withYear ? ' ' + row.month.slice(0, 4) : '');
  return row.partial ? n + ' (to ' + parseInt(row.to.slice(8, 10), 10) + ')' : n;
}
function wdTrend(end, months){
  const d = Object.assign(digestData(), { today: todayStr() });
  return UMCore.monthlyTrend(d, { end, reps: REPS.slice(), months: months || 6, settings: (typeof kpiSettings === 'function') ? kpiSettings() : {} });
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
  // the strongest TRUE comparison: on last week, else on the average of the
  // earlier weeks, else the week's own breadth (invoices and accounts)
  const HW = (W.history || []).filter(h => h.covered && !h.current), curH = (W.history || []).find(h => h.current) || {};
  const avg8 = HW.length >= 3 ? HW.reduce((a, h) => a + h.sales, 0) / HW.length : null;
  const vsAvg = avg8 > 0 ? (team.week - avg8) / avg8 : null;
  tiles.push({ big: W.salesCovered ? wdKD(team.week) : '—', label: 'Invoiced this week (ERP)',
    sub: !W.salesCovered ? 'No sales file for this week uploaded yet'
      : wkUp != null && wkUp > 0 ? '▲ ' + wdPct(wkUp) + ' on the week before'
      : vsAvg != null && vsAvg > 0 ? '▲ ' + wdPct(vsAvg) + ' above the ' + HW.length + '-week average'
      : (curH.invoices || 0) + ' invoice' + (curH.invoices === 1 ? '' : 's') + ' · ' + (curH.accounts || 0) + ' account' + (curH.accounts === 1 ? '' : 's') + ' served',
    good: (wkUp != null && wkUp > 0) || (vsAvg != null && vsAvg > 0) });
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
  const hl = UMCore.weeklyHighlights(W, { brandName: wdBrand });
  txt(s, 'Highlights', { x: 0.6, y: 3.75, w: 6, h: 0.4, fontFace: WD.head, fontSize: 18, bold: true, color: WD.dk });
  const hlRuns = (hl.length ? hl.slice(0, 6) : ['Upload this week\'s sales files and log the visits to see the week\'s highlights here.']).map((t, i, a) => ({ text: wdCut(t, 150), options: { bullet: { code: '25CF' }, breakLine: i < a.length - 1, paraSpaceAfter: 5 } }));
  txt(s, hlRuns, { x: 0.6, y: 4.2, w: 12.1, h: 2.7, fontSize: 14, color: WD.ink, valign: 'top', fit: 'shrink' });
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

  // 4 — this week against the last 8 weeks
  const HIS = W.history || [];
  s = content('This week against the last ' + HIS.length + ' weeks', 'Sales');
  if(HIS.length && R.length){
    const hl8 = HIS.map(h => (h.current ? 'This week ' : '') + wdRange(h.from, h.to).replace(/ \d{4}$/, ''));
    s.addChart(pres.charts.BAR, R.map(r => ({ name: r, labels: hl8, values: HIS.map(h => Math.round(h.byRep[r] || 0)) })),
      { x: 0.6, y: 1.15, w: 12.1, h: 2.85, barDir: 'col', barGrouping: 'stacked', chartColors: [WD.dk, WD.gold, '5FA77E', WD.soft].slice(0, Math.max(1, R.length)),
        showValue: true, dataLabelPosition: 'ctr', dataLabelFormatCode: '#,##0;-#,##0;;', dataLabelFontSize: 8, dataLabelColor: WD.white,
        catAxisLabelColor: WD.ink, catAxisLabelFontSize: 10, valAxisLabelColor: WD.muted, valAxisLabelFontSize: 8, valAxisLabelFormatCode: '#,##0',
        valGridLine: { color: 'E6ECE8', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 'r', legendFontSize: 10,
        catAxisLabelFontFace: WD.body, valAxisLabelFontFace: WD.body, legendFontFace: WD.body, dataLabelFontFace: WD.body });
    const measures = [['Sales (KD)', h => h.sales, v => Math.round(v).toLocaleString('en-US')], ['Invoices', h => h.invoices], ['Accounts invoiced', h => h.accounts],
      ['New products placed', h => h.placements], ['New accounts', h => h.newAccounts], ['Back after 60+ days', h => h.reactivated], ['Samples placed', h => h.samples],
      ['Field visits', h => h.fieldVisits], ['Doctors met', h => h.doctorsMet]];
    const head = [{ text: 'Week', options: { bold: true, color: WD.white, fill: { color: WD.dk }, fontSize: 9.5 } }].concat(HIS.map((h, i) => ({ text: hl8[i], options: { bold: true, color: h.current ? WD.dk : WD.white, fill: { color: h.current ? WD.gold : WD.dk }, fontSize: 9, align: 'center' } })));
    const body = measures.map(([lbl, f, fmt], ri) => {
      const vals = HIS.map(f), top = Math.max(0, ...vals.filter(v => v != null));
      return [{ text: lbl, options: { bold: true, fontSize: 9.5, color: WD.ink, fill: { color: ri % 2 ? WD.white : WD.paper } } }].concat(vals.map((v, i) => {
        const isBest = v != null && top > 0 && v === top, cur = HIS[i].current;
        return { text: v == null ? (HIS[i].covered ? '—' : 'no file') : (fmt ? fmt(v) : String(v)) + (isBest ? ' ★' : ''),
          options: { fontSize: 9.5, align: 'center', bold: isBest || cur, color: v == null ? WD.muted : WD.ink, fill: { color: isBest ? 'F6E7C1' : cur ? WD.mint : ri % 2 ? WD.white : WD.paper } } };
      }));
    });
    s.addTable([head].concat(body), { x: 0.6, y: 4.1, w: 12.1, colW: [1.9].concat(HIS.map(() => 10.2 / HIS.length)), rowH: 0.255, fontFace: WD.body, valign: 'middle', border: { type: 'solid', pt: 0.5, color: WD.line } });
  }
  txt(s, `Gold column = this week (${wdRange(W.from, W.to)}, to the chosen day); the others run Sunday to Saturday. ★ = the best of the ${HIS.length} weeks. Sales = ERP invoices net of returns; "—" = not measurable yet (new accounts need a month of earlier invoices).`,
    { x: 0.6, y: 6.72, w: 12.1, h: 0.3, fontSize: 9, color: WD.muted });

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

  // month by month — sales against earlier months (UMCore.monthlyTrend)
  const TR = wdTrend(W.to), TM = TR.months;
  const chartBase = () => ({ barDir: 'col', barGrouping: 'clustered', showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '#,##0;-#,##0;;', dataLabelFontSize: 10, dataLabelColor: WD.ink,
    catAxisLabelColor: WD.ink, catAxisLabelFontSize: 11, valAxisLabelColor: WD.muted, valAxisLabelFontSize: 9, valAxisLabelFormatCode: '#,##0',
    valGridLine: { color: 'E6ECE8', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 't', legendFontSize: 10.5, showTitle: true, titleFontSize: 13, titleColor: WD.dk,
    catAxisLabelFontFace: WD.body, valAxisLabelFontFace: WD.body, legendFontFace: WD.body, dataLabelFontFace: WD.body, titleFontFace: WD.body });
  if(TM.length > 1){
    s = content('Month by month: sales against earlier months', 'Sales');
    const mLbl = TM.map(m => wdMonth(m));
    s.addChart(pres.charts.BAR, [
      { name: 'Achieved (ERP)', labels: mLbl, values: TM.map(m => Math.round(m.team.sales || 0)) },
      { name: 'Target (DSR)', labels: mLbl, values: TM.map(m => Math.round(m.team.target || 0)) }],
      Object.assign(chartBase(), { x: 0.6, y: 1.2, w: 7.3, h: 3.55, chartColors: [WD.dk, WD.soft], title: 'Team: achieved and target per month (KD)' }));
    const dN = parseInt(W.to.slice(8, 10), 10), last = TM[TM.length - 1], prev = TM[TM.length - 2];
    s.addChart(pres.charts.BAR, [{ name: 'Day 1–' + dN, labels: TM.map(m => wdMonth(m).replace(/ \(to \d+\)$/, '')), values: TM.map(m => Math.round(m.team.sameDays || 0)) }],
      Object.assign(chartBase(), { x: 8.1, y: 1.2, w: 4.6, h: 3.55, chartColors: [WD.gold], showLegend: false, title: 'Same days of each month: day 1–' + dN + ' (KD)' }));
    const ch = last.team.sameDays != null && prev.team.sameDays > 0 ? (last.team.sameDays - prev.team.sameDays) / prev.team.sameDays : null;
    const tRowsM = [[hdr('Person')].concat(TM.map(m => hdr(wdMonth(m))))];
    R.concat(['Team']).forEach((r, i) => { const f = { fill: { color: r === 'Team' ? WD.mint : i % 2 ? WD.white : WD.paper } }, b = r === 'Team';
      tRowsM.push([cell(r, Object.assign({ bold: true }, f))].concat(TM.map(m => { const x = b ? m.team : m.byRep[r];
        return cell(x.sales == null ? 'no file' : wdKD(x.sales) + (x.pct != null ? ' · ' + wdPct(x.pct) : ''), Object.assign({ align: 'center', bold: b, color: x.sales == null ? WD.muted : WD.ink, fontSize: 10.5 }, f)); }))); });
    const rowHM = Math.min(0.32, 1.5 / tRowsM.length);
    s.addTable(tRowsM, { x: 0.6, y: 4.9, w: 12.1, colW: [1.7].concat(TM.map(() => 10.4 / TM.length)), rowH: rowHM, fontFace: WD.body, border: { type: 'solid', pt: 0.5, color: WD.line } });
    txt(s, (ch != null ? `Day 1–${dN}: ${wdKD(last.team.sameDays)} this month against ${wdKD(prev.team.sameDays)} in ${wdMonth(prev)} (${ch >= 0 ? '▲ +' : '▼ '}${wdPct(ch)}). ` : '') +
      'Achieved = ERP invoices of each month (the running month to its last invoiced day); "no file" = no sales file of that person for that month in the app. % = of that month\'s own DSR target.',
      { x: 0.6, y: 4.9 + rowHM * tRowsM.length + 0.08, w: 12.1, h: 0.45, fontSize: 9.5, color: ch != null && ch > 0 ? WD.pos : WD.muted, valign: 'top' });
    s.addNotes(TM.map(m => `${wdMonth(m, true)}: ${m.team.sales == null ? 'no sales file' : wdKD(m.team.sales) + ' of ' + wdKD(m.team.target || 0)}; day 1–${dN}: ${m.team.sameDays == null ? '—' : wdKD(m.team.sameDays)}`).join('\n'));
  }

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

  // month by month — field work and KPI
  if(TM.length > 1){
    s = content('Month by month: field work and KPI', 'Field work');
    const mLbl = TM.map(m => wdMonth(m)), cols = [WD.dk, WD.gold, '5FA77E', WD.soft];
    s.addChart(pres.charts.BAR, R.map(r => ({ name: r, labels: mLbl, values: TM.map(m => m.byRep[r].perDay) })),
      Object.assign(chartBase(), { x: 0.6, y: 1.2, w: 6.0, h: 3.6, chartColors: cols.slice(0, Math.max(1, R.length)), dataLabelFormatCode: '0.0;-0.0;;', valAxisLabelFormatCode: '0.0', title: 'Field visits a working day (target ' + ((typeof kpiSettings === 'function' ? kpiSettings() : {}).visitsPerDay || 5) + ')' }));
    s.addChart(pres.charts.BAR, R.map(r => ({ name: r, labels: mLbl, values: TM.map(m => m.byRep[r].kpi || 0) })),
      Object.assign(chartBase(), { x: 6.8, y: 1.2, w: 5.9, h: 3.6, chartColors: cols.slice(0, Math.max(1, R.length)), valAxisMaxVal: 100, valAxisMinVal: 0, title: 'KPI total score (out of 100)' }));
    const fr = [[hdr('Team')].concat(TM.map(m => hdr(wdMonth(m))))];
    const line = (lbl, f, i) => [cell(lbl, { bold: true, fill: { color: i % 2 ? WD.white : WD.paper } })].concat(TM.map(m => { const v = f(m); return cell(v == null ? '—' : String(v), { align: 'center', fill: { color: i % 2 ? WD.white : WD.paper } }); }));
    fr.push(line('Field visits', m => m.team.fieldVisits, 0));
    fr.push(line('Doctors met', m => m.team.doctorsMet, 1));
    fr.push(line('New accounts', m => m.team.newAccounts, 2));
    fr.push(line('New products placed', m => m.team.placements, 3));
    s.addTable(fr, { x: 0.6, y: 4.95, w: 12.1, colW: [2.2].concat(TM.map(() => 9.9 / TM.length)), rowH: 0.3, fontFace: WD.body, fontSize: 10.5, border: { type: 'solid', pt: 0.5, color: WD.line } });
    txt(s, 'Visits as logged in the app (a joint visit counts for both); KPI = the same 10 measures as the scorecard, scored month by month. "—" = not measurable yet (new accounts need an earlier month in the sales files). The running month counts to ' + wdDay(W.to) + '.',
      { x: 0.6, y: 6.5, w: 12.1, h: 0.45, fontSize: 9.5, color: WD.muted, valign: 'top' });
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
  const byNet = (a, b) => (b.net || 0) - (a.net || 0);
  const winRows = []                                   // the biggest first, down to the smallest
    .concat(wins.newAccounts.slice().sort(byNet).map(x => [wdDay(x.date), 'New account', x.account, x.rep, 'first order in our files', wdKD(x.net, 2)]))
    .concat(wins.reactivated.map(x => [wdDay(x.date), 'Back after 60+ days', x.account, x.rep, 'previous order ' + wdDay(x.lastBefore), '']))
    .concat(wins.placements.slice().sort(byNet).map(x => [wdDay(x.date), 'New product placed', x.account, x.rep, wdCut(x.product, 48) + (x.brand ? ' (' + x.brand + ')' : ''), wdKD(x.net, 2)]))
    .concat(wins.samples.map(x => [wdDay(x.date), 'Samples', x.account, x.rep, wdCut(x.items.join(', '), 60), '']));
  table('Appendix – every win of the week, biggest first', ['Date', 'Type', 'Account', 'Person', 'Detail', 'KD'], winRows, [0.8, 1.6, 3.0, 1.3, 4.2, 1.2], 'No wins recorded in this week\'s files.');
  table('Appendix – every invoice of the week, largest first', ['Date', 'Person', 'Invoice', 'Account', 'Brands', 'Lines', 'KD'],
    wins.invoices.slice().sort((a, b) => b.net - a.net || (a.date < b.date ? -1 : 1)).map(i => [wdDay(i.date), i.rep, i.doc, wdCut(i.account, 40), wdCut(i.brands.map(wdBrand).join(', '), 40), i.lines, wdKD(i.net, 2)]),
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
