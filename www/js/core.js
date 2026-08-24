/*
 * UltraMed Field Ops — core logic.
 *
 * Pure functions shared between the app (www/index.html, via <script src>)
 * and the automated tests (tests/, via require). Everything here must stay
 * free of DOM access and app globals: data comes in through parameters.
 */
(function(root, factory){
  if(typeof module === 'object' && module.exports){ module.exports = factory(); }
  else { root.UMCore = factory(); }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  // ---- ids / formatting ----
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function localDateStr(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  // Local calendar date, NOT toISOString(): Kuwait is UTC+3, so the UTC date
  // is still "yesterday" between midnight and 3 AM local time.
  function todayStr(){ return localDateStr(new Date()); }
  function fmtDate(d){ const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US',{month:'short', day:'numeric'}); }
  function daysBetween(a,b){ return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00')) / 86400000); }
  function esc(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  // Only http(s) links are ever rendered as href — blocks javascript:/data: URI injection via saved fields.
  function safeUrl(u){ u=(u||'').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function initials(n){ return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
  function money(n){ return (n||0).toFixed(2)+' KD'; }
  function slugify(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

  // ---- calendar helpers ----
  function getWeekDates(anchor){
    const d = new Date(anchor+'T00:00:00');
    const start = new Date(d); start.setDate(d.getDate()-d.getDay());
    const dates = [];
    for(let i=0;i<7;i++){ const x=new Date(start); x.setDate(start.getDate()+i); dates.push(localDateStr(x)); }
    return dates;
  }
  // The work week is Sunday–Thursday; Friday and Saturday are the weekend.
  function isWorkday(dateStr){
    var g = new Date(dateStr + 'T00:00:00').getDay();
    return g !== 5 && g !== 6;
  }
  // Inclusive count of working days (Sun–Thu) between two ISO dates.
  function workingDaysBetween(fromStr, toStr){
    var n = 0;
    var d = new Date(fromStr + 'T00:00:00');
    var end = new Date(toStr + 'T00:00:00');
    while(d <= end){
      var g = d.getDay();
      if(g !== 5 && g !== 6) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }
  function getMonthDates(anchor){
    const d = new Date(anchor+'T00:00:00');
    const year = d.getFullYear(), month = d.getMonth();
    const lastDay = new Date(year, month+1, 0).getDate();
    const dates = [];
    for(let i=1;i<=lastDay;i++){ dates.push(localDateStr(new Date(year, month, i))); }
    return dates;
  }
  function followStatus(dateStr, today){
    if(!dateStr) return 'none';
    const diff = daysBetween(today || todayStr(), dateStr);
    if(diff < 0) return 'overdue';
    if(diff === 0) return 'today';
    return 'upcoming';
  }

  // ---- persistence helpers ----
  // One corrupt stored entry must not take the rest of the data down with it:
  // callers parse each key through this instead of a bare JSON.parse.
  function safeParse(raw, fallback){
    if(raw === null || raw === undefined) return fallback;
    try{ return JSON.parse(raw); }catch(e){ return fallback; }
  }

  // ---- CSV ----
  function csvEscape(v){
    if(v===null||v===undefined) return '';
    let s = String(v);
    // Neutralize spreadsheet formula injection (=CMD(), @SUM(), +/- payloads)
    // while leaving plain numbers like "+96512345678" or "-5.5" untouched.
    if(/^[=@]/.test(s) || (/^[+-]/.test(s) && !/^[+-]\d+(\.\d+)?$/.test(s))) s = "'" + s;
    if(s.includes(',')||s.includes('"')||s.includes('\n')) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  }

  // ---- order math ----
  // order: {qty: {productId: count}, discountPct}
  function orderGross(order, products){
    let g = 0;
    Object.keys(order.qty).forEach(pid=>{
      // Keys may be plain ids or _key values ("ID#2" for duplicated catalog
      // ids) — same lookup order as the app's findProduct.
      const p = products.find(x=>(x._key||x.id)===pid) || products.find(x=>x.id===pid);
      const q = order.qty[pid]||0;
      if(p && p.price!=null) g += p.price*q;
    });
    return g;
  }
  function orderNet(order, products){
    const g = orderGross(order, products);
    return Math.round(g*(1-(order.discountPct||0)/100)*100)/100;
  }
  // items: {productKey: qty}. Keys match on _key first, then id (same lookup
  // as the app's findProduct). Returns rounded {gross, disc, net}.
  function orderTotals(items, discountPct, products){
    let gross = 0;
    Object.keys(items).forEach(id=>{
      const p = products.find(x=>(x._key||x.id)===id) || products.find(x=>x.id===id);
      if(p && p.price!=null) gross += p.price*items[id];
    });
    const net = gross*(1-(discountPct||0)/100);
    return {gross:Math.round(gross*100)/100, disc:Math.round((gross-net)*100)/100, net:Math.round(net*100)/100};
  }

  // ---- contacts ----
  // Healthcare professionals met during a visit. New visits record doctorIds
  // (multi-select); older ones carry a single doctorId; call logs a contactName.
  function contactCount(v){
    if(Array.isArray(v.doctorIds) && v.doctorIds.length) return v.doctorIds.length;
    if(v.doctorId) return 1;
    if(v.callOnly && v.contactName) return 1;
    return 0;
  }

  // ---- rep scoring ----
  // A "visit" means a real field visit — physical presence at the clinic.
  // Phone calls (callOnly) and remote orders (orderOnly) are separate
  // activities and never inflate the visit count.
  function isFieldVisit(v){ return !!v && !v.orderOnly && !v.callOnly; }
  // Everyone who was AT a visit counts it: the rep who logged it and the
  // colleague on a joint visit both get credit in their own scorecard.
  function repWasThere(v, repName){ return v.rep === repName || v.withRep === repName; }

  function computeScoreForVisits(repName, visitList, clinics){
    // Money and orders belong to the lead rep only, so a joint visit's sale is
    // never double-counted across two reps' revenue.
    const led = visitList.filter(v=>v.rep===repName);
    // Visit COUNT and coverage credit both reps who attended, de-duplicated so
    // an accidental double-tap never inflates the number.
    const attendedField = dedupeVisits(visitList.filter(v=>repWasThere(v,repName) && isFieldVisit(v))).unique;
    const assigned = clinics.filter(c=>c.rep===repName && c.cls!=='Closed');
    const priorityAssigned = assigned.filter(c=>c.cls==='A'||c.cls==='B');
    const coveredIds = new Set(attendedField.map(v=>v.clinicId));
    const priorityIds = new Set(priorityAssigned.map(c=>c.id));
    const priorityCovered = [...coveredIds].filter(id=>priorityIds.has(id)).length;
    const orders = led.filter(v=>v.orderTaken).length;
    const revenue = led.reduce((s,v)=>s+(v.orderTotal||0),0);
    const contacts = attendedField.reduce((s,v)=>s+contactCount(v),0);
    const ledField = led.filter(isFieldVisit).length;
    const fieldOrders = led.filter(v=>isFieldVisit(v)&&v.orderTaken).length;
    return {
      visits: attendedField.length, orders, revenue, contacts,
      calls: led.filter(v=>v.callOnly).length,
      remoteOrders: led.filter(v=>v.orderOnly).length,
      // Conversion = share of field visits that closed an order (not diluted by calls).
      conversion: ledField ? Math.round(fieldOrders/ledField*100) : 0,
      assignedCount: assigned.length, covered: coveredIds.size,
      coveragePct: assigned.length ? Math.round(coveredIds.size/assigned.length*100) : 0,
      priorityAssignedCount: priorityAssigned.length, priorityCovered,
      priorityPct: priorityAssigned.length ? Math.round(priorityCovered/priorityAssigned.length*100) : 0,
    };
  }
  // data: {visits, clinics, tasks, today} — visits already filtered to the report range.
  function computeRepScore(repName, data){
    const s = computeScoreForVisits(repName, data.visits, data.clinics);
    const overdue = data.clinics.filter(c=>c.rep===repName && c.cls!=='Closed' && followStatus(c.nextFollowUp, data.today)==='overdue').length;
    const repTasks = data.tasks.filter(t=>t.rep===repName);
    const tasksDone = repTasks.filter(t=>t.done).length;
    return Object.assign({rep: repName}, s, {
      overdue, tasksTotal: repTasks.length, tasksDone,
      taskPct: repTasks.length ? Math.round(tasksDone/repTasks.length*100) : 0
    });
  }
  // dates: iterable of 'YYYY-MM-DD' visit dates for one rep. Counts consecutive
  // days ending today; a not-yet-logged today doesn't break yesterday's streak.
  function calcStreak(dates, today){
    const days = dates instanceof Set ? dates : new Set(dates);
    if(!days.size) return 0;
    const d = new Date((today || todayStr()) + 'T00:00:00');
    let streak = 0;
    for(let i=0;i<365;i++){
      const key = localDateStr(d);
      if(days.has(key)) streak++;
      else if(i>0) break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  // ---- calendar ----
  // Everything happening on one date, filtered by rep ('all' = everyone).
  // data: {visits, clinics, tasks, events, dayPlans}
  //  - dayPlans[date][repName] = [{id: clinicId, note}] (legacy entries may be bare id strings)
  //  - events: {id, title, date, time, type, notes, rep} where rep 'all' = whole team
  // Returns {planned, visits, followUps, tasks, events, total}.
  function calendarDayItems(dateStr, repFilter, data){
    const wantRep = r => repFilter === 'all' || r === repFilter;
    const dayObj = (data.dayPlans || {})[dateStr] || {};
    const planned = [];
    Object.keys(dayObj).forEach(rep => {
      if(!wantRep(rep)) return;
      (dayObj[rep] || []).forEach(e => {
        const entry = typeof e === 'string' ? { id: e, note: '' } : e;
        planned.push({ rep, clinicId: entry.id, note: entry.note || '' });
      });
    });
    const visits = (data.visits || []).filter(v => v.date === dateStr && (wantRep(v.rep) || wantRep(v.withRep)));
    const followUps = (data.clinics || []).filter(c =>
      c.nextFollowUp === dateStr && c.cls !== 'Closed' && wantRep(c.rep));
    const tasks = (data.tasks || []).filter(t =>
      t.dueDate === dateStr && !t.done && (wantRep(t.rep) || t.rep === 'Team'));
    const events = (data.events || []).filter(ev =>
      ev.date === dateStr && (ev.rep === 'all' || wantRep(ev.rep)));
    return {
      planned, visits, followUps, tasks, events,
      total: planned.length + visits.length + followUps.length + tasks.length + events.length
    };
  }

  // ---- date-range analytics ----
  // from/to are inclusive 'YYYY-MM-DD' strings; lexicographic compare is safe.
  function inRange(dateStr, from, to){
    if(!dateStr) return false;
    if(from && dateStr < from) return false;
    if(to && dateStr > to) return false;
    return true;
  }
  function filterVisitsByRange(visits, from, to){
    return (visits || []).filter(v => inRange(v.date, from, to));
  }
  // Everything that happened (or is scheduled) between two dates, filtered by
  // rep ('all' = everyone). data: {visits, clinics, tasks, events, dayPlans}
  function rangeSummary(from, to, repFilter, data){
    const wantRep = r => repFilter === 'all' || r === repFilter;
    const vis = filterVisitsByRange(data.visits, from, to).filter(v => wantRep(v.rep));
    const fieldVisits = vis.filter(v => !v.orderOnly && !v.callOnly);
    const calls = vis.filter(v => v.callOnly);
    const orders = vis.filter(v => v.orderTaken);
    const revenue = vis.reduce((s, v) => s + (v.orderTotal || 0), 0);
    const discount = vis.reduce((s, v) => s + (v.orderDiscount || 0), 0);
    const contacts = vis.reduce((s, v) => s + contactCount(v), 0);
    const clinicsCovered = new Set(vis.map(v => v.clinicId)).size;
    let planned = 0;
    Object.keys(data.dayPlans || {}).forEach(d => {
      if(!inRange(d, from, to)) return;
      const dayObj = data.dayPlans[d];
      Object.keys(dayObj).forEach(rep => { if(wantRep(rep)) planned += (dayObj[rep] || []).length; });
    });
    const events = (data.events || []).filter(ev =>
      inRange(ev.date, from, to) && (ev.rep === 'all' || wantRep(ev.rep)));
    const followUpsDue = (data.clinics || []).filter(c =>
      c.cls !== 'Closed' && inRange(c.nextFollowUp, from, to) && wantRep(c.rep));
    const tasksDue = (data.tasks || []).filter(t =>
      !t.done && inRange(t.dueDate, from, to) && (wantRep(t.rep) || t.rep === 'Team'));
    // per-rep breakdown from the visits in range — visits mean FIELD visits,
    // consistent with the top-level fieldVisits and the scorecard.
    const byRep = {};
    vis.forEach(v => {
      const r = byRep[v.rep] || (byRep[v.rep] = { rep: v.rep, visits: 0, orders: 0, revenue: 0, contacts: 0 });
      if(!v.orderOnly && !v.callOnly) r.visits++;
      if(v.orderTaken) r.orders++;
      r.revenue += v.orderTotal || 0;
      r.contacts += contactCount(v);
    });
    return {
      totalActivity: vis.length, fieldVisits: fieldVisits.length, calls: calls.length,
      orders: orders.length, revenue, discount, contacts, clinicsCovered,
      conversion: fieldVisits.length ? Math.round(orders.length / fieldVisits.length * 100) : 0,
      planned, events: events.length, followUpsDue: followUpsDue.length, tasksDue: tasksDue.length,
      perRep: Object.values(byRep).sort((a, b) => b.revenue - a.revenue),
    };
  }

  // ---- period comparison / targets / dormant clinics ----
  // Percentage change from prev to cur; a zero baseline reports 100% when
  // anything appeared (and 0% when both are zero) rather than dividing by zero.
  function pctDelta(cur, prev){
    if(!prev) return cur > 0 ? 100 : 0;
    return Math.round((cur - prev) / prev * 100);
  }
  // Planned visits whose day has passed with no matching visit logged by that
  // rep at that clinic on that day. Looks back `daysBack` days (default 14).
  // Returns [{date, rep, clinicId, note}], oldest first.
  function missedPlans(dayPlans, visits, today, opts){
    const daysBack = (opts && opts.daysBack) || 14;
    const floor = new Date(today + 'T00:00:00');
    floor.setDate(floor.getDate() - daysBack);
    const floorStr = localDateStr(floor);
    const visited = new Set((visits || []).map(v => v.date + '|' + v.rep + '|' + v.clinicId));
    const out = [];
    Object.keys(dayPlans || {}).forEach(d => {
      if(d >= today || d < floorStr) return;
      const dayObj = dayPlans[d];
      Object.keys(dayObj || {}).forEach(rep => {
        (dayObj[rep] || []).forEach(e => {
          const clinicId = typeof e === 'string' ? e : e.id;
          const note = typeof e === 'string' ? '' : (e.note || '');
          if(!visited.has(d + '|' + rep + '|' + clinicId)) out.push({ date: d, rep, clinicId, note });
        });
      });
    });
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }

  // Priority clinics that haven't seen any activity for `days`+ days (or ever).
  // Never-visited clinics rank first, then longest-quiet first.
  function dormantClinics(clinics, visits, today, opts){
    const days = (opts && opts.days) || 30;
    const classes = (opts && opts.classes) || ['A', 'B'];
    const lastByClinic = {};
    (visits || []).forEach(v => {
      if(v.date && (!lastByClinic[v.clinicId] || v.date > lastByClinic[v.clinicId])) lastByClinic[v.clinicId] = v.date;
    });
    return (clinics || [])
      .filter(c => c.cls !== 'Closed' && classes.includes(c.cls))
      .map(c => {
        const last = lastByClinic[c.id] || null;
        return { id: c.id, name: c.name, rep: c.rep, cls: c.cls, lastVisit: last, daysSince: last ? daysBetween(last, today) : null };
      })
      .filter(x => x.lastVisit === null || x.daysSince >= days)
      .sort((a, b) => (b.daysSince === null ? 99999 : b.daysSince) - (a.daysSince === null ? 99999 : a.daysSince));
  }

  // Turns the raw numbers of a period into a prioritized to-do list for the
  // supervisor: what to fix now ('act'), what to keep an eye on ('watch'),
  // and what is working and should be repeated ('good').
  // opts: {from, to, today, repFilter, visits, clinics, targets, dayPlans}
  // Returns [{level, icon, key, title, detail}], 'act' first.
  function coachInsights(opts){
    const from = opts.from || null, to = opts.to || null;
    const today = opts.today, repFilter = opts.repFilter || 'all';
    const visits = opts.visits || [], clinics = opts.clinics || [];
    const targets = opts.targets || {}, dayPlans = opts.dayPlans || {};
    const wantRep = r => repFilter === 'all' || r === repFilter;
    const s = rangeSummary(from, to, repFilter, { visits, clinics, tasks: [], events: [], dayPlans });
    const vis = filterVisitsByRange(visits, from, to).filter(v => wantRep(v.rep));
    const field = vis.filter(v => !v.orderOnly && !v.callOnly);
    const out = [];
    const listNames = (names, max) => names.slice(0, max).join(', ') + (names.length > max ? ' +' + (names.length - max) + ' more' : '');

    // 1. Overdue follow-ups: promised visits are the easiest sales in the pipeline.
    const overdue = clinics.filter(c => c.cls !== 'Closed' && wantRep(c.rep) && c.nextFollowUp && c.nextFollowUp < today);
    if(overdue.length){
      out.push({ level: 'act', icon: '⏰', key: 'followups', data: { count: overdue.length, names: overdue.slice(0, 3).map(function(c){ return c.name; }) },
        title: overdue.length + ' overdue follow-up' + (overdue.length === 1 ? '' : 's'),
        detail: 'Visits already promised to: ' + listNames(overdue.map(c => c.name), 3) +
          '. A promised visit is the easiest sale — book these first.' });
    }

    // 2. Best clinics going quiet = revenue quietly leaking.
    const dorm = dormantClinics(clinics, visits, today, { days: 30 }).filter(c => wantRep(c.rep));
    if(dorm.length){
      out.push({ level: 'act', icon: '😴', key: 'dormant', data: { count: dorm.length, names: dorm.slice(0, 3).map(function(c){ return c.name; }) },
        title: dorm.length + ' top clinic' + (dorm.length === 1 ? '' : 's') + ' quiet for 30+ days',
        detail: listNames(dorm.map(c => c.name + ' (' + (c.daysSince === null ? 'never visited' : c.daysSince + 'd') + ')'), 3) +
          '. Class A/B clinics buy the most — put them in next week’s plan.' });
    }

    // 3. Plans that never became visits.
    const missed = missedPlans(dayPlans, visits, today, { daysBack: 14 }).filter(m => wantRep(m.rep));
    if(missed.length){
      out.push({ level: missed.length >= 3 ? 'act' : 'watch', icon: '📅', key: 'missed', data: { count: missed.length },
        title: missed.length + ' planned visit' + (missed.length === 1 ? '' : 's') + ' never happened',
        detail: 'Planned in the last 14 days but never logged. Reschedule them from the Today screen so the plan stays real.' });
    }

    // 4. Monthly target pace, per rep with a sales target set.
    const mStart = today.slice(0, 7) + '-01';
    const daysInMonth = new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate();
    const dayOfMonth = +today.slice(8, 10);
    const erpMtd = opts.erpMtd || {}; // {rep: {amount, asOf}} from uploaded sales files
    Object.keys(targets).filter(r => wantRep(r) && targets[r] && targets[r].revenue > 0).sort().forEach(rep => {
      const t = targets[rep];
      const goal = t.revenue;
      // Target tracking is grounded in the supervisor's uploads, never in what
      // the reps type by hand. The monthly DSR and the weekly sales files are
      // both uploads — the FRESHEST one wins, so a weekly sales upload
      // overtakes an older DSR figure. Pace math uses the winning source's
      // as-of day so a mid-month upload isn't judged against today's calendar.
      const officialOk = t.achieved != null && t.achievedAsOf && t.achievedAsOf.slice(0, 7) === today.slice(0, 7);
      const e = erpMtd[rep];
      const erpOk = e && e.amount != null;
      const official = officialOk && (!erpOk || t.achievedAsOf >= (e.asOf || ''));
      const erp = !official && erpOk;
      const mtd = official ? t.achieved
        : erp ? e.amount
        : visits.filter(v => v.rep === rep && v.date >= mStart && v.date <= today)
          .reduce(function(sum, v){ return sum + (v.orderTotal || 0); }, 0);
      const src = official ? ' (official DSR figure)' : erp ? ' (from uploaded sales)' : ' (app-logged — upload a sales file for the official figure)';
      // Pace runs on WORKING days only (Sun–Thu; Fri/Sat weekend) so the
      // required daily amount is realistic for days actually worked.
      const asOfDate = official ? t.achievedAsOf : (erp && e.asOf ? e.asOf : today);
      const monthEnd = today.slice(0, 7) + '-' + ('0' + daysInMonth).slice(-2);
      const totalWork = workingDaysBetween(mStart, monthEnd);
      const workedSoFar = Math.max(1, workingDaysBetween(mStart, asOfDate));
      const expected = goal * workedSoFar / totalWork;
      const daysLeft = totalWork - workedSoFar;
      if(mtd >= goal){
        out.push({ level: 'good', icon: '🏆', key: 'target-' + rep, data: { rep: rep, mtd: mtd, goal: goal, state: 'hit', official: official },
          title: rep + ' already hit the monthly target',
          detail: money(mtd) + src + ' against a ' + money(goal) + ' goal. Everything from here is upside — a great week to push new products.' });
      } else if(mtd < expected * 0.9){
        const perDay = daysLeft > 0 ? Math.ceil((goal - mtd) / daysLeft) : Math.ceil(goal - mtd);
        out.push({ level: 'act', icon: '🎯', key: 'target-' + rep, data: { rep: rep, mtd: mtd, goal: goal, perDay: perDay, daysLeft: daysLeft, state: 'behind', official: official },
          title: rep + ' is behind the monthly target',
          detail: money(mtd) + src + ' of ' + money(goal) + ' so far. Needs about ' + perDay + ' KD/day for the remaining ' + daysLeft +
            ' working day' + (daysLeft === 1 ? '' : 's') + ' (Sun–Thu) — steer the visits toward clinics that already order.' });
      } else {
        out.push({ level: 'good', icon: '🎯', key: 'target-' + rep, data: { rep: rep, mtd: mtd, goal: goal, state: 'pace', official: official },
          title: rep + ' is on pace for the monthly target',
          detail: money(mtd) + src + ' of ' + money(goal) + '. Keep the current rhythm and the target lands on its own.' });
      }
    });

    // 5. Conversion coaching — only once there are enough visits to mean anything.
    if(s.fieldVisits >= 5){
      if(s.conversion < 30){
        out.push({ level: 'act', icon: '🛒', key: 'conversion', data: { pct: s.conversion, state: 'low' },
          title: 'Low conversion: ' + s.conversion + '% of visits end with an order',
          detail: 'Lots of walking, little closing. Open the category selling guides before each visit and always ask for the order before leaving.' });
      } else if(s.conversion >= 60){
        out.push({ level: 'good', icon: '🛒', key: 'conversion', data: { pct: s.conversion, state: 'strong' },
          title: 'Strong closing: ' + s.conversion + '% of visits take an order',
          detail: 'The pitch works. The straightest line to more sales now is simply more visits to the same kind of clinics.' });
      }
    }

    // 6. Contacts met per visit — the multiplier that costs no extra driving.
    if(s.fieldVisits >= 5){
      const perVisit = Math.round(s.contacts / s.fieldVisits * 10) / 10;
      if(perVisit < 1){
        out.push({ level: 'watch', icon: '👥', key: 'contacts', data: { perVisit: perVisit, state: 'low' },
          title: 'Only ' + perVisit + ' contact' + (perVisit === 1 ? '' : 's') + ' met per visit',
          detail: 'Every extra doctor met in the same clinic is a free lead. Ask reception who else is in today — aim for 2+ per visit.' });
      } else if(perVisit >= 2){
        out.push({ level: 'good', icon: '👥', key: 'contacts', data: { perVisit: perVisit, state: 'strong' },
          title: perVisit + ' contacts met per visit — excellent coverage',
          detail: 'Meeting more people per clinic multiplies orders without extra driving. Keep it up.' });
      }
    }

    // 7. Clinics visited again and again with nothing to show for it.
    const byClinic = {};
    field.forEach(v => {
      const b = byClinic[v.clinicId] || (byClinic[v.clinicId] = { n: 0, orders: 0 });
      b.n++; if(v.orderTaken) b.orders++;
    });
    const stuckIds = Object.keys(byClinic).filter(id => byClinic[id].n >= 3 && byClinic[id].orders === 0);
    if(stuckIds.length){
      const names = stuckIds.map(id => { const c = clinics.find(x => x.id === id); return c ? c.name : id; });
      out.push({ level: 'watch', icon: '🔁', key: 'stuck', data: { count: stuckIds.length, names: names.slice(0, 3) },
        title: stuckIds.length + ' clinic' + (stuckIds.length === 1 ? '' : 's') + ' visited 3+ times with no order',
        detail: listNames(names, 3) + '. Change the approach: different products, a different doctor, or a joint visit with the supervisor.' });
    }

    // 8. All the eggs in one basket.
    if(s.revenue > 0){
      const revByClinic = {};
      vis.forEach(v => { revByClinic[v.clinicId] = (revByClinic[v.clinicId] || 0) + (v.orderTotal || 0); });
      const ids = Object.keys(revByClinic).sort((a, b) => revByClinic[b] - revByClinic[a]);
      const share = Math.round(revByClinic[ids[0]] / s.revenue * 100);
      if(share >= 60 && ids.length > 1){
        const c = clinics.find(x => x.id === ids[0]);
        out.push({ level: 'watch', icon: '🥚', key: 'concentration', data: { share: share, name: c ? c.name : '' },
          title: share + '% of sales comes from one clinic',
          detail: (c ? c.name : 'One clinic') + ' carries this period. Great account — but grow 2-3 more A/B clinics so one slow month there can’t sink the numbers.' });
      }
    }

    // 9. One rep converts far better than another → pair them up (team view only).
    if(repFilter === 'all' && s.perRep.length >= 2){
      const enough = s.perRep.filter(r => r.visits >= 5);
      if(enough.length >= 2){
        const conv = r => Math.round(r.orders / r.visits * 100);
        const sorted = enough.slice().sort((a, b) => conv(b) - conv(a));
        const top = sorted[0], low = sorted[sorted.length - 1];
        if(conv(top) - conv(low) >= 25){
          out.push({ level: 'watch', icon: '🤝', key: 'jointcoach', data: { top: top.rep, low: low.rep, topPct: conv(top), lowPct: conv(low) },
            title: top.rep + ' converts at ' + conv(top) + '%, ' + low.rep + ' at ' + conv(low) + '%',
            detail: 'Send them on 2-3 joint visits: ' + low.rep + ' watches how ' + top.rep + ' asks for the order. Log them as joint visits so both get credit.' });
        }
      }
    }

    if(!out.length){
      out.push({ level: 'good', icon: '✅', key: 'allgood', data: {},
        title: 'No red flags in this period',
        detail: 'Follow-ups done and top clinics covered. To grow from here: more visits, and 2+ contacts met per visit.' });
    }
    const rank = { act: 0, watch: 1, good: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  // ==== ERP IMPORT & RECONCILIATION ====
  // Parses EXceed ERP sales-detail exports (CSV export, or text copied/extracted
  // from the PDF report) into normalized line items, then reconciles them
  // against the visits logged in this app.

  var ERP_BRANDS = ['WATERPIK', 'FLASH', 'Philips Export BV', 'The Breath Co.', 'TEPE',
    'Hismile', 'UNDO', 'Univet', 'Beverly Hills Formula', 'Beverly Hills', 'Silonn',
    'EverSmile', 'Ultramed', 'Maintenance', 'Shenzhen', 'B&L Biotech', 'Intensiv',
    'Tepe - Marketing', 'Curasept', 'Spotlight'];
  // ERP "customers" that are sales channels, not clinics we visit.
  var ERP_CHANNELS = ['my fatoorah', 'individual - customers', 'customers -univet',
    'customers - univet', 'online customers', 'cash customer'];

  // "1,234.500" → 1234.5 · "(6.763-)" / "6.763-" / "(1.00-)" → negative · '' → 0
  function erpNum(s){
    if(typeof s === 'number') return s;
    s = String(s == null ? '' : s).replace(/,/g, '').trim();
    if(!s) return 0;
    var neg = s.charAt(0) === '(' || s.charAt(0) === '-' || /-\)?$/.test(s);
    s = s.replace(/[()\-]/g, '');
    var v = parseFloat(s);
    if(isNaN(v)) return 0;
    return neg ? -v : v;
  }
  // Accepts dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, or an Excel serial number
  // (raw .xlsx cells store dates as day counts) → ISO yyyy-mm-dd (or null).
  function erpDate(s){
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if(m) return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
    var n = Number(s);
    if(isFinite(n) && n >= 25569 && n <= 73415){ // 1970-01-01 .. 2100-12-31
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  // Minimal CSV parser that honors quoted fields (embedded commas/newlines).
  function parseCsvText(text){
    var rows = [], row = [], cur = '', inQ = false;
    for(var i = 0; i < text.length; i++){
      var ch = text[i];
      if(inQ){
        if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if(ch === '"') inQ = true;
      else if(ch === ','){ row.push(cur); cur = ''; }
      else if(ch === '\n' || ch === '\r'){
        if(ch === '\r' && text[i+1] === '\n') i++;
        row.push(cur); cur = '';
        if(row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += ch;
    }
    if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
    return rows;
  }
  // Finds which column is which by header keywords; tolerant of naming drift.
  function detectErpColumns(header){
    var idx = {};
    var find = function(res, avoid){
      for(var i = 0; i < header.length; i++){
        var h = String(header[i] || '').toLowerCase().trim();
        if(!h) continue;
        if(avoid && avoid.test(h)) continue;
        for(var j = 0; j < res.length; j++) if(res[j].test(h)) return i;
      }
      return -1;
    };
    idx.date = find([/^date$/, /invoice date/, /^date\b/], /stock|issue/);
    idx.doc = find([/invoice\s*#/, /^invoice/, /voucher/, /doc/]);
    idx.product = find([/^product/, /^item(?! code)/, /description/], /code/);
    idx.qty = find([/^qty/, /quantity/]);
    idx.gross = find([/gross/]);
    idx.salesman = find([/^name$/, /salesman/, /sales\s*person/, /sales\s*man/]);
    idx.sret = find([/return\s*amount/, /sales\s*return$/]);
    idx.net = find([/net\s*sales/, /^net/]);
    idx.brand = find([/brand/]);
    idx.customer = find([/customer/, /^account$/], /class/);
    idx.cls = find([/class/]);
    // The essentials without which reconciliation is meaningless:
    if(idx.date < 0 || idx.doc < 0 || idx.net < 0 || idx.salesman < 0) return null;
    return idx;
  }
  // CSV export → normalized rows. Returns {rows, skipped, error}.
  function parseErpCsv(text){
    var all = parseCsvText(String(text || ''));
    var headerAt = -1, cols = null;
    for(var i = 0; i < Math.min(all.length, 25); i++){
      var c = detectErpColumns(all[i]);
      if(c){ headerAt = i; cols = c; break; }
    }
    if(!cols) return { rows: [], skipped: 0, error: 'NO_HEADER' };
    var rows = [], skipped = 0;
    for(var r = headerAt + 1; r < all.length; r++){
      var line = all[r];
      var date = erpDate(line[cols.date]);
      var doc = String(line[cols.doc] || '').trim();
      if(!date || !doc){ skipped++; continue; }
      rows.push({
        date: date, doc: doc,
        type: /^SRT|return/i.test(doc) ? 'return' : 'invoice',
        product: String(cols.product >= 0 ? line[cols.product] || '' : '').trim(),
        qty: cols.qty >= 0 ? erpNum(line[cols.qty]) : 0,
        gross: cols.gross >= 0 ? erpNum(line[cols.gross]) : 0,
        net: erpNum(line[cols.net]),
        sret: cols.sret >= 0 ? erpNum(line[cols.sret]) : 0,
        salesman: String(line[cols.salesman] || '').trim(),
        brand: String(cols.brand >= 0 ? line[cols.brand] || '' : '').trim(),
        customer: String(cols.customer >= 0 ? line[cols.customer] || '' : '').trim(),
        cls: String(cols.cls >= 0 ? line[cols.cls] || '' : '').trim(),
      });
    }
    return { rows: rows, skipped: skipped, error: rows.length ? null : 'NO_ROWS' };
  }
  // Text extracted/copied from the EXceed PDF sales report → normalized rows.
  function parseErpPdfText(text){
    var chunks = String(text || '').split(/(?=\d{2}[-\/]\d{2}[-\/]\d{4}\s+S(?:INV|RT)\d+)/);
    var pat = /(\(?[\d,]+\.\d{2}-?\)?)\s+([\d,]+\.\d{3})\s+([\d,]+\.\d{3})\s+([\d,]+\.\d{3})\s+([A-Za-z][A-Za-z .\-]*?)\s*(\(?[\d,]+\.\d{3}-?\)?)\s+(\(?[\d,]+\.\d{3}-?\)?)\s+(\(?[\d,]+\.\d{3}-?\)?)/;
    var rows = [];
    for(var i = 0; i < chunks.length; i++){
      var head = chunks[i].match(/^(\d{2}[-\/]\d{2}[-\/]\d{4})\s+(S(?:INV|RT)\d+)\s+(\d+)\s+([\s\S]*)/);
      if(!head) continue;
      var date = erpDate(head[1]), doc = head[2], rest = head[4];
      var m = rest.match(pat);
      if(!m || !date) continue;
      var tail = rest.slice(rest.indexOf(m[0]) + m[0].length).replace(/^\s+/, '');
      var brand = null;
      for(var b = 0; b < ERP_BRANDS.length; b++){
        if(tail.toUpperCase().indexOf(ERP_BRANDS[b].toUpperCase()) === 0){ brand = ERP_BRANDS[b]; break; }
      }
      var custRaw = brand ? tail.slice(brand.length) : tail;
      var cm = custRaw.replace(/\n/g, ' ').match(/^[A-Za-z&().\-' ,]+/);
      var custName = '';
      if(cm){
        // Trailing product-code fragments leak into the name run ("My Fatoorah WP",
        // "...W.L.L (Sup"); drop all-caps code tokens and unclosed parens from the end.
        var ctoks = cm[0].trim().split(/\s+/);
        while(ctoks.length > 1){
          var last = ctoks[ctoks.length - 1];
          if(/^[A-Z][A-Z\-]{0,6}$/.test(last) || /^\([A-Za-z]*$/.test(last)) ctoks.pop();
          else break;
        }
        custName = ctoks.join(' ').replace(/[ ,\-]+$/, '');
      }
      var cls = '';
      var clsList = ['Online Customers', 'Hypermarkets and Supermarkets', 'Clinics', 'Pharmacy', 'Pharmacies', 'Co-Op', 'Hospitals', 'Dental Centers'];
      var flat = chunks[i].replace(/\s+/g, ' ');
      for(var cci = 0; cci < clsList.length; cci++){ if(flat.indexOf(clsList[cci]) >= 0){ cls = clsList[cci]; break; } }
      rows.push({
        date: date, doc: doc, type: doc.indexOf('SRT') === 0 ? 'return' : 'invoice',
        product: rest.slice(0, rest.indexOf(m[0])).replace(/\s+/g, ' ').trim(),
        qty: erpNum(m[1]), gross: erpNum(m[2]), net: erpNum(m[8]), sret: erpNum(m[6]),
        salesman: m[5].trim(), brand: brand || '', customer: custName, cls: cls,
      });
    }
    return { rows: rows, skipped: 0, error: rows.length ? null : 'NO_ROWS' };
  }
  function parseErpFile(text){
    // Try CSV first (structured wins); fall back to the PDF text pattern.
    var csv = parseErpCsv(text);
    if(!csv.error) return csv;
    var pdf = parseErpPdfText(text);
    if(!pdf.error) return pdf;
    return { rows: [], skipped: 0, error: 'UNRECOGNIZED' };
  }

  function levenshtein(a, b){
    a = String(a); b = String(b);
    var prev = [], cur = [];
    for(var j = 0; j <= b.length; j++) prev[j] = j;
    for(var i = 1; i <= a.length; i++){
      cur = [i];
      for(var k = 1; k <= b.length; k++){
        cur[k] = Math.min(prev[k] + 1, cur[k-1] + 1, prev[k-1] + (a[i-1] === b[k-1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  // ERP salesman names rarely equal app rep names ("Ranova Ayman Mohammed" vs
  // "Renova"). Guess by comparing each name token with edit distance ≤ 2.
  function guessRepMap(salesmen, reps){
    var map = {};
    (salesmen || []).forEach(function(sm){
      var tokens = String(sm).toLowerCase().split(/\s+/);
      var best = null, bestD = 99;
      (reps || []).forEach(function(rep){
        var rl = String(rep).toLowerCase();
        tokens.forEach(function(t){
          if(!t) return;
          var d = levenshtein(t, rl);
          if(d < bestD && d <= 2){ best = rep; bestD = d; }
        });
      });
      map[sm] = best;
    });
    return map;
  }
  function normClinicName(s){
    var stop = ['dental', 'center', 'centre', 'clinic', 'clinics', 'pharmacy', 'company',
      'co', 'wll', 'w.l.l', 'the', 'al', 'international', 'group', 'dr', 'medical', 'general', 'trading'];
    return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ')
      .split(/\s+/).filter(function(t){ return t && stop.indexOf(t) < 0; }).join(' ');
  }
  function isErpChannel(cust){
    var c = String(cust || '').toLowerCase();
    return ERP_CHANNELS.some(function(ch){ return c.indexOf(ch) >= 0; });
  }
  // Match one ERP customer name to an app clinic. erpMap overrides win.
  // Returns {clinicId, channel} — channel=true means "online/channel sale".
  function matchCustomer(cust, clinics, erpMap){
    if(erpMap && Object.prototype.hasOwnProperty.call(erpMap, cust)){
      var v = erpMap[cust];
      return v === '@channel' ? { clinicId: null, channel: true, method: 'map' }
           : v === '@ignore' ? { clinicId: null, channel: false, ignored: true, method: 'map' }
           : { clinicId: v, channel: false, method: 'map' };
    }
    if(isErpChannel(cust)) return { clinicId: null, channel: true, method: 'channel' };
    var n = normClinicName(cust);
    if(!n) return { clinicId: null, channel: false, method: 'none' };
    var toks = n.split(' ');
    // Token-overlap scoring; collect EVERY clinic tied at the top score so two
    // branches of the same clinic ("Aline Salmiya" vs "Aline Hawally") are
    // never silently merged — a tie is reported as ambiguous, not guessed.
    var bestScore = 0, tied = [];
    (clinics || []).forEach(function(c){
      var ct = normClinicName(c.name).split(' ');
      var ov = toks.filter(function(t){ return ct.indexOf(t) >= 0; }).length;
      var need = (toks.length === 1 || ct.length === 1) ? 1 : 2;
      if(ov < need) return;
      if(ov > bestScore){ bestScore = ov; tied = [c.id]; }
      else if(ov === bestScore){ tied.push(c.id); }
    });
    if(tied.length === 1) return { clinicId: tied[0], channel: false, method: 'token', score: bestScore };
    if(tied.length > 1) return { clinicId: null, channel: false, ambiguous: true, candidates: tied, method: 'ambiguous' };
    // No token match — try a de-spaced containment pass for spelling/spacing
    // variants ("Al-Noor" vs "Alnoor"), still branch-safe (unique winner only).
    var flat = n.replace(/ /g, '');
    if(flat.length >= 4){
      var fz = [];
      (clinics || []).forEach(function(c){
        var cf = normClinicName(c.name).replace(/ /g, '');
        if(cf.length >= 4 && (cf.indexOf(flat) >= 0 || flat.indexOf(cf) >= 0)) fz.push(c.id);
      });
      if(fz.length === 1) return { clinicId: fz[0], channel: false, method: 'fuzzy' };
      if(fz.length > 1) return { clinicId: null, channel: false, ambiguous: true, candidates: fz, method: 'ambiguous' };
    }
    return { clinicId: null, channel: false, method: 'none' };
  }
  // Duplicate saves show up as identical visit rows; collapse them for fair counts.
  function dedupeVisits(visits){
    var seen = {}, unique = [], dup = 0;
    (visits || []).forEach(function(v){
      var key = [v.date, v.rep, v.clinicId, v.callOnly ? 1 : 0, v.orderTotal || 0,
        (v.notes || ''), (v.orders || []).length].join('|');
      if(seen[key]){ dup++; return; }
      seen[key] = 1; unique.push(v);
    });
    return { unique: unique, dupCount: dup };
  }
  function erpTotals(rows){
    var t = { net: 0, gross: 0, sret: 0, lines: 0, invoices: {}, returns: {}, bySalesman: {}, from: null, to: null };
    (rows || []).forEach(function(r){
      t.net += r.net; t.gross += r.gross; t.sret += r.sret; t.lines++;
      (r.type === 'return' ? t.returns : t.invoices)[r.doc] = 1;
      var s = t.bySalesman[r.salesman] || (t.bySalesman[r.salesman] = { net: 0, sret: 0, lines: 0 });
      s.net += r.net; s.sret += r.sret; s.lines++;
      if(!t.from || r.date < t.from) t.from = r.date;
      if(!t.to || r.date > t.to) t.to = r.date;
    });
    t.invoiceCount = Object.keys(t.invoices).length;
    t.returnCount = Object.keys(t.returns).length;
    return t;
  }
  // The heart of the evaluation: ERP invoices vs app visits, per app rep.
  // opts: {rows, visits, clinics, erpMap, repMap, from, to}
  function reconcileErp(opts){
    var rows = (opts.rows || []).filter(function(r){ return inRange(r.date, opts.from, opts.to); });
    var repMap = opts.repMap || {};
    var clinics = opts.clinics || [];
    var dd = dedupeVisits(filterVisitsByRange(opts.visits, opts.from, opts.to));
    var out = { perRep: [], unmatchedCustomers: [], window: { from: opts.from, to: opts.to } };
    var reps = {};
    rows.forEach(function(r){ var rep = repMap[r.salesman]; if(rep) reps[rep] = 1; });
    dd.unique.forEach(function(v){ if(v.rep) reps[v.rep] = 1; if(v.withRep) reps[v.withRep] = 1; });
    var unmatchedSet = {};
    Object.keys(reps).sort().forEach(function(rep){
      var erpRows = rows.filter(function(r){ return repMap[r.salesman] === rep; });
      // A visit means a FIELD visit, and a joint attendee is credited too —
      // so calls/remote orders never fake a visit→invoice link, and a joint
      // rep's real visit isn't flagged as "invoiced with no visit".
      var appVisits = dd.unique.filter(function(v){ return repWasThere(v, rep) && isFieldVisit(v); });
      var byCust = {};
      erpRows.forEach(function(r){
        var c = byCust[r.customer] || (byCust[r.customer] = { net: 0, sret: 0, docs: {} });
        c.net += r.net; c.sret += r.sret; c.docs[r.doc] = 1;
      });
      var visitsByClinic = {};
      appVisits.forEach(function(v){
        var c = visitsByClinic[v.clinicId] || (visitsByClinic[v.clinicId] = { visits: 0, orders: 0, logged: 0 });
        c.visits++; if(v.orderTaken){ c.orders++; c.logged += v.orderTotal || 0; }
      });
      var matched = [], invoicedNoVisit = [], channelNet = 0, ignoredNet = 0;
      var matchedClinicIds = {};
      Object.keys(byCust).forEach(function(cust){
        var m = matchCustomer(cust, clinics, opts.erpMap);
        var agg = byCust[cust];
        if(m.ignored){ ignoredNet += agg.net; return; }
        if(m.channel){ channelNet += agg.net; return; }
        if(m.clinicId && visitsByClinic[m.clinicId]){
          matchedClinicIds[m.clinicId] = 1;
          var cl = clinics.find(function(c){ return c.id === m.clinicId; });
          matched.push({ clinicId: m.clinicId, clinicName: cl ? cl.name : m.clinicId,
            customer: cust, net: agg.net, sret: agg.sret, visits: visitsByClinic[m.clinicId].visits });
        } else {
          if(!m.clinicId && !unmatchedSet[cust] && Math.abs(agg.net) + Math.abs(agg.sret) > 0.005){
            unmatchedSet[cust] = 1; out.unmatchedCustomers.push(cust);
          }
          invoicedNoVisit.push({ customer: cust, net: agg.net, sret: agg.sret,
            clinicId: m.clinicId || null });
        }
      });
      var visitedNoInvoice = [];
      Object.keys(visitsByClinic).forEach(function(cid){
        if(matchedClinicIds[cid]) return;
        var cl = clinics.find(function(c){ return c.id === cid; });
        visitedNoInvoice.push({ clinicId: cid, clinicName: cl ? cl.name : (cid || 'Unknown'),
          visits: visitsByClinic[cid].visits, logged: visitsByClinic[cid].logged });
      });
      matched.sort(function(a, b){ return b.net - a.net; });
      invoicedNoVisit.sort(function(a, b){ return b.net - a.net; });
      visitedNoInvoice.sort(function(a, b){ return b.visits - a.visits; });
      var erpNet = erpRows.reduce(function(s, r){ return s + r.net; }, 0);
      var matchedNet = matched.reduce(function(s, m){ return s + m.net; }, 0);
      var clinicNet = erpNet - channelNet - ignoredNet;
      out.perRep.push({
        rep: rep,
        erp: {
          net: Math.round(erpNet * 1000) / 1000,
          invoices: Object.keys(erpRows.reduce(function(a, r){ if(r.type !== 'return') a[r.doc] = 1; return a; }, {})).length,
          returns: Math.round(erpRows.reduce(function(s, r){ return s + returnValue(r); }, 0) * 1000) / 1000,
          channelNet: Math.round(channelNet * 1000) / 1000,
          clinicNet: Math.round(clinicNet * 1000) / 1000,
        },
        app: {
          visits: appVisits.length,
          orders: appVisits.filter(function(v){ return v.orderTaken; }).length,
          logged: Math.round(appVisits.reduce(function(s, v){ return s + (v.orderTotal || 0); }, 0) * 100) / 100,
          unknownClinic: appVisits.filter(function(v){ return !clinics.some(function(c){ return c.id === v.clinicId; }); }).length,
          zeroOrders: appVisits.filter(function(v){ return v.orderTaken && !(v.orderTotal > 0); }).length,
        },
        matched: matched, visitedNoInvoice: visitedNoInvoice, invoicedNoVisit: invoicedNoVisit,
        linkagePct: clinicNet > 0 ? Math.round(matchedNet / clinicNet * 100) : 0,
      });
    });
    out.dupRows = dd.dupCount;
    return out;
  }

  // ---- Minimal XLSX reader (no libraries) ----
  // .xlsx is a ZIP of XML files; browsers and Node both ship the pieces we
  // need (DataView + DecompressionStream). Returns [{name, rows[][]}].
  function xmlUnescape(s){
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  async function inflateRaw(bytes){
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readXlsx(buffer){
    var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1;
    for(var i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65536); i--){
      if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
    }
    if(eocd < 0) throw new Error('NOT_ZIP');
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var entries = {};
    var td = new TextDecoder();
    for(var f = 0; f < count; f++){
      if(dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      entries[td.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method: method, csize: csize, lho: lho };
      p += 46 + nlen + elen + clen;
    }
    async function readEntry(name){
      var e = entries[name];
      if(!e || dv.getUint32(e.lho, true) !== 0x04034b50) return null;
      var start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
      var data = u8.subarray(start, start + e.csize);
      return td.decode(e.method === 0 ? data : await inflateRaw(data));
    }
    var shared = [];
    var ss = await readEntry('xl/sharedStrings.xml');
    if(ss){
      (ss.match(/<si[\s>][\s\S]*?<\/si>/g) || []).forEach(function(si){
        shared.push(xmlUnescape((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
          .map(function(t){ return t.replace(/<t[^>]*>/, '').replace('</t>', ''); }).join('')));
      });
    }
    var wb = (await readEntry('xl/workbook.xml')) || '';
    var relXml = (await readEntry('xl/_rels/workbook.xml.rels')) || '';
    var rels = {};
    (relXml.match(/<Relationship\b[^>]*\/?>/g) || []).forEach(function(r){
      var id = (r.match(/Id="([^"]+)"/) || [])[1];
      var tg = (r.match(/Target="([^"]+)"/) || [])[1];
      if(id && tg) rels[id] = (tg.charAt(0) === '/' ? tg.slice(1) : 'xl/' + tg.replace(/^xl\//, ''));
    });
    var sheets = [];
    var tags = wb.match(/<sheet\b[^>]*\/?>/g) || [];
    for(var s = 0; s < tags.length; s++){
      var nm = xmlUnescape((tags[s].match(/name="([^"]+)"/) || [])[1] || ('Sheet' + (s + 1)));
      var rid = (tags[s].match(/r:id="([^"]+)"/) || [])[1];
      var xml = await readEntry(rels[rid] || ('xl/worksheets/sheet' + (s + 1) + '.xml'));
      if(!xml) continue;
      var rows = [];
      var cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      var m;
      while((m = cellRe.exec(xml))){
        var attrs = m[1], body = m[2] || '';
        var ref = (attrs.match(/r="([A-Z]+)(\d+)"/) || []);
        if(!ref[1]) continue;
        var col = 0;
        for(var L = 0; L < ref[1].length; L++) col = col * 26 + (ref[1].charCodeAt(L) - 64);
        var rowIdx = parseInt(ref[2], 10) - 1;
        var t = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
        var val = '';
        if(t === 'inlineStr'){
          var it = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          val = it ? xmlUnescape(it[1]) : '';
        } else {
          var vm = body.match(/<v>([\s\S]*?)<\/v>/);
          if(vm) val = t === 's' ? (shared[parseInt(vm[1], 10)] || '') : xmlUnescape(vm[1]);
        }
        (rows[rowIdx] = rows[rowIdx] || [])[col - 1] = val;
      }
      for(var rI = 0; rI < rows.length; rI++){
        if(!rows[rI]){ rows[rI] = []; continue; }
        for(var cI = 0; cI < rows[rI].length; cI++) if(rows[rI][cI] == null) rows[rI][cI] = '';
      }
      sheets.push({ name: nm, rows: rows });
    }
    return sheets;
  }

  // Brand names differ between the DSR targets sheet and the ERP sales detail
  // ("Philips Sonicare" vs "Philips Export BV", "BHF" vs "Beverly Hills"...).
  var BRAND_ALIASES = {
    philipssonicare: 'philips', philipsexportbv: 'philips', philips: 'philips',
    bhf: 'beverly hills', beverlyhillsformula: 'beverly hills', beverlyhills: 'beverly hills',
    shenzen: 'shenzhen', shenzhen: 'shenzhen',
    everbrands: 'eversmile', eversmile: 'eversmile',
    combobundlekit: 'bundles', ultramed: 'bundles',
    tepemarketing: 'tepe', tepe: 'tepe',
    thebreathco: 'the breath co', waterpik: 'waterpik', univet: 'univet',
    hismile: 'hismile', flash: 'flash', undo: 'undo', silonn: 'silonn',
    intensiv: 'intensiv', blbiotech: 'b&l biotech',
  };
  function normBrand(s){
    var key = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return BRAND_ALIASES[key] || String(s || '').toLowerCase().trim();
  }

  // Parses the DSR targets workbook: blocks of rows per salesman (name in the
  // first column once, then one row per brand target, closed by a "<name>
  // Total" row carrying the overall target).
  function parseDsrTargets(sheets, reps, opts){
    var asOf = (opts && opts.asOf) || null;
    var out = { targets: {}, matched: [], unmatched: [], error: null };
    var found = {};
    (sheets || []).forEach(function(sheet){
      var rows = sheet.rows || [];
      var hIdx = -1, cName = -1, cBrand = -1, cTarget = -1, cAch = -1;
      for(var i = 0; i < Math.min(rows.length, 15); i++){
        var r = rows[i] || [], nc = -1, bc = -1, tc = -1, ac = -1;
        for(var j = 0; j < r.length; j++){
          var h = String(r[j] || '').toLowerCase().trim();
          if(nc < 0 && /salesman|sales\s*person|name|rep\b|employee/.test(h)) nc = j;
          if(bc < 0 && /^brand/.test(h)) bc = j;
          if(tc < 0 && /^target/.test(h)) tc = j;
          // Achieved column ("MTD Sales 26") — never the "Achieved vs. Target" ratio.
          if(ac < 0 && (/mtd/.test(h) || (/achiev|actual/.test(h) && !/vs|%|ratio/.test(h)))) ac = j;
        }
        if(nc >= 0 && tc >= 0){ hIdx = i; cName = nc; cBrand = bc; cTarget = tc; cAch = ac; break; }
      }
      if(hIdx < 0) return;
      var current = null;
      for(var r2 = hIdx + 1; r2 < rows.length; r2++){
        var row = rows[r2] || [];
        var name = String(row[cName] || '').trim();
        var brand = cBrand >= 0 ? String(row[cBrand] || '').trim() : '';
        var target = erpNum(row[cTarget]);
        var ach = cAch >= 0 ? erpNum(row[cAch]) : 0;
        if(name && /total\s*$/i.test(name)){
          var base = name.replace(/\s*total\s*$/i, '').trim();
          if(found[base]){
            if(target > 0) found[base].total = target;
            if(ach !== 0) found[base].achievedTotal = ach;
          }
          current = null;
          continue;
        }
        if(name){ current = name; found[current] = found[current] || { total: 0, achievedTotal: null, brands: {}, achievedBrands: {} }; }
        if(current && brand){
          if(target > 0) found[current].brands[brand] = Math.round(target * 100) / 100;
          if(ach !== 0) found[current].achievedBrands[brand] = Math.round(ach * 1000) / 1000;
        }
      }
    });
    var names = Object.keys(found);
    if(!names.length){ out.error = 'NO_TARGETS'; return out; }
    var map = guessRepMap(names, reps);
    names.forEach(function(nm){
      var f = found[nm];
      var total = f.total || Object.keys(f.brands).reduce(function(s, b){ return s + f.brands[b]; }, 0);
      total = Math.round(total * 100) / 100;
      if(!map[nm]){ if(total > 0) out.unmatched.push(nm); return; }
      if(!(total > 0)) return;
      var achieved = f.achievedTotal != null ? f.achievedTotal
        : Object.keys(f.achievedBrands).reduce(function(s, b){ return s + f.achievedBrands[b]; }, 0);
      achieved = Math.round(achieved * 1000) / 1000;
      var entry = { revenue: total, brands: f.brands };
      entry.achieved = achieved;
      entry.achievedBrands = f.achievedBrands;
      if(asOf) entry.achievedAsOf = asOf;
      out.targets[map[nm]] = entry;
      out.matched.push({ name: nm, rep: map[nm], revenue: total, achieved: achieved,
        brandCount: Object.keys(f.brands).length });
    });
    if(!out.matched.length){ out.error = 'NO_MATCH'; return out; }
    return out;
  }

  // Parses a targets file: a CSV with name + target columns, or plain
  // "Renova 12000" lines. Names are fuzzy-matched to app reps.
  // Returns {targets: {rep:{revenue[,visits]}}, matched:[], unmatched:[], error}
  function parseTargetsFile(text, reps){
    var out = { targets: {}, matched: [], unmatched: [], error: null };
    var candidates = [];
    var all = parseCsvText(String(text || ''));
    var headerAt = -1, nameCol = -1, targetCol = -1, visitsCol = -1;
    for(var i = 0; i < Math.min(all.length, 25); i++){
      var row = all[i], nc = -1, tc = -1, vc = -1;
      for(var j = 0; j < row.length; j++){
        var h = String(row[j] || '').toLowerCase();
        if(nc < 0 && /name|salesman|sales\s*person|rep\b|employee/.test(h)) nc = j;
        if(tc < 0 && /target|goal|quota|budget|required/.test(h) && !/visit/.test(h)) tc = j;
        if(vc < 0 && /visit/.test(h) && /target|goal|quota|required|count|no\b|#/.test(h)) vc = j;
      }
      if(nc >= 0 && tc >= 0){ headerAt = i; nameCol = nc; targetCol = tc; visitsCol = vc; break; }
    }
    if(headerAt >= 0){
      for(var r = headerAt + 1; r < all.length; r++){
        var name = String(all[r][nameCol] || '').trim();
        var rev = erpNum(all[r][targetCol]);
        if(!name || !(rev > 0)) continue;
        candidates.push({ name: name, revenue: rev, visits: visitsCol >= 0 ? erpNum(all[r][visitsCol]) : 0 });
      }
    } else {
      // Plain lines: "Renova 12000" / "Renova: 12,000.500"
      var lines = String(text || '').split(/\r?\n/);
      for(var L = 0; L < lines.length; L++){
        var m = lines[L].trim().match(/^([A-Za-z؀-ۿ][A-Za-z؀-ۿ .\-]*?)[\s:,\t]+([\d,]+(?:\.\d+)?)\s*$/);
        if(m && erpNum(m[2]) > 0) candidates.push({ name: m[1].trim(), revenue: erpNum(m[2]), visits: 0 });
      }
      // A wall of matching lines is almost certainly not a targets file.
      if(candidates.length > 12){ out.error = 'AMBIGUOUS'; return out; }
    }
    if(!candidates.length){ out.error = 'NO_TARGETS'; return out; }
    var map = guessRepMap(candidates.map(function(c){ return c.name; }), reps);
    candidates.forEach(function(c){
      var rep = map[c.name];
      if(rep){
        out.targets[rep] = { revenue: c.revenue };
        if(c.visits > 0) out.targets[rep].visits = c.visits;
        out.matched.push({ name: c.name, rep: rep, revenue: c.revenue, visits: c.visits || 0 });
      } else out.unmatched.push(c.name);
    });
    if(!out.matched.length) out.error = 'NO_MATCH';
    return out;
  }

  // Week-by-week net per app rep from one imported file (weeks run Sun–Sat,
  // matching the app's planner). Rows with no rep mapping are skipped.
  function erpWeeklyTrend(rows, repMap){
    var weeks = {};
    (rows || []).forEach(function(r){
      var rep = (repMap || {})[r.salesman];
      if(!rep || !r.date) return;
      var span = getWeekDates(r.date);
      var w = weeks[span[0]] || (weeks[span[0]] = { from: span[0], to: span[6], byRep: {}, total: 0 });
      w.byRep[rep] = (w.byRep[rep] || 0) + r.net;
      w.total += r.net;
    });
    return Object.keys(weeks).sort().map(function(k){
      var w = weeks[k];
      Object.keys(w.byRep).forEach(function(rep){ w.byRep[rep] = Math.round(w.byRep[rep] * 1000) / 1000; });
      w.total = Math.round(w.total * 1000) / 1000;
      return w;
    });
  }

  // Straight-line month-end projection from the pace so far.
  function forecastMonthEnd(achieved, asOfDay, daysInMonth){
    if(!(asOfDay > 0) || !(daysInMonth > 0)) return 0;
    return Math.round((achieved / asOfDay) * daysInMonth * 100) / 100;
  }
  // Groups returned value by brand and by customer, largest first.
  // The returned value carried by one ERP row. Two shapes exist in the wild:
  // a "Sales Return" column on invoice lines (sret), and dedicated SRT return
  // documents whose value only shows up as a negative net. Count each row
  // once — sret wins when both are present.
  function returnValue(r){
    if(r.sret > 0) return r.sret;
    if(r.type === 'return') return Math.abs(r.net || 0);
    return 0;
  }
  function returnsAnalysis(rows){
    var ret = (rows || []).filter(function(r){ return returnValue(r) > 0; });
    var agg = function(key){
      var d = {};
      ret.forEach(function(r){ var k = r[key] || '—'; d[k] = (d[k] || 0) + returnValue(r); });
      return Object.keys(d).map(function(k){ return { name: k, amount: Math.round(d[k] * 1000) / 1000 }; })
        .sort(function(a, b){ return b.amount - a.amount; });
    };
    var docs = {};
    ret.forEach(function(r){ if(r.doc) docs[r.doc] = 1; });
    // Per-line detail so a supervisor can see WHICH clinic returned WHAT,
    // not just the top-5 aggregates.
    var detail = ret.map(function(r){
      return { date: r.date, doc: r.doc, customer: r.customer || '—', brand: r.brand || '—',
        product: r.product || '', qty: r.qty || 0, amount: Math.round(returnValue(r) * 1000) / 1000 };
    }).sort(function(a, b){ return b.amount - a.amount; });
    return {
      total: Math.round(ret.reduce(function(s, r){ return s + returnValue(r); }, 0) * 1000) / 1000,
      count: ret.length, docCount: Object.keys(docs).length,
      byBrand: agg('brand'), byCustomer: agg('customer'), detail: detail,
    };
  }


  // ==== CLINIC LIST IMPORT (Excel / CSV) ====
  // Reads a clinic sheet the supervisor exports from anywhere: header names
  // are detected in Arabic or English, and a bare list (name in the first
  // column, phone in the second) works with no header row at all.
  function detectClinicColumns(header){
    var idx = { name: -1, phone: -1, contact: -1, rep: -1, cls: -1, area: -1, account: -1 };
    var pats = {
      name: /clinic|customer|account\s*name|^name$|عياد|عميل|اسم/i,
      phone: /phone|mobile|tel|whats|هاتف|رقم|جوال|موبايل|واتس/i,
      contact: /contact|person|attention|مسؤول|اتصال|جهة/i,
      rep: /rep|sales\s*(man|person)|مندوب/i,
      cls: /^class|^cls|grade|category|فئة|تصنيف|درجة/i,
      area: /area|city|market|region|zone|منطق|محافظ|مدينة/i,
      account: /account\s*type|payment|نوع\s*الحساب|دفع/i,
    };
    var hits = 0;
    for(var i = 0; i < header.length; i++){
      var h = String(header[i] || '').trim();
      if(!h) continue;
      for(var k in pats){ if(idx[k] < 0 && pats[k].test(h)) { idx[k] = i; hits++; break; } }
    }
    // A real header names at least two known columns — a lone match is far
    // more likely to be an actual clinic name ("عيادة النور") in a bare list.
    return idx.name >= 0 && hits >= 2 ? idx : null;
  }
  function cleanPhone(v){
    var s = String(v == null ? '' : v).replace(/[^0-9+]/g, '');
    return s.length >= 7 ? s : String(v == null ? '' : v).trim();
  }
  function parseClinicRows(rows){
    var out = [], skipped = 0;
    if(!rows || !rows.length) return { clinics: [], skipped: 0, error: 'NO_ROWS' };
    var headerAt = -1, cols = null;
    for(var i = 0; i < Math.min(rows.length, 10); i++){
      var c = detectClinicColumns(rows[i] || []);
      if(c){ headerAt = i; cols = c; break; }
    }
    var CLS = ['A', 'B', 'C', 'D', 'F'];
    var push = function(name, phone, contact, rep, cls, area, account){
      name = String(name == null ? '' : name).trim();
      if(!name || /^(total|المجموع|الاجمالي|الإجمالي)$/i.test(name)){ skipped++; return; }
      cls = String(cls == null ? '' : cls).trim().toUpperCase();
      out.push({
        name: name,
        phone: cleanPhone(phone),
        contact: String(contact == null ? '' : contact).trim(),
        rep: String(rep == null ? '' : rep).trim(),
        cls: CLS.indexOf(cls) >= 0 ? cls : null,
        market: String(area == null ? '' : area).trim() || null,
        account: String(account == null ? '' : account).trim() || null,
      });
    };
    if(cols){
      for(var r = headerAt + 1; r < rows.length; r++){
        var line = rows[r] || [];
        push(line[cols.name], cols.phone >= 0 ? line[cols.phone] : '',
          cols.contact >= 0 ? line[cols.contact] : '', cols.rep >= 0 ? line[cols.rep] : '',
          cols.cls >= 0 ? line[cols.cls] : '', cols.area >= 0 ? line[cols.area] : '',
          cols.account >= 0 ? line[cols.account] : '');
      }
    } else {
      // Headerless list: first column is the clinic name; if a later cell is
      // phone-shaped it becomes the phone.
      var start = 0;
      // A lone label row like "Clinic Name" / "اسم العيادة" is not a clinic.
      var first = String((rows[0] || [])[0] || '').trim();
      if(/^(clinic\s*name|clinics?|customers?|name|اسم\s*العيادة|العيادات|الاسم|اسم)$/i.test(first)) start = 1;
      for(var r2 = start; r2 < rows.length; r2++){
        var ln = rows[r2] || [];
        var phone = '';
        for(var j = 1; j < ln.length; j++){
          var cand = String(ln[j] == null ? '' : ln[j]).replace(/[^0-9]/g, '');
          if(cand.length >= 7){ phone = cleanPhone(ln[j]); break; }
        }
        push(ln[0], phone, '', '', '', '', '');
      }
    }
    return { clinics: out, skipped: skipped, error: out.length ? null : 'NO_ROWS' };
  }

  // ==== MARKETING / FREE-OF-CHARGE TRACKING ====
  // Goods that left the warehouse without revenue: rows filed under a
  // "Marketing" brand or account, and invoice lines with quantity but zero
  // net (bonus / free-of-charge goods). Grouped so the supervisor can see
  // which clinic received what for free and what it was worth at gross.
  function isMarketingRow(r){
    return /marketing/i.test(String(r.brand || '')) || /marketing/i.test(String(r.customer || ''));
  }
  // One row's verdict, shared by the aggregate analysis and the per-clinic
  // ledgers in the app UI.
  function isFocRow(r){
    if(r.type === 'return' || r.sret > 0) return false; // return lines are not giveaways
    // A giveaway earns no revenue. A marketing-branded line that DID earn net
    // is a real sale, not a free item — so both branches require net <= 0.
    return (isMarketingRow(r) || (r.qty || 0) > 0) && !(r.net > 0);
  }
  // FOC lines split into two very different stories: a free line on an
  // invoice that ALSO carries paid lines is a bonus inside a deal (part of
  // the sale's economics); a free line on an all-free document or under a
  // marketing brand is a sample / marketing giveaway.
  function focLinesAnnotated(rows){
    var paidDocs = {};
    (rows || []).forEach(function(r){ if(r.type !== 'return' && r.net > 0 && r.doc) paidDocs[r.doc] = 1; });
    return (rows || []).filter(isFocRow).map(function(r){
      var kind = (!isMarketingRow(r) && r.doc && paidDocs[r.doc]) ? 'deal' : 'sample';
      return Object.assign({}, r, { kindDefault: kind });
    });
  }
  function focAnalysis(rows){
    var foc = (rows || []).filter(isFocRow);
    var round3 = function(n){ return Math.round(n * 1000) / 1000; };
    var byCust = {}, byProd = {};
    foc.forEach(function(r){
      var ck = (r.customer || '').trim() || '—';
      var c = byCust[ck] || (byCust[ck] = { name: ck, qty: 0, gross: 0, lines: 0, items: {} });
      c.qty += (r.qty || 0); c.gross += (r.gross || 0); c.lines++;
      var pk = (r.product || '').trim() || '—';
      c.items[pk] = (c.items[pk] || 0) + (r.qty || 0);
      var p = byProd[pk] || (byProd[pk] = { name: pk, qty: 0, gross: 0 });
      p.qty += (r.qty || 0); p.gross += (r.gross || 0);
    });
    var customers = Object.keys(byCust).map(function(k){
      var c = byCust[k];
      return { name: c.name, qty: c.qty, gross: round3(c.gross), lines: c.lines,
        items: Object.keys(c.items).map(function(pk){ return { product: pk, qty: c.items[pk] }; })
          .sort(function(a, b){ return b.qty - a.qty; }) };
    }).sort(function(a, b){ return b.gross - a.gross || b.qty - a.qty; });
    var products = Object.keys(byProd).map(function(k){
      return { name: byProd[k].name, qty: byProd[k].qty, gross: round3(byProd[k].gross) };
    }).sort(function(a, b){ return b.qty - a.qty; });
    return {
      count: foc.length,
      totalQty: foc.reduce(function(s, r){ return s + (r.qty || 0); }, 0),
      grossValue: round3(foc.reduce(function(s, r){ return s + (r.gross || 0); }, 0)),
      byCustomer: customers, byProduct: products,
    };
  }

  // ==== COVERAGE BOARD ====
  // One picture of a period: which clinics were visited (with a visit summary
  // each) and which still need a visit — with machine-readable reasons the UI
  // turns into advice. opts: {from, to, today, repFilter, visits, clinics, dayPlans}
  function clinicCoverage(opts){
    var wantRep = function(r){ return opts.repFilter === 'all' || r === opts.repFilter; };
    var pool = (opts.clinics || []).filter(function(c){ return c.cls !== 'Closed' && wantRep(c.rep); });
    var inWindow = filterVisitsByRange(opts.visits, opts.from, opts.to)
      .filter(function(v){ return wantRep(v.rep) || wantRep(v.withRep); });
    // Coverage means a real FIELD visit — a phone call or a remote order does
    // NOT cover a clinic, consistent with the visit count everywhere else.
    var vis = inWindow.filter(isFieldVisit);
    var today = opts.today;
    var byClinic = {};
    vis.forEach(function(v){ (byClinic[v.clinicId] = byClinic[v.clinicId] || []).push(v); });
    // Calls in-window, kept only as a sub-metric of an already-covered clinic.
    var callsByClinic = {};
    inWindow.forEach(function(v){ if(v.callOnly) callsByClinic[v.clinicId] = (callsByClinic[v.clinicId] || 0) + 1; });
    // never-visited / dormant / last-visit are judged from FIELD visits only,
    // so a clinic that was only phoned still reads as never actually visited.
    var lastEver = {};
    (opts.visits || []).forEach(function(v){
      if(!isFieldVisit(v)) return;
      if(v.date && (!lastEver[v.clinicId] || v.date > lastEver[v.clinicId])) lastEver[v.clinicId] = v.date;
    });

    var visited = pool.filter(function(c){ return byClinic[c.id]; }).map(function(c){
      var list = byClinic[c.id].slice().sort(function(a, b){ return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
      return {
        id: c.id, name: c.name, rep: c.rep, cls: c.cls,
        visits: list.length,
        lastDate: list[0].date,
        calls: callsByClinic[c.id] || 0,
        orders: list.filter(function(v){ return v.orderTaken; }).length,
        revenue: Math.round(list.reduce(function(s, v){ return s + (v.orderTotal || 0); }, 0) * 100) / 100,
        contacts: list.reduce(function(s, v){ return s + contactCount(v); }, 0),
        nextFollowUp: c.nextFollowUp || null,
        detail: list.map(function(v){
          return { date: v.date, rep: v.rep, withRep: v.withRep || null, callOnly: !!v.callOnly,
            orderTaken: !!v.orderTaken, orderTotal: v.orderTotal || 0,
            doctorIds: (v.doctorIds || []).slice(), notes: v.notes || '', noOrderReason: v.noOrderReason || '' };
        }),
      };
    }).sort(function(a, b){ return b.revenue - a.revenue || b.visits - a.visits; });

    // Reasons a clinic still needs attention, most urgent first (lowest weight wins):
    // 0 overdue follow-up · 1 due today · 2 missed plan · 3 never visited ·
    // 4 dormant 30+ days · 5 follow-up due within a week · 6 simply not
    // covered this window
    var missed = missedPlans(opts.dayPlans, opts.visits, today, { daysBack: 14 })
      .filter(function(m){ return wantRep(m.rep); });
    var missedByClinic = {};
    missed.forEach(function(m){ (missedByClinic[m.clinicId] = missedByClinic[m.clinicId] || []).push(m); });
    var soon = new Date(today + 'T00:00:00'); soon.setDate(soon.getDate() + 7);
    var soonStr = localDateStr(soon);

    // EVERY pool clinic lands in exactly one bucket: visited this window, or
    // needsVisit with at least one reason. A clinic with no urgent flag still
    // gets a 'not-covered' reason — silently dropping it made
    // visited + unvisited ≠ total and read as data corruption in the field.
    var dormDays = (opts.dormantDays || 30);
    var needsVisit = [];
    pool.forEach(function(c){
      if(byClinic[c.id]) return; // being handled this period
      var reasons = [];
      var fs = followStatus(c.nextFollowUp, today);
      if(fs === 'overdue') reasons.push({ key: 'overdue', weight: 0, date: c.nextFollowUp });
      if(fs === 'today') reasons.push({ key: 'due-today', weight: 1, date: c.nextFollowUp });
      if(missedByClinic[c.id]) reasons.push({ key: 'missed-plan', weight: 2, count: missedByClinic[c.id].length, date: missedByClinic[c.id][0].date });
      // Never-visited / dormant judged for every class from the full visit
      // log (dormantClinics limits itself to A/B, which silently exempted
      // C/D/F clinics from the unvisited list).
      var last = lastEver[c.id] || null;
      if(last === null) reasons.push({ key: 'never-visited', weight: 3 });
      else if(daysBetween(last, today) >= dormDays) reasons.push({ key: 'dormant', weight: 4, days: daysBetween(last, today) });
      if(fs === 'upcoming' && c.nextFollowUp <= soonStr) reasons.push({ key: 'due-soon', weight: 5, date: c.nextFollowUp });
      if(!reasons.length) reasons.push({ key: 'not-covered', weight: 6, lastVisit: last });
      reasons.sort(function(a, b){ return a.weight - b.weight; });
      needsVisit.push({ id: c.id, name: c.name, rep: c.rep, cls: c.cls,
        reasons: reasons, weight: reasons[0].weight,
        lastVisit: last, nextFollowUp: c.nextFollowUp || null });
    });
    needsVisit.sort(function(a, b){
      return a.weight - b.weight || String(a.cls || 'Z').localeCompare(String(b.cls || 'Z')) || a.name.localeCompare(b.name);
    });

    return {
      visited: visited,
      needsVisit: needsVisit,
      stats: {
        totalClinics: pool.length,
        visitedCount: visited.length,
        coveragePct: pool.length ? Math.round(visited.length / pool.length * 100) : 0,
        needsCount: needsVisit.length,
        orders: visited.reduce(function(s, c){ return s + c.orders; }, 0),
        revenue: Math.round(visited.reduce(function(s, c){ return s + c.revenue; }, 0) * 100) / 100,
        contacts: visited.reduce(function(s, c){ return s + c.contacts; }, 0),
      },
    };
  }

  return {
    uid, localDateStr, todayStr, fmtDate, daysBetween, esc, safeUrl, initials,
    money, slugify, getWeekDates, getMonthDates, isWorkday, workingDaysBetween, followStatus, safeParse,
    csvEscape, orderGross, orderNet, orderTotals,
    computeScoreForVisits, computeRepScore, calcStreak, calendarDayItems, isFieldVisit, repWasThere,
    inRange, filterVisitsByRange, rangeSummary, pctDelta, dormantClinics, missedPlans,
    contactCount, coachInsights,
    erpNum, erpDate, parseCsvText, detectErpColumns, parseErpCsv, parseErpPdfText,
    parseErpFile, levenshtein, guessRepMap, normClinicName, isErpChannel,
    matchCustomer, dedupeVisits, erpTotals, reconcileErp, clinicCoverage, erpWeeklyTrend,
    parseTargetsFile, readXlsx, parseDsrTargets, normBrand,
    forecastMonthEnd, returnsAnalysis, returnValue, focAnalysis, isMarketingRow, isFocRow,
    detectClinicColumns, parseClinicRows, focLinesAnnotated
  };
});
