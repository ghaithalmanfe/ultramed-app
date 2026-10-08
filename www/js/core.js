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
    // Everyone who was AT the visit fulfilled their plan: the rep who logged
    // it and the colleague on a joint visit alike.
    const visited = new Set();
    (visits || []).forEach(v => {
      visited.add(v.date + '|' + v.rep + '|' + v.clinicId);
      if(v.withRep) visited.add(v.date + '|' + v.withRep + '|' + v.clinicId);
    });
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
        detail: 'Planned in the last 14 days but never logged. Reschedule or clear them under "Missed planned visits" on the Today screen so the plan stays real.' });
    }

    // 4. Monthly target pace, per rep with a sales target set.
    const mStart = today.slice(0, 7) + '-01';
    const daysInMonth = new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate();
    const dayOfMonth = +today.slice(8, 10);
    const erpMtd = opts.erpMtd || {}; // {rep: {amount, asOf}} from uploaded sales files
    Object.keys(targets).filter(r => wantRep(r) && targets[r] && targets[r].revenue > 0).sort().forEach(rep => {
      const t = targets[rep];
      const goal = t.revenue;
      // Target tracking is measured ONLY by the uploaded ERP sales files
      // (owner's rule); the DSR supplies the target. No sales file yet → no
      // verdict on pace, just a prompt to upload one.
      const e = erpMtd[rep];
      const erp = !!(e && e.amount != null);
      const official = false;
      if(!erp) return;
      const mtd = e.amount;
      const src = ' (ERP sales files)';
      // Pace runs on WORKING days only (Sun–Thu; Fri/Sat weekend) so the
      // required daily amount is realistic for days actually worked.
      const asOfDate = e.covered || e.asOf || today;
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

    // 10. Decision maps: the coach can only steer what the team recorded.
    var withDocs = clinics.filter(function(c){ return c.cls !== 'Closed' && wantRep(c.rep) && (c.doctors || []).length; });
    var noDecider = withDocs.filter(function(c){ return !(c.doctors || []).some(function(d){ return d.influence === 'decider'; }); });
    if(noDecider.length){
      out.push({ level: 'watch', icon: '🧭', key: 'decision-map', data: { count: noDecider.length, names: noDecider.slice(0, 3).map(function(c){ return c.name; }) },
        title: noDecider.length + ' clinic' + (noDecider.length === 1 ? '' : 's') + ' with no known decision maker',
        detail: listNames(noDecider.map(function(c){ return c.name; }), 3) + '. Ask who signs the orders and mark them in the doctor card — then the next step appears on the clinic.' });
    }
    var staleDeciders = [];
    withDocs.forEach(function(c){
      (c.doctors || []).filter(function(d){ return d.influence === 'decider' && d.stage !== 'blocked'; }).forEach(function(d){
        var dates = vis.filter(function(v){ if(v.clinicId !== c.id) return false; var ids = (Array.isArray(v.doctorIds) && v.doctorIds.length) ? v.doctorIds : (v.doctorId ? [v.doctorId] : []); return ids.indexOf(d.id) >= 0; }).map(function(v){ return v.date; }).sort();
        var lv = dates.length ? dates[dates.length - 1] : null;
        if(!lv || daysBetween(lv, today) >= 45) staleDeciders.push(d.name + ' (' + c.name + ')');
      });
    });
    if(staleDeciders.length){
      out.push({ level: 'act', icon: '🤝', key: 'deciders-stale', data: { count: staleDeciders.length, names: staleDeciders.slice(0, 3) },
        title: staleDeciders.length + ' decision maker' + (staleDeciders.length === 1 ? '' : 's') + ' not met in 45+ days',
        detail: listNames(staleDeciders, 3) + '. These people sign the orders — put them in next week\u2019s plan.' });
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
  // opts.mdy: the text dates are month/day/year (a CSV saved on a US-locale
  // laptop) — decided per FILE by erpDateOrder, never guessed per row.
  function erpDate(s, opts){
    s = String(s || '').trim();
    var ok = function(y, mo, d){ return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? y + '-' + ('0'+mo).slice(-2) + '-' + ('0'+d).slice(-2) : null; };
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return ok(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if(m) return (opts && opts.mdy) ? ok(+m[3], +m[1], +m[2]) : ok(+m[3], +m[2], +m[1]);
    var n = Number(s);
    if(isFinite(n) && n >= 25569 && n <= 73415){ // 1970-01-01 .. 2100-12-31; a time of day never rolls to the next date
      var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  // Day-first or month-first? Any value whose FIRST field exceeds 12 proves
  // day-first; any whose SECOND field exceeds 12 proves month-first. Day-first
  // (the ERP's own format) when nothing proves otherwise.
  function erpDateOrder(values){
    var mdy = false, dmy = false;
    (values || []).forEach(function(v){
      var m = String(v || '').trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
      if(!m) return;
      if(+m[1] > 12) dmy = true;
      if(+m[2] > 12) mdy = true;
    });
    return mdy && !dmy ? { mdy: true } : { mdy: false };
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
    // The return's own discount ("Discount. Sales Ret") — without it a return
    // shows GROSS, i.e. bigger than the discounted order it reverses. The
    // patterns demand a return-stem token ("ret"/"return", end-anchored or
    // abbreviated) so "Retail Discount"-style headers can never false-match.
    idx.dsret = find([/disc\w*\.?\s*(sales\s*)?ret(urn)?s?\.?$/, /ret(urn)?s?\.?\s*disc/]);
    idx.net = find([/net\s*sales/, /^net/]);
    idx.brand = find([/brand/]);
    idx.customer = find([/customer/, /^account$/], /class/);
    idx.cls = find([/class/]);
    idx.remarks = find([/remark/, /^notes?$/, /reference/]);
    // Document kind ("SalesInvoice" / "SalesReturn") — a return is recognized
    // from this column too, so a future numbering scheme without the SRT
    // prefix still counts returns as returns.
    idx.type = find([/^type$/, /^doc(ument)?\s*type$/, /^transaction\s*type$/, /^voucher\s*type$/]);
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
    var order = erpDateOrder(all.slice(headerAt + 1).map(function(l){ return l[cols.date]; }));
    var rows = [], skipped = 0, dropped = 0, inherited = 0;
    var last = null; // previous line's date/doc/customer/class/salesman, for grouped exports
    for(var r = headerAt + 1; r < all.length; r++){
      var line = all[r];
      var date = erpDate(line[cols.date], order);
      var doc = String(line[cols.doc] || '').trim();
      var product = String(cols.product >= 0 ? line[cols.product] || '' : '').trim();
      if((!date || !doc) && last && product && !String(line[cols.date] || '').trim() && !doc){
        // Grouped/report-style export: date and invoice number only on the
        // first line of each invoice — the following product lines inherit
        // them. A totals row has no product, so it is never inherited.
        date = last.date; doc = last.doc; inherited++;
        if(cols.customer >= 0 && !String(line[cols.customer] || '').trim()) line[cols.customer] = last.customer;
        if(cols.cls >= 0 && !String(line[cols.cls] || '').trim()) line[cols.cls] = last.cls;
        if(!String(line[cols.salesman] || '').trim()) line[cols.salesman] = last.salesman;
      }
      if(!date || !doc){ skipped++; if(product) dropped++; continue; }
      last = { date: date, doc: doc, customer: cols.customer >= 0 ? line[cols.customer] : '', cls: cols.cls >= 0 ? line[cols.cls] : '', salesman: line[cols.salesman] };
      var isRet = /^SRT|return/i.test(doc) ||
        (cols.type >= 0 && /return|credit\s*note/i.test(String(line[cols.type] || '')));
      var remarks = String(cols.remarks >= 0 ? line[cols.remarks] || '' : '').trim();
      rows.push({
        date: date, doc: doc,
        type: isRet ? 'return' : 'invoice',
        ref: isRet ? erpRefFromRemarks(remarks) : null,
        product: String(cols.product >= 0 ? line[cols.product] || '' : '').trim(),
        qty: cols.qty >= 0 ? erpNum(line[cols.qty]) : 0,
        gross: cols.gross >= 0 ? erpNum(line[cols.gross]) : 0,
        net: erpNum(line[cols.net]),
        sret: cols.sret >= 0 ? erpNum(line[cols.sret]) : 0,
        dsret: cols.dsret >= 0 ? erpNum(line[cols.dsret]) : 0,
        salesman: String(line[cols.salesman] || '').trim(),
        brand: String(cols.brand >= 0 ? line[cols.brand] || '' : '').trim(),
        customer: String(cols.customer >= 0 ? line[cols.customer] || '' : '').trim(),
        cls: String(cols.cls >= 0 ? line[cols.cls] || '' : '').trim(),
      });
    }
    return { rows: rows, skipped: skipped, dropped: dropped, inherited: inherited, mdy: !!order.mdy, error: rows.length ? null : 'NO_ROWS' };
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
  // An ERP salesman name ("Ghaith Al Manfe", "Ranova Ayman Mohammed") is
  // matched to an app rep by any name part: the rep's own name parts count
  // too, so "Dr. Ghaith" in the app still finds "Ghaith Al Manfe" — titles
  // (Dr, Mr, Mrs) and parts under 3 letters never match on their own.
  var NAME_TITLES = { dr: 1, mr: 1, mrs: 1, ms: 1, miss: 1, eng: 1, prof: 1 };
  function nameParts(s){
    return String(s || '').toLowerCase().replace(/[^a-z؀-ۿ\s]+/g, ' ').split(/\s+/)
      .filter(function(t){ return t.length >= 3 && !NAME_TITLES[t]; });
  }
  function guessRepMap(salesmen, reps){
    var map = {};
    (salesmen || []).forEach(function(sm){
      var tokens = nameParts(sm);
      var best = null, bestD = 99;
      (reps || []).forEach(function(rep){
        var parts = nameParts(rep);
        if(!parts.length) parts = [String(rep).toLowerCase()];
        tokens.forEach(function(t){
          parts.forEach(function(p){
            var d = levenshtein(t, p);
            if(d < bestD && d <= 2){ best = rep; bestD = d; }
          });
        });
      });
      map[sm] = best;
    });
    return map;
  }
  function normClinicName(s){
    var stop = ['dental', 'center', 'centre', 'clinic', 'clinics', 'pharmacy', 'company',
      'co', 'wll', 'w.l.l', 'the', 'al', 'international', 'group', 'dr', 'medical', 'general', 'trading',
      'عيادة', 'عيادات', 'مركز', 'مجمع', 'مستشفى', 'مستوصف', 'صيدلية', 'دكتور', 'الدكتور', 'د'];
    return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ')
      .split(/\s+/).filter(function(t){ return t && stop.indexOf(t) < 0; }).join(' ');
  }
  function isErpChannel(cust){
    var c = String(cust || '').toLowerCase();
    return ERP_CHANNELS.some(function(ch){ return c.indexOf(ch) >= 0; });
  }
  // A tie between clinics is NOT ambiguous when every candidate is a branch of
  // the same family — the invoice belongs to that clinic, counted ONCE under
  // its primary branch, whichever branch took delivery.
  function familyOfTie(ids, clinics){
    var f = clinicFamilies(clinics);
    var key = f.byClinic[ids[0]];
    if(!key) return null;
    for(var i = 1; i < ids.length; i++) if(f.byClinic[ids[i]] !== key) return null;
    var fam = f.fams[key];
    return { clinicId: fam.ids[0], channel: false, method: 'family', family: key, familyLabel: fam.label, branches: fam.count };
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
    if(tied.length > 1){
      var famRes = familyOfTie(tied, clinics);
      if(famRes) return famRes;
      return { clinicId: null, channel: false, ambiguous: true, candidates: tied, method: 'ambiguous' };
    }
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
      if(fz.length > 1){
        var famFz = familyOfTie(fz, clinics);
        if(famFz) return famFz;
        return { clinicId: null, channel: false, ambiguous: true, candidates: fz, method: 'ambiguous' };
      }
    }
    return { clinicId: null, channel: false, method: 'none' };
  }
  // Branches of one clinic ("Aline Salmiya" / "Aline Hawally") form a FAMILY:
  // same rep, same distinctive first name-token (4+ chars, so "New X"/"New Y"
  // never merge on a generic word). Sales and returns are aggregated per
  // family so one clinic never LOOKS invoiced or returned twice just because
  // deliveries went to different branches. Visits/coverage stay per-branch.
  // Entity-type words: a clinic and a pharmacy sharing an owner's name are NOT
  // branches of each other, so the type signature is part of the family key.
  var FAMILY_TYPE_WORDS = ['clinic', 'clinics', 'pharmacy', 'pharmacies', 'hospital', 'center',
    'centre', 'dental', 'medical', 'polyclinic', 'lab',
    'عيادة', 'عيادات', 'صيدلية', 'مستشفى', 'مركز', 'مستوصف', 'مجمع', 'مختبر'];
  function familyTypeSig(name){
    var low = String(name || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ').split(/\s+/);
    return FAMILY_TYPE_WORDS.filter(function(w){ return low.indexOf(w) >= 0; }).sort().join('+');
  }
  function clinicFamilies(clinics){
    var byKey = {}, byClinic = {}, fams = {};
    (clinics || []).forEach(function(c){
      if(!c.rep) return; // unassigned clinics never auto-cluster
      var tok = normClinicName(c.name).split(' ')[0] || '';
      if(tok.length < 4) return;
      var key = tok + '|' + c.rep + '|' + familyTypeSig(c.name);
      (byKey[key] = byKey[key] || []).push(c);
    });
    Object.keys(byKey).forEach(function(key){
      var group = byKey[key];
      if(group.length < 2) return;
      var ids = group.map(function(c){ return c.id; }).sort();
      var tok = key.split('|')[0];
      // Human label: the original word whose normalized form IS the family
      // token ("Aline"), never a noise word like "Dr." that norm discards.
      var lead = tok;
      var words = String(group[0].name || '').trim().split(/\s+/);
      for(var i = 0; i < words.length; i++){
        if(normClinicName(words[i]) === tok){ lead = words[i]; break; }
      }
      fams[key] = { key: key, label: lead, ids: ids, rep: group[0].rep || '', count: group.length };
      group.forEach(function(c){ byClinic[c.id] = key; });
    });
    return { byClinic: byClinic, fams: fams };
  }
  // Territory attribution: a sale to a KNOWN clinic belongs to the rep who
  // owns that clinic, whatever salesman name the ERP invoice carries. Only
  // when the customer isn't a matched clinic (channel / unmatched / ambiguous)
  // do we fall back to the file's salesman→rep mapping.
  // A clinic handed to another rep keeps its history: `repSince` (YYYY-MM-DD)
  // is the first day the new owner counts, and lines dated before it still
  // belong to `prevRep` — so last month's closed figures never move.
  function clinicRepOn(c, date){
    if(c.repSince && c.prevRep && date && date < c.repSince) return c.prevRep;
    return c.rep || null;
  }
  // A SHARED account (hospitals, the ministry, a university…) has no single
  // owner for sales: from `sharedSince` each invoice counts in full for the
  // team member who issued it (the file's salesman); earlier lines keep the
  // territory rule, so closed months never move.
  function clinicSharedOn(c, date){
    return !!(c && c.shared) && (!c.sharedSince || !date || date >= c.sharedSince);
  }
  function erpRowRep(r, clinics, erpMap, repMap){
    var m = matchCustomer((r.customer || '').trim(), clinics, erpMap);
    if(m.clinicId){
      for(var i = 0; i < (clinics || []).length; i++){
        if(clinics[i].id !== m.clinicId) continue;
        if(clinicSharedOn(clinics[i], r.date)) return (repMap || {})[r.salesman] || null;
        return clinicRepOn(clinics[i], r.date) || (repMap || {})[r.salesman] || null;
      }
    }
    return (repMap || {})[r.salesman] || null;
  }
  // Split a rep's monthly brand targets (from the uploaded DSR) across her
  // clinics: each clinic's share of a brand's target follows its share of that
  // brand's actual ERP sales history; brands nobody bought yet fall back to
  // clinic-class weights (A=3, B=2, C=1) so every clinic still gets a concrete
  // number to chase. Returns {byClinic: {clinicId: {total, byBrand}}, totals}.
  function allocateClinicTargets(opts){
    var reps = opts.rep ? [opts.rep] : null;
    var clinics = (opts.clinics || []).filter(function(c){
      return c.cls !== 'Closed' && (!reps || reps.indexOf(c.rep) >= 0);
    });
    var brandTargets = opts.brandTargets || {};
    var out = { byClinic: {}, totals: { target: 0 } };
    if(!clinics.length) return out;
    clinics.forEach(function(c){ out.byClinic[c.id] = { total: 0, byBrand: {} }; });
    // Brand sales per clinic from the ERP rows (invoice lines only).
    var salesByBrand = {}; // brand -> {clinicId: net}
    (opts.erpRows || []).forEach(function(r){
      if(r.type === 'return') return;
      var m = matchCustomer((r.customer || '').trim(), clinics, opts.erpMap);
      if(!m.clinicId || !out.byClinic[m.clinicId]) return;
      var b = normBrand(r.brand);
      (salesByBrand[b] = salesByBrand[b] || {})[m.clinicId] =
        (salesByBrand[b][m.clinicId] || 0) + Math.max(0, r.net || 0);
    });
    var clsW = { A: 3, B: 2, C: 1 };
    Object.keys(brandTargets).forEach(function(brand){
      var amount = brandTargets[brand];
      if(!(amount > 0)) return;
      var sales = salesByBrand[normBrand(brand)] || {};
      var weights = {}, wSum = 0;
      clinics.forEach(function(c){
        var w = sales[c.id] || 0;
        weights[c.id] = w; wSum += w;
      });
      if(wSum <= 0){
        clinics.forEach(function(c){ weights[c.id] = clsW[c.cls] || 1; });
        wSum = clinics.reduce(function(s2, c){ return s2 + weights[c.id]; }, 0);
      }
      clinics.forEach(function(c){
        var share = Math.round(amount * weights[c.id] / wSum * 100) / 100;
        if(share <= 0) return;
        out.byClinic[c.id].byBrand[brand] = share;
        out.byClinic[c.id].total = Math.round((out.byClinic[c.id].total + share) * 100) / 100;
      });
      out.totals.target = Math.round((out.totals.target + amount) * 100) / 100;
    });
    return out;
  }
  // Turn one brand's money gap into CONCRETE UNITS: "sell ~3x Cordless Plus
  // + 2x Cordless Freedom". Products the clinic already re-buys come first
  // (the easiest sale), then the market's best sellers, then the catalog as a
  // last resort. Unit prices are the REAL average invoice prices. The plan
  // always covers the gap (units are rounded up), and a small gap gets a
  // single product instead of a scatter of one-unit lines.
  function unitSellPlan(opts){
    var target = normBrand(opts.brand);
    var gap = opts.gap || 0;
    if(!(gap > 0)) return [];
    var stats = {};
    var add = function(rows, mine){
      (rows || []).forEach(function(r){
        if(r.type === 'return' || !(r.net > 0) || !(r.qty > 0)) return;
        if(normBrand(r.brand) !== target) return;
        var pn = (r.product || '').trim(); if(!pn) return;
        var a = stats[pn] || (stats[pn] = { q: 0, v: 0, mine: false });
        a.q += r.qty; a.v += r.net; if(mine) a.mine = true;
      });
    };
    add(opts.clinicRows, true);
    add(opts.allRows, false);
    var cands = Object.keys(stats).map(function(pn){
      var a = stats[pn];
      return { product: pn, price: Math.round(a.v / a.q * 100) / 100, popularity: a.q, mine: a.mine };
    }).filter(function(x){ return x.price > 0; });
    cands.sort(function(a, b){ return (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.popularity - a.popularity; });
    if(!cands.length){
      cands = (opts.products || []).filter(function(pr){
        return normBrand(pr.brand) === target && pr.price > 0;
      }).slice(0, 2).map(function(pr){ return { product: pr.name, price: pr.price, popularity: 0, mine: false }; });
    }
    if(!cands.length) return [];
    var chosen = cands.slice(0, 3);
    // A gap smaller than ~1.5 of the best product's price: one product, no scatter.
    if(gap < chosen[0].price * 1.5) chosen = [chosen[0]];
    var popSum = chosen.reduce(function(s2, c){ return s2 + Math.max(1, c.popularity); }, 0);
    return chosen.map(function(c){
      var share = gap * Math.max(1, c.popularity) / popSum;
      var units = Math.max(1, Math.ceil(share / c.price));
      return { product: c.product, price: c.price, units: units,
        amount: Math.round(units * c.price * 100) / 100, mine: c.mine };
    });
  }
  // ==== CROSS-SELL / UP-SELL ====
  // Answers the two questions a rep has at the clinic door: what do they
  // already buy, and what should I sell them next? Every suggestion carries
  // its evidence — either this clinic's own re-order history, or how many
  // comparable clinics already buy the thing they are missing.
  function catKeyOf(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Invoice product names are free text; the catalog is the source of brand,
  // category and list price. Token overlap is enough to bridge the two.
  function matchCatalogProduct(name, products){
    var nt = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if(!nt.length) return null;
    var best = null, bestScore = 0;
    (products || []).forEach(function(pr){
      var pt = ((pr.name || '') + ' ' + (pr.brand || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
      var ov = nt.filter(function(t){ return pt.indexOf(t) >= 0; }).length;
      var score = ov / Math.max(1, Math.max(nt.length, Math.min(pt.length, nt.length + 2)));
      if(ov >= Math.min(2, nt.length) && score > bestScore){ best = pr; bestScore = score; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  function crossSellPlan(opts){
    opts = opts || {};
    var clinics = opts.clinics || [];
    var products = opts.products || [];
    var today = opts.today || todayStr();
    var limit = opts.limit || 3;
    var out = { bought: [], upsell: [], cross: [], lapsed: [], catsBought: 0, lines: 0, net: 0 };
    var me = null;
    clinics.forEach(function(c){ if(c && c.id === opts.clinicId) me = c; });
    if(!me) return out;

    var memo = {};
    function catalogInfo(name){
      var k = catKeyOf(name);
      if(memo[k] !== undefined) return memo[k];
      var pr = matchCatalogProduct(name, products);
      return (memo[k] = pr ? { name: pr.name, cat: pr.cat || '', brand: pr.brand || '', price: pr.price || 0 } : null);
    }

    // Purchase lines: ERP invoices are authoritative; app-logged orders keep
    // the guide alive for clinics whose invoices have not been imported yet.
    var lines = [];
    (opts.erpRows || []).forEach(function(r){
      if(!r || r.type === 'return') return;
      if(!(r.net > 0) && !(r.qty > 0)) return;
      var m = matchCustomer((r.customer || '').trim(), clinics, opts.erpMap);
      if(!m.clinicId) return;
      var pn = (r.product || '').trim();
      if(!pn) return;
      var ci = catalogInfo(pn);
      lines.push({ clinicId: m.clinicId, product: (ci && ci.name) || pn,
        brand: normBrand(r.brand || (ci && ci.brand) || ''), cat: (ci && ci.cat) || '',
        qty: Math.max(0, r.qty || 0), net: Math.max(0, r.net || 0), date: r.date || '' });
    });
    var byKey = {};
    products.forEach(function(pr){ byKey[pr._key || pr.id] = pr; });
    (opts.visits || []).forEach(function(v){
      if(!v || !v.clinicId) return;
      (v.orders || []).forEach(function(o){
        (o.items || []).forEach(function(it){
          var pr = byKey[it.productId];
          if(!pr) return;
          lines.push({ clinicId: v.clinicId, product: pr.name, brand: normBrand(pr.brand || ''),
            cat: pr.cat || '', qty: it.qty || 0, net: (pr.price || 0) * (it.qty || 0), date: v.date || '' });
        });
      });
    });

    var mineByProduct = {}, myCat = {}, clinicCats = {}, catClinics = {}, marketByCat = {};
    lines.forEach(function(l){
      var cat = l.cat;
      if(cat){
        (clinicCats[l.clinicId] = clinicCats[l.clinicId] || {})[cat] = true;
        (catClinics[cat] = catClinics[cat] || {})[l.clinicId] = true;
        var mc = marketByCat[cat] || (marketByCat[cat] = { qty: 0, net: 0, prods: {} });
        mc.qty += l.qty; mc.net += l.net;
        var mp = mc.prods[l.product] || (mc.prods[l.product] = { qty: 0, net: 0, clinics: {}, brand: l.brand });
        mp.qty += l.qty; mp.net += l.net; mp.clinics[l.clinicId] = true;
      }
      if(l.clinicId !== me.id) return;
      out.lines++; out.net += l.net;
      var a = mineByProduct[l.product] || (mineByProduct[l.product] =
        { product: l.product, brand: l.brand, cat: cat, qty: 0, net: 0, last: '', times: 0 });
      a.qty += l.qty; a.net += l.net; a.times++;
      if(l.date > a.last) a.last = l.date;
      if(cat){
        var k = myCat[cat] || (myCat[cat] = { qty: 0, net: 0 });
        k.qty += l.qty; k.net += l.net;
      }
    });
    out.net = Math.round(out.net * 100) / 100;

    var myCats = Object.keys(myCat);
    out.catsBought = myCats.length;
    out.bought = Object.keys(mineByProduct).map(function(k){ return mineByProduct[k]; })
      .sort(function(a, b){ return b.net - a.net; })
      .map(function(b){ return { product: b.product, brand: b.brand, cat: b.cat,
        units: b.qty, net: Math.round(b.net * 100) / 100, lastDate: b.last, times: b.times }; })
      .slice(0, Math.max(limit, 5));

    // Cross-sell: a category comparable clinics buy and this one never has.
    // "Comparable" = same class, or overlapping buying profile.
    var cross = [];
    Object.keys(marketByCat).forEach(function(cat){
      if(myCat[cat]) return;
      var buyers = Object.keys(catClinics[cat] || {}).filter(function(id){ return id !== me.id; });
      var similar = buyers.filter(function(id){
        var peer = null;
        clinics.forEach(function(c){ if(c && c.id === id) peer = c; });
        if(peer && me.cls && peer.cls === me.cls) return true;
        var pc = clinicCats[id] || {};
        return myCats.some(function(c2){ return pc[c2]; });
      });
      if(!similar.length) return;
      var best = null;
      Object.keys(marketByCat[cat].prods).forEach(function(pn){
        var pp = marketByCat[cat].prods[pn];
        var score = Object.keys(pp.clinics).length * 2 + pp.qty;
        if(!best || score > best.score) best = { name: pn, brand: pp.brand, score: score, qty: pp.qty };
      });
      if(!best) return;
      var pr = matchCatalogProduct(best.name, products);
      cross.push({ product: best.name, brand: best.brand, cat: cat,
        price: pr ? pr.price || 0 : 0, peers: similar.length, marketNet: marketByCat[cat].net,
        reason: similar.length + ' comparable clinic' + (similar.length === 1 ? '' : 's') +
          ' buy ' + cat + ' — this one never has' });
    });
    cross.sort(function(a, b){ return b.peers - a.peers || b.marketNet - a.marketNet; });
    out.cross = cross.slice(0, limit);

    // Up-sell: a real price step inside a category they already buy, proven by
    // other clinics buying it.
    var ups = [];
    myCats.forEach(function(cat){
      var mineAvg = myCat[cat].qty > 0 ? myCat[cat].net / myCat[cat].qty : 0;
      if(!(mineAvg > 0)) return;
      var mc = marketByCat[cat];
      Object.keys(mc.prods).forEach(function(pn){
        if(mineByProduct[pn]) return;
        var pp = mc.prods[pn];
        var price = pp.qty > 0 ? pp.net / pp.qty : 0;
        if(!(price >= mineAvg * 1.25)) return;
        var buyers = Object.keys(pp.clinics).filter(function(id){ return id !== me.id; }).length;
        if(!buyers) return;
        ups.push({ product: pn, brand: pp.brand, cat: cat,
          price: Math.round(price * 100) / 100, from: Math.round(mineAvg * 100) / 100,
          buyers: buyers, lift: price / mineAvg,
          reason: 'They buy ' + cat + ' at about ' + money(Math.round(mineAvg * 100) / 100) +
            ' a unit — this is the step up, and ' + buyers + ' other clinic' + (buyers === 1 ? ' takes' : 's take') + ' it' });
      });
    });
    ups.sort(function(a, b){ return b.buyers - a.buyers || b.lift - a.lift; });
    out.upsell = ups.slice(0, limit);

    // Lapsed: a proven repeat purchase that stopped.
    var gapDays = opts.lapsedDays || 45;
    out.lapsed = out.bought.filter(function(b){
      return b.times >= 2 && b.lastDate && daysBetween(b.lastDate, today) >= gapDays;
    }).map(function(b){
      var d = daysBetween(b.lastDate, today);
      return { product: b.product, brand: b.brand, cat: b.cat, lastDate: b.lastDate,
        daysSince: d, units: b.units, times: b.times,
        reason: 'Bought ' + b.times + ' times, last ' + fmtDate(b.lastDate) + ' (' + d + ' days ago) — due a re-order' };
    }).sort(function(a, b){ return b.daysSince - a.daysSince; }).slice(0, limit);

    return out;
  }

  // ==== CONTACTS BULK IMPORT ====
  // One sheet with every contact in the market -> parsed, matched to the
  // right clinic automatically, specialties normalized, birthdays accepted in
  // any common shape (ISO, DD/MM/YYYY, or a raw Excel serial number).
  function parseDateLoose(v){
    if(v == null || v === '') return '';
    if(typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim())){
      var n = parseFloat(v);
      if(n > 10000 && n < 80000){ // Excel serial (days since 1899-12-30)
        var d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return d.toISOString().slice(0, 10);
      }
    }
    var str = String(v).trim();
    var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(dmy){
      var y = +dmy[3]; if(y < 100) y += y > 30 ? 1900 : 2000;
      var mo = +dmy[2], da = +dmy[1];
      if(mo > 12 && da <= 12){ var tswp = mo; mo = da; da = tswp; } // MM/DD written the other way
      if(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0');
    }
    return '';
  }
  var SPECIALTY_ALIASES = {
    'ortho': 'Orthodontist', 'orthodont': 'Orthodontist', 'تقويم': 'Orthodontist',
    'perio': 'Periodontist', 'لثة': 'Periodontist',
    'pedo': 'Pedodontist', 'اطفال': 'Pedodontist', 'أطفال': 'Pedodontist',
    'prostho': 'Prosthodontist', 'تركيبات': 'Prosthodontist',
    'endo': 'Endodontist', 'عصب': 'Endodontist', 'جذور': 'Endodontist',
    'surg': 'Oral Surgeon', 'جراح': 'Oral Surgeon',
    'hygien': 'Hygienist',
    'manager': 'Clinic Manager', 'مدير': 'Clinic Manager',
    'general': 'General Dentist', 'gp': 'General Dentist', 'عام': 'General Dentist', 'اسنان': 'General Dentist', 'أسنان': 'General Dentist',
  };
  function matchSpecialty(text, specialties){
    var t = String(text || '').toLowerCase().trim();
    if(!t) return '';
    for(var i = 0; i < (specialties || []).length; i++)
      if(specialties[i].toLowerCase() === t) return specialties[i];
    for(var k in SPECIALTY_ALIASES)
      if(t.indexOf(k) >= 0) return SPECIALTY_ALIASES[k];
    for(var j = 0; j < (specialties || []).length; j++)
      if(t.indexOf(specialties[j].toLowerCase().split(' ')[0]) >= 0) return specialties[j];
    return '';
  }
  // ==== CONTACT IMPORT (people sheets → doctors/hygienists) ====
  // The team's own spreadsheets are messy by nature: a title row above the
  // header, several people columns ("Doctor", "Dentist", "Hygienist"), a
  // phone column called "Contact Number", a name cell that also carries the
  // role and the clinic ("Maram Aline Hygenist"), abbreviations for clinics,
  // and the same person repeated across sheets. Everything below exists to
  // turn that into clean, de-duplicated contacts attached to the right clinic.
  var PERSON_HDR = /hygien|dentist|doctor|dr\.?\s|contact\s*name|^name$|physician|staff|person|طبيب|دكتور|^اسم$|اسم (الطبيب|الدكتور|الشخص|جهة الاتصال|الممرض)/i;
  var LOCATION_HDR = /location|area|address|branch|منطقة|موقع|عنوان|فرع/i;
  var PHONE_HDR = /phone|mobile|tel\b|whats|number|contact\s*(no|num)|هاتف|رقم|جوال|موبايل|واتس/i;
  var CLINIC_HDR = /clinic|center|centre|hospital|pharmacy|account|عيادة|مركز|مستشفى|صيدلية|جهة/i;
  var TITLE_HDR = /special|title|position|role|تخصص|لقب|وظيفة/i;
  var BIRTHDAY_HDR = /birth|b\.?day|dob|ميلاد/i;
  var NOTES_HDR = /note|remark|comment|feedback|action|ملاحظ|تقرير/i;
  var HYG_TOKEN = /\b(hyg\w*)\b/i;                       // hygienist, hygenist, hyginist, hygeinst…
  var CLINIC_WORD = /\b(clinic|clinics|center|centre|hospital|hosp|tower|pharmacy|dental|polyclinic|medical)\b/i;
  var PERSON_TITLE = /^(ms|mr|mrs|miss|dr|dra|d)\.?\s*/i;

  // Spelling variants and abbreviations the team uses for clinics in their own
  // sheets, expanded before a hint is matched against the app's clinics.
  var CLINIC_HINT_ALIASES = [
    [/\bnhc\b/g, 'nael hazeem sharq'],
    [/\bnael\s+(al\s*)?haze+m\b/g, 'nael hazeem sharq'],
    [/\balien\b/g, 'aline'],
    [/\bspecializrd\b/g, 'specialized'],
    [/\broyale?\s+h[ay]+a?t+\b/g, 'royale hayat hospital'],
    [/\bansan\b/g, 'asnan'],
    [/\bdaman\b/g, 'dasman'],
    [/\bhekma\b/g, 'al hekma dental center'],
    [/\b(al\s*)?seef(\s+hosp\w*)?\b/g, 'al seef hospital'],
    [/\bgrow\s+clinic\b/g, ' '],
    [/\bmoh\b/g, 'ministry of health'],
    [/\bhosp\b/g, 'hospital'],
    [/\basnan\s+co\b\.?/g, 'asnanco'],
  ];
  // Words that name a place, not a clinic — "Jahra" after a hygienist's name is where she works, not who she works for.
  var AREA_WORDS = ['jahra','salmiya','hawally','hawalli','farwaniya','fahaheel','fahahel','mangaf','mahboula','jabriya','sabah','salem','shaab','sharq','kuwait','city','egaila','fintas','avenues','mall','kipco','hamra','tijaria','riggae','bneid','beneid','gar','algar','alghar','qurain','mubarak','kabeer','ahmadi','jleeb','khaitan','rumaithiya','mishref','bayan','surra','qadsiya','adan','dasma','shuwaikh'];
  // Tokens that never identify a clinic on their own.
  var GENERIC_WORDS = ['hospital','clinic','clinics','center','centre','dental','medical','care','group','tower','plus','co','company','pharmacy','international','general','dr','al','the','of','polyclinic','services','service','new'];
  // A hint made only of these says nothing at all ("Dental", "Clinic", "H").
  var PURE_NOISE = ['dental','clinic','clinics','center','centre','hospital','medical','dr','al','the','of','and'];
  var NOT_A_PERSON = /^(no|none|n\/a|yes|close|closed|floater|nurse|hygienist|hygienists|filipino|filipina|arab|indian|partimer|part\s*timer|pharmacy|office|self|team|staff|reception|tbd|na|-)\b/i;
  function hintSaysSomething(h){
    var t = normClinicHint(h);
    if(t.length < 2 || /^ksa$/.test(t)) return false;
    var toks = t.split(' ').filter(Boolean);
    // "SN", "Dental 8" carry a real identifier; "H", "Dental", "Clinic" do not
    return toks.some(function(w){ return PURE_NOISE.indexOf(w) < 0 && (w.length >= 2 || /^\d$/.test(w)) && (w.length >= 2 || toks.length > 1); });
  }
  function isAreaHint(h){ var t = normClinicHint(h).split(' ').filter(Boolean); return t.length > 0 && t.every(function(w){ return AREA_WORDS.indexOf(w) >= 0 || /^\d+$/.test(w); }); }
  function distinctiveTokens(name){ return normClinicName(name).split(' ').filter(function(t){ return t && GENERIC_WORDS.indexOf(t) < 0; }); }
  function normClinicHint(s){
    var t = String(s || '').toLowerCase().replace(/[()"'’“”]/g, ' ').replace(/\s+/g, ' ').trim();
    CLINIC_HINT_ALIASES.forEach(function(a){ t = t.replace(a[0], a[1]); });
    return t.replace(/\s+/g, ' ').trim();
  }
  function normPerson(name){
    return String(name || '').toLowerCase().replace(PERSON_TITLE, '').replace(/[^a-z0-9؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tidyPersonName(name){
    return String(name || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim()
      .replace(/^(Ms|Mr|Mrs|Miss|Dr)\.?\s*/i, function(m, t){ return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() + '. '; })
      .replace(/\s+\.$/, '').trim();
  }
  function looksLikeName(s){
    var t = String(s || '').trim();
    if(!t || t.length > 60) return false;
    if(t.split(/\s+/).length > 8) return false;
    if(/[.!?;]\s+[A-Za-z]/.test(t) && t.length > 30) return false; // a sentence, not a name
    if(/^\d|\d{3,}/.test(t) || NOT_A_PERSON.test(t)) return false;   // "No Hygienist", "1 / Arab", "Floater", a phone number
    return /[A-Za-z؀-ۿ]{3}/.test(t);
  }
  // "Ms. Bidya, Ms.Abby and Ms.Moly" → three people
  function splitPeople(cell){
    var t = String(cell || '').trim();
    if(!/(,|&|\band\b|\+)/i.test(t)) return [t];
    var parts = t.split(/\s*(?:,|&|\band\b|\+)\s*/i).map(function(x){ return x.trim(); }).filter(Boolean);
    if(parts.length < 2 || !parts.every(looksLikeName)) return [t];
    return parts;
  }
  // "Maram Aline Hygenist" → {name:'Maram', hint:'Aline', title:'Hygienist'}
  // "Dr Aseel Yousfan Hygenist Nael Hazem" → name 'Dr Aseel Yousfan', hint 'Nael Hazem'
  // "Dana El Shatty Kuwait Hospital Hyg" → name 'Dana El Shatty', hint 'Kuwait Hospital'
  function splitPersonHint(raw, clinics){
    var s = String(raw || '').replace(/[“”"]/g, ' ').replace(/\s+/g, ' ').trim();
    var m = s.match(HYG_TOKEN);
    if(!m) return { name: s, hint: '', title: '' };
    var before = s.slice(0, m.index).trim();
    var after = s.slice(m.index + m[0].length).trim();
    var m2 = after.match(HYG_TOKEN);                 // a second copy of the role → keep what precedes it
    if(m2) after = after.slice(0, m2.index).trim();
    var fill = /\b(cheif|chief|the|from)\b/gi;
    before = before.replace(fill, ' ').replace(/\s+/g, ' ').trim();
    after = after.replace(fill, ' ').replace(/\s+/g, ' ').trim();
    var name = before.replace(/[.,]+$/, '').trim(), hint = after, area = '';
    if(hint && isAreaHint(hint)){ area = hint; hint = ''; }      // "iane Bayan Hygenist Jahra" → Jahra is where, not who
    if(!name && after){                              // "Hygeinist Anwar New Care" → the name follows the role
      var w = after.split(' '); name = w[0]; hint = w.slice(1).join(' ');
    } else if(!hint){
      var words = name.split(/\s+/);
      var ci = -1;
      for(var i = 0; i < words.length; i++) if(CLINIC_WORD.test(words[i])){ ci = i; break; }
      if(ci >= 0){                                   // "Marlyn. Gulf Clinic" / "Pia Asnan Tower"
        var cut = Math.max(1, ci - 1);
        hint = words.slice(cut).join(' '); name = words.slice(0, cut).join(' ');
      } else if(words.length >= 2){
        // "Maram Aline" / "Dr Ghoson Al Ali Moh": the shortest tail that names a clinic we know, or an abbreviation we expand
        for(var k = words.length - 1; k >= 1; k--){
          var tail = words.slice(k).join(' ');
          var aliased = normClinicHint(tail) !== tail.toLowerCase().replace(/\s+/g, ' ').trim();
          var mm = (clinics && clinics.length) ? matchCustomer(normClinicHint(tail), clinics, {}) : { clinicId: null };
          if(mm.clinicId || aliased){ hint = tail; name = words.slice(0, k).join(' '); break; }
        }
      }
    }
    name = name.replace(/[.,]+$/, '').trim();
    hint = hint.replace(/^[.,\-–]+|[.,\-–]+$/g, '').trim();
    if(hint && !hintSaysSomething(hint)) hint = '';   // "H", "Dental", "Clinic", "Ksa" say nothing
    if(CLINIC_WORD.test(name) && name.split(' ').length <= 2 && !PERSON_TITLE.test(name)) return { name: '', hint: name, area: area, title: 'Hygienist' }; // "Sen Clinic Hygenist": no person named
    return { name: name, hint: hint, area: area, title: 'Hygienist' };
  }
  function detectContactHeader(all){
    for(var i = 0; i < Math.min(all.length, 20); i++){
      var r = all[i] || [], cols = { people: [], phones: [], clinic: -1, location: -1, title: -1, birthday: -1, notes: -1 };
      for(var c = 0; c < r.length; c++){
        var h = String(r[c] || '').trim();
        if(!h || h.length > 40) continue;
        if(LOCATION_HDR.test(h)) { if(cols.location < 0) cols.location = c; }
        else if(PERSON_HDR.test(h) && !/^total/i.test(h)) cols.people.push({ col: c, title: /hygien/i.test(h) ? 'Hygienist' : '' });
        else if(PHONE_HDR.test(h)) cols.phones.push(c);
        else if(CLINIC_HDR.test(h)) { if(cols.clinic < 0) cols.clinic = c; }
        else if(TITLE_HDR.test(h)) { if(cols.title < 0) cols.title = c; }
        else if(BIRTHDAY_HDR.test(h)) { if(cols.birthday < 0) cols.birthday = c; }
        else if(NOTES_HDR.test(h)) { if(cols.notes < 0) cols.notes = c; }
      }
      if(cols.people.length && (cols.clinic >= 0 || cols.phones.length)) return { at: i, cols: cols, width: r.length };
    }
    return null;
  }
  // Rows → contacts. opts.clinics lets a role-and-clinic name cell be split.
  function parseContactRows(all, specialties, opts){
    if(!all || !all.length) return { contacts: [], skipped: 0, error: 'NO_ROWS' };
    var hdr = detectContactHeader(all);
    if(!hdr) return { contacts: [], skipped: 0, error: 'NO_HEADER' };
    var cols = hdr.cols, clinics = (opts && opts.clinics) || [];
    var headed = {};
    cols.people.forEach(function(p){ headed[p.col] = 1; }); cols.phones.forEach(function(c){ headed[c] = 1; });
    ['clinic', 'location', 'title', 'birthday', 'notes'].forEach(function(k){ if(cols[k] >= 0) headed[cols[k]] = 1; });
    // each people column pairs with the nearest phone column to its right
    cols.people.forEach(function(p, i){
      var next = cols.people[i + 1] ? cols.people[i + 1].col : Infinity;
      var right = cols.phones.filter(function(c){ return c > p.col && c < next; });
      p.phone = right.length ? right[0] : (cols.phones.filter(function(c){ return c > p.col; })[0] != null ? cols.phones.filter(function(c){ return c > p.col; })[0] : (cols.phones.length === 1 ? cols.phones[0] : -1));
    });
    // a "people" column whose cells are sentences is a report column, not names
    cols.people = cols.people.filter(function(p){
      var vals = all.slice(hdr.at + 1).map(function(r){ return String((r || [])[p.col] || '').trim(); }).filter(Boolean);
      if(!vals.length) return false;
      var ok = vals.filter(function(v){ return splitPeople(v).every(looksLikeName); }).length;
      return ok / vals.length >= 0.6;
    });
    if(!cols.people.length) return { contacts: [], skipped: 0, error: 'NO_HEADER' };
    var contacts = [], skipped = 0;
    for(var rI = hdr.at + 1; rI < all.length; rI++){
      var row = all[rI] || [];
      var clinic = cols.clinic >= 0 ? String(row[cols.clinic] || '').trim() : '';
      var area = cols.location >= 0 ? String(row[cols.location] || '').trim() : '';
      var extra = [];
      for(var x = 0; x < row.length; x++){
        var v = String(row[x] == null ? '' : row[x]).trim();
        if(!headed[x] && v && !/^\d+(\.\d+)?$/.test(v) && v.length <= 60) extra.push(v);
      }
      var any = false;
      cols.people.forEach(function(p){
        var cell = String(row[p.col] || '').trim();
        if(!cell) return;
        splitPeople(cell).forEach(function(raw){
        if(!looksLikeName(raw)) return;
        any = true;
        var name = raw, hint = clinic, title = p.title, rowArea = area;
        if(!clinic || HYG_TOKEN.test(raw)){
          var sp = splitPersonHint(raw, clinics);
          name = sp.name; if(!clinic) hint = sp.hint; if(sp.title) title = sp.title; if(!rowArea && sp.area) rowArea = sp.area;
        }
        if(!name) return;
        var notes = [];
        if(cols.notes >= 0 && String(row[cols.notes] || '').trim()) notes.push(String(row[cols.notes]).trim());
        extra.forEach(function(e){ if(notes.indexOf(e) < 0) notes.push(e); });
        var t = cols.title >= 0 ? matchSpecialty(row[cols.title], specialties) : '';
        contacts.push({
          name: tidyPersonName(name),
          clinic: hint,
          area: rowArea,
          phone: p.phone >= 0 ? cleanPhone(row[p.phone]) : '',
          title: t || (title && (specialties || []).indexOf(title) >= 0 ? title : ''),
          titleRaw: cols.title >= 0 ? String(row[cols.title] || '').trim() : '',
          birthday: cols.birthday >= 0 ? parseDateLoose(row[cols.birthday]) : '',
          notes: notes.join(' · '),
        });
        });
      });
      if(!any) skipped++;
    }
    return { contacts: contacts, skipped: skipped, error: contacts.length ? null : 'NO_ROWS' };
  }
  function phoneKey(phone){ var d = String(phone || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; }
  function samePerson(a, b){
    var xa = normPerson(a).split(' ').filter(function(t){ return t.length >= 3; });
    var ya = normPerson(b).split(' ').filter(function(t){ return t.length >= 3; });
    if(!xa.length || !ya.length) return false;
    return xa.some(function(x){ return ya.some(function(y){
      var a = x.length <= y.length ? x : y, b = x.length <= y.length ? y : x;   // a is the shorter
      return x === y || (a.length >= 4 && b.indexOf(a) >= 0) || (a.length >= 3 && b.length >= 6 && b.indexOf(a) === 0)
        || (a.length >= 4 && levenshtein(x, y) <= 1) || (a.length >= 6 && levenshtein(x, y) <= 2);
    }); });
  }
  // Two people at the same clinic who merely share a family name ("Ahmed
  // Al-Sabah" / "Noura Al-Sabah") are two people: without a shared phone the
  // GIVEN name has to match as well (typo-tolerant, abbreviation-tolerant).
  function sameFirstName(a, b){
    var x = normPerson(a).split(' ').filter(function(t){ return t.length >= 3; })[0];
    var y = normPerson(b).split(' ').filter(function(t){ return t.length >= 3; })[0];
    if(!x || !y) return false;
    var sh = x.length <= y.length ? x : y, lo = x.length <= y.length ? y : x;
    return x === y || (sh.length >= 4 && lo.indexOf(sh) === 0) || (sh.length >= 4 && levenshtein(x, y) <= 1) || (sh.length >= 6 && levenshtein(x, y) <= 2);
  }
  function areaKey(a){ return String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  // One record per person across every sheet: same phone + similar name, or
  // same first name at the same clinic when one side has no phone.
  // resolve(hint, area) → a stable key for the clinic (the matched app clinic id when known).
  function dedupeContacts(list, resolve){
    var key = function(c){ if(!c.clinic) return ''; return (resolve && resolve(c.clinic, c.area)) || ('h:' + normClinicName(normClinicHint(c.clinic))); };
    var out = [];
    list.forEach(function(c){
      var pk = phoneKey(c.phone), ck = key(c), hit = null;
      for(var i = 0; i < out.length && !hit; i++){
        var e = out[i], ek = phoneKey(e.phone);
        if(pk && ek && pk === ek && samePerson(e.name, c.name)) hit = e;
        else if(ck && key(e) === ck && samePerson(e.name, c.name) && sameFirstName(e.name, c.name) && (!pk || !ek || pk === ek)) hit = e;
      }
      if(!hit){ out.push(Object.assign({}, c)); return; }
      ['clinic', 'phone', 'title', 'birthday', 'area'].forEach(function(f){ if(!hit[f] && c[f]) hit[f] = c[f]; });
      if(c.notes) c.notes.split(' · ').forEach(function(n){ if(n && (hit.notes || '').indexOf(n) < 0) hit.notes = hit.notes ? hit.notes + ' · ' + n : n; });
      if(c.area && hit.area && areaKey(hit.area) !== areaKey(c.area) && areaKey(hit.notes || '').indexOf(areaKey(c.area)) < 0) hit.notes = (hit.notes ? hit.notes + ' · ' : '') + 'Also ' + c.area;
    });
    return out;
  }
  // ---- Day plans: three-way merge (this device's copy, the cloud copy, and
  // the copy this device last loaded or saved). A date|rep list this device
  // changed since then wins; every other list takes the cloud's version, so
  // a clinic removed from a plan on another device stays removed instead of
  // being resurrected by the next save from here. Without a base (first save
  // after an offline boot) it degrades to the old union: local lists win,
  // cloud fills in what is missing. `tombs` = Set of 'date|rep' keys whose
  // list this device deleted.
  function mergeDayPlans3(local, cloud, base, tombs){
    var out = {}, recovered = 0;
    var tomb = tombs || { has: function(){ return false; } };
    var keysOf = function(o){ var ks = []; Object.keys(o || {}).forEach(function(d){ Object.keys(o[d] || {}).forEach(function(r){ ks.push(d + '|' + r); }); }); return ks; };
    var get = function(o, k){ var i = k.indexOf('|'), d = k.slice(0, i), r = k.slice(i + 1); return o && o[d] ? o[d][r] : undefined; };
    var all = {};
    keysOf(local).concat(keysOf(cloud), keysOf(base)).forEach(function(k){ all[k] = 1; });
    Object.keys(all).forEach(function(k){
      var L = get(local, k), C = get(cloud, k), B = base ? get(base, k) : undefined;
      var pick;
      if(!base){
        pick = (L && L.length) ? L : (tomb.has(k) ? undefined : C);
      } else {
        var localChanged = JSON.stringify(L === undefined ? null : L) !== JSON.stringify(B === undefined ? null : B);
        pick = localChanged ? L : (tomb.has(k) ? undefined : C);
        if(!localChanged && JSON.stringify(pick === undefined ? null : pick) !== JSON.stringify(L === undefined ? null : L)) recovered++;
      }
      if(!pick || !pick.length) return;
      var i = k.indexOf('|'), d = k.slice(0, i), r = k.slice(i + 1);
      (out[d] = out[d] || {})[r] = pick;
    });
    return { merged: out, recovered: recovered };
  }
  // Recycle bin: union by id per kind (newest deletion wins) — a bin this
  // device never managed to load must not be replaced by its own defaults.
  function mergeRecycleBin(cloud, local){
    var out = {};
    ['clinics', 'products', 'visits'].forEach(function(k){
      var byId = {}, order = [];
      [(cloud || {})[k] || [], (local || {})[k] || []].forEach(function(list){
        list.forEach(function(x){
          if(!x || x.id == null) return;
          if(!byId[x.id]){ byId[x.id] = x; order.push(x.id); }
          else if((x._deletedAt || 0) > (byId[x.id]._deletedAt || 0)) byId[x.id] = x;
        });
      });
      out[k] = order.map(function(id){ return byId[id]; });
    });
    return out;
  }
  // ---- Month achievement, computed from plain data ----
  // The SAME code serves the Today card, the reports and the daily e-mail, so
  // every figure the team sees is one figure. `data` = { today, targets,
  // erpSales (index with packed rows), clinics, erpMap, visits, tasks,
  // events, dayPlans }.
  function unpackErpRows(packed){ return (packed || []).map(function(a){ return { date: a[0], doc: a[1], type: a[2] ? 'return' : 'invoice', product: a[3], qty: a[4], gross: a[5], net: a[6], sret: a[7], salesman: a[8], brand: a[9], customer: a[10], cls: a[11], dsret: a[12] || 0, ref: a[13] || null }; }); }
  function erpPeriodsOf(es){ return (es && Array.isArray(es.periods)) ? es.periods.filter(function(p){ return p && !p.rowsMissing; }) : []; }
  function erpViewRowsOf(es, p, ctx){
    var policy = (es && es.returnPolicy) === 'erp' ? 'erp' : 'origin';
    return applyReturnPolicy(unpackErpRows(p.rows), policy, ctx);
  }
  function erpCtxOf(es){ var all = []; erpPeriodsOf(es).forEach(function(p){ unpackErpRows(p.rows).forEach(function(r){ all.push(r); }); }); return returnContext(all); }
  // Net ERP sales in a range per rep (null when no file covers the range).
  function erpRevenueRange(data, from, to, repFilter){
    var es = data.erpSales, ps = erpPeriodsOf(es).filter(function(p){ return (!from || p.to >= from) && (!to || p.from <= to); });
    if(!ps.length) return null;
    var ctx = erpCtxOf(es), sum = 0;
    ps.forEach(function(p){ erpViewRowsOf(es, p, ctx).forEach(function(r){
      if(!inRange(r.date, from, to)) return;
      var rep = erpRowRep(r, data.clinics || [], data.erpMap || {}, p.repMap || {});
      if(!rep) return;
      if(repFilter !== 'all' && rep !== repFilter) return;
      sum += r.net; // DSR basis: every line of the rep's salesman, channels included
    }); });
    return Math.round(sum * 100) / 100;
  }
  function addDaysStr(d, n){ var x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return localDateStr(x); }
  // Month-to-date ERP sales per rep. `asOf` = the rep's latest invoice;
  // `covered` = the last day the uploaded files cover (a file covers every
  // salesman up to its last invoice date, even on a day this rep sold
  // nothing); `complete` = those files reach back to the start of the month
  // without a gap, so the ERP figure can stand on its own for the month.
  var ERP_GAP_DAYS = 3; // a weekend plus a holiday with no invoices is not a gap
  function erpMtd(data){
    var today = data.today, mStart = today.slice(0, 7) + '-01', es = data.erpSales;
    var sums = {}, asOf = {}, spans = {}, ctx = null;
    erpPeriodsOf(es).filter(function(p){ return p.to >= mStart && p.from <= today; }).forEach(function(p){
      ctx = ctx || erpCtxOf(es);
      var seen = {};
      erpViewRowsOf(es, p, ctx).forEach(function(r){
        if(r.date < mStart || r.date > today) return;
        var rep = erpRowRep(r, data.clinics || [], data.erpMap || {}, p.repMap || {});
        if(!rep) return;
        sums[rep] = (sums[rep] || 0) + r.net;
        if(!asOf[rep] || r.date > asOf[rep]) asOf[rep] = r.date;
        seen[rep] = 1;
      });
      Object.keys(seen).forEach(function(rep){
        (spans[rep] = spans[rep] || []).push({ from: p.from < mStart ? mStart : p.from, to: p.to > today ? today : p.to });
      });
    });
    var map = {};
    Object.keys(sums).forEach(function(rep){
      var sp = (spans[rep] || []).sort(function(a, b){ return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
      var complete = !!sp.length && sp[0].from <= addDaysStr(mStart, ERP_GAP_DAYS), end = sp.length ? sp[0].to : null;
      for(var i = 1; complete && i < sp.length; i++){
        if(sp[i].from > addDaysStr(end, ERP_GAP_DAYS + 1)) break; // a hole: coverage ends before it
        if(sp[i].to > end) end = sp[i].to;
      }
      map[rep] = { amount: Math.round(sums[rep] * 100) / 100, asOf: asOf[rep], covered: end || asOf[rep], complete: complete };
    });
    return map;
  }
  // Invoices a team member issued at ANOTHER rep's clinic this month (shared
  // accounts excluded — those count for the issuer). They count for the
  // clinic's owner; this list is what the app shows so nobody is surprised.
  // Returns [{clinicId, clinic, issuer, owner, invoices, net, from, to,
  //   details: [{doc, date, net, items: [{product, brand, qty, net}]}]}].
  function crossInvoices(data){
    var today = data.today, mStart = today.slice(0, 7) + '-01', es = data.erpSales, clinics = data.clinics || [];
    var byId = {}; clinics.forEach(function(c){ byId[c.id] = c; });
    var out = {}, ctx = null;
    erpPeriodsOf(es).filter(function(p){ return p.to >= mStart && p.from <= today; }).forEach(function(p){
      ctx = ctx || erpCtxOf(es);
      erpViewRowsOf(es, p, ctx).forEach(function(r){
        if(r.date < mStart || r.date > today) return;
        var issuer = (p.repMap || {})[r.salesman];
        if(!issuer) return;
        var m = matchCustomer((r.customer || '').trim(), clinics, data.erpMap || {});
        var c = m.clinicId && byId[m.clinicId];
        if(!c || clinicSharedOn(c, r.date)) return;
        var owner = clinicRepOn(c, r.date);
        if(!owner || owner === issuer) return;
        var k = c.id + '|' + issuer + '|' + owner;
        var a = out[k] || (out[k] = { clinicId: c.id, clinic: c.name, issuer: issuer, owner: owner, docs: {}, net: 0, from: r.date, to: r.date });
        var d = a.docs[r.doc] || (a.docs[r.doc] = { doc: r.doc, date: r.date, net: 0, items: [] });
        d.net += r.net; d.items.push({ product: r.product, brand: r.brand, qty: r.qty, net: r.net });
        a.net += r.net;
        if(r.date < a.from) a.from = r.date;
        if(r.date > a.to) a.to = r.date;
      });
    });
    return Object.keys(out).map(function(k){ var a = out[k];
      var details = Object.keys(a.docs).map(function(n){ var d = a.docs[n]; return { doc: d.doc, date: d.date, net: Math.round(d.net * 1000) / 1000, items: d.items }; })
        .sort(function(x, y){ return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.doc < y.doc ? -1 : 1); });
      return { clinicId: a.clinicId, clinic: a.clinic, issuer: a.issuer, owner: a.owner, invoices: details.length, net: Math.round(a.net * 1000) / 1000, from: a.from, to: a.to, details: details }; })
      .sort(function(x, y){ return y.net - x.net; });
  }
  // ---- ERP lines with the person each counts for (shared by the weekly deck
  // and the KPI scorecard): one pass over every stored file.
  function erpAttributedRows(data){
    var es = data.erpSales, clinics = data.clinics || [], erpMap = data.erpMap || {}, ctx = erpCtxOf(es), rows = [];
    erpPeriodsOf(es).forEach(function(p){ erpViewRowsOf(es, p, ctx).forEach(function(r){
      var m = matchCustomer((r.customer || '').trim(), clinics, erpMap);
      if(m.ignored) return;
      rows.push({ r: r, rep: erpRowRep(r, clinics, erpMap, p.repMap || {}), clinicId: m.clinicId || null, channel: !!m.channel });
    }); });
    return rows;
  }
  // Wins in [from, to] from attributed rows: accounts with a first order ever
  // (in the stored files), accounts back after 60+ days, products bought by an
  // account for the first time, every invoice, and the free goods: samples
  // (documents with free lines only) and deals (free lines on a paid invoice).
  // Company-internal accounts in the ERP ("Marketing Philips", "Marketing and
  // Advertisement"): stock moved for marketing, never a customer win.
  var INTERNAL_ACCT_RE = /^\s*marketing\b|advertis/i;
  function isInternalAccount(name){ return INTERNAL_ACCT_RE.test(String(name || '')); }
  function erpWinsInRange(rows, from, to, clinics){
    var byId = {}; (clinics || []).forEach(function(c){ byId[c.id] = c; });
    var custName = function(x){ return x.clinicId && byId[x.clinicId] ? byId[x.clinicId].name : (x.r.customer || '').trim(); };
    var custKey = function(x){ return x.clinicId ? 'c:' + x.clinicId : 'n:' + (x.r.customer || '').trim().toLowerCase(); };
    var firstSeen = {}, lastBefore = {}, prodSeen = {};
    rows.forEach(function(x){
      if(x.channel || !(x.r.net > 0) || x.r.type === 'return' || (!x.clinicId && isInternalAccount(x.r.customer))) return;
      var k = custKey(x), pk = k + '|' + String(x.r.product || '').toLowerCase();
      if(!firstSeen[k] || x.r.date < firstSeen[k]) firstSeen[k] = x.r.date;
      if(!prodSeen[pk] || x.r.date < prodSeen[pk]) prodSeen[pk] = x.r.date;
      if(x.r.date < from && (!lastBefore[k] || x.r.date > lastBefore[k])) lastBefore[k] = x.r.date;
    });
    var wins = { newAccounts: {}, reactivated: {}, placements: {}, invoices: {} };
    // free lines, by document: a free line on a document that also carries a
    // paid line is part of that deal (it is in the discount); a document with
    // free lines only is a sample — a seed, never a win (R16)
    var focDocs = {}, paidDoc = {};
    rows.filter(function(x){ return x.rep && x.r.date >= from && x.r.date <= to; }).forEach(function(x){
      var r = x.r, k = custKey(x), name = custName(x), pk = k + '|' + String(r.product || '').toLowerCase();
      var internal = !x.clinicId && isInternalAccount(r.customer);
      var inv = wins.invoices[r.doc] || (wins.invoices[r.doc] = { doc: r.doc, date: r.date, rep: x.rep, account: name, clinicId: x.clinicId || null, channel: x.channel, internal: internal, net: 0, gross: 0, lines: 0, brands: {}, items: {} });
      inv.net += r.net; inv.gross += Number(r.gross) || 0; inv.lines++; if(r.brand) inv.brands[normBrand(r.brand)] = 1;
      if(r.product && r.net > 0){ var it = inv.items[r.product] || (inv.items[r.product] = { product: String(r.product).trim(), brand: normBrand(r.brand), net: 0 }); it.net += r.net; }
      if(r.net > 0 && r.type !== 'return') paidDoc[r.doc] = 1;
      if(x.channel || internal) return;
      if(isFocRow(r)){ var fd = focDocs[r.doc] || (focDocs[r.doc] = { doc: r.doc, rep: x.rep, account: name, clinicId: x.clinicId || null, key: k, date: r.date, items: [], lines: [], gross: 0 });
        fd.items.push(r.product); fd.lines.push({ product: String(r.product || '').trim(), brand: normBrand(r.brand), qty: Number(r.qty) || 0, gross: Number(r.gross) || 0 }); fd.gross += Number(r.gross) || 0; return; }
      if(!(r.net > 0) || r.type === 'return') return;
      if(firstSeen[k] >= from && !wins.newAccounts[k]) wins.newAccounts[k] = { rep: x.rep, account: name, clinicId: x.clinicId || null, key: k, date: firstSeen[k], doc: r.doc, net: 0, products: {} };
      if(wins.newAccounts[k]){ var na = wins.newAccounts[k]; na.net += r.net; var np = na.products[r.product] || (na.products[r.product] = { product: String(r.product || '').trim(), brand: normBrand(r.brand), net: 0 }); np.net += r.net; }
      else if(lastBefore[k] && daysBetween(lastBefore[k], from) >= 60 && !wins.reactivated[k]) wins.reactivated[k] = { rep: x.rep, account: name, clinicId: x.clinicId || null, key: k, date: r.date, doc: r.doc, lastBefore: lastBefore[k] };
      if(!wins.newAccounts[k] && prodSeen[pk] >= from && firstSeen[k] < from){
        var pl = wins.placements[pk] || (wins.placements[pk] = { rep: x.rep, account: name, clinicId: x.clinicId || null, key: k, product: r.product, brand: r.brand, date: r.date, doc: r.doc, net: 0 });
        pl.net += r.net;
      }
    });
    var vals = function(o){ return Object.keys(o).map(function(k){ return o[k]; }); };
    var rnd = function(n){ return Math.round(n * 1000) / 1000; };
    var samples = [], deals = [];
    vals(focDocs).forEach(function(f){ f.gross = rnd(f.gross); (paidDoc[f.doc] ? deals : samples).push(f); });
    var byDate = function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.doc < b.doc ? -1 : 1); };
    return {
      newAccounts: vals(wins.newAccounts).map(function(x){ x.net = rnd(x.net); x.products = vals(x.products).map(function(p){ p.net = rnd(p.net); return p; }).sort(function(a, b){ return b.net - a.net; }); return x; }), reactivated: vals(wins.reactivated),
      placements: vals(wins.placements).map(function(x){ x.net = rnd(x.net); return x; }).sort(function(a, b){ return b.net - a.net; }),
      samples: samples.sort(byDate), deals: deals.sort(byDate),
      invoices: vals(wins.invoices).map(function(i){ i.net = rnd(i.net); i.gross = rnd(i.gross); i.brands = Object.keys(i.brands); i.items = vals(i.items).map(function(p){ p.net = rnd(p.net); return p; }).sort(function(a, b){ return b.net - a.net; }); return i; })
        .filter(function(i){ return !(i.internal && i.net === 0); })      // a zero-value move to a marketing account is not an invoice of the week
        .sort(function(a, b){ return b.net - a.net; })
    };
  }
  // ---- KPI SCORECARD (management's 10 measures, weights agreed Oct 2026) ----
  // Each item: score 0..1 (null = nothing to measure, its weight is then spread
  // over the others), the value shown, the target, and the detail behind it.
  var KPI_DEFAULTS = { visitsPerDay: 5, doctorsPerMonth: 60, discountA: 40, discountOther: 35, discountOpenDay: 40, openDays: [],
    rxGrowth: 0.15, newProducts: 5, newAccounts: 2, returnsMax: 0.02, responseHours: 24, workdaysPerMonth: 22 };
  var KPI_ITEMS = [
    ['sales', 'Sales achievement', 30], ['visits', 'Visits per day', 10], ['discipline', 'Daily plan & visit reports', 10],
    ['doctors', 'Doctors seen & decision makers', 10], ['discount', 'Discount within limits', 10], ['issues', 'Fewer problems (escalations, returns)', 10],
    ['rx', 'Prescription growth (My Fatoorah)', 5], ['gov', 'Government coverage every week', 5], ['newbiz', 'New products & new accounts', 5],
    ['response', 'Answering clients on time', 5]];
  // Government accounts: named MOH / ministry / Kuwait University / KOC / a
  // polyclinic, or marked by hand (c.gov); private hospitals are not.
  var GOV_RE = /(\bmoh\b|\bministry\b|kuwait university|\bkoc\b|polyclinic|مستوصف|وزارة)/i;
  function isGovClinic(c){ return !!c && (c.gov === true || (c.gov !== false && GOV_RE.test(c.name || ''))); }
  function kpiScorecard(data, opts){
    opts = opts || {};
    var rep = opts.rep, S = {}; Object.keys(KPI_DEFAULTS).forEach(function(k){ S[k] = KPI_DEFAULTS[k]; });
    Object.keys(opts.settings || {}).forEach(function(k){ if(opts.settings[k] != null && opts.settings[k] !== '') S[k] = opts.settings[k]; });
    var to = opts.to || data.today; if(to > data.today) to = data.today;
    var from = opts.from || to.slice(0, 7) + '-01';
    var clinics = data.clinics || [], byId = {}; clinics.forEach(function(c){ byId[c.id] = c; });
    var rows = opts.rows || erpAttributedRows(data);
    var mine = rows.filter(function(x){ return x.rep === rep && x.r.date >= from && x.r.date <= to; });
    var days = [], d; for(d = from; d <= to; d = addDaysStr(d, 1)) if(isWorkday(d)) days.push(d);
    var wd = Math.max(1, days.length), share = Math.min(1, wd / S.workdaysPerMonth);
    var clamp = function(x){ return Math.max(0, Math.min(1, x)); };
    var visits = (data.visits || []).filter(function(v){ return v && v.date >= from && v.date <= to; });
    var field = visits.filter(function(v){ return isFieldVisit(v) && repWasThere(v, rep); });
    var led = field.filter(function(v){ return v.rep === rep; });
    var events = data.events || [];
    var items = {};
    // 1 sales: projected month-end achievement (70%) and brands on track (30%)
    var d2 = {}; for(var k in data) d2[k] = data[k]; d2.today = to;
    var t = targetOf(data, rep, to.slice(0, 7)), ach = monthAchievement(rep, d2);
    var dim = getMonthDates(to).length, day = parseInt(to.slice(8, 10), 10);
    if(t.revenue > 0){
      var pace = ach.amount / day * dim / t.revenue;
      var bt = t.brands || {}, bOk = 0, bN = 0, bm = {};
      rows.forEach(function(x){ if(x.rep === rep && x.r.date >= to.slice(0, 7) + '-01' && x.r.date <= to){ var b = normBrand(x.r.brand); bm[b] = (bm[b] || 0) + x.r.net; } });
      Object.keys(bt).forEach(function(b){ if(!(bt[b] > 0)) return; bN++; if(((bm[normBrand(b)] || 0) / day * dim) / bt[b] >= 0.8) bOk++; });
      items.sales = { score: clamp(0.7 * Math.min(1, pace) + 0.3 * (bN ? bOk / bN : Math.min(1, pace))), value: Math.round(ach.amount / t.revenue * 100) + '% achieved · on pace for ' + Math.round(pace * 100) + '%',
        target: '100% of ' + Math.round(t.revenue).toLocaleString('en-US') + ' KD; every brand ≥ 80%', detail: bN ? bOk + ' of ' + bN + ' brands on pace for 80%+' : 'no brand targets' };
    } else items.sales = { score: null, value: '—', target: 'DSR target needed', detail: 'no target for this month' };
    // 2 visits per working day
    var vpd = field.length / wd;
    items.visits = { score: clamp(vpd / S.visitsPerDay), value: vpd.toFixed(1) + ' a day (' + field.length + ' in ' + wd + ' working days)', target: S.visitsPerDay + ' field visits a day', detail: '' };
    // 3 daily discipline: the day's plan saved before the first visit; every visit report complete
    var plans = data.dayPlans || {}, pOk = 0, pN = 0;
    days.forEach(function(dt){
      var ent = (plans[dt] || {})[rep] || [], vToday = led.filter(function(v){ return v.date === dt; });
      if(!ent.length && !vToday.length) return;          // no plan and no visit: a day off, not a miss
      pN++;
      if(!ent.length) return;
      var firstV = vToday.reduce(function(m, v){ return v.ts && (!m || v.ts < m) ? v.ts : m; }, null);
      var firstP = ent.reduce(function(m, e){ return e && typeof e === 'object' && typeof e.at === 'number' && (!m || e.at < m) ? e.at : m; }, null); // older entries are plain ids (no time)
      if(!firstV || !firstP || firstP <= firstV) pOk++;   // no timestamp (older entries): a plan existed
    });
    var complete = function(v){ return ((v.doctorIds && v.doctorIds.length) || v.doctorId) && ((v.products && v.products.length) || v.orderTaken || v.noOrderReason || (v.notes && v.notes.trim())); };
    var rOk = led.filter(complete).length;
    var planPct = pN ? pOk / pN : null, repPct = led.length ? rOk / led.length : null;
    items.discipline = { score: planPct == null && repPct == null ? null : clamp(((planPct == null ? repPct : planPct) + (repPct == null ? planPct : repPct)) / 2),
      value: (planPct == null ? '—' : Math.round(planPct * 100) + '% days planned before the first visit') + ' · ' + (repPct == null ? '—' : Math.round(repPct * 100) + '% complete visit reports'),
      target: '100% / 100%', detail: (led.length - rOk) + ' report(s) missing doctors met or outcome' };
    // 4 doctors seen (unique) and decision makers known in key accounts
    var docs = {}; field.forEach(function(v){ (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).forEach(function(id){ docs[v.clinicId + '|' + id] = 1; }); });
    var met = Object.keys(docs).length, metT = Math.max(1, Math.round(S.doctorsPerMonth * share));
    var keyAcc = clinics.filter(function(c){ return c.rep === rep && c.cls === 'A'; });
    var withDm = keyAcc.filter(function(c){ return (c.doctors || []).some(function(x){ return x.influence === 'decider'; }); });
    items.doctors = { score: clamp(0.6 * Math.min(1, met / metT) + 0.4 * (keyAcc.length ? withDm.length / keyAcc.length : 1)),
      value: met + ' doctors met · decision maker known in ' + withDm.length + ' of ' + keyAcc.length + ' A accounts', target: metT + ' doctors in the period; 100% decision makers',
      detail: keyAcc.filter(function(c){ return withDm.indexOf(c) < 0; }).map(function(c){ return c.name; }).slice(0, 6).join(', ') };
    // 5 discount: every invoice within its limit (A account / open day / others)
    var inv = {};
    mine.forEach(function(x){ var r = x.r; if(r.type === 'return' || !(r.gross > 0) || x.channel) return;
      var i = inv[r.doc] || (inv[r.doc] = { doc: r.doc, date: r.date, clinicId: x.clinicId, account: x.clinicId && byId[x.clinicId] ? byId[x.clinicId].name : r.customer, gross: 0, net: 0 });
      i.gross += r.gross; i.net += r.net; });
    var invs = Object.keys(inv).map(function(k){ var i = inv[k]; i.pct = i.gross > 0 ? (i.gross - i.net) / i.gross * 100 : 0;
      var c = i.clinicId && byId[i.clinicId]; i.limit = (S.openDays || []).indexOf(i.date) >= 0 ? S.discountOpenDay : (c && c.cls === 'A' ? S.discountA : S.discountOther); return i; });
    var over = invs.filter(function(i){ return i.pct > i.limit + 0.05; });
    var gT = invs.reduce(function(a, i){ return a + i.gross; }, 0), nT = invs.reduce(function(a, i){ return a + i.net; }, 0);
    items.discount = { score: invs.length ? clamp(1 - over.length / invs.length) : null,
      value: invs.length ? 'average ' + (gT > 0 ? ((gT - nT) / gT * 100).toFixed(1) : '0') + '% · ' + over.length + ' of ' + invs.length + ' invoices over the limit' : 'no invoices',
      target: 'A ≤ ' + S.discountA + '% · others ≤ ' + S.discountOther + '% · open days ≤ ' + S.discountOpenDay + '%',
      detail: over.slice(0, 5).map(function(i){ return i.doc + ' ' + i.account + ' ' + i.pct.toFixed(0) + '% (limit ' + i.limit + '%)'; }).join('; '), over: over };
    // 6 problems: escalations (a client went to someone else in the company) and returns
    var esc = events.filter(function(e){ return e && e.kind === 'issue' && e.type === 'escalation' && e.rep === rep && String(e.at || '').slice(0, 10) >= from && String(e.at || '').slice(0, 10) <= to; });
    var sold = mine.reduce(function(a, x){ return a + (x.r.type !== 'return' && x.r.net > 0 ? x.r.net : 0); }, 0);
    var ret = mine.reduce(function(a, x){ return a + (x.r.type === 'return' ? Math.abs(x.r.net) : 0); }, 0);
    var retPct = sold > 0 ? ret / sold : 0;
    items.issues = { score: clamp(0.5 * Math.max(0, 1 - 0.25 * esc.length) + 0.5 * (retPct <= S.returnsMax ? 1 : Math.max(0, 1 - (retPct - S.returnsMax) / S.returnsMax))),
      value: esc.length + ' escalation' + (esc.length === 1 ? '' : 's') + ' · returns ' + (retPct * 100).toFixed(1) + '% of sales', target: '0 escalations · returns ≤ ' + (S.returnsMax * 100) + '%',
      detail: esc.slice(0, 4).map(function(e){ return (byId[e.clinicId] || {}).name + ': ' + (e.text || ''); }).join('; ') };
    // 7 prescriptions: My Fatoorah sales of this person vs the same days last month
    var rxNow = 0, rxPrev = 0, pf = addMonthsStr(from, -1), pt = addMonthsStr(to, -1);
    rows.forEach(function(x){ if(x.rep !== rep || !/my fatoorah/i.test(x.r.customer || '')) return;
      if(x.r.date >= from && x.r.date <= to) rxNow += x.r.net; else if(x.r.date >= pf && x.r.date <= pt) rxPrev += x.r.net; });
    var g = rxPrev > 0 ? (rxNow - rxPrev) / rxPrev : null;
    items.rx = { score: g == null ? (rxNow > 0 ? 1 : null) : clamp(0.5 + g / (2 * S.rxGrowth)),
      value: 'KD ' + Math.round(rxNow) + (g == null ? '' : ' · ' + (g >= 0 ? '+' : '') + Math.round(g * 100) + '% on the same days last month'), target: '+' + Math.round(S.rxGrowth * 100) + '% a month', detail: '' };
    // 8 government accounts: every one visited every week
    var gov = clinics.filter(function(c){ return c.cls !== 'Closed' && isGovClinic(c) && (c.rep === rep || (c.sharedWith || []).indexOf(rep) >= 0); });
    var weeks = [], w0 = getWeekDates(from)[0];
    for(var ws = w0; ws <= to; ws = addDaysStr(ws, 7)){ var a = ws < from ? from : ws, b = addDaysStr(ws, 6) > to ? to : addDaysStr(ws, 6);
      var seen = gov.filter(function(c){ return field.some(function(v){ return v.clinicId === c.id && v.date >= a && v.date <= b; }); });
      weeks.push({ from: a, to: b, seen: seen.length, missing: gov.filter(function(c){ return seen.indexOf(c) < 0; }).map(function(c){ return c.name; }) }); }
    var cov = gov.length && weeks.length ? weeks.reduce(function(s2, w){ return s2 + w.seen / gov.length; }, 0) / weeks.length : null;
    var lastW = weeks[weeks.length - 1];
    items.gov = { score: cov, value: gov.length ? Math.round(cov * 100) + '% of ' + gov.length + ' government accounts visited per week' : 'no government accounts assigned',
      target: '100% every week', detail: lastW && lastW.missing.length ? 'this week still to visit: ' + lastW.missing.slice(0, 6).join(', ') : '' };
    // 9 new business: products bought by an account for the first time, and new accounts
    var w = erpWinsInRange(rows, from, to, clinics);
    var pl = w.placements.filter(function(x){ return x.rep === rep; }), na = w.newAccounts.filter(function(x){ return x.rep === rep; });
    var plT = Math.max(1, Math.round(S.newProducts * share)), naT = Math.max(1, Math.round(S.newAccounts * share));
    items.newbiz = { score: clamp(0.5 * Math.min(1, pl.length / plT) + 0.5 * Math.min(1, na.length / naT)),
      value: pl.length + ' new product placement' + (pl.length === 1 ? '' : 's') + ' · ' + na.length + ' new account' + (na.length === 1 ? '' : 's'), target: plT + ' placements · ' + naT + ' new accounts',
      detail: pl.slice(0, 3).map(function(x){ return x.product + ' @ ' + x.account; }).concat(na.slice(0, 2).map(function(x){ return 'new: ' + x.account; })).join('; ') };
    // 10 answering clients on time: requests closed within the agreed hours
    var reqs = events.filter(function(e){ return e && e.kind === 'issue' && e.type === 'request' && e.rep === rep && String(e.at || '').slice(0, 10) >= from && String(e.at || '').slice(0, 10) <= to; });
    var lim = S.responseHours * 3600000, nowMs = opts.nowMs || Date.now(), onTime = 0, late = 0, open = 0;
    reqs.forEach(function(e){ var t0 = Date.parse(e.at), t1 = e.resolvedAt ? Date.parse(e.resolvedAt) : null;
      if(t1 != null) (t1 - t0 <= lim ? onTime++ : late++); else if(nowMs - t0 > lim) late++; else open++; });
    items.response = { score: onTime + late ? onTime / (onTime + late) : null, value: reqs.length ? onTime + ' of ' + (onTime + late) + ' answered within ' + S.responseHours + 'h' + (open ? ' · ' + open + ' open' : '') : 'no client requests logged',
      target: '100% within ' + S.responseHours + 'h', detail: '' };
    // stands: tracked, no target
    var stands = events.filter(function(e){ return e && e.kind === 'stand' && e.rep === rep && !e.removed; });
    var checked = stands.filter(function(e){ return (e.checks || []).some(function(c2){ return c2 >= from && c2 <= to; }) || (String(e.at || '').slice(0, 10) >= from && String(e.at || '').slice(0, 10) <= to); });
    var list = KPI_ITEMS.map(function(it){ var x = items[it[0]]; return { key: it[0], label: it[1], weight: it[2], score: x.score, value: x.value, target: x.target, detail: x.detail || '', over: x.over }; });
    var wSum = list.reduce(function(a2, x){ return a2 + (x.score == null ? 0 : x.weight); }, 0);
    var total = wSum ? Math.round(list.reduce(function(a2, x){ return a2 + (x.score == null ? 0 : x.score * x.weight); }, 0) / wSum * 100) : null;
    return { rep: rep, from: from, to: to, workdays: wd, total: total, items: list, stands: { active: stands.length, checked: checked.length } };
  }
  function addMonthsStr(d, n){ var x = new Date(d + 'T00:00:00'), day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return localDateStr(x); }
  // ---- WEEKLY MANAGEMENT UPDATE (the Thursday deck) ----
  // Everything the deck shows, from the same data and the same rules as the
  // rest of the app: ERP lines credited by erpRowRep, month figures from
  // monthAchievement as of the week's last day, visits as logged. Pure.
  // opts: { end: 'YYYY-MM-DD' (last day of the week shown), reps: [...] }
  // The clinic invoices of some people in [a, b] — channel accounts, returns
  // and internal moves left out; free goods inside a deal count as discount —
  // each with its discount and the limit that applies to it (the supervisor's
  // KPI settings: A clinics, others, open days). Pure.
  function clinicInvoices(rows, reps, a, b, byId, KS){
    var inv = {};
    rows.forEach(function(x){ var r = x.r; if(!x.rep || reps.indexOf(x.rep) < 0 || x.channel || r.type === 'return' || r.date < a || r.date > b || (!x.clinicId && isInternalAccount(r.customer))) return;
      var i = inv[r.doc] || (inv[r.doc] = { doc: r.doc, date: r.date, rep: x.rep, clinicId: x.clinicId, account: x.clinicId && byId[x.clinicId] ? byId[x.clinicId].name : String(r.customer || '').trim(), gross: 0, net: 0 });
      i.gross += Number(r.gross) || 0; i.net += Number(r.net) || 0; });
    var list = Object.keys(inv).map(function(k){ return inv[k]; }).filter(function(i){ return i.gross > 0 && i.net > 0; });
    list.forEach(function(i){ i.gross = Math.round(i.gross * 1000) / 1000; i.net = Math.round(i.net * 1000) / 1000;
      i.pct = Math.round((i.gross - i.net) / i.gross * 1000) / 10; var c = i.clinicId && byId[i.clinicId];
      i.limit = (KS.openDays || []).indexOf(i.date) >= 0 ? KS.discountOpenDay : (c && c.cls === 'A' ? KS.discountA : KS.discountOther);
      i.within = i.pct <= i.limit + 0.05; });
    return list.sort(function(x, y){ return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.doc < y.doc ? -1 : 1); });
  }
  // The gross-weighted discount of a list of clinic invoices and the share
  // within their limits; `over` names the ones above. Pure.
  function discountSummary(list){
    var g = list.reduce(function(t, i){ return t + i.gross; }, 0), n = list.reduce(function(t, i){ return t + i.net; }, 0);
    var within = list.filter(function(i){ return i.within; });
    return { invoices: list.length, within: within.length, gross: Math.round(g * 1000) / 1000, net: Math.round(n * 1000) / 1000, discount: g > 0 ? Math.round((g - n) / g * 1000) / 10 : null,
      withinLimit: list.length ? within.length / list.length : null, over: list.filter(function(i){ return !i.within; }).map(function(i){ return { doc: i.doc, date: i.date, rep: i.rep, account: i.account, pct: i.pct, limit: i.limit, gross: i.gross, net: i.net }; }) };
  }
  function weeklyReport(data, opts){
    var reps = (opts && opts.reps) || [];
    var KS = {}; Object.keys(KPI_DEFAULTS).forEach(function(k){ KS[k] = KPI_DEFAULTS[k]; });
    Object.keys((opts && opts.settings) || {}).forEach(function(k){ if(opts.settings[k] != null && opts.settings[k] !== '') KS[k] = opts.settings[k]; });
    var end = (opts && opts.end) || data.today;
    if(end > data.today) end = data.today;
    var from = getWeekDates(end)[0], to = end;                       // Sunday → the chosen day
    var pFrom = addDaysStr(from, -7), pTo = addDaysStr(to, -7);      // the same days a week earlier
    var mStart = to.slice(0, 7) + '-01';
    var d2 = {}; for(var k in data) d2[k] = data[k]; d2.today = to;   // month figures as of the week's end
    var es = data.erpSales, clinics = data.clinics || [];
    var byId = {}; clinics.forEach(function(c){ byId[c.id] = c; });
    var rows = erpAttributedRows(data);
    // Margin: the team's clinic invoices in a range (free goods inside a deal
    // count as discount; an all-free document is a sample, not a sale), the
    // gross-weighted discount and the share of invoices within their limit.
    var discountIn = function(a, b){ return discountSummary(clinicInvoices(rows, reps, a, b, byId, KS)); };
    var covered = function(a, b){ return erpPeriodsOf(es).some(function(p){ return p.to >= a && p.from <= b; }); };
    // a range counts for a person only when a file carrying that person's
    // salesman covers it (a file exported for one salesman says nothing of the others)
    var carries = function(p, rep){ return !p.repMap || !Object.keys(p.repMap).length || Object.keys(p.repMap).some(function(sm){ return p.repMap[sm] === rep; }); };
    var repCovered = function(a, b, rep){ return erpPeriodsOf(es).some(function(p){ return p.to >= a && p.from <= b && carries(p, rep); }); };
    // every day of [a, b] inside the files carrying this person's salesman (a
    // file starting on 1 Oct does not cover the week of 27 Sep – 3 Oct)
    var repCoveredFull = function(a, b, rep){
      var ps = erpPeriodsOf(es).filter(function(p){ return carries(p, rep) && p.to >= a && p.from <= b; })
        .sort(function(x, y){ return x.from < y.from ? -1 : x.from > y.from ? 1 : 0; });
      var cur = a;
      for(var i = 0; i < ps.length; i++){ if(ps[i].from > cur) return false; if(ps[i].to >= cur) cur = addDaysStr(ps[i].to, 1); if(cur > b) return true; }
      return cur > b;
    };
    // the last day of the week the sales files reach (null: no file for the week)
    var salesTo = erpPeriodsOf(es).reduce(function(m, p){ if(!(p.to >= from && p.from <= to)) return m; var t = p.to > to ? to : p.to; return !m || t > m ? t : m; }, null);
    var sum = function(a, b, rep){ return Math.round(rows.reduce(function(s, x){ return s + (x.rep && (!rep || x.rep === rep) && x.r.date >= a && x.r.date <= b ? x.r.net : 0); }, 0) * 1000) / 1000; };
    var earliest = rows.reduce(function(m, x){ return !m || x.r.date < m ? x.r.date : m; }, null);
    // "new account", "back after 60+ days" and "new product placed" can only be
    // claimed for a person whose own files cover the 4 weeks before the period
    var winsOk = function(rep, start){ return repCoveredFull(addDaysStr(start, -28), addDaysStr(start, -1), rep); };
    var keepWins = function(w, start){ var ok = {}; var f = function(x){ if(!(x.rep in ok)) ok[x.rep] = winsOk(x.rep, start); return ok[x.rep]; };
      w.newAccounts = w.newAccounts.filter(f); w.reactivated = w.reactivated.filter(f); w.placements = w.placements.filter(f); return w; };
    var winsR = keepWins(erpWinsInRange(rows, from, to, clinics), from), invoices = winsR.invoices;
    var winsBlocked = reps.filter(function(r){ return !winsOk(r, from); });
    var rnd = function(n){ return Math.round(n * 1000) / 1000; };
    // visits of the week (and the month, for account coverage)
    var vis = (data.visits || []).filter(function(v){ return v && v.date >= from && v.date <= to; });
    var visM = (data.visits || []).filter(function(v){ return v && v.date >= mStart && v.date <= to && isFieldVisit(v); });
    var perRep = {};
    reps.forEach(function(rep){
      var mine = vis.filter(function(v){ return repWasThere(v, rep); }), led = mine.filter(function(v){ return v.rep === rep; });
      var field = mine.filter(isFieldVisit);
      var docs = {}, prods = {}, clin = {}, cdays = {};
      field.forEach(function(v){ clin[v.clinicId] = 1; cdays[v.clinicId + '|' + v.date] = 1; (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).forEach(function(id){ docs[v.clinicId + '|' + id] = 1; }); (v.products || []).forEach(function(p){ prods[p] = 1; }); });
      var aAll = clinics.filter(function(c){ return c.rep === rep && c.cls === 'A'; });
      var aSeen = aAll.filter(function(c){ return visM.some(function(v){ return v.clinicId === c.id && repWasThere(v, rep); }); });
      var t = targetOf(data, rep, to.slice(0, 7));
      var ach = monthAchievement(rep, d2);
      var dim = getMonthDates(to).length, day = parseInt(to.slice(8, 10), 10);
      perRep[rep] = {
        week: sum(from, to, rep), prevWeek: sum(pFrom, pTo, rep),
        mtd: ach.amount, mtdSrc: ach.src, target: t.revenue > 0 ? t.revenue : null,
        pct: t.revenue > 0 ? ach.amount / t.revenue : null,
        pace: t.revenue > 0 && day > 0 ? ach.amount / day * dim / t.revenue : null,
        fieldVisits: Object.keys(cdays).length, logged: led.filter(isFieldVisit).length, calls: mine.filter(function(v){ return v.callOnly; }).length,
        phoneOrders: mine.filter(function(v){ return v.orderOnly; }).length,
        joint: field.filter(function(v){ return v.withRep; }).length,
        clinics: Object.keys(clin).length, doctorsMet: Object.keys(docs).length, productsPresented: Object.keys(prods).length,
        followUps: led.filter(function(v){ return v.nextFollowUp; }).length,
        orders: led.filter(function(v){ return v.orderTaken; }).length,
        orderValue: rnd(led.reduce(function(s, v){ return s + (v.orderTaken ? (v.orderTotal || 0) : 0); }, 0)),
        photos: led.reduce(function(s, v){ return s + ((v.photos || []).length); }, 0),
        aVisited: aSeen.length, aTotal: aAll.length,
        aMissing: aAll.filter(function(c){ return aSeen.indexOf(c) < 0; }).map(function(c){ return c.name; }),
        aMissingIds: aAll.filter(function(c){ return aSeen.indexOf(c) < 0; }).map(function(c){ return c.id; }),
        invoices: invoices.filter(function(i){ return i.rep === rep; }).length,
        invoicesValue: invoices.filter(function(i){ return i.rep === rep && !i.internal && i.net > 0.0005; }).length,
        weekCovered: repCovered(from, to, rep),
        discountMtd: discountSummary(clinicInvoices(rows, [rep], mStart, to, byId, KS)),
        govSites: Object.keys(clin).filter(function(id){ return isGovClinic(byId[id]); }).map(function(id){ return byId[id].name; })
      };
    });
    // brands: this week (team) and month-to-date vs the DSR brand targets
    var bw = {}, bm = {}, bt = {};
    rows.forEach(function(x){ if(!x.rep || reps.indexOf(x.rep) < 0) return; var b = normBrand(x.r.brand);
      if(x.r.date >= from && x.r.date <= to) bw[b] = (bw[b] || 0) + x.r.net;
      if(x.r.date >= mStart && x.r.date <= to) bm[b] = (bm[b] || 0) + x.r.net; });
    reps.forEach(function(rep){ var br = targetOf(data, rep, to.slice(0, 7)).brands || {}; Object.keys(br).forEach(function(b){ var n = normBrand(b); bt[n] = (bt[n] || 0) + br[b]; }); });
    var pmStart = addMonthsStr(mStart, -1), pmEnd = addDaysStr(mStart, -1), pmCov = covered(pmStart, pmEnd), bp = {};
    rows.forEach(function(x){ if(!x.rep || reps.indexOf(x.rep) < 0 || x.r.date < pmStart || x.r.date > pmEnd) return; var b = normBrand(x.r.brand); bp[b] = (bp[b] || 0) + x.r.net; });
    var brands = Object.keys(bw).concat(Object.keys(bt)).filter(function(b, i, a){ return a.indexOf(b) === i; })
      .map(function(b){ return { brand: b, week: rnd(bw[b] || 0), mtd: rnd(bm[b] || 0), target: bt[b] ? rnd(bt[b]) : null, prevMonth: pmCov ? rnd(bp[b] || 0) : null }; })
      .sort(function(a, b){ return b.week - a.week || b.mtd - a.mtd; });
    // week by week this month (Sunday-start weeks, clipped to the month)
    var weeks = [], w0 = getWeekDates(mStart)[0];
    for(var ws = w0; ws <= to; ws = addDaysStr(ws, 7)){
      var a = ws < mStart ? mStart : ws, b = addDaysStr(ws, 6) > to ? to : addDaysStr(ws, 6);
      var row = { from: a, to: b, byRep: {} }; reps.forEach(function(rep){ row.byRep[rep] = sum(a, b, rep); }); weeks.push(row);
    }
    // next week: plans and follow-ups; a key account still due carries what it
    // bought in the two months before this one (any person, our files)
    var p2From = addMonthsStr(mStart, -2), p2To = addDaysStr(mStart, -1), kd2 = {};
    rows.forEach(function(x){ if(x.clinicId && !x.channel && x.r.date >= p2From && x.r.date <= p2To) kd2[x.clinicId] = (kd2[x.clinicId] || 0) + x.r.net; });
    var nFrom = addDaysStr(getWeekDates(to)[0], 7), nTo = addDaysStr(nFrom, 6), next = {};
    reps.forEach(function(rep){
      var planned = [];
      Object.keys(data.dayPlans || {}).forEach(function(dt){ if(dt < nFrom || dt > nTo) return; ((data.dayPlans[dt] || {})[rep] || []).forEach(function(e){ var id = typeof e === 'string' ? e : e.id; if(byId[id]) planned.push({ date: dt, clinic: byId[id].name }); }); });
      var fu = clinics.filter(function(c){ return c.rep === rep && c.cls !== 'Closed' && c.nextFollowUp && c.nextFollowUp >= nFrom && c.nextFollowUp <= nTo; }).map(function(c){ return { date: c.nextFollowUp, clinic: c.name }; });
      var plannedIds = {}; Object.keys(data.dayPlans || {}).forEach(function(dt){ if(dt < nFrom || dt > nTo) return; ((data.dayPlans[dt] || {})[rep] || []).forEach(function(e){ plannedIds[typeof e === 'string' ? e : e.id] = 1; }); });
      var aInfo = perRep[rep].aMissingIds.map(function(id){ return { clinicId: id, name: byId[id].name, kd: rnd(kd2[id] || 0), planned: !!plannedIds[id] }; })
        .sort(function(x, y){ return y.kd - x.kd || (x.name < y.name ? -1 : 1); });
      next[rep] = { planned: planned.sort(function(x, y){ return x.date < y.date ? -1 : 1; }), followUps: fu.sort(function(x, y){ return x.date < y.date ? -1 : 1; }), aMissing: perRep[rep].aMissing, aMissingInfo: aInfo };
    });
    // the last 8 weeks (this one to the chosen day, the others Sunday–Saturday):
    // the same measures week by week, so this week can be read against them
    var history = [];
    for(var hi = 7; hi >= 0; hi--){
      var hs = addDaysStr(from, -7 * hi), he = hi === 0 ? to : addDaysStr(hs, 6), hcov = covered(hs, he);
      var hw = erpWinsInRange(rows, hs, he, clinics), mineW = function(x){ return reps.indexOf(x.rep) >= 0; };
      var hv = (data.visits || []).filter(function(v){ return v && v.date >= hs && v.date <= he && isFieldVisit(v); });
      var hByRep = {}, hFv = {}, hDocs = {};   // a visit = one clinic on one day, however many people logged it
      var hRepCov = {};
      reps.forEach(function(rep){ hRepCov[rep] = hi === 0 ? repCovered(hs, he, rep) : repCoveredFull(hs, he, rep);   // this week may be partial: it can only understate
        hByRep[rep] = hcov && hRepCov[rep] ? sum(hs, he, rep) : null;
        hv.forEach(function(v){ if(!repWasThere(v, rep)) return; hFv[v.clinicId + '|' + v.date] = 1; (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).forEach(function(id){ hDocs[v.clinicId + '|' + id] = 1; }); }); });
      var hInv = hw.invoices.filter(function(i){ return mineW(i) && i.net > 0; }), hAcc = {};
      hInv.forEach(function(i){ if(!i.channel) hAcc[i.account] = 1; });
      var newOk = hcov && reps.some(function(r){ return winsOk(r, hs); }); keepWins(hw, hs);
      history.push({ from: hs, to: he, current: hi === 0, covered: hcov,
        sales: hcov ? rnd(reps.reduce(function(a, rep){ return a + (hByRep[rep] || 0); }, 0)) : null, byRep: hByRep,
        invoices: hcov ? hInv.length : null, accounts: hcov ? Object.keys(hAcc).length : null,
        placements: newOk ? hw.placements.filter(mineW).length : null, newAccounts: newOk ? hw.newAccounts.filter(mineW).length : null,
        reactivated: newOk ? hw.reactivated.filter(mineW).length : null, samples: hcov ? hw.samples.filter(mineW).length : null,
        fieldVisits: Object.keys(hFv).length, doctorsMet: Object.keys(hDocs).length, discount: hcov ? discountIn(hs, he).discount : null, repCovered: hRepCov });
    }
    // the week's best-selling products (team, invoices with a value; internal
    // marketing moves excluded) and the photos taken on the week's visits
    var pAgg = {};
    rows.forEach(function(x){ var r = x.r; if(!x.rep || reps.indexOf(x.rep) < 0 || r.date < from || r.date > to || !(r.net > 0) || r.type === 'return' || (!x.clinicId && isInternalAccount(r.customer))) return;
      var k = String(r.product || '').trim(); if(!k || NON_PRODUCT_RE.test(r.brand || '') || NON_PRODUCT_RE.test(k)) return;   // services (inspection fees, delivery) are not best sellers
      var a = pAgg[k] || (pAgg[k] = { product: k, brand: normBrand(r.brand), qty: 0, net: 0, accounts: {} });
      a.qty += Number(r.qty) || 0; a.net += r.net; a.accounts[x.clinicId || r.customer] = 1; });
    var products = Object.keys(pAgg).map(function(k){ var a = pAgg[k]; return { product: a.product, brand: a.brand, qty: a.qty, net: rnd(a.net), accounts: Object.keys(a.accounts).length, accountKeys: Object.keys(a.accounts) }; })
      .sort(function(a, b){ return b.net - a.net; });
    var photos = [];
    vis.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function(v){
      (v.photos || []).forEach(function(ph){ if(ph && ph.id) photos.push({ id: ph.id, thumb: ph.thumb || null, date: v.date, rep: v.rep, clinic: (byId[v.clinicId] || {}).name || '—' }); }); });
    // margin this week, against the earlier weeks
    var margin = discountIn(from, to);
    var prevD = history.filter(function(h){ return !h.current && h.discount != null; });
    margin.avgPrev = prevD.length ? Math.round(prevD.reduce(function(t, h){ return t + h.discount; }, 0) / prevD.length * 10) / 10 : null;
    margin.limits = { A: KS.discountA, other: KS.discountOther, openDay: KS.discountOpenDay };
    // expansion: the territory, the clinics buying (last 90 days), new this
    // month, and clinics visited this week that are not buying yet (pipeline)
    var since90 = addDaysStr(to, -89), buying = {};
    rows.forEach(function(x){ if(x.clinicId && !x.channel && x.r.net > 0 && x.r.type !== 'return' && x.r.date >= since90 && x.r.date <= to) buying[x.clinicId] = 1; });
    var territory = clinics.filter(function(c){ return c.cls !== 'Closed' && (reps.indexOf(c.rep) >= 0 || (c.sharedWith || []).some(function(r){ return reps.indexOf(r) >= 0; })); });
    var mWins = keepWins(erpWinsInRange(rows, mStart, to, clinics), mStart), monthNewOk = reps.some(function(r){ return winsOk(r, mStart); });
    var pipe = {};
    vis.forEach(function(v){ if(!isFieldVisit(v) || !v.clinicId || buying[v.clinicId] || !byId[v.clinicId]) return;
      var p = pipe[v.clinicId] || (pipe[v.clinicId] = { clinic: byId[v.clinicId].name, rep: v.rep, visits: 0, last: v.date }); p.visits++; if(v.date > p.last) p.last = v.date; });
    var expansion = { territory: territory.length, active: territory.filter(function(c){ return buying[c.id]; }).length,
      newThisMonth: monthNewOk ? mWins.newAccounts.filter(function(x){ return reps.indexOf(x.rep) >= 0; }).map(function(x){ return { account: x.account, rep: x.rep, date: x.date, net: x.net }; }) : null,
      placementsThisMonth: monthNewOk ? mWins.placements.filter(function(x){ return reps.indexOf(x.rep) >= 0; }).length : null,
      pipeline: Object.keys(pipe).map(function(k){ return pipe[k]; }).sort(function(a, b){ return b.visits - a.visits || (a.clinic < b.clinic ? -1 : 1); }) };
    // satisfaction signals: accounts that ordered again, requests answered in
    // time, escalations, returns, and the doctors' mood on the visits
    var firstBuy = {};
    rows.forEach(function(x){ if(!x.clinicId || x.channel || !(x.r.net > 0) || x.r.type === 'return') return; if(!firstBuy[x.clinicId] || x.r.date < firstBuy[x.clinicId]) firstBuy[x.clinicId] = x.r.date; });
    var repeatAcc = {};
    rows.forEach(function(x){ if(x.clinicId && !x.channel && x.r.net > 0 && x.r.type !== 'return' && x.r.date >= from && x.r.date <= to && reps.indexOf(x.rep) >= 0 && firstBuy[x.clinicId] < from) repeatAcc[x.clinicId] = byId[x.clinicId] ? byId[x.clinicId].name : x.clinicId; });
    var evW = (data.events || []).filter(function(e){ return e && e.kind === 'issue' && reps.indexOf(e.rep) >= 0 && String(e.at || '').slice(0, 10) >= from && String(e.at || '').slice(0, 10) <= to; });
    var reqs = evW.filter(function(e){ return e.type === 'request'; });
    var hrs = function(a, b){ return (new Date(String(b).replace(' ', 'T')).getTime() - new Date(String(a).replace(' ', 'T')).getTime()) / 3600000; };
    var retNet = 0, saleNet = 0;
    rows.forEach(function(x){ if(!x.rep || reps.indexOf(x.rep) < 0 || x.r.date < from || x.r.date > to) return; if(x.r.type === 'return' || x.r.net < 0) retNet += -x.r.net; else saleNet += x.r.net; });
    var moods = { pleased: 0, neutral: 0, concerned: 0 };
    vis.forEach(function(v){ if(v.mood && moods[v.mood] != null && reps.some(function(r){ return repWasThere(v, r); })) moods[v.mood]++; });
    var satisfaction = { repeatAccounts: Object.keys(repeatAcc).map(function(k){ return repeatAcc[k]; }).sort(),
      requests: reqs.length, answeredOnTime: reqs.filter(function(e){ return e.resolvedAt && hrs(e.at, e.resolvedAt) <= KS.responseHours; }).length, open: reqs.filter(function(e){ return !e.resolvedAt; }).length,
      escalations: evW.filter(function(e){ return e.type === 'escalation'; }).length,
      returnsPct: saleNet > 0 ? Math.round(retNet / saleNet * 1000) / 10 : null, moods: moods };
    var team = { week: sum(from, to), prevWeek: sum(pFrom, pTo), mtd: 0, target: 0 };
    // team field counts are DISTINCT: a clinic on a day, a doctor, a clinic, a product — once each
    var tDays = {}, tClin = {}, tDocs = {}, tProds = {}, tFu = {};
    vis.forEach(function(v){ if(!isFieldVisit(v) || !reps.some(function(r){ return repWasThere(v, r); })) return;
      tDays[v.clinicId + '|' + v.date] = 1; tClin[v.clinicId] = 1; (v.products || []).forEach(function(pid){ tProds[pid] = 1; });
      (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).forEach(function(id){ tDocs[v.clinicId + '|' + id] = 1; });
      if(v.nextFollowUp && reps.indexOf(v.rep) >= 0) tFu[v.clinicId] = 1; });
    team.fieldVisits = Object.keys(tDays).length; team.clinics = Object.keys(tClin).length; team.doctorsMet = Object.keys(tDocs).length;
    team.productsPresented = Object.keys(tProds).length; team.followUpClinics = Object.keys(tFu).length;
    reps.forEach(function(rep){ team.mtd += perRep[rep].mtd; if(perRep[rep].target) team.target += perRep[rep].target; });
    team.week = rnd(reps.reduce(function(s, rep){ return s + perRep[rep].week; }, 0));
    team.prevWeek = rnd(reps.reduce(function(s, rep){ return s + perRep[rep].prevWeek; }, 0));
    team.mtd = rnd(team.mtd); team.target = rnd(team.target);
    var govT = {}; vis.forEach(function(v){ if(isFieldVisit(v) && reps.some(function(r){ return repWasThere(v, r); }) && isGovClinic(byId[v.clinicId])) govT[byId[v.clinicId].name] = 1; });
    team.govSites = Object.keys(govT).sort();
    var mineX = function(x){ return reps.indexOf(x.rep) >= 0; };
    var custKeyOf = function(x){ return x.clinicId ? 'c:' + x.clinicId : 'n:' + String(x.r.customer || '').trim().toLowerCase(); };
    var nameOf = function(x){ return x.clinicId && byId[x.clinicId] ? byId[x.clinicId].name : String(x.r.customer || '').trim(); };
    // ---- the money page: where the week's KD came from (the parts add up to
    // team.week): accounts that bought before the week (their first-time
    // products inside), new accounts, channel accounts (My Fatoorah,
    // individual customers), internal moves, returns
    var newKeys = {}, plKeys = {};
    winsR.newAccounts.filter(mineX).forEach(function(x){ newKeys[x.key] = 1; });
    winsR.placements.filter(mineX).forEach(function(x){ plKeys[x.key + '|' + String(x.product || '').toLowerCase()] = 1; });
    var mx = { existing: 0, firstTime: 0, newAccounts: 0, channel: 0, other: 0, returns: 0 }, accNet = {};
    rows.forEach(function(x){ var r = x.r; if(!x.rep || !mineX(x) || r.date < from || r.date > to) return;
      var net = Number(r.net) || 0, k = custKeyOf(x);
      if(r.type === 'return' || net < 0){ mx.returns += net; return; }
      if(x.channel) mx.channel += net;
      else if(!x.clinicId && isInternalAccount(r.customer)) mx.other += net;
      else { if(newKeys[k]) mx.newAccounts += net; else { mx.existing += net; if(plKeys[k + '|' + String(r.product || '').toLowerCase()]) mx.firstTime += net; }
        accNet[nameOf(x)] = (accNet[nameOf(x)] || 0) + net; } });
    var invW = winsR.invoices.filter(function(i){ return mineX(i) && !i.internal; });
    var withValue = invW.filter(function(i){ return i.net > 0.0005; }), negDocs = invW.filter(function(i){ return i.net < -0.0005; }), zeroDocs = invW.filter(function(i){ return Math.abs(i.net) <= 0.0005; });
    var uniq = function(a){ return a.filter(function(v, i){ return a.indexOf(v) === i; }); };
    var topAcc = Object.keys(accNet).sort(function(a, b){ return accNet[b] - accNet[a]; })[0];
    var mix = { existing: rnd(mx.existing), firstTime: rnd(mx.firstTime), newAccounts: rnd(mx.newAccounts), channel: rnd(mx.channel), other: rnd(mx.other), returns: rnd(mx.returns), total: team.week,
      invoices: withValue.length, withValue: rnd(withValue.reduce(function(t, i){ return t + i.net; }, 0)), zeroDocs: zeroDocs.length, returnDocs: negDocs.length,
      returnsNet: rnd(negDocs.reduce(function(t, i){ return t + i.net; }, 0)),
      accounts: uniq(withValue.filter(function(i){ return !i.channel; }).map(function(i){ return i.account; })).length,
      channelAccounts: uniq(withValue.filter(function(i){ return i.channel; }).map(function(i){ return i.account; })).length,
      top: topAcc && team.week > 0 ? { account: topAcc, net: rnd(accNet[topAcc]), share: accNet[topAcc] / team.week } : null,
      topInvoice: withValue[0] && team.week > 0 ? { doc: withValue[0].doc, account: withValue[0].account, rep: withValue[0].rep, net: withValue[0].net, share: withValue[0].net / team.week } : null };
    // free goods: samples (all-free documents, at list price) and free lines
    // inside paid invoices (part of the deal: already in the discount)
    var sampW = winsR.samples.filter(mineX), dealW = winsR.deals.filter(mineX);
    var free = { samples: { docs: sampW.length, accounts: uniq(sampW.map(function(x){ return x.account; })), gross: rnd(sampW.reduce(function(t, x){ return t + x.gross; }, 0)), list: sampW },
      deals: { docs: dealW.length, lines: dealW.reduce(function(t, x){ return t + x.lines.length; }, 0), gross: rnd(dealW.reduce(function(t, x){ return t + x.gross; }, 0)), list: dealW } };
    // samples in the 8 weeks before this one: did the clinic buy that brand
    // within 30 days? (a follow-through, not proof that the sample caused it)
    var sFrom = addDaysStr(from, -56), sTo = addDaysStr(from, -1); if(earliest && earliest > sFrom) sFrom = earliest;
    var paidAll = {}; rows.forEach(function(x){ if(x.r.net > 0 && x.r.type !== 'return') paidAll[x.r.doc] = 1; });
    var sampled = {};
    rows.forEach(function(x){ var r = x.r; if(!x.rep || !mineX(x) || x.channel || r.date < sFrom || r.date > sTo || (!x.clinicId && isInternalAccount(r.customer)) || !isFocRow(r) || paidAll[r.doc]) return;
      var key = custKeyOf(x) + '|' + normBrand(r.brand); if(!sampled[key] || r.date < sampled[key].date) sampled[key] = { date: r.date, account: nameOf(x), cust: custKeyOf(x), brand: normBrand(r.brand), kd: 0 }; });
    rows.forEach(function(x){ var r = x.r; if(x.channel || !(r.net > 0) || r.type === 'return') return; var sm = sampled[custKeyOf(x) + '|' + normBrand(r.brand)];
      if(sm && r.date > sm.date && r.date <= addDaysStr(sm.date, 30) && r.date <= to) sm.kd += r.net; });
    var sPairs = Object.keys(sampled).map(function(k){ var x = sampled[k]; x.kd = rnd(x.kd); return x; }).sort(function(a, b){ return a.date < b.date ? -1 : 1; });
    var sampleConversion = sFrom <= sTo && sPairs.length ? { from: sFrom, to: sTo, clinics: uniq(sPairs.map(function(x){ return x.cust; })).length,
      converted: uniq(sPairs.filter(function(x){ return x.kd > 0; }).map(function(x){ return x.cust; })).length, kd: rnd(sPairs.reduce(function(t, x){ return t + x.kd; }, 0)), list: sPairs } : null;
    // how much rests on one clinic: shares of the clinics' sales since the window start
    var since = earliest && earliest > since90 ? earliest : since90, cNet = {};
    rows.forEach(function(x){ if(!x.clinicId || x.channel || x.r.date < since || x.r.date > to) return; cNet[x.clinicId] = (cNet[x.clinicId] || 0) + x.r.net; });
    var cList = Object.keys(cNet).filter(function(id){ return cNet[id] > 0; }).sort(function(a, b){ return cNet[b] - cNet[a]; }), cTot = cList.reduce(function(t, id){ return t + cNet[id]; }, 0);
    expansion.since = since;
    expansion.spread = cTot > 0 ? { total: rnd(cTot), clinics: cList.length, top: { clinic: byId[cList[0]] ? byId[cList[0]].name : cList[0], net: rnd(cNet[cList[0]]), share: cNet[cList[0]] / cTot },
      top5: cList.slice(0, 5).reduce(function(t, id){ return t + cNet[id]; }, 0) / cTot } : null;
    expansion.pipeline.forEach(function(p){ var c = clinics.filter(function(c){ return c.name === p.clinic; })[0]; p.kind = isGovClinic(c) ? 'gov' : /pharmac|صيدل/i.test(p.clinic) ? 'pharmacy' : 'clinic'; });
    // last month's new accounts: did they order again, and for how much since
    var prevMonthNew = null;
    if(pmCov && reps.some(function(r){ return winsOk(r, pmStart); })){
      var pmW = keepWins(erpWinsInRange(rows, pmStart, pmEnd, clinics), pmStart);
      var pmList = pmW.newAccounts.filter(mineX).map(function(x){
        var later = rows.filter(function(y){ return !y.channel && custKeyOf(y) === x.key && y.r.date > x.date && y.r.date <= to; });
        var again = later.some(function(y){ return y.r.net > 0 && y.r.type !== 'return'; });
        return { account: x.account, rep: x.rep, first: x.date, firstNet: x.net, again: again, kdSince: rnd(later.reduce(function(t, y){ return t + y.r.net; }, 0)) }; });
      prevMonthNew = { month: pmStart.slice(0, 7), count: pmList.length, orderedAgain: pmList.filter(function(a){ return a.again; }).length,
        kdSince: rnd(pmList.filter(function(a){ return a.again; }).reduce(function(t, a){ return t + a.kdSince; }, 0)), accounts: pmList };
    }
    expansion.prevMonthNew = prevMonthNew;
    // orders taken in the field this week (as logged): invoiced since, or awaiting
    var fieldOrders = vis.filter(function(v){ return v.orderTaken && reps.indexOf(v.rep) >= 0 && !v.callOnly; }).map(function(v){
      var inv = rows.some(function(x){ return x.clinicId && x.clinicId === v.clinicId && x.r.net > 0 && x.r.type !== 'return' && x.r.date >= v.date; });
      return { date: v.date, rep: v.rep, clinic: (byId[v.clinicId] || {}).name || '—', clinicId: v.clinicId || null, value: rnd(v.orderTotal || 0), invoiced: inv }; });
    // the month's clinic sales (invoice lines, before returns) from clinics visited this month (visit → invoice)
    var visitedM = {}; visM.forEach(function(v){ if(reps.some(function(r){ return repWasThere(v, r); })) visitedM[v.clinicId] = 1; });
    var lnAll = 0, lnVis = 0, lnClin = {};
    rows.forEach(function(x){ if(!x.clinicId || x.channel || !x.rep || !mineX(x) || x.r.date < mStart || x.r.date > to || !(x.r.net > 0) || x.r.type === 'return') return; lnAll += x.r.net; if(visitedM[x.clinicId]){ lnVis += x.r.net; lnClin[x.clinicId] = 1; } });
    var linkage = lnAll > 0 ? { from: mStart, to: to, clinicNet: rnd(lnAll), visitedNet: rnd(lnVis), pct: lnVis / lnAll, clinics: Object.keys(lnClin).length } : null;
    // this week's plan (saved last week) against what was done, and the
    // follow-ups that fell due this week (the latest earlier visit sets each date)
    var pl0 = {};
    Object.keys(data.dayPlans || {}).forEach(function(dt){ if(dt < from || dt > to) return; reps.forEach(function(rep){ ((data.dayPlans[dt] || {})[rep] || []).forEach(function(e){ var id = typeof e === 'string' ? e : e.id; if(byId[id]) pl0[rep + '|' + id] = { rep: rep, clinicId: id, date: dt }; }); }); });
    var plList = Object.keys(pl0).map(function(k){ var e = pl0[k]; e.clinic = byId[e.clinicId].name; e.done = vis.some(function(v){ return v.clinicId === e.clinicId && isFieldVisit(v) && repWasThere(v, e.rep); }); return e; });
    var lastV = {}; (data.visits || []).forEach(function(v){ if(!v || !v.clinicId || v.date >= from) return; if(!lastV[v.clinicId] || v.date > lastV[v.clinicId].date) lastV[v.clinicId] = v; });
    var fuList = Object.keys(lastV).filter(function(id){ var v = lastV[id]; return byId[id] && v.nextFollowUp && v.nextFollowUp >= from && v.nextFollowUp <= to && reps.some(function(r){ return repWasThere(v, r); }); })
      .map(function(id){ return { clinicId: id, clinic: byId[id].name, rep: lastV[id].rep, due: lastV[id].nextFollowUp, done: vis.some(function(v){ return v.clinicId === id; }) }; });
    var lastPlan = plList.length || fuList.length ? { planned: plList.length, plannedDone: plList.filter(function(e){ return e.done; }).length, followUps: fuList.length, followUpsDone: fuList.filter(function(e){ return e.done; }).length, plans: plList, followUpList: fuList } : null;
    // returns month to date
    var retM = 0, saleM = 0;
    rows.forEach(function(x){ if(!x.rep || !mineX(x) || x.r.date < mStart || x.r.date > to) return; if(x.r.type === 'return' || x.r.net < 0) retM += -x.r.net; else saleM += x.r.net; });
    satisfaction.returnsPctMtd = saleM > 0 ? Math.round(retM / saleM * 1000) / 10 : null;
    satisfaction.returnsKd = rnd(retNet); satisfaction.salesKd = rnd(saleNet);
    var marginMtd = discountIn(mStart, to);
    // before the meeting: what the supervisor should fix in the app first
    var checks = [];
    if(!covered(from, to)) checks.push({ key: 'no-file', level: 'warn', text: 'No ERP sales file covers this week yet — upload it first.', ar: 'لا يوجد ملف مبيعات ERP يغطي هذا الأسبوع بعد — ارفعه أولاً.' });
    if(!(team.target > 0)) checks.push({ key: 'no-target', level: 'warn', text: 'No DSR target for this month yet — the month pages will be left out.', ar: 'لا يوجد تارغت DSR لهذا الشهر بعد — ستُحذف صفحات الشهر من العرض.' });
    reps.forEach(function(rep){
      if(!next[rep].planned.length) checks.push({ key: 'no-plan:' + rep, level: 'warn', rep: rep, text: rep + ' has no visits planned for next week (' + nFrom + ' to ' + addDaysStr(nFrom, 4) + ').', ar: 'لا توجد زيارات مخططة لـ' + rep + ' في الأسبوع القادم (' + nFrom + ' إلى ' + addDaysStr(nFrom, 4) + ').' });
      var un = next[rep].aMissingInfo.filter(function(a){ return !a.planned; });
      if(un.length) checks.push({ key: 'a-unplanned:' + rep, level: 'info', rep: rep, text: rep + ': ' + un.length + ' key (A) account' + (un.length === 1 ? '' : 's') + ' not visited this month and not in next week\'s plan.', ar: rep + ': حسابات رئيسية (A) لم تُزر هذا الشهر وليست في خطة الأسبوع القادم: ' + un.length + '.' }); });
    var sampM = keepWins(erpWinsInRange(rows, mStart, to, clinics), mStart).samples.filter(mineX);
    sampM.forEach(function(sm){ var c = sm.clinicId && byId[sm.clinicId]; if(!c || c.cls !== 'A') return;
      if(!(data.visits || []).some(function(v){ return v && v.clinicId === c.id && v.date >= mStart && v.date <= to; }))
        checks.push({ key: 'sample-no-visit:' + c.id, level: 'warn', text: c.name + ': samples invoiced on ' + sm.date + ' (' + sm.doc + ') but no visit or call logged this month — log it, or it counts as a key account still to visit.', ar: c.name + ': عينات بتاريخ ' + sm.date + ' (' + sm.doc + ') دون زيارة أو مكالمة مسجلة هذا الشهر — سجّلها، وإلا ستُحسب حساباً رئيسياً لم يُزر.' }); });
    var moodN = satisfaction.moods.pleased + satisfaction.moods.neutral + satisfaction.moods.concerned;
    if(team.fieldVisits && !moodN) checks.push({ key: 'no-mood', level: 'info', text: 'No doctor mood was tapped on this week\'s visits.', ar: 'لم يُسجَّل رضا الطبيب في أي زيارة هذا الأسبوع.' });
    return {
      from: from, to: to, prevFrom: pFrom, prevTo: pTo, monthStart: mStart, nextFrom: nFrom, nextTo: nTo,
      salesCovered: covered(from, to), salesTo: salesTo, prevCovered: covered(pFrom, pTo), historyFrom: earliest, settings: KS,
      reps: reps, perRep: perRep, team: team, brands: brands, weeks: weeks, next: next, history: history, products: products, photos: photos, margin: margin, expansion: expansion, satisfaction: satisfaction,
      marginMtd: marginMtd, winsBlocked: winsBlocked, mix: mix, free: free, sampleConversion: sampleConversion, fieldOrders: fieldOrders, linkage: linkage, lastPlan: lastPlan, checks: checks,
      prevMonth: { from: pmStart, to: pmEnd, covered: pmCov }, prev2: { from: p2From, to: p2To },
      wins: winsR,
      visits: vis.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).map(function(v){
        return { date: v.date, rep: v.rep, withRep: v.withRep || null, clinic: (byId[v.clinicId] || {}).name || '—', type: v.callOnly ? 'call' : v.orderOnly ? 'phone order' : 'visit',
          doctors: (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).map(function(id){ var c = byId[v.clinicId]; var d = c && (c.doctors || []).find(function(x){ return x.id === id; }); return d ? d.name : null; }).filter(Boolean),
          products: (v.products || []).length, order: v.orderTaken ? rnd(v.orderTotal || 0) : 0, followUp: v.nextFollowUp || null }; })
    };
  }
  // One rep's DSR target for a month: the live target when it belongs to that
  // month (a target without a month is the current month's), otherwise the
  // copy kept in targets._history[month]; {} when the month has none.
  function targetOf(data, rep, m){
    var T = data.targets || {}, t = T[rep], h = ((T._history || {})[m] || {})[rep];
    if(t && t.month === m) return t;
    if(h) return h;
    if(t && !t.month && m === String(data.today || '').slice(0, 7)) return t;
    return {};
  }
  // ---- MONTH BY MONTH (progress against earlier months) ----
  // The last `months` months up to `end`, each with the same figures the app
  // shows for a month: achieved from monthAchievement as of the month's last
  // day (the running month: as of `end`), the month's own DSR target, the
  // achievement to the same day of the month (a fair comparison with a month
  // still running), field visits a working day, doctors met, new accounts and
  // first-time products, and the KPI total. Sales are null for a month no
  // sales file covers (never shown as a 0); new accounts are null for the
  // first month of the files (every account would look new); the KPI score is
  // null for a month the person logged no visit or call in. Leading months
  // with no data at all are dropped. Pure.
  function monthlyTrend(data, opts){
    opts = opts || {};
    var reps = opts.reps || [], end = opts.end || data.today; if(end > data.today) end = data.today;
    var n = opts.months || 6, rows = opts.rows || erpAttributedRows(data), S = opts.settings || null;
    var clinics = data.clinics || [], es = data.erpSales, dayN = parseInt(end.slice(8, 10), 10);
    var earliest = rows.reduce(function(m, x){ return !m || x.r.date < m ? x.r.date : m; }, null);
    var rnd = function(x){ return Math.round(x * 1000) / 1000; };
    var out = [];
    for(var i = n - 1; i >= 0; i--){
      var m = addMonthsStr(end.slice(0, 7) + '-01', -i).slice(0, 7), from = m + '-01';
      var dates = getMonthDates(from), mEnd = dates[dates.length - 1], to = mEnd > end ? end : mEnd;
      var same = m + '-' + String(Math.min(dayN, dates.length)).padStart(2, '0'); if(same > to) same = to;
      var covered = erpPeriodsOf(es).some(function(p){ return p.to >= from && p.from <= to; });
      var d2 = {}; for(var k in data) d2[k] = data[k]; d2.today = to;
      var d3 = {}; for(var k3 in data) d3[k3] = data[k3]; d3.today = same;
      var mtd = erpMtd(d2), mtdSame = same === to ? mtd : erpMtd(d3), wins = erpWinsInRange(rows, from, to, clinics);
      var vis = (data.visits || []).filter(function(v){ return v && v.date >= from && v.date <= to && isFieldVisit(v); });
      var wd = 0; for(var dd = from; dd <= to; dd = addDaysStr(dd, 1)) if(isWorkday(dd)) wd++;
      var row = { month: m, from: from, to: to, partial: to < mEnd, sameTo: same, covered: covered, workdays: wd, byRep: {} };
      reps.forEach(function(rep){
        var ach = monthAchievement(rep, d2, mtd), t = targetOf(data, rep, m);
        var sales = covered && ach.basis === 'erp' && ach.asOf ? rnd(ach.amount) : null;   // a file without this rep's salesman says nothing about her
        var sameDays = sales == null ? null : rnd(same === to ? ach.amount : monthAchievement(rep, d3, mtdSame).amount);
        var mine = vis.filter(function(v){ return repWasThere(v, rep); }), docs = {};
        mine.forEach(function(v){ (v.doctorIds && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : [])).forEach(function(id){ docs[v.clinicId + '|' + id] = 1; }); });
        var newOk = covered && earliest && earliest <= addDaysStr(from, -28);   // a month of earlier invoices, or every account looks new
        var logged = (data.visits || []).some(function(v){ return v && v.date >= from && v.date <= to && repWasThere(v, rep); });
        row.byRep[rep] = {
          sales: sales, sameDays: sameDays, target: t.revenue > 0 ? t.revenue : null,
          pct: sales != null && t.revenue > 0 ? sales / t.revenue : null,
          fieldVisits: mine.length, perDay: wd ? Math.round(mine.length / wd * 10) / 10 : 0, doctorsMet: Object.keys(docs).length,
          newAccounts: newOk ? wins.newAccounts.filter(function(x){ return x.rep === rep; }).length : null,
          placements: newOk ? wins.placements.filter(function(x){ return x.rep === rep; }).length : null,
          kpi: S && logged ? kpiScorecard(data, { rep: rep, from: from, to: to, settings: S, rows: rows }).total : null   // no visit or call logged that month: the app was not in use, no score
        };
      });
      var sumOf = function(f){ var any = false, s = 0; reps.forEach(function(r){ var v = row.byRep[r][f]; if(v != null){ any = true; s += v; } }); return any ? rnd(s) : null; };
      row.team = { sales: sumOf('sales'), sameDays: sumOf('sameDays'), target: sumOf('target'), fieldVisits: sumOf('fieldVisits'), doctorsMet: sumOf('doctorsMet'),
        newAccounts: sumOf('newAccounts'), placements: sumOf('placements') };
      var withT = reps.filter(function(r){ return row.byRep[r].target && row.byRep[r].sales != null; });   // as teamAchievement: reps with a target only
      var tg = withT.reduce(function(a, r){ return a + row.byRep[r].target; }, 0), ts = withT.reduce(function(a, r){ return a + row.byRep[r].sales; }, 0);
      row.team.pct = tg > 0 ? ts / tg : null;
      out.push(row);
    }
    while(out.length > 1 && !out[0].covered && !out[0].team.fieldVisits) out.shift();
    return { end: end, months: out, reps: reps };
  }
  // ---- THE STORY'S TRUTH GATES (R1–R7 of the weekly deck) ----
  // Only a claim that passes these reaches the deck's main pages; everything
  // else stays in the appendix. Values are week rows oldest → newest (this
  // week last); null = the files cannot measure that week. Pure.
  var storyGate = {
    // R2: a rise needs +10% and +2 units (or +KD 100)
    rise: function(cur, prev, money){ if(cur == null || prev == null || !(cur > prev)) return false; var d = cur - prev; return (prev > 0 ? d / prev >= 0.10 : true) && d >= (money ? 100 : 2); },
    // R2: a % is printed only on a base of 10 units or KD 250
    pctOk: function(base, money){ return base != null && base >= (money ? 250 : 10); },
    // R3: best of N — strictly above every earlier measurable week, at least 3 of them, at least 2 above zero
    record: function(vals){ var cur = vals[vals.length - 1], prev = vals.slice(0, -1).filter(function(v){ return v != null; });
      return cur != null && cur > 0 && prev.length >= 3 && prev.filter(function(v){ return v > 0; }).length >= 2 && prev.every(function(v){ return cur > v; }); },
    // above the average of the earlier measurable weeks (at least 3), by 10%
    aboveAvg: function(vals, money){ var cur = vals[vals.length - 1], prev = vals.slice(0, -1).filter(function(v){ return v != null; });
      if(cur == null || prev.length < 3) return null; var avg = prev.reduce(function(a, v){ return a + v; }, 0) / prev.length;
      return avg > 0 && cur >= 1.1 * avg && cur - avg >= (money ? 100 : 2) ? avg : null; },
    // R2 (amended): "up from last week" only when this week is also at least
    // 1.1 × the average of the earlier measurable weeks (2 or more) and last
    // week was not below that average — never a rise from a weak week
    fairRise: function(vals, money){ var c = vals[vals.length - 1], p = vals.length > 1 ? vals[vals.length - 2] : null;
      if(!storyGate.rise(c, p, money)) return false; var prev = vals.slice(0, -1).filter(function(v){ return v != null; });
      if(prev.length < 2) return false; var avg = prev.reduce(function(a, v){ return a + v; }, 0) / prev.length; return c >= 1.1 * avg && p >= avg; },
    // R4: consecutive measurable weeks above zero, ending this week
    streak: function(vals){ var n = 0; for(var i = vals.length - 1; i >= 0; i--){ if(vals[i] == null || !(vals[i] > 0)) break; n++; } return n; },
    // R6: a brand target is material at KD 1,000 or 5% of the team target
    material: function(brandTarget, teamTarget){ return brandTarget >= 1000 || (teamTarget > 0 && brandTarget >= 0.05 * teamTarget); },
    // the rank of this week among the measurable weeks (1 = highest)
    rank: function(vals){ var cur = vals[vals.length - 1]; if(cur == null) return null; return 1 + vals.slice(0, -1).filter(function(v){ return v != null && v > cur; }).length; }
  };
  // R1: team sales week by week for the SAME people — those this week's files
  // carry; a week in which any of them is not fully covered is not measurable.
  function teamSalesLikeForLike(W){
    var H = W.history || [], cur = H[H.length - 1] || {}, prev = H.length > 1 ? H[H.length - 2] : null;
    var people = (W.reps || []).filter(function(r){ return cur.byRep && cur.byRep[r] != null && (!prev || (prev.byRep && prev.byRep[r] != null)); });
    return { people: people, values: H.map(function(h){ if(!people.length || people.some(function(r){ return h.byRep[r] == null; })) return null;
      return Math.round(people.reduce(function(a, r){ return a + h.byRep[r]; }, 0) * 1000) / 1000; }) };
  }
  // ---- THE WEEKLY STORY (what the management deck says, and in what order) ----
  // From weeklyReport's W: every TRUE positive item of the week, each with its
  // number, its words, its basis and an Arabic line for the speaker notes,
  // passed through the truth gates (R1 like for like, R2 rises, R3 records,
  // R4 streaks, R5 no ranking of people, R6 materiality, R7 the month, R8
  // samples are seeds, R9 distinct counts, R10 no zeros, R11 at most one
  // headline about the presenter, R12 one value per figure). The deck only
  // lays this out; weak measures go to `excluded` (the notes say where they
  // are in the appendix). Pure. opts: {presenter, brandName, trend (from
  // monthlyTrend), kpi {rep: kpiScorecard}, familyOf (for foldProducts)}.
  var STORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STORY_MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var STORY_MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function weeklyStory(W, opts){
    opts = opts || {};
    var reps = W.reps || [], P = W.perRep || {}, H = W.history || [], cur = H[H.length - 1] || {}, prevW = H.length > 1 ? H[H.length - 2] : null;
    var presenter = opts.presenter || null, bn = opts.brandName || function(b){ return b; };
    var KS = W.settings || KPI_DEFAULTS;
    var dm = function(d){ return parseInt(d.slice(8, 10), 10) + ' ' + STORY_MONTHS[parseInt(d.slice(5, 7), 10) - 1]; };
    var range = function(a, b){ return dm(a) + ' – ' + dm(b); };
    var kd = function(n){ return 'KD ' + Math.round(n).toLocaleString('en-US'); };
    var num = function(n){ return Math.round(n).toLocaleString('en-US'); };
    var pl = function(n, one, many){ return n + ' ' + (n === 1 ? one : many); };
    var pct = function(x){ return Math.round(x * 100) + '%'; };
    var cut = function(t, n){ t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    var mIdx = parseInt(W.to.slice(5, 7), 10) - 1, mName = STORY_MONTHS_LONG[mIdx], mAr = STORY_MONTHS_AR[mIdx];
    var day = parseInt(W.to.slice(8, 10), 10), dim = getMonthDates(W.to).length;
    var wdays = 0; for(var dd = W.to.slice(0, 7) + '-01'; dd <= W.to; dd = addDaysStr(dd, 1)) if(isWorkday(dd)) wdays++;
    var lastWk = prevW ? range(prevW.from, prevW.to) : '';
    var items = [];
    var add = function(it){ it.score = it.score || 0; it.scope = it.scope || 'team'; it.text = it.text || (it.big ? it.big + ' — ' : '') + it.headline + (it.detail ? ': ' + it.detail : ''); items.push(it); return it; };
    // visit measures: weeks before the team logged anything in the app are not measurable
    var fromFirstUse = function(vals){ var i0 = -1; for(var i = 0; i < vals.length; i++){ if(vals[i] > 0){ i0 = i; break; } } return vals.map(function(v, i){ return i0 < 0 || i < i0 ? null : v; }); };
    var measured = function(vals){ return vals.filter(function(v){ return v != null; }).length; };
    // 1 · team sales, like for like (R1–R3)
    var tl = teamSalesLikeForLike(W), sv = tl.values, sCur = sv[sv.length - 1], sPrev = sv.length > 1 ? sv[sv.length - 2] : null;
    if(W.salesCovered && sCur != null && sCur > 0){
      var sAvg = storyGate.aboveAvg(sv, true);
      if(storyGate.record(sv)) add({ key: 'sales-record', kind: 'sales', big: kd(sCur), headline: 'Best sales week of the last ' + measured(sv) + ' weeks', detail: 'above every earlier week our sales files cover', basis: 'ERP invoices, the same people every week', icon: 'award', evidence: { values: sv, frame: 'record' }, score: 100,
        ar: 'أفضل أسبوع مبيعات منذ ' + measured(sv) + ' أسابيع: ' + num(sCur) + ' ديناراً.' });
      else if(storyGate.fairRise(sv, true)) add({ key: 'sales-rise', kind: 'sales', big: kd(sCur), headline: 'Sales up on last week', detail: 'up from ' + kd(sPrev) + ' (' + lastWk + ')' + (storyGate.pctOk(sPrev, true) ? ', +' + pct((sCur - sPrev) / sPrev) : ''), basis: 'ERP invoices, the same people both weeks', icon: 'arrow-up', evidence: { values: sv, frame: 'rise' }, score: 90,
        ar: 'المبيعات ارتفعت إلى ' + num(sCur) + ' ديناراً مقابل ' + num(sPrev) + ' الأسبوع الماضي.' });
      else if(sAvg != null) add({ key: 'sales-avg', kind: 'sales', big: kd(sCur), headline: 'Above the average of the earlier weeks', detail: 'against an average of ' + kd(sAvg) + ' a week', basis: 'ERP invoices, the same people every week', icon: 'chart', evidence: { values: sv, frame: 'avg' }, score: 80,
        ar: 'مبيعات الأسبوع ' + num(sCur) + ' ديناراً، فوق متوسط الأسابيع السابقة (' + num(sAvg) + ').' });
    }
    // 2 · the month (R7): past the target, or on pace after 6 working days
    var withT = reps.filter(function(r){ return P[r] && P[r].target > 0; });
    withT.forEach(function(r){ var p = P[r];
      if(p.pct >= 1) add({ key: 'target-past:' + r, kind: 'target', scope: 'rep', rep: r, big: pct(p.pct), headline: r + ' is past the ' + mName + ' target', detail: kd(p.mtd) + ' of ' + kd(p.target) + ' by ' + dm(W.to), basis: 'ERP month to date against the DSR target', icon: 'target', score: 95,
        ar: r + ' تجاوز هدف ' + mAr + ': ' + num(p.mtd) + ' من ' + num(p.target) + ' ديناراً.' });
      else if(wdays >= 6 && p.pace >= 1) add({ key: 'target-pace:' + r, kind: 'target', scope: 'rep', rep: r, big: pct(p.pace), headline: r + ' is on pace to pass the ' + mName + ' target', detail: kd(p.mtd) + ' of ' + kd(p.target) + ' by ' + dm(W.to) + ' (day ' + day + ' of ' + dim + ')', basis: 'month to date projected over the calendar days, as on the Today card', icon: 'target', score: 88,
        ar: r + ' على الطريق لتجاوز هدف ' + mAr + ': ' + num(p.mtd) + ' من ' + num(p.target) + ' حتى يوم ' + day + '.' }); });
    var tMtd = withT.reduce(function(a, r){ return a + P[r].mtd; }, 0), tTgt = withT.reduce(function(a, r){ return a + P[r].target; }, 0);
    var teamPct = tTgt > 0 ? tMtd / tTgt : null, teamPace = teamPct != null && day > 0 ? teamPct / day * dim : null;
    if(teamPct != null && teamPct >= 1) add({ key: 'target-team-past', kind: 'target', big: pct(teamPct), headline: 'The team is past the ' + mName + ' target', detail: kd(tMtd) + ' of ' + kd(tTgt), basis: 'ERP month to date against the DSR targets', icon: 'target', score: 97, ar: 'الفريق تجاوز هدف ' + mAr + '.' });
    else if(teamPace != null && wdays >= 6 && teamPace >= 1) add({ key: 'target-team-pace', kind: 'target', big: pct(teamPace), headline: 'The team is on pace to pass the ' + mName + ' target', detail: kd(tMtd) + ' of ' + kd(tTgt) + ' by ' + dm(W.to), basis: 'month to date projected over the calendar days', icon: 'target', score: 93, ar: 'الفريق على الطريق لتجاوز هدف ' + mAr + '.' });
    // a closed month (days 1–10): KD AND % of target both up, for the same people
    var closed = null, closedRep = {};
    if(day <= 10 && opts.trend && opts.trend.months && opts.trend.months.length >= 3){
      var TM = opts.trend.months, mc = TM[TM.length - 2], mp = TM[TM.length - 3];
      var same = reps.filter(function(r){ return mc.byRep[r] && mp.byRep[r] && mc.byRep[r].sales != null && mp.byRep[r].sales != null && mc.byRep[r].target && mp.byRep[r].target; });
      var sum = function(m, f){ return same.reduce(function(a, r){ return a + m.byRep[r][f]; }, 0); };
      if(same.length){ var k1 = sum(mp, 'sales'), k2 = sum(mc, 'sales'), p1 = k1 / sum(mp, 'target'), p2 = k2 / sum(mc, 'target');
        if(k2 > k1 && p2 > p1) closed = { month: mc.month, prev: mp.month, kd: k2, kdPrev: k1, pct: p2, pctPrev: p1, people: same }; }
      reps.forEach(function(r){ var a = mp.byRep[r], b = mc.byRep[r]; if(a && b && a.sales != null && b.sales != null && a.pct != null && b.pct != null && b.sales > a.sales && b.pct > a.pct) closedRep[r] = { month: mc.month, kd: b.sales, kdPrev: a.sales, pct: b.pct, pctPrev: a.pct }; });
      if(closed){ var cmn = STORY_MONTHS_LONG[parseInt(closed.month.slice(5, 7), 10) - 1], pmn = STORY_MONTHS_LONG[parseInt(closed.prev.slice(5, 7), 10) - 1];
        add({ key: 'month-closed', kind: 'target', big: pct(closed.pct), headline: cmn + ' closed above ' + pmn, detail: kd(closed.kd) + ', ' + pct(closed.pct) + ' of target (' + pmn + ': ' + kd(closed.kdPrev) + ', ' + pct(closed.pctPrev) + ')', basis: 'ERP month totals against each month\'s own DSR target, the same people', icon: 'target', score: 70,
          ar: 'أغلق ' + STORY_MONTHS_AR[parseInt(closed.month.slice(5, 7), 10) - 1] + ' أعلى من الشهر الذي قبله في المبيعات وفي نسبة الهدف معاً.' }); }
    }
    // 3 · new business (R8: samples are seeds, never wins)
    var mine = function(x){ return reps.indexOf(x.rep) >= 0; };
    var newOk = cur.newAccounts != null;
    var NA = newOk ? (W.wins.newAccounts || []).filter(mine) : [], RA = newOk ? (W.wins.reactivated || []).filter(mine) : [], PL = newOk ? (W.wins.placements || []).filter(mine) : [];
    var nWins = NA.length + RA.length + PL.length;
    if(nWins){
      var parts = [];
      if(NA.length) parts.push(NA.length === 1 ? 'a new account (' + cut(NA[0].account, 30) + ', first order ' + kd(NA[0].net) + ')' : NA.length + ' new accounts');
      if(RA.length) parts.push(RA.length === 1 ? cut(RA[0].account, 30) + ' ordering again after 60+ days' : RA.length + ' accounts ordering again after 60+ days');
      if(PL.length) parts.push(PL.length === 1 ? 'a first-time product in a clinic that already buys from us' : PL.length + ' first-time products in clinics that already buy from us');
      var detail = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
      add({ key: 'newbiz', kind: 'newbiz', big: String(nWins), headline: nWins === 1 ? 'business win this week' : 'business wins this week', detail: detail.charAt(0).toUpperCase() + detail.slice(1), basis: 'new = first order in our sales files, which start ' + dm(W.historyFrom || W.from), icon: 'sparkles', score: NA.length ? 86 : 76,
        ar: nWins + ' مكاسب جديدة هذا الأسبوع' + (NA.length ? '، منها ' + (NA.length === 1 ? 'حساب جديد هو ' + NA[0].account + ' بأول طلب قيمته ' + num(NA[0].net) + ' ديناراً' : NA.length + ' حسابات جديدة') : '') + (PL.length ? '، و' + PL.length + ' منتجات جديدة دخلت عيادات تتعامل معنا' : '') + '.' });
    }
    // 4 · field work: records, above the average, or a rise — visits and doctors met
    var fieldCands = [];
    [['fieldVisits', 'field visits', 'زيارة ميدانية', 'stethoscope'], ['doctorsMet', 'doctors and staff met', 'من الأطباء والعاملين قابلناهم', 'users']].forEach(function(m){
      var vals = fromFirstUse(H.map(function(h){ return h[m[0]]; })), c = vals[vals.length - 1], p = vals.length > 1 ? vals[vals.length - 2] : null;
      if(!(c > 0)) return;
      var avg = storyGate.aboveAvg(vals), rk = storyGate.rank(vals);
      if(storyGate.record(vals)) fieldCands.push({ key: 'field-record:' + m[0], kind: 'field', big: String(c), headline: m[1] + ', the most in ' + measured(vals) + ' weeks', detail: 'more than any earlier week logged in the app', basis: 'a visit = one clinic on one day; each doctor counted once', icon: m[3], evidence: { values: vals, frame: 'record' }, score: 84, rank: rk, ar: c + ' ' + m[2] + '، الأعلى منذ ' + measured(vals) + ' أسابيع.' });
      else if(storyGate.fairRise(vals, false)) fieldCands.push({ key: 'field-rise:' + m[0], kind: 'field', big: String(c), headline: m[1] + ', up from ' + p + ' last week', detail: (storyGate.pctOk(p, false) ? '+' + pct((c - p) / p) + ' on ' + lastWk : 'against ' + p + ' on ' + lastWk), basis: 'a visit = one clinic on one day; each doctor counted once', icon: m[3], evidence: { values: vals, frame: 'rise' }, score: 70, rank: rk, ar: c + ' ' + m[2] + ' مقابل ' + p + ' الأسبوع الماضي.' });
      else if(avg != null) fieldCands.push({ key: 'field-avg:' + m[0], kind: 'field', big: String(c), headline: m[1] + ', above the weekly average', detail: 'against an average of ' + Math.round(avg) + ' a week', basis: 'a visit = one clinic on one day; each doctor counted once', icon: m[3], evidence: { values: vals, frame: 'avg' }, score: 72, rank: rk, ar: c + ' ' + m[2] + '، فوق متوسط الأسابيع السابقة.' });
    });
    fieldCands.sort(function(a, b){ return b.score - a.score || a.rank - b.rank; }).forEach(function(c, i){ if(i > 0) c.score -= 20; add(c); });
    // 5 · streaks (R4) — new accounts, back after 60+ days, new products
    var streaks = [], streakFrom = W.historyFrom ? addDaysStr(W.historyFrom, 90) : null;
    // R4 (amended): a week counts in a streak only with 90 days of files before it ("first" is not knowable sooner)
    var streakVals = function(f){ return H.map(function(h){ return streakFrom && h.from >= streakFrom ? h[f] : null; }); };
    [['placements', 'first-time products', 'منتج يدخل عيادة لأول مرة'], ['newAccounts', 'a new account', 'حساب جديد'], ['reactivated', 'an account back after 60+ days', 'حساب عاد بعد انقطاع']].forEach(function(m){
      var vals = streakVals(m[0]), n = storyGate.streak(vals);
      if(n >= 3) streaks.push(add({ key: 'streak:' + m[0], kind: 'streak', big: String(n), headline: 'weeks in a row with ' + m[1], detail: 'every week our files can measure' + (cur[m[0]] ? '; ' + cur[m[0]] + ' this week' : ''), basis: 'measurable weeks: ' + measured(vals) + ' of the last ' + vals.length, icon: 'refresh', evidence: { values: vals, frame: 'streak' }, score: n >= 4 ? 74 : 54, headlineOk: n >= 4, ar: n + ' أسابيع متتالية فيها ' + m[2] + '.' }));
    });
    // 6 · brands at their month target: a headline only when material (R6)
    (W.brands || []).filter(function(b){ return b.target > 0 && b.mtd >= b.target; }).forEach(function(b){
      if(storyGate.material(b.target, tTgt)) add({ key: 'brand:' + b.brand, kind: 'brand', big: pct(b.mtd / b.target), headline: bn(b.brand) + ' past its ' + mName + ' target', detail: kd(b.mtd) + ' of ' + kd(b.target), basis: 'ERP month to date against the DSR brand target', icon: 'target', score: 78, ar: bn(b.brand) + ' تجاوز هدفه لشهر ' + mAr + ': ' + num(b.mtd) + ' من ' + num(b.target) + '.' });
      else add({ key: 'brand-small:' + b.brand, kind: 'brand-small', big: kd(b.mtd), headline: bn(b.brand) + ' past its ' + mName + ' target', detail: 'of a ' + kd(b.target) + ' target', basis: 'ERP month to date against the DSR brand target', icon: 'target', score: 40, headlineOk: false, ar: bn(b.brand) + ' تجاوز هدفه الصغير (' + num(b.mtd) + ' من ' + num(b.target) + ').' });
    });
    // 7 · the week's largest clinic invoice (KD 250 or more)
    var bigInv = (W.wins.invoices || []).filter(function(i){ return mine(i) && !i.channel && !i.internal && i.net >= 250; }).sort(function(a, b){ return b.net - a.net; })[0];
    if(bigInv) add({ key: 'invoice:' + bigInv.doc, kind: 'invoice', scope: 'rep', rep: bigInv.rep, big: kd(bigInv.net), headline: 'the week\'s largest invoice', detail: cut(bigInv.account, 40) + ' · ' + bigInv.rep + ' · ' + dm(bigInv.date), proof: 'Invoice ' + bigInv.doc, basis: 'ERP invoice, net of discount', icon: 'file', score: 60, ar: 'أكبر فاتورة هذا الأسبوع ' + num(bigInv.net) + ' ديناراً لدى ' + bigInv.account + ' (' + bigInv.doc + ').' });
    // 8 · margin, loyalty, service, satisfaction (true only; never a zero)
    var mg = W.margin || {};
    if(mg.discount != null && mg.invoices >= 2 && mg.avgPrev != null && mg.discount <= mg.avgPrev - 1) add({ key: 'margin-kept', kind: 'margin', big: mg.discount + '%', headline: 'average discount, down from ' + mg.avgPrev + '%', detail: 'more margin kept on ' + pl(mg.invoices, 'clinic invoice', 'clinic invoices'), basis: 'gross-weighted; free goods inside a deal count as discount', icon: 'shield', score: 66, ar: 'متوسط الخصم ' + mg.discount + '% مقابل ' + mg.avgPrev + '% في الأسابيع السابقة: هامش ربح أعلى.' });
    if(mg.withinLimit === 1 && mg.invoices >= 3) add({ key: 'margin-within', kind: 'within', big: mg.invoices + ' of ' + mg.invoices, headline: 'invoices within the discount limits', detail: 'average discount ' + mg.discount + '% (limits: A clinics ' + (mg.limits || {}).A + '%, others ' + (mg.limits || {}).other + '%)', basis: 'the supervisor\'s KPI settings', icon: 'shield', score: 58, headlineOk: false, ar: 'كل الفواتير ضمن حدود الخصم المسموحة، بمتوسط ' + mg.discount + '%.' });
    var sat = W.satisfaction || {};
    if((sat.repeatAccounts || []).length >= 2) add({ key: 'loyalty', kind: 'loyalty', big: String(sat.repeatAccounts.length), headline: 'clinics ordered again', detail: cut(sat.repeatAccounts.slice(0, 3).join(' · '), 60), basis: 'clinics with an earlier order in our files', icon: 'refresh', score: 56, headlineOk: false, ar: sat.repeatAccounts.length + ' عيادات طلبت مرة أخرى هذا الأسبوع.' });
    if(sat.requests >= 2 && sat.answeredOnTime === sat.requests) add({ key: 'service', kind: 'service', big: sat.requests + ' of ' + sat.requests, headline: 'client requests answered on time', detail: 'within ' + KS.responseHours + ' hours', basis: 'requests logged in the app', icon: 'chat', score: 50, headlineOk: false, ar: 'كل طلبات العملاء (' + sat.requests + ') تم الرد عليها في الوقت.' });
    var moods = sat.moods || {}, rated = (moods.pleased || 0) + (moods.neutral || 0) + (moods.concerned || 0);
    if(rated >= 3 && moods.pleased / rated >= 0.6) add({ key: 'mood', kind: 'mood', big: moods.pleased + ' of ' + rated, headline: 'visits where the doctor was pleased', detail: 'as the rep recorded it on each visit', basis: 'the visit form\'s satisfaction tap', icon: 'star', score: 62, headlineOk: false, ar: 'الأطباء كانوا راضين في ' + moods.pleased + ' من ' + rated + ' زيارات قيّمناها.' });
    var seeds = (W.wins.samples || []).filter(mine), seedAcc = seeds.map(function(x){ return x.account; }).filter(function(a, i, l){ return l.indexOf(a) === i; });
    if(seeds.length) add({ key: 'seeds', kind: 'seeds', big: String(seedAcc.length), headline: seedAcc.length === 1 ? 'account given samples' : 'accounts given samples', detail: 'seeds: ' + cut(seedAcc.join(', '), 60), basis: 'documents with free goods only (a free line on a paid invoice is part of that deal)', icon: 'gift', score: 36, headlineOk: false, ar: 'وزعنا عينات على ' + seedAcc.length + ' حسابات لفتح طلبات قادمة.' });
    var ex = W.expansion || {};
    if((ex.pipeline || []).length >= 2) add({ key: 'pipeline', kind: 'pipeline', big: String(ex.pipeline.length), headline: 'prospects visited', detail: 'no invoice in the last 90 days: ' + cut(ex.pipeline.slice(0, 3).map(function(x){ return x.clinic; }).join(', '), 60), basis: 'clinics visited this week with no invoice in 90 days', icon: 'compass', score: 46, headlineOk: false, ar: 'زرنا ' + ex.pipeline.length + ' عيادات لا تشتري منا حالياً: هذه خطة التوسع.' });
    if(ex.newThisMonth && ex.newThisMonth.length >= 2) add({ key: 'new-month', kind: 'newclinics', big: String(ex.newThisMonth.length), headline: 'new accounts this month', detail: cut(ex.newThisMonth.map(function(x){ return x.account; }).join(', '), 60), basis: 'first order in our files', icon: 'building', score: 64, headlineOk: false, ar: ex.newThisMonth.length + ' حسابات جديدة منذ بداية الشهر.' });
    var aT = reps.reduce(function(a, r){ return a + (P[r] ? P[r].aTotal : 0); }, 0), aV = reps.reduce(function(a, r){ return a + (P[r] ? P[r].aVisited : 0); }, 0);
    if(aT > 0 && aV === aT) add({ key: 'key-accounts', kind: 'keyaccounts', big: aV + ' of ' + aT, headline: 'key (A) accounts visited this month', detail: 'every one', basis: 'visits logged in the app', icon: 'check', score: 52, headlineOk: false, ar: 'كل عيادات الفئة A زرناها هذا الشهر.' });
    // ---- the headline: three different kinds, at most one about the presenter (R11)
    var order = ['sales', 'target', 'newbiz', 'field', 'streak', 'brand', 'invoice', 'margin', 'newclinics', 'mood', 'loyalty', 'service'];
    var headline = [], presenterUsed = 0;
    order.forEach(function(k){
      if(headline.length >= 3) return;
      var c = items.filter(function(i){ return i.kind === k && i.headlineOk !== false; })
        .sort(function(a, b){ return b.score - a.score || ((a.rep === presenter) - (b.rep === presenter)); });
      for(var i = 0; i < c.length; i++){ if(c[i].scope === 'rep' && c[i].rep === presenter && presenterUsed >= 1) continue; headline.push(c[i]); if(c[i].rep === presenter) presenterUsed++; break; }
    });
    headline.sort(function(a, b){ return b.score - a.score; });
    var inHead = function(i){ return headline.indexOf(i) >= 0; };
    // ---- also this week: the rest of the true positives, strongest first
    var alsoKinds = ['seeds', 'loyalty', 'brand-small', 'margin', 'within', 'pipeline', 'service', 'mood', 'newclinics', 'keyaccounts', 'invoice', 'brand', 'target'];
    var also = items.filter(function(i){ return !inHead(i) && alsoKinds.indexOf(i.kind) >= 0; }).sort(function(a, b){ return b.score - a.score; }).slice(0, 8);
    // ---- the people: one signature and up to three facts each (R5: no ranking)
    var people = {};
    var most = function(f, r){ var v = P[r] ? P[r][f] : 0; return v > 0 && reps.every(function(o){ return o === r || !P[o] || P[o][f] < v; }); };
    reps.forEach(function(r){
      var p = P[r] || {}, c = [];
      items.forEach(function(i){ if(i.rep === r && (i.kind === 'target' || i.kind === 'invoice')) c.push({ kind: i.kind, big: i.big, line: i.kind === 'invoice' ? 'the week\'s largest invoice, at ' + cut(bigInv.account, 34) : i.headline.replace(r + ' ', '').replace(/^is /, ''), icon: i.icon, score: i.score, ar: i.ar }); });
      var rv = H.map(function(h){ return h.byRep ? h.byRep[r] : null; }), rc = rv[rv.length - 1], rp = rv.length > 1 ? rv[rv.length - 2] : null;
      if(W.salesCovered && rc > 0){
        if(storyGate.record(rv)) c.push({ kind: 'sales', big: kd(rc), line: 'best sales week of the last ' + measured(rv) + ' weeks', icon: 'award', score: 86, ar: 'أفضل أسبوع مبيعات لـ' + r + ' منذ ' + measured(rv) + ' أسابيع.' });
        else if(storyGate.fairRise(rv, true)) c.push({ kind: 'sales', big: kd(rc), line: 'invoiced, up from ' + kd(rp) + ' last week', icon: 'arrow-up', score: 80, ar: r + ' رفع مبيعاته إلى ' + num(rc) + ' مقابل ' + num(rp) + '.' });
      }
      NA.filter(function(x){ return x.rep === r; }).forEach(function(x){ c.push({ kind: 'new', big: kd(x.net), line: 'first order from a new account, ' + cut(x.account, 28), icon: 'building', score: 84, ar: 'حساب جديد: ' + x.account + ' بأول طلب ' + num(x.net) + ' ديناراً.' }); });
      RA.filter(function(x){ return x.rep === r; }).forEach(function(x){ c.push({ kind: 'back', big: '1', line: cut(x.account, 28) + ' ordering again after 60+ days', icon: 'refresh', score: 74, ar: x.account + ' عاد للطلب بعد انقطاع.' }); });
      var myPl = PL.filter(function(x){ return x.rep === r; }), plKd = myPl.reduce(function(a, x){ return a + x.net; }, 0);
      if(myPl.length >= 2 || plKd >= 100) c.push({ kind: 'placements', big: String(myPl.length), line: myPl.length === 1 ? 'first-time product: ' + cut(myPl[0].product, 30) : 'products placed for the first time in clinics', icon: 'package', score: 66, ar: myPl.length + ' منتجات دخلت عيادات لأول مرة.' });
      else if(myPl.length === 1) c.push({ kind: 'placements', big: kd(myPl[0].net), line: 'first-time product at ' + cut(myPl[0].account, 26), icon: 'package', score: 40, ar: 'منتج جديد دخل ' + myPl[0].account + '.' });
      if(closedRep[r]){ var cr = closedRep[r]; c.push({ kind: 'month', big: pct(cr.pct), line: STORY_MONTHS_LONG[parseInt(cr.month.slice(5, 7), 10) - 1] + ' closed at ' + pct(cr.pct) + ', up from ' + pct(cr.pctPrev), icon: 'target', score: 62, ar: r + ' أغلق الشهر الماضي بنسبة ' + pct(cr.pct) + ' مقابل ' + pct(cr.pctPrev) + '، والمبيعات أعلى أيضاً.' }); }
      [['fieldVisits', 'field visits, the most on the team', 'stethoscope', 'زيارات ميدانية، الأكثر في الفريق'], ['doctorsMet', 'doctors and staff met, the most on the team', 'users', 'من الأطباء والعاملين، الأكثر في الفريق'], ['productsPresented', 'products presented, the most on the team', 'layers', 'منتجات عُرضت، الأكثر في الفريق'], ['followUps', 'follow-up dates set, the most on the team', 'calendar', 'مواعيد متابعة، الأكثر في الفريق']].forEach(function(m, k){
        if(most(m[0], r) && p[m[0]] >= 3) c.push({ kind: 'most:' + m[0], big: String(p[m[0]]), line: m[1], icon: m[2], score: 50 - k, ar: p[m[0]] + ' ' + m[3] + '.' }); });
      if(p.logged >= 3 && p.followUps === p.logged) c.push({ kind: 'discipline', big: p.followUps + ' of ' + p.logged, line: 'visits logged with a follow-up date', icon: 'calendar', score: 44, ar: 'كل زيارة سجلها لها موعد متابعة.' });
      var K = opts.kpi && opts.kpi[r];
      if(K && K.items) K.items.filter(function(it){ return it.score != null && it.score >= 0.85 && it.key !== 'sales'; }).sort(function(a, b){ return b.weight - a.weight || b.score - a.score; }).slice(0, 2).forEach(function(it){
        c.push({ kind: 'kpi:' + it.key, big: pct(it.score), line: it.label + ' (KPI, ' + range(K.from, K.to) + ')', icon: 'check', score: 38, ar: 'مؤشر ' + it.label + ' عند ' + pct(it.score) + '.' }); });
      if(p.fieldVisits > 0 && !c.some(function(x){ return x.kind === 'most:fieldVisits'; })) c.push({ kind: 'field', big: String(p.fieldVisits), line: (p.fieldVisits === 1 ? 'field visit' : 'field visits') + (p.doctorsMet ? ', ' + pl(p.doctorsMet, 'doctor', 'doctors') + ' met' : ''), icon: 'stethoscope', score: 30, ar: p.fieldVisits + ' زيارات ميدانية.' });
      c.sort(function(a, b){ return b.score - a.score; });
      var seen = {}, list = c.filter(function(x){ var k = x.kind.split(':')[0] === 'most' ? x.kind : x.kind; if(seen[k]) return false; seen[k] = 1; return true; });
      people[r] = list.length ? { signature: list[0], facts: list.slice(1, 4) } : null;
    });
    // ---- against the last 8 weeks: favourable frames only, one per measure
    var momentum = [];
    var mMeasures = [['sales', 'Sales', sv, true], ['invoices', 'Invoices', H.map(function(h){ return h.invoices; }), false], ['accounts', 'Clinic accounts invoiced', H.map(function(h){ return h.accounts; }), false],
      ['placements', 'First-time products', H.map(function(h){ return h.placements; }), false], ['newAccounts', 'New accounts', H.map(function(h){ return h.newAccounts; }), false],
      ['fieldVisits', 'Field visits', fromFirstUse(H.map(function(h){ return h.fieldVisits; })), false], ['doctorsMet', 'Doctors and staff met', fromFirstUse(H.map(function(h){ return h.doctorsMet; })), false]];
    mMeasures.forEach(function(m){
      var vals = m[2], c = vals[vals.length - 1], p = vals.length > 1 ? vals[vals.length - 2] : null;
      if(m[0] === 'sales' && !W.salesCovered) return;
      var big = m[3] ? kd(c || 0) : String(c), rk = storyGate.rank(vals);
      if(c > 0 && storyGate.record(vals)) momentum.push({ key: m[0], label: m[1], big: big, chip: '★ best of ' + measured(vals) + ' weeks', frame: 'record', values: vals, score: 4, rank: rk });
      else if(c > 0 && storyGate.aboveAvg(vals, m[3]) != null) momentum.push({ key: m[0], label: m[1], big: big, chip: 'above the ' + (measured(vals) - 1) + '-week average', frame: 'avg', values: vals, score: 3, rank: rk, avg: storyGate.aboveAvg(vals, m[3]) });
      else if(['placements', 'newAccounts'].indexOf(m[0]) >= 0 && storyGate.streak(streakVals(m[0])) >= 3){ var sk = storyGate.streak(streakVals(m[0])); momentum.push({ key: m[0], label: m[1], big: String(sk), chip: sk + ' weeks in a row', frame: 'streak', values: streakVals(m[0]), score: 2, rank: rk }); }
      else if(storyGate.fairRise(vals, m[3])) momentum.push({ key: m[0], label: m[1], big: big, chip: '▲ up from ' + (m[3] ? kd(p) : p) + ' last week', frame: 'rise', values: vals, score: 1, rank: rk });
    });
    momentum.sort(function(a, b){ return b.score - a.score || a.rank - b.rank; }); momentum = momentum.slice(0, 4);
    // R15: the page title names its measure — never "Up on last week"
    var mt = momentum[0], momentumTitle = !mt ? null : mt.frame === 'record' ? mt.label + ': ' + mt.big + ', the most in ' + measured(mt.values) + ' weeks'
      : mt.frame === 'avg' ? mt.label + ': ' + mt.big + ', above the ' + (measured(mt.values) - 1) + '-week average'
      : mt.frame === 'streak' ? mt.label + ' every week for ' + mt.big + ' weeks' : mt.label + ': ' + mt.big + ', ' + mt.chip.replace(/^▲ /, '');
    // ---- the wins of the week, biggest first (every one with its invoice)
    var winsList = [].concat(NA.map(function(x){ return { type: 'new', account: x.account, clinicId: x.clinicId, rep: x.rep, date: x.date, doc: x.doc, net: x.net, product: x.products && x.products[0] ? x.products[0].product : null, brand: x.products && x.products[0] ? x.products[0].brand : null }; }),
      RA.map(function(x){ return { type: 'back', account: x.account, clinicId: x.clinicId, rep: x.rep, date: x.date, doc: x.doc, net: null, lastBefore: x.lastBefore }; }),
      PL.map(function(x){ return { type: 'product', account: x.account, clinicId: x.clinicId, rep: x.rep, date: x.date, doc: x.doc, net: x.net, product: x.product, brand: normBrand(x.brand) }; }))
      .sort(function(a, b){ var o = { new: 0, back: 1, product: 2 }; return (b.net || 0) - (a.net || 0) || o[a.type] - o[b.type]; });
    // ---- what sold: product lines folded by photo family, the leading brand
    var folded = foldProducts(W.products || [], opts.familyOf);
    var brandsWeek = (W.brands || []).filter(function(b){ return b.week > 0 && !NON_PRODUCT_RE.test(b.brand); });
    var sold = W.salesCovered && folded.length ? { items: folded.slice(0, 5), more: Math.max(0, folded.length - 5), topBrand: brandsWeek[0] ? { brand: bn(brandsWeek[0].brand), week: brandsWeek[0].week } : null, total: W.team.week } : null;
    // ---- the field, the month, next week
    var joint = (W.visits || []).filter(function(v){ return v.withRep && v.type === 'visit'; }).map(function(v){ return { reps: [v.rep, v.withRep], clinic: v.clinic, date: v.date }; });
    var orders = reps.reduce(function(a, r){ return { n: a.n + ((P[r] || {}).orders || 0), value: a.value + ((P[r] || {}).orderValue || 0) }; }, { n: 0, value: 0 });
    var field = W.team && W.team.fieldVisits ? { visits: W.team.fieldVisits, clinics: W.team.clinics, doctors: W.team.doctorsMet, products: W.team.productsPresented, followUpClinics: W.team.followUpClinics, joint: joint, orders: orders } : null;
    var monthQ = withT.filter(function(r){ return P[r].pct >= 1 || (wdays >= 6 && P[r].pace >= 1); });
    var month = { qualifies: monthQ, team: teamPct != null && (teamPct >= 1 || (wdays >= 6 && teamPace >= 1)) ? { mtd: tMtd, target: tTgt, pct: teamPct, pace: teamPace } : null, closed: closed, day: day, dim: dim, monthName: mName };
    var nP = 0, nF = 0; reps.forEach(function(r){ var n = (W.next || {})[r]; if(n){ nP += n.planned.length; nF += n.followUps.length; } });
    var next = { planned: nP, followUps: nF, from: W.nextFrom, to: W.nextTo, people: reps.map(function(r){ var n = (W.next || {})[r] || { planned: [], followUps: [], aMissing: [] }; return { rep: r, planned: n.planned, followUps: n.followUps, aMissing: n.aMissing }; }) };
    // ---- what the main pages leave out (the notes say where it is)
    var excluded = [];
    if(W.salesCovered && !items.some(function(i){ return i.kind === 'sales'; })) excluded.push('المبيعات ' + num(W.team.week) + ' ديناراً' + (sCur != null && sPrev != null ? ' (للمقارنة: ' + (tl.people.length < reps.length ? tl.people.join(' و') + ' ' : '') + num(sCur) + ' مقابل ' + num(sPrev) + ' الأسبوع الماضي)' : '') + ' (A5)');
    if(tTgt > 0 && !(teamPct >= 1)) excluded.push('الشهر حتى ' + dm(W.to) + ': ' + num(tMtd) + ' من ' + num(tTgt) + ' ديناراً = ' + pct(teamPct) + ' من الهدف، وتيرة ' + pct(teamPace) + ' (A3)');
    if(cur.invoices != null && prevW && prevW.invoices != null && cur.invoices < prevW.invoices) excluded.push('الفواتير ' + cur.invoices + ' مقابل ' + prevW.invoices + ' (A5)');
    if(cur.placements != null && prevW && prevW.placements != null && cur.placements < prevW.placements) excluded.push('منتجات جديدة ' + cur.placements + ' مقابل ' + prevW.placements + ' (A5)');
    if(aT > 0 && aV < aT) excluded.push('عيادات الفئة A التي زرناها هذا الشهر: ' + aV + ' من ' + aT + ' (A2)');
    (W.brands || []).filter(function(b){ return b.target > 0 && b.mtd < b.target; }).length && excluded.push('براندات تحت هدفها الشهري (A3)');
    if(mg.over && mg.over.length) excluded.push('فواتير فوق حد الخصم: ' + mg.over.length + ' (A11)');
    var out = { headline: headline, close: headline, also: also, people: people, momentum: momentum, momentumTitle: momentumTitle, wins: winsList, nWins: nWins, newOk: newOk, sold: sold, field: field, month: month, next: next,
      all: items.slice().sort(function(a, b){ return b.score - a.score; }), excluded: excluded, salesLikeForLike: tl, workingDays: wdays,
      cover: headline[0] ? (headline[0].big ? headline[0].big + ' ' : '') + headline[0].headline : null };
    out.pages = weeklyPages(W, out, opts);
    return out;
  }
  // Product lines that share one photo (one family) folded into one entry:
  // familyOf(product) → {key, display} or null (stays on its own). Units and
  // KD add up; clinics are counted once across the family. Pure.
  function foldProducts(products, familyOf){
    var out = [], byKey = {};
    (products || []).forEach(function(p){
      var f = familyOf ? familyOf(p) : null;
      if(!f || !f.key){ out.push({ key: 'p:' + p.product, display: (f && f.display) || p.product, brand: p.brand, members: [p.product], qty: p.qty, net: p.net, accountKeys: (p.accountKeys || []).slice(), first: p.product }); return; }
      var e = byKey[f.key];
      if(!e){ e = byKey[f.key] = { key: f.key, display: f.display || p.product, brand: p.brand, members: [], qty: 0, net: 0, accountKeys: [], first: p.product }; out.push(e); }
      e.members.push(p.product); e.qty += Number(p.qty) || 0; e.net = Math.round((e.net + (Number(p.net) || 0)) * 1000) / 1000;
      (p.accountKeys || []).forEach(function(a){ if(e.accountKeys.indexOf(a) < 0) e.accountKeys.push(a); });
    });
    out.forEach(function(e){ e.accounts = e.accountKeys.length; });
    return out.sort(function(a, b){ return b.net - a.net; });
  }
  // ---- VALUE PER PERSON (the appendix page management reads for raises and
  // commission): for each of the last `months` closed months, per person —
  // ERP net (returns netted), % of the month's own DSR target, the clinic
  // invoices' gross-weighted discount and the share within the limits,
  // returns as a share of sales, new accounts and first-time products, the
  // KPI total, and the commission base: ERP net minus the invoices above
  // their discount limit. null where the files cannot say. Pure.
  function valuePerPerson(data, opts){
    opts = opts || {};
    var reps = opts.reps || [], end = opts.end || data.today, n = opts.months || 3, S = opts.settings || null;
    var KS = {}; Object.keys(KPI_DEFAULTS).forEach(function(k){ KS[k] = KPI_DEFAULTS[k]; });
    Object.keys(S || {}).forEach(function(k){ if(S[k] != null && S[k] !== '') KS[k] = S[k]; });
    var rows = opts.rows || erpAttributedRows(data), byId = {}; (data.clinics || []).forEach(function(c){ byId[c.id] = c; });
    var lastClosed = addDaysStr(end.slice(0, 7) + '-01', -1);
    var T = monthlyTrend(data, { reps: reps, end: lastClosed, months: n, rows: rows, settings: S });
    var rnd = function(x){ return Math.round(x * 1000) / 1000; };
    return { reps: reps, months: T.months.map(function(m){
      var out = { month: m.month, from: m.from, to: m.to, byRep: {} };
      reps.forEach(function(rep){
        var t = m.byRep[rep] || {}, has = t.sales != null;
        var inv = has ? clinicInvoices(rows, [rep], m.from, m.to, byId, KS) : [], ds = discountSummary(inv);
        var ret = 0, sale = 0;
        if(has) rows.forEach(function(x){ if(x.rep !== rep || x.r.date < m.from || x.r.date > m.to) return; if(x.r.type === 'return' || x.r.net < 0) ret += -x.r.net; else sale += x.r.net; });
        var overNet = inv.filter(function(i){ return !i.within; }).reduce(function(a, i){ return a + i.net; }, 0);
        out.byRep[rep] = { sales: has ? t.sales : null, target: t.target || null, pct: has ? t.pct : null,
          discount: has ? ds.discount : null, withinLimit: has ? ds.withinLimit : null, invoices: has ? ds.invoices : null, over: has ? ds.over.length : null,
          returnsPct: has && sale > 0 ? Math.round(ret / sale * 1000) / 10 : null,
          newAccounts: has ? t.newAccounts : null, placements: has ? t.placements : null, kpi: t.kpi != null ? t.kpi : null,
          base: has ? rnd(t.sales - overNet) : null };
      });
      return out; }) };
  }
  // ---- THE PAGES OF THE WEEKLY DECK (money first, then the month and its
  // plan, growth, price, relationships, the people, the commitments) ----
  // From weeklyReport's W and weeklyStory's S: each page's title, figures and
  // Arabic speaker lines, so the deck only lays them out. The money tiles are
  // the same every week whatever the direction (R13); titles choose the true
  // positive framing; activity never carries a title alone (R14); comparison
  // words name their measure (R15); samples are all-free documents (R16).
  // Pure. opts: {presenter, brandName, trend (monthlyTrend), kpi, ask}.
  function weeklyPages(W, S, opts){
    opts = opts || {};
    var reps = W.reps || [], P = W.perRep || {}, bn = opts.brandName || function(b){ return b; }, presenter = opts.presenter || null;
    var KS = W.settings || KPI_DEFAULTS;
    var mi = function(d){ return parseInt(String(d).slice(5, 7), 10) - 1; };
    var dm = function(d){ return parseInt(d.slice(8, 10), 10) + ' ' + STORY_MONTHS[mi(d)]; };
    var dmAr = function(d){ return parseInt(d.slice(8, 10), 10) + ' ' + STORY_MONTHS_AR[mi(d)]; };
    var range = function(a, b){ return a.slice(0, 7) === b.slice(0, 7) ? parseInt(a.slice(8, 10), 10) + '–' + dm(b) : dm(a) + ' – ' + dm(b); };
    var kd = function(n){ return (n < -0.5 ? '−' : '') + 'KD ' + Math.round(Math.abs(n)).toLocaleString('en-US'); };
    var kd2 = function(n){ return 'KD ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var num = function(n){ return Math.round(n).toLocaleString('en-US'); };
    var pct = function(x){ return Math.round(x * 100) + '%'; };
    var pl = function(n, one, many){ return n + ' ' + (n === 1 ? one : many); };
    var cut = function(t, n){ t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    var andList = function(a){ return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; };
    var andAr = function(a){ return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join('، ') + ' و' + a[a.length - 1]; };
    var uniq = function(a){ return a.filter(function(v, i){ return a.indexOf(v) === i; }); };
    var sum = function(a, f){ return a.reduce(function(t, x){ return t + (Number(f(x)) || 0); }, 0); };
    // Arabic counted nouns: 1, 2, 3–10, 11+ take different forms
    var arN = function(n, one, two, few, many){ return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many; };
    var mName = STORY_MONTHS_LONG[mi(W.to)], mAr = STORY_MONTHS_AR[mi(W.to)];
    var day = parseInt(W.to.slice(8, 10), 10), dates = getMonthDates(W.to), dim = dates.length;
    var wdTot = 0, wdDone = 0; dates.forEach(function(d){ if(isWorkday(d)){ wdTot++; if(d <= W.to) wdDone++; } });
    var wdLeft = wdTot - wdDone;
    var TM = opts.trend && opts.trend.months ? opts.trend.months : [];
    var curM = TM.length && TM[TM.length - 1].month === W.to.slice(0, 7) ? TM[TM.length - 1] : null;
    var prevM = curM && TM.length >= 2 ? TM[TM.length - 2] : null, prev2M = curM && TM.length >= 3 ? TM[TM.length - 3] : null;
    var nameOfM = function(m){ return STORY_MONTHS_LONG[mi(m.month + '-01')]; }, arOfM = function(m){ return STORY_MONTHS_AR[mi(m.month + '-01')]; };
    var mx = W.mix || {}, mg = W.margin || {}, mm = W.marginMtd || {}, sat = W.satisfaction || {}, ex = W.expansion || {};
    var fr = W.free || { samples: { docs: 0, accounts: [], gross: 0, list: [] }, deals: { docs: 0, lines: 0, gross: 0, list: [] } };
    var cov = !!W.salesCovered, week = W.team.week;
    var wins = S.wins || [], NA = wins.filter(function(w){ return w.type === 'new'; }), PL = wins.filter(function(w){ return w.type === 'product'; }), BA = wins.filter(function(w){ return w.type === 'back'; });
    var newKd = sum(NA, function(w){ return w.net; }), firstKd = sum(PL, function(w){ return w.net; }), nbKd = Math.round((newKd + firstKd) * 1000) / 1000;
    var withT = reps.filter(function(r){ return P[r] && P[r].target > 0; });
    var tMtd = sum(withT, function(r){ return P[r].mtd; }), tTgt = sum(withT, function(r){ return P[r].target; });
    var nbParts = [], nbAr = [];
    if(NA.length){ nbParts.push(pl(NA.length, 'new account', 'new accounts')); nbAr.push(arN(NA.length, 'حساب جديد', 'حسابان جديدان', 'حسابات جديدة', 'حساباً جديداً')); }
    if(PL.length){ nbParts.push(pl(PL.length, 'first-time product', 'first-time products')); nbAr.push(arN(PL.length, 'منتج يدخل عيادة لأول مرة', 'منتجان يدخلان عيادات لأول مرة', 'منتجات تدخل عيادات لأول مرة', 'منتجاً يدخل عيادات لأول مرة')); }
    if(BA.length){ nbParts.push(BA.length + ' back after 60+ days'); nbAr.push(arN(BA.length, 'حساب عاد بعد انقطاع', 'حسابان عادا بعد انقطاع', 'حسابات عادت بعد انقطاع', 'حساباً عاد بعد انقطاع')); }
    var lim = mg.limits || { A: KS.discountA, other: KS.discountOther, openDay: KS.discountOpenDay };
    var p1 = function(x){ return x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1) + '%'; };
    var limText = 'A clinics ' + lim.A + '% · others ' + lim.other + '%';
    var retMax = Math.round((KS.returnsMax || 0.02) * 100);

    // ======== the week on one page (fixed tiles, R13)
    var money = { covered: cov, salesTo: W.salesTo };
    money.tiles = [
      { key: 'week', big: cov ? kd(week) : '—', label: cov ? 'invoiced ' + range(W.from, W.salesTo || W.to) + ', returns netted' : 'ERP file for this week not in the app yet',
        detail: cov ? pl(mx.invoices || 0, 'invoice', 'invoices') + ' · ' + pl(mx.accounts || 0, 'clinic', 'clinics') + (mx.channelAccounts ? ' · ' + pl(mx.channelAccounts, 'channel account', 'channel accounts') : '') : '' },
      { key: 'month', big: kd(tTgt > 0 ? tMtd : W.team.mtd), label: mName + ' to date' + (tTgt > 0 ? ', of a ' + kd(tTgt) + ' target' : ''),
        detail: 'day ' + day + ' of ' + dim + ' · ' + wdDone + ' of ' + wdTot + ' working days' },
      { key: 'newbiz', big: cov ? kd(nbKd) : '—', label: 'new business this week', detail: cov ? (nbParts.length ? nbParts.join(' + ') : 'none this week · prospects on the new business page') : '' },
      { key: 'price', big: cov && mg.discount != null ? p1(mg.discount) : '—', label: 'average discount, clinic invoices',
        detail: cov && mg.invoices ? mg.within + ' of ' + mg.invoices + ' within limits' + (sat.returnsPct != null ? ' · returns ' + sat.returnsPct + '% (limit ' + retMax + '%)' : '') : '' }];
    var mixParts = [['existing', 'clinics that already buy', 'عيادات تشتري منا'], ['newAccounts', 'new accounts', 'حسابات جديدة'], ['channel', 'My Fatoorah and individual customers', 'My Fatoorah والأفراد'], ['other', 'internal moves', 'حركات داخلية'], ['returns', 'returns', 'مرتجعات']];
    var grossSales = ['existing', 'newAccounts', 'channel', 'other'].reduce(function(t, k){ return t + Math.max(0, mx[k] || 0); }, 0);
    // shares of the sales before returns, so the bar adds up to 100%; returns are their own share of those sales
    money.mix = cov && grossSales > 0 ? mixParts.filter(function(m){ return Math.abs(mx[m[0]] || 0) >= 0.005; }).map(function(m){ return { key: m[0], label: m[1], ar: m[2], kd: mx[m[0]], share: mx[m[0]] / grossSales }; }) : [];
    money.salesBeforeReturns = Math.round(grossSales * 1000) / 1000;
    money.firstTimeKd = mx.firstTime || 0;
    money.concentration = cov && mx.top && mx.top.share >= 0.5 ? mx.top : null;
    money.recon = cov ? 'ERP ' + range(W.from, W.salesTo || W.to) + ': ' + pl(mx.invoices || 0, 'invoice', 'invoices') + ' with value (' + kd2(mx.withValue || 0) + ')' +
      (mx.zeroDocs ? ' + ' + pl(mx.zeroDocs, 'sample document', 'sample documents') + ' (KD 0)' : '') + (mx.returnDocs ? ' + ' + pl(mx.returnDocs, 'return', 'returns') + ' (' + kd2(mx.returnsNet).replace('KD -', '−KD ') + ')' : '') + ' = ' + kd2(week) : 'No ERP sales file covers this week in the app yet';
    money.title = !cov ? 'The week on one page'
      : mg.withinLimit === 1 && mg.invoices >= 2 ? kd(week) + ' invoiced, all clinic invoices within discount limits'
      : nbKd > 0 && week > 0 && nbKd >= 0.2 * week ? kd(week) + ' invoiced; ' + kd(nbKd) + ' of it new business'
      : kd(week) + ' invoiced, ERP to ' + dm(W.salesTo || W.to);
    money.ar = cov ? 'فوترنا هذا الأسبوع ' + num(week) + ' ديناراً حسب ملف الـERP' + (money.mix.length ? ': ' + money.mix.filter(function(m){ return m.kd > 0; }).map(function(m){ return num(m.kd) + ' من ' + m.ar; }).join('، ') : '') + '.'
        + (nbKd > 0 ? ' منها ' + num(nbKd) + ' ديناراً أعمال جديدة.' : '')
        + (mg.withinLimit === 1 && mg.invoices >= 2 ? ' وكل فواتير العيادات ضمن حدود الخصم المعتمدة، بمتوسط ' + mg.discount + '%.' : mg.discount != null ? ' متوسط الخصم ' + mg.discount + '%.' : '')
        + (sat.returnsPct != null ? ' والمرتجعات ' + sat.returnsPct + '% من المبيعات (الحد ' + retMax + '%).' : '')
        + (tTgt > 0 ? ' ووصلنا في ' + mAr + ' إلى ' + num(tMtd) + ' ديناراً من هدف ' + num(tTgt) + '.' : '')
      : 'ملف مبيعات هذا الأسبوع غير موجود في التطبيق بعد.';
    var prevWk = (W.history || []).length > 1 ? W.history[W.history.length - 2] : null;
    money.askedLastWeek = cov && prevWk && prevWk.sales != null ? 'إذا سُئلت عن الأسبوع الماضي: ' + num(prevWk.sales) + ' ديناراً (' + dmAr(prevWk.from) + ' – ' + dmAr(prevWk.to) + ')' +
      (prevWk.from.slice(0, 7) !== prevWk.to.slice(0, 7) ? '، وكان فيه إغلاق شهر ' + STORY_MONTHS_AR[mi(prevWk.from)] + '.' : '.') : '';

    // ======== the closed month (days 1–10)
    var closed = null;
    if(day <= 10 && prevM){
      var cPeople = reps.filter(function(r){ var b = prevM.byRep[r]; return b && b.sales != null && b.target > 0; });
      if(cPeople.length){
        var cKd = sum(cPeople, function(r){ return prevM.byRep[r].sales; }), cTg = sum(cPeople, function(r){ return prevM.byRep[r].target; });
        var pPeople = prev2M ? reps.filter(function(r){ var b = prev2M.byRep[r]; return b && b.sales != null && b.target > 0; }) : [];
        var pKd = sum(pPeople, function(r){ return prev2M.byRep[r].sales; }), pTg = sum(pPeople, function(r){ return prev2M.byRep[r].target; });
        closed = { month: prevM.month, name: nameOfM(prevM), prevName: prev2M ? nameOfM(prev2M) : null, team: { kd: cKd, target: cTg, pct: cKd / cTg, people: cPeople },
          prev: pPeople.length ? { kd: pKd, target: pTg, pct: pKd / pTg, people: pPeople } : null,
          people: reps.map(function(r){ var b = prevM.byRep[r], a = prev2M ? prev2M.byRep[r] : null;
            if(!b || b.sales == null) return { rep: r, noFile: true, first: !!(curM && curM.byRep[r] && curM.byRep[r].sales != null) };
            if(!(b.target > 0)) return { rep: r, kd: b.sales, target: null, pct: null, kpi: b.kpi, noTarget: true, up: false };
            return { rep: r, kd: b.sales, target: b.target, pct: b.pct, kpi: b.kpi, prevKd: a && a.sales != null ? a.sales : null, prevPct: a && a.pct != null ? a.pct : null,
              up: !!(a && a.sales != null && a.pct != null && b.pct != null && b.sales > a.sales && b.pct > a.pct) }; }) };
        closed.title = closed.name + ' closed at ' + pct(closed.team.pct) + ' of target: ' + kd(cKd) + ' of ' + kd(cTg);
        var miss = reps.filter(function(r){ return cPeople.indexOf(r) < 0; });
        closed.basis = 'ERP month totals, returns netted, against each month\'s own DSR target' + (miss.length ? ' · team = ' + andList(cPeople) + ' (no ' + closed.name + ' file for ' + andList(miss) + ')' : '');
        closed.ar = 'أغلقنا ' + arOfM(prevM) + ' عند ' + pct(closed.team.pct) + ' من الهدف: ' + num(cKd) + ' من ' + num(cTg) + ' ديناراً' + (closed.prev ? '، مقابل ' + pct(closed.prev.pct) + ' في ' + arOfM(prev2M) + ' (' + num(pKd) + ' من ' + num(pTg) + ')' : '') + '.'
          + closed.people.filter(function(p){ return p.up; }).map(function(p){ return ' ' + p.rep + ': ' + pct(p.pct) + ' من الهدف بـ' + num(p.kd) + ' ديناراً، أعلى من الشهر الذي قبله في المبلغ والنسبة معاً.'; }).join('');
      }
    }

    // ======== the month: the gap and the plan
    var nx = W.next || {}, aInfo = reps.map(function(r){ return { rep: r, list: (nx[r] && nx[r].aMissingInfo) || [] }; });
    var K = sum(aInfo, function(a){ return a.list.length; }), aKd = sum(aInfo, function(a){ return sum(a.list, function(x){ return x.kd; }); }), booked = sum(aInfo, function(a){ return a.list.filter(function(x){ return x.planned; }).length; });
    var pipeAll = ex.pipeline || [], pipe = pipeAll.filter(function(p){ return p.kind !== 'gov' && p.kind !== 'pharmacy'; });
    var awaiting = (W.fieldOrders || []).filter(function(o){ return !o.invoiced && o.value > 0; }), awKd = sum(awaiting, function(o){ return o.value; });
    var push = (W.brands || []).filter(function(b){ return b.target > 0 && storyGate.material(b.target, tTgt) && b.mtd < b.target && !NON_PRODUCT_RE.test(b.brand); })
      .sort(function(a, b){ return (b.target - b.mtd) - (a.target - a.mtd); }).slice(0, 4);
    var pushKd = sum(push, function(b){ return b.target - b.mtd; });
    var p2 = W.prev2 ? STORY_MONTHS[mi(W.prev2.from)] + '–' + STORY_MONTHS[mi(W.prev2.to)] : '';
    var plan = null, prevTargets = !!(prevM && reps.some(function(r){ return prevM.byRep[r] && prevM.byRep[r].target > 0; }));
    if(tTgt > 0){
      var toGo = Math.max(0, tTgt - tMtd);
      var after = TM.filter(function(m){ return !m.partial && m.month < W.to.slice(0, 7) && m.team.sales > 0 && m.team.sameDays != null; }).slice(-2)
        .map(function(m){ return { month: m.month, name: STORY_MONTHS[mi(m.month + '-01')], share: 1 - m.team.sameDays / m.team.sales, people: reps.filter(function(r){ return m.byRep[r] && m.byRep[r].sales != null; }) }; });
      var levers = [];
      if(K) levers.push({ key: 'key', big: String(K), text: (K === 1 ? 'key account' : 'key accounts') + ' still to visit in ' + mName,
        detail: aInfo.filter(function(a){ return a.list.length; }).map(function(a){ return a.rep + ' ' + a.list.length; }).join(' · ') + (aKd > 0 ? ' · they bought ' + kd(aKd) + ' in ' + p2 : '') + (booked ? ' · ' + booked + ' booked next week' : ''),
        names: [].concat.apply([], aInfo.map(function(a){ return a.list; })).sort(function(x, y){ return y.kd - x.kd; }).slice(0, 5).map(function(x){ return x.name; }),
        ar: arN(K, 'حساب رئيسي واحد لم نزره بعد هذا الشهر', 'حسابان رئيسيان لم نزرهما بعد هذا الشهر', 'حسابات رئيسية لم نزرها بعد هذا الشهر', 'حساباً رئيسياً لم نزرها بعد هذا الشهر') + (aKd > 0 ? '، اشترت منا ' + num(aKd) + ' ديناراً في ' + STORY_MONTHS_AR[mi(W.prev2.from)] + ' و' + STORY_MONTHS_AR[mi(W.prev2.to)] : '') });
      if(pipe.length) levers.push({ key: 'pipeline', big: String(pipe.length), text: (pipe.length === 1 ? 'prospect clinic' : 'prospect clinics') + ' visited this week', detail: 'no invoice since ' + dm(ex.since || W.from) + ' · ' + cut(pipe.slice(0, 3).map(function(p){ return p.clinic; }).join(' · '), 70),
        ar: arN(pipe.length, 'عيادة واحدة', 'عيادتان', 'عيادات', 'عيادة') + ' زرناها هذا الأسبوع ولا تشتري منا بعد' });
      if(awKd > 0) levers.push({ key: 'orders', big: kd(awKd), text: 'taken in the field, awaiting invoice (as logged)', detail: cut(uniq(awaiting.map(function(o){ return o.clinic; })).join(' · '), 70),
        ar: num(awKd) + ' ديناراً طلبات ميدانية تنتظر الفوترة' });
      if(push.length) levers.push({ key: 'brands', big: kd(pushKd), text: 'to go on ' + pl(push.length, 'push brand', 'push brands') + ' this month', detail: push.map(function(b){ return bn(b.brand); }).join(' · '),
        ar: 'العلامات التي نركّز عليها (' + push.length + ') ينقصها ' + num(pushKd) + ' ديناراً لتبلغ أهدافها' });
      plan = { monthName: mName, day: day, dim: dim, workdays: { total: wdTot, done: wdDone, left: wdLeft },
        team: { mtd: tMtd, target: tTgt, pct: tMtd / tTgt, toGo: toGo },
        people: reps.filter(function(r){ return P[r] && (P[r].target > 0 || P[r].mtd > 0); }).map(function(r){ var p = P[r] || {}, b = prevM ? prevM.byRep[r] : null;
          // "first month with a target" only when last month's targets are in the app for others but not for this person
          return { rep: r, mtd: p.mtd || 0, target: p.target || null, pct: p.pct, src: p.mtdSrc, last: b && b.sales != null && b.pct != null ? { kd: b.sales, pct: b.pct } : null, first: !!(prevTargets && !(b && b.target > 0) && p.target > 0) }; }),
        after: after, levers: levers, ask: opts.ask ? cut(String(opts.ask).trim(), 90) : '',
        split: mName + ' targets: ' + withT.map(function(r){ return r + ' ' + num(P[r].target); }).join(' · '),
        perDay: wdLeft > 0 ? toGo / wdLeft : null, pace: day > 0 ? tMtd / tTgt / day * dim : null };
      plan.title = tMtd >= tTgt ? 'The team is past the ' + mName + ' target: ' + kd(tMtd) + ' of ' + kd(tTgt)
        : wdLeft > 0 ? mName + ': ' + kd(toGo) + ' to go in ' + pl(wdLeft, 'working day', 'working days') + ' — the plan' : mName + ': ' + kd(toGo) + ' to go — the plan';
      plan.afterLine = after.length ? 'In ' + andList(after.map(function(a){ return a.name; })) + ', ' + andList(after.map(function(a){ return pct(a.share); })) + ' of the month was invoiced after day ' + day +
        (after[0].people.length < reps.length ? ' (' + andList(after[0].people) + ')' : '') : '';
      plan.ar = 'في اليوم ' + day + ' من ' + mAr + ' فوترنا ' + num(tMtd) + ' ديناراً من هدف ' + num(tTgt) + '، والمتبقي ' + num(toGo) + ' ديناراً في ' + wdLeft + ' يوم عمل.'
        + (after.length ? ' وفي ' + andAr(after.map(function(a){ return STORY_MONTHS_AR[mi(a.month + '-01')]; })) + ' جاءت ' + andAr(after.map(function(a){ return pct(a.share); })) + ' من مبيعات الشهر بعد اليوم ' + day + '.' : '')
        + (levers.length ? ' خطتنا بالأسماء: ' + andAr(levers.map(function(l){ return l.ar; })) + '.' : '');
      plan.notes = (plan.perDay ? 'الحساب الصريح: نحتاج نحو ' + num(plan.perDay) + ' ديناراً في كل يوم عمل متبقٍ.' : '') + (plan.pace != null ? ' الوتيرة الخطية حتى اليوم ' + pct(plan.pace) + ' (A3) — لا نعد برقم، نلتزم بالخطة ونعرض نتيجتها كل خميس.' : '');
    }

    // ======== new business and pipeline
    var newBiz = { kd: nbKd, newKd: newKd, firstKd: firstKd, share: cov && week > 0 ? nbKd / week : null, wins: wins, newAccounts: NA, firstTime: PL, back: BA,
      pipeline: { clinics: pipe, gov: pipeAll.filter(function(p){ return p.kind === 'gov'; }), pharmacy: pipeAll.filter(function(p){ return p.kind === 'pharmacy'; }), since: ex.since || null },
      buying: ex.territory ? { active: ex.active, territory: ex.territory, since: ex.since || null } : null,
      month: ex.newThisMonth ? { newAccounts: ex.newThisMonth.length, placements: ex.placementsThisMonth } : null, prevMonthNew: ex.prevMonthNew || null };
    newBiz.title = S.nWins ? kd(nbKd) + ' new business: ' + nbParts.slice(0, 2).join(', ')
      : newBiz.month && (newBiz.month.newAccounts || newBiz.month.placements) ? pl(newBiz.month.newAccounts, 'new account', 'new accounts') + ' and ' + pl(newBiz.month.placements || 0, 'first-time product', 'first-time products') + ' since 1 ' + mName
      : newBiz.buying && newBiz.buying.active ? 'Expansion: ' + newBiz.buying.active + ' of ' + newBiz.buying.territory + ' clinics in our list buying since ' + dm(newBiz.buying.since || W.from) : 'New business and prospects';
    newBiz.qualifies = !!(S.nWins || pipeAll.length || (newBiz.month && (newBiz.month.newAccounts || newBiz.month.placements)));
    newBiz.ar = S.nWins ? 'أعمال جديدة هذا الأسبوع بقيمة ' + num(nbKd) + ' ديناراً' + (cov && week > 0 ? '، أي ' + pct(nbKd / week) + ' من مبيعات الأسبوع' : '') + ': ' + andAr(nbAr) + '.'
        + NA.map(function(w){ return ' ' + w.account + ' حساب جديد بأول طلب ' + num(w.net) + ' ديناراً (' + w.rep + '، ' + w.doc + ').'; }).join('')
      : (newBiz.month ? 'منذ بداية ' + mAr + ': ' + (newBiz.month.newAccounts || 0) + ' حسابات جديدة و' + (newBiz.month.placements || 0) + ' منتجات تدخل عيادات لأول مرة.' : '');
    if(pipe.length) newBiz.ar += ' وعلى قائمة الفرص ' + arN(pipe.length, 'عيادة واحدة', 'عيادتان', 'عيادات', 'عيادة') + ' زرناها هذا الأسبوع ولم تشترِ منا منذ ' + dmAr(ex.since || W.from) + '، وهي أول ما نتابعه.';

    // ======== what sold and the brands against their targets
    var bw = (W.brands || []).filter(function(b){ return b.week > 0 && !NON_PRODUCT_RE.test(b.brand); }).sort(function(a, b){ return b.week - a.week; });
    var top = bw[0] || null, sampBy = {};
    (fr.samples.list || []).forEach(function(sm){ sm.lines.forEach(function(l){ (sampBy[l.brand] = sampBy[l.brand] || []).push(sm.account); }); });
    var meters = (W.brands || []).filter(function(b){ return b.target > 0 && storyGate.material(b.target, tTgt) && !NON_PRODUCT_RE.test(b.brand); })
      .map(function(b){ return { brand: b.brand, label: bn(b.brand), mtd: b.mtd, target: b.target, toGo: Math.max(0, b.target - b.mtd), week: b.week, prevMonth: b.prevMonth, past: b.mtd >= b.target,
        push: push.indexOf(b) >= 0, samples: uniq(sampBy[b.brand] || []) }; })
      .sort(function(a, b){ return (b.past - a.past) || (a.past ? b.mtd / b.target - a.mtd / a.target : b.toGo - a.toGo); });
    var allBT = sum((W.brands || []).filter(function(b){ return b.target > 0; }), function(b){ return b.target; });
    var brands = { top: top ? { brand: top.brand, label: bn(top.brand), week: top.week, share: week > 0 ? top.week / week : null } : null, items: S.sold ? S.sold.items : [], more: S.sold ? S.sold.more : 0,
      meters: meters, targetsTotal: allBT, teamTarget: tTgt, small: (W.brands || []).filter(function(b){ return b.target > 0 && !storyGate.material(b.target, tTgt); }).length };
    brands.title = top ? bn(top.brand) + (week > 0 && top.week / week >= 0.4 ? ' carried the week: ' : ' led the week: ') + kd(top.week) + ' of our ' + kd(week) : 'Brands against their ' + mName + ' targets';
    brands.qualifies = cov && !!(brands.items.length || meters.length);
    brands.ar = (top ? bn(top.brand) + ' تصدّر الأسبوع بـ' + num(top.week) + ' ديناراً من أصل ' + num(week) + '.' : '')
      + (meters.filter(function(m){ return m.past; }).length ? ' ' + andAr(meters.filter(function(m){ return m.past; }).map(function(m){ return m.label; })) + ' تجاوز هدفه لهذا الشهر.' : '')
      + (push.length ? ' والعلامات التي نركّز عليها (' + andAr(push.map(function(b){ return bn(b.brand); })) + ') ينقصها ' + num(pushKd) + ' ديناراً لتبلغ أهدافها هذا الشهر.' : '');

    // ======== price discipline (never called margin: there are no costs here)
    var fils = mg.gross > 0 ? Math.round(mg.net / mg.gross * 1000) : null;
    var lastDay = function(d){ var ds = getMonthDates(d); return ds[ds.length - 1]; };
    var price = { discount: mg.discount, avgPrev: mg.avgPrev, invoices: mg.invoices || 0, within: mg.within || 0, gross: mg.gross || 0, net: mg.net || 0, fils: fils, limits: lim, limText: limText,
      history: (W.history || []).map(function(h){ return { from: h.from, to: h.to, discount: h.discount, current: !!h.current, monthEnd: h.from.slice(0, 7) !== h.to.slice(0, 7) || h.to === lastDay(h.to) }; }),
      over: mg.over || [], mtd: { invoices: mm.invoices || 0, within: mm.within || 0, withinLimit: mm.withinLimit, discount: mm.discount },
      deals: fr.deals, samples: fr.samples, conversion: W.sampleConversion || null, conversionOk: !!(W.sampleConversion && W.sampleConversion.converted >= 1),
      returns: { week: sat.returnsPct, mtd: sat.returnsPctMtd, max: retMax, kd: sat.returnsKd || 0 } };
    price.title = mg.discount != null && mg.avgPrev != null && mg.invoices >= 2 && mg.discount <= mg.avgPrev - 1 ? 'Average discount down to ' + p1(mg.discount) + ' from ' + p1(mg.avgPrev)
      : mm.withinLimit === 1 && mm.invoices >= 3 && !(mg.withinLimit === 1 && mg.invoices >= 2) ? 'Every ' + mName + ' clinic invoice within the discount limits'
      : fils != null ? 'Of every KD 1 at list price, clinics paid ' + fils + ' fils' : 'Discounts, samples and returns';
    price.qualifies = cov && !!(mg.invoices || fr.samples.docs || sat.returnsPct != null);
    price.ar = (fils != null ? 'من كل دينار بسعر القائمة دفعت العيادات ' + fils + ' فلساً هذا الأسبوع (متوسط الخصم ' + mg.discount + '%' + (mg.avgPrev != null ? ' مقابل ' + mg.avgPrev + '% في الأسابيع السابقة' : '') + ').' : '')
      + (mg.invoices ? (mg.over && mg.over.length ? ' ' + arN(mg.over.length, 'فاتورة واحدة تجاوزت', 'فاتورتان تجاوزتا', 'فواتير تجاوزت', 'فاتورة تجاوزت') + ' حد الخصم، مذكورة بالاسم.' : ' ولم تتجاوز أي فاتورة عيادة حدود الخصم: ' + lim.A + '% لعيادات A و' + lim.other + '% لغيرها.') : '')
      + (fr.deals.gross > 0 ? ' البضاعة المجانية داخل الصفقات ' + num(fr.deals.gross) + ' ديناراً بسعر القائمة، وهي محسوبة ضمن الخصم.' : '')
      + (fr.samples.docs ? ' والعينات ' + arN(fr.samples.docs, 'مستند واحد', 'مستندان', 'مستندات', 'مستنداً') + ' بقيمة ' + num(fr.samples.gross) + ' ديناراً بسعر القائمة إلى ' + andAr(fr.samples.accounts) + '.' : '')
      + (sat.returnsPct != null ? ' والمرتجعات ' + sat.returnsPct + '% من المبيعات هذا الأسبوع' + (sat.returnsPctMtd != null ? ' و' + sat.returnsPctMtd + '% منذ بداية الشهر' : '') + '، والحد ' + retMax + '%.' : '');

    // ======== doctors and clinics (relationships, the clinic base, the field)
    var F = S.field, ln = W.linkage, rep = (sat.repeatAccounts || []), moods = sat.moods || {}, rated = (moods.pleased || 0) + (moods.neutral || 0) + (moods.concerned || 0);
    var base = { field: F, active: ex.active || 0, territory: ex.territory || 0, since: ex.since || null, spread: ex.spread || null, linkage: ln, repeat: rep, gov: (W.team && W.team.govSites) || [],
      requests: { n: sat.requests || 0, onTime: sat.answeredOnTime || 0, open: sat.open || 0 }, moods: { rated: rated, pleased: moods.pleased || 0 },
      newThisMonth: ex.newThisMonth ? ex.newThisMonth.length : null };
    base.title = ln && ln.pct >= 0.5 && ln.clinicNet >= 250 ? pct(ln.pct) + ' of ' + mName + '\'s clinic sales came from clinics we visited'
      : F && rep.length >= 2 ? F.doctors + ' doctors and staff met; ' + rep.length + ' clinics ordered again'
      : base.active ? base.active + ' clinics have bought from us since ' + dm(base.since || W.from)
      : F ? F.clinics + ' clinics visited and ' + F.doctors + ' doctors and staff met' : 'Our clinics';
    base.qualifies = !!(F || base.active);
    base.ar = (F ? 'زرنا هذا الأسبوع ' + arN(F.clinics, 'عيادة واحدة', 'عيادتين', 'عيادات', 'عيادة') + ' وقابلنا ' + F.doctors + ' من الأطباء والعاملين' + (F.followUpClinics ? '، وحددنا موعد متابعة في ' + arN(F.followUpClinics, 'عيادة واحدة', 'عيادتين', 'عيادات', 'عيادة') : '') + '.' : '')
      + (rep.length ? ' وطلبت منا مرة أخرى: ' + andAr(rep.slice(0, 4)) + '.' : '')
      + (base.gov.length ? ' وغطّينا ' + arN(base.gov.length, 'جهة حكومية واحدة', 'جهتين حكوميتين', 'جهات حكومية', 'جهة حكومية') + '.' : '')
      + (base.active ? ' اشترت منا منذ ' + dmAr(base.since || W.from) + ' ' + base.active + ' من أصل ' + base.territory + ' عيادة في قائمتنا.' : '')
      + (ln && ln.clinicNet > 0 ? ' و' + pct(ln.pct) + ' من مبيعات العيادات هذا الشهر جاءت من عيادات زرناها.' : '');

    // ======== the people: the same rows for everyone, money first (R5, R11)
    var K0 = opts.kpi || {}, invAll = (W.wins && W.wins.invoices) || [];
    var people = reps.map(function(r){
      var p = P[r] || {}, row = { rep: r };
      row.money = p.weekCovered ? { big: kd(p.week), line: pl(p.invoicesValue || 0, 'invoice', 'invoices') + ' with value this week' } : { big: '—', line: 'no ERP file for ' + r + ' this week yet' };
      var cRow = closed ? closed.people.filter(function(x){ return x.rep === r; })[0] : null;
      row.month = cRow && !cRow.noFile && !cRow.noTarget ? { text: closed.name + ': ' + kd(cRow.kd) + ' · ' + pct(cRow.pct) + ' of target', up: cRow.up ? 'KD and % both up from ' + closed.prevName : '' }
        : p.mtdSrc && /no ERP sales file|no invoice of this rep/.test(p.mtdSrc) && !(p.mtd > 0) ? { text: p.target ? mName + ' target ' + kd(p.target) + ' · no sales file yet' : 'No ' + mName + ' target in the app', up: '' }
        : { text: mName + ' to date: ' + kd(p.mtd || 0) + (p.target ? ' of ' + kd(p.target) : '') + (cRow && (cRow.noFile || cRow.noTarget) && p.target ? ' (first month with a target)' : ''), up: '' };
      var myNA = NA.filter(function(w){ return w.rep === r; }), myPL = PL.filter(function(w){ return w.rep === r; });
      var myInv = invAll.filter(function(i){ return i.rep === r && !i.channel && !i.internal && i.net >= 100; })[0];
      var met = function(n){ return pl(n, 'doctor or staff member met', 'doctors and staff met'); };
      if(myNA.length) row.signature = { big: kd(myNA[0].net), line: 'New account ' + cut(myNA[0].account, 34) + ': first order', proof: myNA[0].doc, ar: 'حساب جديد هو ' + myNA[0].account + ' بأول طلب ' + num(myNA[0].net) + ' ديناراً' };
      else if(myInv){ var inDoc = myPL.filter(function(w){ return w.doc === myInv.doc; }).length;
        row.signature = { big: kd(myInv.net), line: 'Order at ' + cut(myInv.account, 38) + (inDoc ? ' with ' + pl(inDoc, 'first-time product', 'first-time products') : ''), proof: myInv.doc,
          ar: 'طلب ' + myInv.account + ' بـ' + num(myInv.net) + ' ديناراً' + (inDoc ? ' فيه ' + arN(inDoc, 'منتج جديد للعيادة', 'منتجان جديدان للعيادة', 'منتجات جديدة للعيادة', 'منتجاً جديداً للعيادة') : '') }; }
      else if(myPL.length) row.signature = { big: kd(sum(myPL, function(w){ return w.net; })), line: myPL.length === 1 ? 'First-time product at ' + cut(myPL[0].account, 34) : pl(myPL.length, 'first-time product', 'first-time products') + ' in clinics that already buy', proof: myPL[0].doc,
          ar: arN(myPL.length, 'منتج يدخل ' + myPL[0].account + ' لأول مرة', 'منتجان يدخلان عيادات لأول مرة', 'منتجات تدخل عيادات لأول مرة', 'منتجاً يدخل عيادات لأول مرة') };
      else if(p.fieldVisits) row.signature = { big: String(p.fieldVisits), line: (p.fieldVisits === 1 ? 'clinic visit' : 'clinic visits') + (p.doctorsMet ? ', ' + met(p.doctorsMet) : ''), proof: '', ar: arN(p.fieldVisits, 'زيارة ميدانية واحدة', 'زيارتان ميدانيتان', 'زيارات ميدانية', 'زيارة ميدانية') };
      else row.signature = null;
      row.field = p.fieldVisits ? pl(p.fieldVisits, 'clinic visit', 'clinic visits') + (p.doctorsMet ? ' · ' + met(p.doctorsMet) : '') + (p.joint ? ' · ' + pl(p.joint, 'joint visit', 'joint visits') : '') : (p.calls ? pl(p.calls, 'call', 'calls') + ' logged' : 'no visits logged this week');
      if(row.signature && !row.signature.proof) row.field = p.joint ? pl(p.joint, 'joint visit', 'joint visits') + (p.followUps ? ' · ' + pl(p.followUps, 'follow-up date set', 'follow-up dates set') : '') : (p.followUps ? pl(p.followUps, 'follow-up date set', 'follow-up dates set') : '');   // the signature already says the visits
      var facts = [], dmx = p.discountMtd || {};
      if(dmx.invoices >= 2 && dmx.withinLimit === 1) facts.push((dmx.invoices === 2 ? 'Both clinic invoices' : 'All ' + dmx.invoices + ' clinic invoices') + ' this month within the discount limits');
      if(p.logged >= 3 && p.followUps === p.logged) facts.push('Follow-up date set on all ' + p.logged + ' visits logged');
      if((p.govSites || []).length) facts.push(pl(p.govSites.length, 'government site', 'government sites') + ' visited: ' + cut(p.govSites.join(' · '), 60));
      var hasDisc = facts.length && /discount limits/.test(facts[0]);
      var Kr = K0[r]; if(Kr && Kr.items){ var best = Kr.items.filter(function(it){ return it.score != null && it.score >= 0.85 && it.key !== 'sales' && !(hasDisc && it.key === 'discount'); }).sort(function(a, b){ return b.weight - a.weight || b.score - a.score; })[0];
        if(best) facts.push(best.label + ': ' + pct(best.score) + ' (KPI, month to date)'); }
      row.facts = facts.slice(0, 2);
      row.ar = r + ': ' + (p.weekCovered ? num(p.week) + ' ديناراً هذا الأسبوع' : 'لا يوجد ملف مبيعات لهذا الأسبوع بعد') + (row.signature && row.signature.proof ? '، أبرزها ' + row.signature.ar : '') + '.'
        + (cRow && !cRow.noFile && !cRow.noTarget ? ' ' + arOfM(prevM) + ': ' + pct(cRow.pct) + ' من الهدف' + (cRow.up ? '، أعلى من الشهر الذي قبله في المبلغ والنسبة' : '') + '.' : '');
      return row; });

    // ======== next week, by name, and last week's plan against what was done
    var lp = W.lastPlan, lpN = lp ? lp.planned + lp.followUps : 0, lpD = lp ? lp.plannedDone + lp.followUpsDone : 0;
    var next = { planned: (S.next || {}).planned || 0, followUps: (S.next || {}).followUps || 0, from: W.nextFrom, to: W.nextTo, keyDue: K, booked: booked,
      people: reps.map(function(r){ var n = nx[r] || { planned: [], followUps: [], aMissingInfo: [] }; return { rep: r, planned: n.planned, followUps: n.followUps, keyDue: n.aMissingInfo || [] }; }),
      toInvoice: awaiting, lastPlan: lp, lastPlanOk: !!(lp && lpN >= 3 && lpD / lpN >= 0.7) };
    var nParts = []; if(next.planned) nParts.push(pl(next.planned, 'visit planned', 'visits planned')); if(next.followUps) nParts.push(pl(next.followUps, 'follow-up due', 'follow-ups due'));
    next.title = nParts.length ? 'Next week: ' + nParts.join(' and ') : K ? 'Next week: ' + pl(K, 'key account', 'key accounts') + ' still to visit in ' + mName : 'Next week';
    next.ar = 'الأسبوع القادم: ' + (next.planned ? arN(next.planned, 'زيارة واحدة مخططة', 'زيارتان مخططتان', 'زيارات مخططة', 'زيارة مخططة') : 'لا زيارات محفوظة بعد') + (next.followUps ? ' و' + arN(next.followUps, 'متابعة واحدة مستحقة', 'متابعتان مستحقتان', 'متابعات مستحقة', 'متابعة مستحقة') : '')
      + (K ? '، وأولويتنا ' + arN(K, 'حساب رئيسي واحد لم نزره', 'حسابان رئيسيان لم نزرهما', 'حسابات رئيسية لم نزرها', 'حساباً رئيسياً لم نزرها') + ' هذا الشهر' : '') + '.'
      + (awKd > 0 ? ' ونفوتر طلبات ميدانية بقيمة ' + num(awKd) + ' ديناراً.' : '');

    // ======== the close: three commitments, the optional ask, the recap
    var commits = [];
    if(K) commits.push(booked ? { text: 'Key accounts: ' + booked + ' of the ' + K + ' still due ' + (booked === 1 ? 'is' : 'are') + ' booked for next week; the rest by name', ar: 'الحسابات الرئيسية: ' + booked + ' من ' + K + ' محجوزة للأسبوع القادم، والباقي بالأسماء' }
      : { text: 'Key accounts: book the ' + K + ' still due in ' + mName + ' (names on the next-week page)', ar: 'الحسابات الرئيسية: نحجز الـ' + K + ' المتبقية هذا الشهر بالأسماء' });
    if(next.followUps || pipe.length) commits.push({ text: 'Follow-ups: ' + [next.followUps ? (next.followUps === 1 ? 'the one due next week' : 'the ' + next.followUps + ' due next week') : '', pipe.length ? (pipe.length === 1 ? 'the prospect clinic visited this week' : 'the ' + pipe.length + ' prospect clinics visited this week') : ''].filter(Boolean).join(', plus '),
      ar: 'المتابعات: ' + [next.followUps ? arN(next.followUps, 'متابعة واحدة مستحقة', 'متابعتان مستحقتان', 'متابعات مستحقة', 'متابعة مستحقة') : '', pipe.length ? arN(pipe.length, 'عيادة فرص واحدة', 'عيادتا فرص', 'عيادات فرص', 'عيادة فرص') : ''].filter(Boolean).join(' و') });
    var mny = []; if(awKd > 0) mny.push('invoice the ' + kd(awKd) + ' taken in the field'); if(push.length) mny.push('push ' + andList(push.slice(0, 3).map(function(b){ return bn(b.brand); })));
    if(mny.length) commits.push({ text: mny[0].charAt(0).toUpperCase() + mny[0].slice(1) + (mny[1] ? '; ' + mny[1] : ''), ar: [awKd > 0 ? 'فوترة ' + num(awKd) + ' ديناراً من الطلبات الميدانية' : '', push.length ? 'دفع ' + andAr(push.slice(0, 3).map(function(b){ return bn(b.brand); })) : ''].filter(Boolean).join(' و') });
    var close = { title: 'What you will see from us next Thursday', kicker: 'Our commitments for ' + range(W.nextFrom, addDaysStr(W.nextFrom, 4)), commits: commits.slice(0, 3), ask: opts.ask ? cut(String(opts.ask).trim(), 90) : '',
      recap: 'This week: ' + [cov ? money.tiles[0].big + ' invoiced' : '', cov ? money.tiles[2].big + ' new business' : '', cov && mg.discount != null ? p1(mg.discount) + ' average discount' : '', tTgt > 0 ? kd(tMtd) + ' of ' + kd(tTgt) + ' in ' + mName : ''].filter(Boolean).join(' · ') };
    close.ar = 'التزامنا للأسبوع القادم ونعرض نتيجته يوم الخميس: ' + andAr(close.commits.map(function(c){ return c.ar; })) + '.' + (close.ask ? ' وطلبنا من الإدارة: ' + close.ask + '.' : '');

    // ======== the cover line: money, never the presenter's own sale (R11)
    // the team's new business (the presenter's own part unnamed); when all of
    // it is the presenter's, the week's money leads instead
    var naNP = NA.filter(function(w){ return w.rep !== presenter; }), nbNP = naNP.length + PL.filter(function(w){ return w.rep !== presenter; }).length;
    var cover = !nbNP ? (cov ? money.title : null)
      : naNP.length === 1 && NA.length === 1 ? kd(nbKd) + ' of new business: new account ' + cut(naNP[0].account, 24) + (PL.length ? ' and ' + pl(PL.length, 'first-time product', 'first-time products') : '')
      : kd(nbKd) + ' of new business: ' + nbParts.slice(0, 2).join(' and ');

    // ======== left out of the main pages (the notes say where it is)
    var excluded = [];
    if(plan && plan.pace != null) excluded.push('الوتيرة الخطية للشهر ' + pct(plan.pace) + ' (A3)');
    var H = W.history || [], hc = H[H.length - 1] || {}, hp = H.length > 1 ? H[H.length - 2] : null;
    if(hp && hc.sales != null && hp.sales != null) excluded.push('المبيعات مقابل الأسبوع الماضي: ' + num(hc.sales) + ' مقابل ' + num(hp.sales) + ' (A5)');
    if(hp && hc.invoices != null && hp.invoices != null && hc.invoices < hp.invoices) excluded.push('الفواتير ' + hc.invoices + ' مقابل ' + hp.invoices + ' (A5)');
    if(hp && hc.placements != null && hp.placements != null && hc.placements < hp.placements) excluded.push('المنتجات التي دخلت عيادات لأول مرة ' + hc.placements + ' مقابل ' + hp.placements + ' (A5)');
    if(brands.small) excluded.push('أهداف العلامات الصغيرة (A10)');
    return { money: money, closed: closed, plan: plan, newBiz: newBiz, brands: brands, price: price, base: base, people: people, next: next, close: close, cover: cover ? cut(cover, 70) : null, excluded: excluded, checks: W.checks || [] };
  }
  // The week's achievements for management, strongest first: only things that
  // went well and are true in the figures (a record against the last 8 weeks,
  // growth on last week, brands at target, people on pace, new accounts and
  // products, the biggest invoice, field work). A weak measure is never
  // written here — it stays visible in its own table. Pure; from weeklyReport.
  function weeklyHighlights(w, opts){
    var bn = (opts && opts.brandName) || function(b){ return b; };
    var out = [], H = (w.history || []).filter(function(h){ return h.covered; }), cur = H.length && H[H.length - 1].current ? H[H.length - 1] : null;
    var prev = H.filter(function(h){ return !h.current; });
    var kd = function(n){ return 'KD ' + Math.round(n).toLocaleString('en-US'); };
    var pct = function(x){ return Math.round(x * 100) + '%'; };
    var add = function(score, text){ out.push({ score: score, text: text }); };
    // a record needs at least 3 earlier weeks with a figure for the same measure (a week with no file is no figure)
    var best = function(f){ if(!cur) return false; var v = f(cur), pv = prev.map(f).filter(function(p){ return p != null; }); return v > 0 && pv.length >= 3 && pv.every(function(p){ return v > p; }); };
    var wk = (w.history || []).length;
    // sales against earlier weeks
    if(w.salesCovered && cur){
      if(best(function(h){ return h.sales; })) add(100, 'Best sales week of the last ' + wk + ': ' + kd(cur.sales) + ' invoiced.');
      else if(w.team.prevWeek > 0 && w.team.week > w.team.prevWeek) add(90, 'Sales up ' + pct((w.team.week - w.team.prevWeek) / w.team.prevWeek) + ' on last week: ' + kd(w.team.week) + ' against ' + kd(w.team.prevWeek) + '.');
      else if(prev.length >= 3){ var avg = prev.reduce(function(a, h){ return a + h.sales; }, 0) / prev.length; if(avg > 0 && cur.sales > avg) add(80, kd(cur.sales) + ' invoiced — ' + pct((cur.sales - avg) / avg) + ' above the average of the previous ' + prev.length + ' weeks.'); }
      (w.reps || []).forEach(function(rep){ if(best(function(h){ return h.byRep[rep]; })) add(85, 'Best week of the last ' + wk + ' for ' + rep + ': ' + kd(cur.byRep[rep]) + '.'); });
      if(best(function(h){ return h.accounts; })) add(70, 'Most accounts invoiced in ' + wk + ' weeks: ' + cur.accounts + '.');
      if(best(function(h){ return h.placements; })) add(72, 'Most new product placements in ' + wk + ' weeks: ' + cur.placements + '.');
    }
    // the month
    (w.reps || []).forEach(function(rep){ var p = w.perRep[rep];
      if(p.pct != null && p.pct >= 1) add(95, rep + ' has already reached the month\'s target: ' + pct(p.pct) + ' (' + kd(p.mtd) + ').');
      else if(p.pace != null && p.pace >= 1) add(88, rep + ' is on pace to exceed the month\'s target (' + pct(p.pace) + ').'); });
    var bOk = (w.brands || []).filter(function(b){ return b.target > 0 && b.mtd >= b.target; }).sort(function(a, b){ return b.mtd / b.target - a.mtd / a.target; });
    if(bOk.length) add(87, bOk.length + ' brand' + (bOk.length === 1 ? '' : 's') + ' already at or above the month\'s target: ' + bOk.slice(0, 4).map(function(b){ return bn(b.brand) + ' ' + pct(b.mtd / b.target); }).join(', ') + '.');
    // wins of the week
    var wins = w.wins || { newAccounts: [], reactivated: [], placements: [], samples: [], invoices: [] };
    if(wins.newAccounts.length) add(84, wins.newAccounts.length + ' new account' + (wins.newAccounts.length === 1 ? '' : 's') + ' placed a first order: ' + wins.newAccounts.slice(0, 3).map(function(x){ return x.account; }).join(', ') + (wins.newAccounts.length > 3 ? '…' : '') + '.');
    if(wins.reactivated.length) add(78, wins.reactivated.length + ' account' + (wins.reactivated.length === 1 ? '' : 's') + ' ordering again after 60+ days: ' + wins.reactivated.slice(0, 3).map(function(x){ return x.account; }).join(', ') + '.');
    if(wins.placements.length) add(76, wins.placements.length + ' new product placement' + (wins.placements.length === 1 ? '' : 's') + ' in existing accounts — e.g. ' + wins.placements[0].product + ' at ' + wins.placements[0].account + '.');
    var top = (wins.invoices || []).filter(function(i){ return i.net > 0; });
    if(w.salesCovered && top.length){
      var lead = (w.reps || []).slice().sort(function(a, b){ return w.perRep[b].week - w.perRep[a].week; })[0];
      if(lead && w.perRep[lead].week > 0) add(60, lead + ' led the week with ' + kd(w.perRep[lead].week) + ' invoiced (' + w.perRep[lead].invoices + ' invoice' + (w.perRep[lead].invoices === 1 ? '' : 's') + ').');
      add(58, 'Largest invoice of the week: KD ' + top[0].net.toFixed(2) + ' — ' + top[0].account + ' (' + top[0].rep + ').');
      if(cur && cur.invoices) add(50, cur.invoices + ' invoice' + (cur.invoices === 1 ? '' : 's') + ' to ' + cur.accounts + ' account' + (cur.accounts === 1 ? '' : 's') + ' this week.');
    }
    if(wins.samples.length) add(40, 'Samples placed at ' + wins.samples.length + ' account' + (wins.samples.length === 1 ? '' : 's') + ' to open the next orders.');
    // field work
    var fv = (w.reps || []).reduce(function(a, r){ return a + w.perRep[r].fieldVisits; }, 0), dm = (w.reps || []).reduce(function(a, r){ return a + w.perRep[r].doctorsMet; }, 0);
    if(cur && best(function(h){ return h.fieldVisits; })) add(74, 'Most field visits in ' + wk + ' weeks: ' + fv + '.');
    else if(fv) add(45, fv + ' field visit' + (fv === 1 ? '' : 's') + (dm ? ' and ' + dm + ' doctor' + (dm === 1 ? '' : 's') + ' met' : '') + ' this week.');
    // margin kept, clients served well, the pipeline growing — only when true
    var mg = w.margin;
    if(mg && mg.discount != null && mg.invoices >= 2){
      if(mg.avgPrev != null && mg.discount <= mg.avgPrev - 1) add(82, 'More margin kept: average discount ' + mg.discount + '% against ' + mg.avgPrev + '% over the previous weeks.');
      if(mg.withinLimit === 1) add(71, 'Every invoice within the discount limits (' + mg.invoices + ' invoices, average ' + mg.discount + '%).');
    }
    var sat = w.satisfaction;
    if(sat){
      if(sat.repeatAccounts.length >= 2) add(66, sat.repeatAccounts.length + ' clinics ordered again this week: ' + sat.repeatAccounts.slice(0, 3).join(', ') + (sat.repeatAccounts.length > 3 ? '…' : '') + '.');
      if(sat.requests && sat.answeredOnTime === sat.requests) add(64, 'Every client request answered on time (' + sat.requests + ').');
      var rated = sat.moods.pleased + sat.moods.neutral + sat.moods.concerned;
      if(rated >= 3 && sat.moods.pleased / rated >= 0.6) add(68, 'Doctors pleased on ' + sat.moods.pleased + ' of ' + rated + ' visits rated this week.');
    }
    var ex = w.expansion;
    if(ex){
      if(ex.newThisMonth && ex.newThisMonth.length >= 2) add(75, ex.newThisMonth.length + ' new clinics opened this month so far.');
      if(ex.pipeline.length >= 2) add(52, ex.pipeline.length + ' clinics in the pipeline: visited this week, not buying yet — ' + ex.pipeline.slice(0, 3).map(function(p){ return p.clinic; }).join(', ') + (ex.pipeline.length > 3 ? '…' : '') + '.');
    }
    var aT = (w.reps || []).reduce(function(a, r){ return a + w.perRep[r].aTotal; }, 0), aV = (w.reps || []).reduce(function(a, r){ return a + w.perRep[r].aVisited; }, 0);
    if(aT && aV) add(aV === aT ? 73 : 35, (aV === aT ? 'Every key (A) account visited this month: ' : 'Key (A) accounts visited this month: ') + aV + ' of ' + aT + '.');
    return out.sort(function(a, b){ return b.score - a.score; }).map(function(x){ return x.text; });
  }
  // The last day the uploaded sales files cover in the current month (null = none).
  // With a rep: only files that carry that rep's salesman — a file exported
  // for one salesman says nothing about the others' sales.
  function erpMonthCovered(data, rep){
    var today = data.today, mStart = today.slice(0, 7) + '-01', out = null;
    erpPeriodsOf(data.erpSales).forEach(function(p){
      if(!(p.to >= mStart && p.from <= today)) return;
      if(rep && p.repMap && Object.keys(p.repMap).length && !Object.keys(p.repMap).some(function(sm){ return p.repMap[sm] === rep; })) return;
      var to = p.to > today ? today : p.to;
      if(!out || to > out) out = to;
    });
    return out;
  }
  // The month's achieved figure for one rep. Owner's rule: the ERP sales
  // files are the ONLY measure of achievement (every invoice line of the
  // rep's salesman, day by day). The DSR supplies the targets only — per
  // brand, per rep and for the team — and its achieved column is never used.
  function monthAchievement(rep, data, mtdMap){
    var em = (mtdMap || erpMtd(data))[rep];
    if(em && em.amount != null){
      return { amount: em.amount, src: 'ERP to ' + fmtDate(em.covered) + (em.complete ? '' : ' (partial month)'), asOf: em.covered, basis: 'erp', complete: em.complete, alt: null };
    }
    var covered = erpMonthCovered(data, rep);
    if(covered) return { amount: 0, src: 'ERP to ' + fmtDate(covered), asOf: covered, basis: 'erp', complete: true, alt: null }; // files cover the month, no invoice for this rep yet
    var other = erpMonthCovered(data);
    if(other) return { amount: 0, src: 'no invoice of this rep in the ERP files uploaded (to ' + fmtDate(other) + ')', asOf: null, basis: 'erp', complete: false, alt: null }; // files exist, but none carries this rep's salesman
    return { amount: 0, src: 'no ERP sales file for this month yet', asOf: null, basis: 'none', complete: false, alt: null };
  }
  function teamAchievement(reps, data){
    var mtd = erpMtd(data), rows = [];
    (reps || []).forEach(function(r){ var t = (data.targets || {})[r] || {}; if(t.revenue > 0) rows.push({ rep: r, goal: t.revenue, ach: monthAchievement(r, data, mtd).amount }); });
    var goal = rows.reduce(function(s, x){ return s + x.goal; }, 0), ach = rows.reduce(function(s, x){ return s + (x.ach || 0); }, 0);
    return { n: rows.length, goal: Math.round(goal * 100) / 100, ach: Math.round(ach * 100) / 100, pct: goal > 0 ? Math.round(ach / goal * 100) : null, rows: rows };
  }

  // ---- Daily e-mail digest (morning / evening), pure ----
  // Returns { subject, text, html } for one recipient: a rep (her own day) or
  // the supervisor (the team). Arabic, figures and names as they are.
  function dailyDigest(opts){
    var kind = opts.kind === 'evening' ? 'evening' : 'morning';
    var data = opts.data, today = data.today, reps = opts.reps || [], forRep = opts.rep || null;
    var mtd = erpMtd(data);
    var dayName = new Date(today + 'T00:00:00').toLocaleDateString('ar-KW-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
    var clinicName = function(id){ var c = (data.clinics || []).find(function(x){ return x.id === id; }); return c ? c.name : id; };
    var entryId = function(e){ return typeof e === 'string' ? e : e.id; };
    var entryNote = function(e){ return typeof e === 'string' ? '' : (e.note || ''); };
    var tomorrow = (function(){ var d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + 1); return localDateStr(d); })();
    var plansOf = function(rep, date){ var dObj = (data.dayPlans || {})[date] || {}; return (dObj[rep] || []).map(function(e){ return { id: entryId(e), note: entryNote(e) }; }); };
    var visitsToday = (data.visits || []).filter(function(v){ return v.date === today; });
    var targetLine = function(rep){
      var t = (data.targets || {})[rep] || {};
      if(!(t.revenue > 0)) return null;
      var a = monthAchievement(rep, data, mtd), pct = Math.round(a.amount / t.revenue * 100);
      var m = today.slice(0, 7), stale = (t.month || (t.achievedAsOf ? t.achievedAsOf.slice(0, 7) : m)) < m;
      var dim = getMonthDates(today).length, day = parseInt(today.slice(8, 10), 10), left = dim - day;
      var pace = day > 0 ? Math.round(a.amount / day * dim / t.revenue * 100) : null;
      return { rep: rep, pct: pct, amount: a.amount, goal: t.revenue, src: a.src, asOf: a.asOf, stale: stale, left: left, pace: pace, alt: a.alt, why: a.why, basis: a.basis };
    };
    var repBlock = function(rep){
      var b = { rep: rep, target: targetLine(rep) };
      b.plan = plansOf(rep, today);
      b.planTomorrow = plansOf(rep, tomorrow);
      var mine = (data.clinics || []).filter(function(c){ return c.rep === rep && c.cls !== 'Closed'; });
      b.overdue = mine.filter(function(c){ return followStatus(c.nextFollowUp, today) === 'overdue'; }).map(function(c){ return { name: c.name, date: c.nextFollowUp }; });
      b.dueToday = mine.filter(function(c){ return followStatus(c.nextFollowUp, today) === 'today'; }).map(function(c){ return { name: c.name }; });
      b.missed = missedPlans(data.dayPlans, data.visits, today, { daysBack: 14 }).filter(function(x){ return x.rep === rep; }).map(function(x){ return { name: clinicName(x.clinicId), date: x.date }; });
      b.tasks = (data.tasks || []).filter(function(t){ return t.rep === rep && !t.done && t.dueDate && t.dueDate <= today; }).map(function(t){ return { text: t.text, date: t.dueDate }; });
      var tv = visitsToday.filter(function(v){ return v.rep === rep || v.withRep === rep; });
      var field = dedupeVisits(tv.filter(isFieldVisit)).unique;
      var led = tv.filter(function(v){ return v.rep === rep; });
      b.today = {
        visits: field.length, calls: led.filter(function(v){ return v.callOnly; }).length, phoneOrders: led.filter(function(v){ return v.orderOnly; }).length,
        orders: led.filter(function(v){ return v.orderTaken; }).length, sales: Math.round(led.reduce(function(s, v){ return s + (v.orderTotal || 0); }, 0) * 100) / 100,
        contacts: field.reduce(function(s, v){ return s + contactCount(v); }, 0),
        clinics: field.map(function(v){ return clinicName(v.clinicId) + (v.orderTaken ? ' (' + money(v.orderTotal) + ')' : ''); }),
        reasons: led.filter(function(v){ return !v.orderTaken && v.noOrderReason; }).map(function(v){ return v.noOrderReason; }),
        followUps: led.filter(function(v){ return v.nextFollowUp; }).map(function(v){ return clinicName(v.clinicId) + ' → ' + fmtDate(v.nextFollowUp); }),
      };
      var visitedIds = {}; tv.forEach(function(v){ visitedIds[v.clinicId] = 1; });
      b.planDone = b.plan.filter(function(e){ return visitedIds[e.id]; }).length;
      b.planMissedToday = b.plan.filter(function(e){ return !visitedIds[e.id]; }).map(function(e){ return clinicName(e.id); });
      return b;
    };
    var blocks = (forRep ? [forRep] : reps).map(repBlock);
    var team = forRep ? null : teamAchievement(reps, data);
    var kd = function(n){ return money(n); };
    var esc = function(x){ return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var L = [], H = [];
    var h = function(t){ L.push(''); L.push('■ ' + t); H.push('<h3 style="margin:18px 0 6px;font-size:15px;color:#0b3d2e;">' + esc(t) + '</h3>'); };
    var li = function(items, empty){
      if(!items.length){ L.push('  ' + empty); H.push('<div style="color:#6b7280;">' + esc(empty) + '</div>'); return; }
      items.forEach(function(x){ L.push('  • ' + x); });
      H.push('<ul style="margin:4px 0;padding-inline-start:20px;">' + items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    };
    var p = function(t){ L.push(t); H.push('<div style="margin:4px 0;">' + esc(t) + '</div>'); };
    var tLine = function(t){
      if(!t) return 'لا يوجد تارغت مبيعات لهذا الشهر';
      var s = t.rep + ': ' + t.pct + '% — ' + kd(t.amount) + ' من ' + kd(t.goal) + ' (المصدر: ' + t.src + ')';
      if(t.basis === 'none') s = t.rep + ': لا يوجد ملف مبيعات ERP لهذا الشهر بعد — التارغت ' + kd(t.goal);
      if(t.stale) s += ' ⚠️ التارغت من شهر سابق — ارفع DSR الشهر الجديد';
      else if(t.pace != null) s += ' · على هذا الإيقاع تصل إلى ' + t.pace + '% بنهاية الشهر · متبقٍ ' + t.left + ' يوم';
      return s;
    };
    var title = kind === 'morning' ? 'ملخص الصباح' : 'ملخص نهاية اليوم';
    var subject = 'UltraMed · ' + title + ' · ' + dayName + (forRep ? ' · ' + forRep : ' · الفريق');
    p(title + ' — ' + dayName);
    if(team){
      h('تحقيق الفريق');
      p(team.n ? 'الفريق: ' + (team.pct == null ? '—' : team.pct + '%') + ' — ' + kd(team.ach) + ' من ' + kd(team.goal) + ' (' + team.n + ' مندوبات)' : 'لا يوجد تارغت مبيعات لهذا الشهر — ارفع ملف DSR');
      blocks.forEach(function(b){ p(tLine(b.target)); });
    }
    blocks.forEach(function(b){
      var who = forRep ? '' : b.rep + ' — ';
      if(kind === 'morning'){
        if(forRep){ h('التارغت'); p(tLine(b.target)); }
        h(who + 'خطة اليوم (' + b.plan.length + ')');
        li(b.plan.map(function(e){ return clinicName(e.id) + (e.note ? ' — ' + e.note : ''); }), 'لا توجد زيارات مخططة لليوم');
        h(who + 'متابعات اليوم والمتأخرة');
        li(b.dueToday.map(function(c){ return c.name + ' — اليوم'; }).concat(b.overdue.map(function(c){ return c.name + ' — متأخرة منذ ' + fmtDate(c.date); })), 'لا توجد متابعات مستحقة');
        if(b.missed.length){ h(who + 'زيارات مخططة لم تتم (آخر 14 يومًا)'); li(b.missed.map(function(x){ return x.name + ' — كانت ' + fmtDate(x.date); }), ''); }
        if(b.tasks.length){ h(who + 'مهام مستحقة'); li(b.tasks.map(function(t){ return t.text + ' — ' + fmtDate(t.date); }), ''); }
      } else {
        h(who + 'حصيلة اليوم');
        p('زيارات ميدانية: ' + b.today.visits + ' · مكالمات: ' + b.today.calls + ' · طلبات هاتفية: ' + b.today.phoneOrders + ' · طلبات: ' + b.today.orders + ' · مبيعات مسجلة: ' + kd(b.today.sales) + ' · أشخاص قابلتهم: ' + b.today.contacts);
        li(b.today.clinics, 'لم تُسجَّل أي زيارة اليوم');
        h(who + 'الخطة مقابل الواقع');
        p('مخطط: ' + b.plan.length + ' · تمت: ' + b.planDone + (b.planMissedToday.length ? ' · لم تتم: ' + b.planMissedToday.join('، ') : ''));
        if(b.today.reasons.length){ h(who + 'أسباب عدم الطلب'); li(b.today.reasons, ''); }
        if(b.today.followUps.length){ h(who + 'متابعات جُدولت اليوم'); li(b.today.followUps, ''); }
        if(forRep){ h('التارغت بعد اليوم'); p(tLine(b.target)); }
        h(who + 'خطة الغد (' + b.planTomorrow.length + ')');
        li(b.planTomorrow.map(function(e){ return clinicName(e.id) + (e.note ? ' — ' + e.note : ''); }), 'لا توجد خطة للغد بعد — خططي الآن من التطبيق');
      }
    });
    L.push(''); L.push('— UltraMed Field Ops · تقرير آلي');
    var html = '<div dir="rtl" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:640px;margin:0 auto;padding:16px;">'
      + '<div style="font-weight:800;font-size:17px;color:#0b3d2e;margin-bottom:4px;">UltraMed · ' + esc(title) + '</div>'
      + H.join('') + '<div style="margin-top:20px;color:#6b7280;font-size:12px;">UltraMed Field Ops · تقرير آلي</div></div>';
    return { subject: subject, text: L.join('\n'), html: html, blocks: blocks, team: team };
  }
  // ---- Visits storage: one small LIVE document for the current month plus
  // one ARCHIVE document per past month ----
  // Everything used to sit in one cloud document, which has a hard 1 MB cap
  // and grows with every visit and photo thumbnail — the same wall the sales
  // file hit. The app still holds ONE in-memory list; these helpers decide
  // which document each visit lives in and put the pieces back together.
  var VISITS_ARCH_PREFIX = 'visitsArch:';
  function visitMonth(v){ var d = v && v.date; return (typeof d === 'string' && /^\d{4}-\d{2}/.test(d)) ? d.slice(0, 7) : null; }
  function visitsArchKey(month){ return VISITS_ARCH_PREFIX + month; }
  // Where a visit belongs: 'live' for the current month (and any visit with
  // no usable date, or dated in the future by mistake), else its month.
  function visitHome(v, today){ var m = visitMonth(v); return (!m || m >= String(today).slice(0, 7)) ? 'live' : m; }
  function visitsPartition(visits, today){
    var live = [], months = {};
    (visits || []).forEach(function(v){
      if(!v) return;
      var h = visitHome(v, today);
      if(h === 'live') live.push(v); else (months[h] = months[h] || []).push(v);
    });
    return { live: live, months: months };
  }
  // Live + archives → one list. A visit can sit in two documents for a moment
  // (its date was edited before the old document was tidied): keep the copy
  // that lives where its date says it belongs, else the live copy.
  function visitsAssemble(live, archives, today){
    var out = [], at = {}, docAt = [];
    var take = function(v, doc){
      if(!v) return;
      if(v.id == null){ out.push(v); docAt.push(doc); return; }
      var i = at[v.id];
      if(i === undefined){ at[v.id] = out.length; out.push(v); docAt.push(doc); return; }
      var prevAtHome = visitHome(out[i], today) === docAt[i];
      var thisAtHome = visitHome(v, today) === doc;
      if(thisAtHome && !prevAtHome){ out[i] = v; docAt[i] = doc; } // else the first copy (live is read first) stays
    };
    (live || []).forEach(function(v){ take(v, 'live'); });
    Object.keys(archives || {}).sort().forEach(function(m){ (archives[m] || []).forEach(function(v){ take(v, m); }); });
    return out;
  }
  // Ids a document should shed: they are stored, per the local partition, in
  // ANOTHER document that is confirmed to hold them (`storedIn` = id → doc key
  // as last read or written). Nothing is ever dropped from a document unless
  // its new home provably has it.
  function visitsStrayIds(docKey, docArr, homeById, storedHas){
    var stray = [];
    (docArr || []).forEach(function(v){
      if(!v || v.id == null) return;
      var home = homeById[v.id];
      if(!home || home === docKey) return;
      if(storedHas(home, v.id)) stray.push(v.id);
    });
    return stray;
  }
  // Every sheet of a workbook that holds people, merged and de-duplicated.
  function parseContactWorkbook(sheets, specialties, opts){
    var all = [], perSheet = [], skipped = 0;
    var clinics = (opts && opts.clinics) || [];
    (sheets || []).forEach(function(sh){
      if(isClinicRepSheet(sh.rows)){ perSheet.push({ sheet: sh.name, contacts: 0, error: 'CLINIC_LIST' }); return; }
      var r = parseContactRows(sh.rows, specialties, opts);
      if(r.error){ perSheet.push({ sheet: sh.name, contacts: 0, error: r.error }); return; }
      r.contacts.forEach(function(c){ c.sheet = sh.name; });
      all = all.concat(r.contacts); skipped += r.skipped;
      perSheet.push({ sheet: sh.name, contacts: r.contacts.length });
    });
    var merged = dedupeContacts(all, clinics.length ? function(hint, area){ var m = matchClinicHint(hint, area, clinics); return m.clinicId || null; } : null);
    return { contacts: merged, perSheet: perSheet, skipped: skipped, duplicates: all.length - merged.length,
      error: merged.length ? null : (all.length ? 'NO_ROWS' : 'NO_HEADER') };
  }
  // A sheet listing clinics with their rep ("Account | Rep | Location") tells
  // the importer who a brand-new clinic belongs to. {normalized name → rep}.
  function clinicRepHeader(rows){
    for(var i = 0; i < Math.min((rows || []).length, 10); i++){
      var r = rows[i] || [], nameC = -1, repC = -1, locC = -1;
      for(var c = 0; c < r.length; c++){
        var h = String(r[c] || '').trim();
        if(nameC < 0 && /^(account|clinic|clinic name|customer|اسم العيادة|العيادة|الحساب)$/i.test(h)) nameC = c;
        else if(repC < 0 && /^(rep|representative|salesman|مندوب|المندوبة|المندوب)$/i.test(h)) repC = c;
        else if(locC < 0 && LOCATION_HDR.test(h)) locC = c;
      }
      if(nameC >= 0 && repC >= 0) return { at: i, nameC: nameC, repC: repC, locC: locC };
    }
    return null;
  }
  function isClinicRepSheet(rows){ return !!clinicRepHeader(rows); }
  function parseClinicRepSheet(sheets, reps){
    var map = {}, areas = {};
    (sheets || []).forEach(function(sh){
      var rows = sh.rows || [], hd = clinicRepHeader(rows);
      if(!hd) return;
      for(var j = hd.at + 1; j < rows.length; j++){
        var row = rows[j] || [], nm = String(row[hd.nameC] || '').trim(), rp = String(row[hd.repC] || '').trim();
        if(!nm || !rp) continue;
        var g = guessRepMap([rp], reps)[rp];
        if(!g) continue;
        var key = normClinicName(normClinicHint(nm));
        if(key && !map[key]) map[key] = g;
        if(hd.locC >= 0 && key && !areas[key] && String(row[hd.locC] || '').trim()) areas[key] = String(row[hd.locC]).trim();
      }
    });
    return { reps: map, areas: areas };
  }
  // ---- CLINIC DISTRIBUTION FILE (who owns which clinic) ----
  // Reads a sheet listing accounts and their owner: an "Account / Clinic"
  // column and a "Now with / New rep / Owner" column (never the "Previous"
  // one). Header rows may repeat (one block per person); total rows are
  // skipped. "Mariam + Ghaith" = a SHARED account (first name keeps the
  // clinic on her list; invoices count for whoever issues them).
  function distributionHeader(row){
    var accC = -1, ownC = -1, prevC = -1;
    for(var j = 0; j < (row || []).length; j++){
      var h = String(row[j] == null ? '' : row[j]).toLowerCase().trim();
      if(!h) continue;
      if(/prev|old|before|سابق/.test(h)){ if(prevC < 0) prevC = j; continue; }
      if(accC < 0 && /^(account|clinic|customer|العميل|العيادة|الحساب)/.test(h)) accC = j;
      else if(ownC < 0 && /now with|new rep|new owner|^owner|assigned|^with\b|^rep\b|المندوب الحالي|أصبحت مع|مع من/.test(h)) ownC = j;
    }
    return accC >= 0 && ownC >= 0 ? { accC: accC, ownC: ownC, prevC: prevC } : null;
  }
  function parseDistribution(sheets, reps){
    var out = { rows: [], badOwners: [], error: null }, seen = {};
    (sheets || []).forEach(function(sh){
      var hd = null;
      (sh.rows || []).forEach(function(row){
        var h = distributionHeader(row);
        if(h){ hd = h; return; }
        if(!hd) return;
        // another table's header (a summary block) ends the distribution table
        if((row || []).some(function(v){ return /^(accounts?|clinics?|customers?|name)$/i.test(String(v == null ? '' : v).trim()); })){ hd = null; return; }
        var acct = String(row[hd.accC] == null ? '' : row[hd.accC]).replace(/\s+/g, ' ').trim();
        var own = String(row[hd.ownC] == null ? '' : row[hd.ownC]).trim();
        if(!acct || !/[A-Za-z؀-ۿ]/.test(acct) || /total/i.test(acct) || /total/i.test(String(row[0] || ''))) return;
        if(!own || /^[—\-–]+$/.test(own)) return;
        var names = own.split(/\s*(?:\+|&|\/|,|،|\band\b|\sو\s)\s*/i).map(function(x){ return x.trim(); }).filter(Boolean);
        var map = guessRepMap(names, reps), owners = [];
        names.forEach(function(n){ var r = map[n]; if(r && owners.indexOf(r) < 0) owners.push(r); });
        if(!owners.length){ out.badOwners.push({ account: acct, owner: own }); return; }
        var key = acct.toLowerCase();
        if(seen[key]) return; seen[key] = 1;
        out.rows.push({ account: acct, owners: owners, shared: owners.length > 1, prev: hd.prevC >= 0 ? String(row[hd.prevC] || '').trim() : '' });
      });
    });
    if(!out.rows.length && !out.badOwners.length) out.error = 'NO_DISTRIBUTION';
    return out;
  }
  // Matches each distribution row to app clinics and returns the plan:
  // exact names (or the ERP name map) first, then the branch-aware hint
  // matcher, then a whole branch family ("Aline Dental Centers" → every Aline
  // branch); a pharmacy is only taken when the account says pharmacy, and a
  // clinic named exactly by one row is never swept up by another's family.
  function planDistribution(dist, clinics, erpMap, since){
    var live = (clinics || []).filter(function(c){ return c && c.cls !== 'Closed'; });
    var key = function(x){ return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
    var byName = {}; live.forEach(function(c){ (byName[key(c.name)] = byName[key(c.name)] || []).push(c.id); });
    var claimed = {}, found = {};
    dist.rows.forEach(function(r, i){
      var ids = (byName[key(r.account)] || []).slice();
      var v = erpMap && erpMap[r.account];
      if(!ids.length && v && v.charAt(0) !== '@' && live.some(function(c){ return c.id === v; })) ids = [v];
      if(ids.length){ found[i] = { ids: ids, how: 'exact' }; ids.forEach(function(id){ claimed[id] = i; }); }
    });
    var isPh = function(n){ return /pharmac|صيدلية/i.test(n || ''); };
    var toks = function(n){ return normClinicName(n).split(' ').filter(Boolean); };
    var sub = function(a, b){ return a.length && a.every(function(t){ return b.indexOf(t) >= 0; }); };
    dist.rows.forEach(function(r, i){
      if(found[i]) return;
      var wantsPh = isPh(r.account), free = live.filter(function(c){ return claimed[c.id] == null && isPh(c.name) === wantsPh; });
      // A group account ("Aline Dental Centers", "NHC - Dr. Nael Al Hazeem
      // Dental Centers") covers every branch whose name holds all its words;
      // any other account must carry exactly the same words as one clinic, so
      // "Dr.Teeth … Shaab" never lands on the Mangaf branch.
      var group = /\b(centers|centres|clinics|branches)\b/i.test(r.account) || /^\s*[A-Z]{2,5}\s*-\s*/.test(r.account);
      var ht = toks(r.account.replace(/\b(centers|centres|clinics|branches)\b/ig, '').replace(/^\s*[A-Z]{2,5}\s*-\s*/, ''));
      var hits = free.filter(function(c){ var ct = toks(c.name); return group ? sub(ht, ct) : (sub(ht, ct) && sub(ct, ht)); });
      if(!hits.length){
        // Only a near name ("Meena Dental" for "Meena Dental Speciality
        // Center"): never moved on a guess — fine if it is already right,
        // otherwise listed for a manual look.
        var GEN = ['hospital', 'moh', 'care', 'services', 'service', 'speciality', 'specialty', 'ph', 'health', 'centre', 'polyclinic'];
        var dh = ht.filter(function(t){ return GEN.indexOf(t) < 0; });
        var near = free.filter(function(c){ var ct = toks(c.name); return (sub(ht, ct) || sub(ct, ht)) && dh.some(function(t){ return ct.indexOf(t) >= 0; }); });
        if(near.length && near.every(function(c){ return c.rep === r.owners[0] && !!c.shared === r.shared; })) found[i] = { ids: near.map(function(c){ return c.id; }), how: 'near' };
        else if(near.length) found[i] = { ids: [], how: 'ambiguous', candidates: near.map(function(c){ return c.name; }) };
        return;
      }
      var oneFamily = hits.every(function(c){ return c.rep === hits[0].rep; });
      if(hits.length === 1 || (group && oneFamily)){
        found[i] = { ids: hits.map(function(c){ return c.id; }), how: hits.length > 1 ? 'family' : 'match' };
        hits.forEach(function(c){ claimed[c.id] = i; });
      } else found[i] = { ids: [], how: 'ambiguous', candidates: hits.map(function(c){ return c.name; }) };
    });
    var plan = { changes: [], same: [], missing: [], ambiguous: [] };
    dist.rows.forEach(function(r, i){
      var f = found[i];
      if(!f || !f.ids.length){ (f && f.how === 'ambiguous' ? plan.ambiguous : plan.missing).push({ account: r.account, owners: r.owners, shared: r.shared, candidates: f && f.candidates }); return; }
      f.ids.forEach(function(id){
        var c = live.find(function(x){ return x.id === id; });
        var to = r.owners[0], wasShared = !!c.shared;
        var item = { account: r.account, clinicId: id, clinic: c.name, from: c.rep || '', to: to, shared: r.shared, wasShared: wasShared, how: f.how, owners: r.owners };
        if(c.rep === to && wasShared === r.shared && (!r.shared || JSON.stringify(c.sharedWith || []) === JSON.stringify(r.owners))) plan.same.push(item); else plan.changes.push(item);
      });
    });
    plan.since = since;
    return plan;
  }
  // Applies a plan to the clinic list in place (the same handover rule as a
  // manual reassignment: from `since`, earlier lines stay with the previous
  // owner). Returns the number of clinics changed.
  function applyDistributionPlan(plan, clinics, reps){
    var n = 0, since = plan.since;
    plan.changes.forEach(function(ch){
      var c = (clinics || []).find(function(x){ return x.id === ch.clinicId; });
      if(!c) return;
      var prev = c.rep;
      if(prev !== ch.to){
        if(prev && (reps || []).indexOf(prev) >= 0){
          if(c.prevRep && c.repSince === since && c.prevRep !== ch.to){ /* changed again within the month: keep the first previous owner */ }
          else if(c.prevRep && c.repSince === since && c.prevRep === ch.to){ c.prevRep = null; c.repSince = null; }
          else { c.prevRep = prev; c.repSince = since; }
        }
        c.rep = ch.to;
      }
      if(ch.shared && !c.shared){ c.shared = true; c.sharedSince = since; }
      if(ch.shared) c.sharedWith = (ch.owners || [ch.to]).slice(); // who covers it (government coverage counts for each)
      if(!ch.shared && c.shared){ c.shared = false; c.sharedSince = null; c.sharedWith = null; }
      n++;
    });
    return n;
  }
  // A clinic hint from a sheet → app clinic, branch-aware: a tie between
  // branches is settled by the contact's area, and a dental hint never lands
  // on the clinic's pharmacy.
  function fullTokens(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ').split(/\s+/).filter(Boolean); }
  function matchClinicHint(hint, area, clinics){
    var h = normClinicHint(hint);
    if(!h || !hintSaysSomething(h)) return { clinicId: null, method: 'none' };
    var m = matchCustomer(h, clinics, {});
    if(!m.clinicId && !m.ambiguous){
      // "Royal Hayat" → "Royale Hayat Hospital": rare words that nearly match, unique winner only
      var hd0 = distinctiveTokens(h);
      if(hd0.length){
        var near = function(t, u){ return t === u || (t.length >= 4 && u.length >= 4 && (u.indexOf(t) >= 0 || t.indexOf(u) >= 0)) || (t.length >= 5 && u.length >= 5 && levenshtein(t, u) <= 1); };
        var hits = [];
        clinics.forEach(function(c){
          var cd0 = distinctiveTokens(c.name);
          var n = hd0.filter(function(t){ return cd0.some(function(u){ return near(t, u); }); }).length;
          if(n && n * 2 >= hd0.length) hits.push({ id: c.id, n: n });
        });
        var top = hits.filter(function(x){ return x.n === Math.max.apply(null, hits.map(function(y){ return y.n; })); });
        if(top.length === 1) m = { clinicId: top[0].id, channel: false, method: 'near' };
      }
    }
    // "Kuwait Hospital" must not land on "International Hospital" just because both say hospital
    if(m.clinicId && (m.method === 'token' || m.method === 'fuzzy')){
      var cl = clinics.find(function(x){ return x.id === m.clinicId; });
      var hd = distinctiveTokens(h), cd = distinctiveTokens(cl ? cl.name : '');
      var shared = hd.filter(function(t){ return cd.some(function(u){ return u === t || (t.length >= 4 && u.length >= 4 && (u.indexOf(t) >= 0 || t.indexOf(u) >= 0)); }); });
      if(!shared.length) return { clinicId: null, method: 'none' };
    }
    var pool = null;
    if(m.clinicId && m.method === 'family' && m.family){
      var fam = clinicFamilies(clinics).fams[m.family];
      pool = fam ? fam.ids.slice() : null;
    } else if(m.ambiguous && m.candidates) pool = m.candidates.slice();
    if(pool && pool.length > 1){
      var wantsPharmacy = /pharmac|صيدلية/i.test(String(hint));
      var noPh = pool.filter(function(id){ var c = clinics.find(function(x){ return x.id === id; }); return c && !/pharmac|صيدلية/i.test(c.name); });
      if(!wantsPharmacy && noPh.length && noPh.length < pool.length) pool = noPh;
      var at = normClinicName(area || '').split(' ').filter(function(t){ return t.length >= 3; });
      if(at.length && pool.length > 1){
        var byArea = pool.filter(function(id){
          var c = clinics.find(function(x){ return x.id === id; });
          var ct = normClinicName(c ? c.name : '').split(' ');
          return at.some(function(a){ return ct.some(function(t){ return t.length >= 3 && (t.indexOf(a) >= 0 || a.indexOf(t) >= 0); }); });
        });
        if(byArea.length) pool = byArea;
      }
      if(pool.length > 1){                           // "Gulf Clinic" vs "Gulf Medical Service": count every word, not just the rare ones
        var ht = fullTokens(h), best = -1, bestIds = [];
        pool.forEach(function(id){ var c = clinics.find(function(x){ return x.id === id; }); var ct = fullTokens(c ? c.name : ''); var ov = ht.filter(function(t){ return ct.indexOf(t) >= 0; }).length; if(ov > best){ best = ov; bestIds = [id]; } else if(ov === best) bestIds.push(id); });
        if(bestIds.length === 1 && best > 0) pool = bestIds;
      }
      if(pool.length === 1) return { clinicId: pool[0], method: 'branch' };
      if(m.clinicId) return m;                       // family head when the area does not settle it
      return { clinicId: null, ambiguous: true, candidates: pool, method: 'ambiguous' };
    }
    return m;
  }
  function clinicDisplayName(hint){
    var t = normClinicHint(hint).replace(/\s+/g, ' ').trim();
    return t.split(' ').map(function(w){ return /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase() === w ? w : w; }).join(' ');
  }
  // ==== DOCTOR CRM ====
  // One flat analytics row per doctor across the visible clinics: visit
  // history (from visits that tagged them), follow-up cadence status
  // (weekly/monthly/quarterly), birthday countdown, handover totals
  // (prescriptions / samples / gifts logged against the doctor), and the
  // doctor's clinic ERP figures — so one screen tracks the person, the
  // paper and the money together.
  var CADENCE_DAYS = { weekly: 7, monthly: 30, quarterly: 90 };
  function daysBetween(a, b){ return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function daysToBirthday(birthday, today){
    if(!birthday) return null;
    var md = String(birthday).slice(5); // MM-DD works for full dates and '--MM-DD'
    if(!/^\d{2}-\d{2}$/.test(md)) return null;
    var y = +today.slice(0, 4);
    var next = y + '-' + md;
    if(next < today) next = (y + 1) + '-' + md;
    return daysBetween(today, next);
  }
  function handoverTotals(handovers, today){
    var t = { prescription: 0, sample: 0, gift: 0, other: 0,
      rxWeek: 0, rxLastWeek: 0, rxMonth: 0, rxLastMonth: 0, count: (handovers || []).length, last: null };
    var wkStart = (function(){ var d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); })();
    var wkPrev = (function(){ var d = new Date(wkStart + 'T00:00:00'); d.setDate(d.getDate() - 7); return localDateStr(d); })();
    var mStart = today.slice(0, 7) + '-01';
    var pm = new Date(mStart + 'T00:00:00'); pm.setMonth(pm.getMonth() - 1);
    var pmStart = localDateStr(pm);
    (handovers || []).forEach(function(h){
      var kind = t[h.kind] != null ? h.kind : 'other';
      var q = h.qty > 0 ? h.qty : 1;
      t[kind] += q;
      if(!t.last || h.date > t.last) t.last = h.date;
      if(h.kind === 'prescription'){
        if(h.date >= wkStart) t.rxWeek += q;
        else if(h.date >= wkPrev) t.rxLastWeek += q;
        if(h.date >= mStart) t.rxMonth += q;
        else if(h.date >= pmStart) t.rxLastMonth += q;
      }
    });
    return t;
  }
  function doctorAnalytics(opts){
    var today = opts.today, out = [];
    var vis = dedupeVisits(opts.visits || []).unique;
    (opts.clinics || []).forEach(function(c){
      if(opts.repFilter && opts.repFilter !== 'all' && c.rep !== opts.repFilter) return;
      (c.doctors || []).forEach(function(d){
        // Every doctor picked on the visit counts — the multi-select list when
        // present, else the legacy single doctorId — so a two-doctor visit
        // shows in BOTH doctors' reports and old records aren't lost.
        var dv = vis.filter(function(v){
          if(v.clinicId !== c.id) return false;
          var ids = (Array.isArray(v.doctorIds) && v.doctorIds.length) ? v.doctorIds : (v.doctorId ? [v.doctorId] : []);
          return ids.indexOf(d.id) >= 0;
        });
        var dates = dv.map(function(v){ return v.date; }).sort();
        var lastVisit = dates.length ? dates[dates.length - 1] : null;
        var cadence = CADENCE_DAYS[d.cadence] ? d.cadence : null;
        var overdueDays = null, cadenceStatus = 'none';
        if(cadence){
          var since = lastVisit ? daysBetween(lastVisit, today) : null;
          if(since == null){ cadenceStatus = 'due'; overdueDays = CADENCE_DAYS[cadence]; }
          else if(since > CADENCE_DAYS[cadence]){ cadenceStatus = 'due'; overdueDays = since - CADENCE_DAYS[cadence]; }
          else cadenceStatus = 'ok';
        }
        out.push({
          id: d.id, name: d.name, title: d.title || '', clinicId: c.id, clinicName: c.name,
          rep: c.rep || '', phone: d.phone || '', birthday: d.birthday || '', notes: d.notes || '',
          cadence: cadence, cadenceStatus: cadenceStatus, overdueDays: overdueDays,
          lastVisit: lastVisit, fieldVisits: dv.filter(isFieldVisit).length,
          calls: dv.filter(function(v){ return v.callOnly; }).length,
          birthdayIn: daysToBirthday(d.birthday, today),
          handovers: handoverTotals(d.handovers, today),
          visitLog: dv.sort(function(a, b){ return b.date.localeCompare(a.date); }),
        });
      });
    });
    return out;
  }
  // ==== DOCTOR RECORDS: who is who inside a clinic, and what to do about it ====
  // The card a rep fills per doctor. Role = their job in the clinic; influence
  // = their weight in the buying decision; stage = where the relationship is.
  var DOC_ROLES = [
    ['owner', 'Owner'], ['partner', 'Partner'], ['dentist', 'Dentist (employed)'], ['hygienist', 'Hygienist'],
    ['manager', 'Clinic manager'], ['procurement', 'Procurement / purchasing'], ['reception', 'Reception'], ['other', 'Other']
  ];
  var DOC_INFLUENCE = [['decider', 'Decision maker'], ['influencer', 'Influencer'], ['user', 'User only'], ['gatekeeper', 'Gatekeeper']];
  var DOC_STAGES = [['new', 'Not met yet'], ['met', 'Met once'], ['warm', 'Warm'], ['champion', 'Champion'], ['blocked', 'Blocked']];
  var RECORD_FIELDS = ['title', 'role', 'influence', 'stage', 'phone'];
  function doctorRecordCompleteness(d){
    var missing = RECORD_FIELDS.filter(function(f){ return !(d && d[f]); });
    return { pct: Math.round((RECORD_FIELDS.length - missing.length) / RECORD_FIELDS.length * 100), missing: missing };
  }
  // The clinic's decision map: who decides, who influences, who is on our side
  // or against us — plus the gaps in what we know and the rep's next step.
  // opts.analytics = doctorAnalytics rows for this clinic (for last-visit dates).
  function clinicDecisionMap(c, opts){
    opts = opts || {};
    var today = opts.today || null, last = {};
    (opts.analytics || []).forEach(function(a){ last[a.id] = a.lastVisit; });
    var docs = (c && c.doctors) || [];
    var by = function(k, v){ return docs.filter(function(d){ return d[k] === v; }); };
    var names = function(arr, max){ max = max || 3; var n = arr.map(function(d){ return d.name; }); return n.slice(0, max).join(', ') + (n.length > max ? ' +' + (n.length - max) : ''); };
    var deciders = by('influence', 'decider'), influencers = by('influence', 'influencer'), gatekeepers = by('influence', 'gatekeeper');
    var champions = by('stage', 'champion'), blocked = by('stage', 'blocked'), unmet = by('stage', 'new'), metOnce = by('stage', 'met');
    var unknown = docs.filter(function(d){ return !d.influence || !d.role; });
    var noPhone = docs.filter(function(d){ return !d.phone; });
    var gaps = [], steps = [];
    var res = { deciders: deciders, influencers: influencers, gatekeepers: gatekeepers, champions: champions, blocked: blocked, unknown: unknown, noPhone: noPhone, gaps: gaps, steps: steps, total: docs.length };
    if(!docs.length){
      gaps.push('No doctors recorded yet — add who works here and who decides.');
      steps.push('Ask reception for the doctors\' names and who signs the orders.');
      return res;
    }
    if(!deciders.length) gaps.push('No decision maker identified — find out who signs the orders (owner or manager).');
    if(unknown.length) gaps.push(unknown.length + ' doctor' + (unknown.length === 1 ? '' : 's') + ' with unknown role or influence: ' + names(unknown));
    if(noPhone.length) gaps.push(noPhone.length + ' without a phone number: ' + names(noPhone));
    deciders.forEach(function(d){
      var lv = last[d.id];
      if(d.stage === 'blocked'){
        var ally = champions.concat(influencers).filter(function(x){ return x.id !== d.id && x.stage !== 'blocked'; })[0];
        steps.push(d.name + ' (decision maker) is blocked — win over ' + (ally ? ally.name : 'an influencer') + ' first and let them open the door.');
      } else if(d.stage === 'new' || (!lv && d.stage !== 'champion')){
        steps.push('Meet the decision maker ' + d.name + ' — no visit with them yet.');
      } else if(lv && today && daysBetween(lv, today) >= 45){
        steps.push('Decision maker ' + d.name + ' not seen for ' + daysBetween(lv, today) + ' days — visit before the next order cycle.');
      }
    });
    champions.forEach(function(d){
      var other = deciders.filter(function(x){ return x.id !== d.id && x.stage !== 'champion'; })[0];
      steps.push(other ? 'Ask ' + d.name + ' (champion) to introduce you to ' + other.name + '.'
                       : 'Ask ' + d.name + ' (champion) for a prescription or a referral to another clinic.');
    });
    blocked.filter(function(d){ return d.influence !== 'decider'; }).forEach(function(d){
      var via = influencers.concat(gatekeepers, champions).filter(function(x){ return x.id !== d.id && x.stage !== 'blocked'; })[0];
      steps.push('Do not push ' + d.name + ' — work through ' + (via ? via.name : 'another contact') + ' instead.');
    });
    metOnce.forEach(function(d){ steps.push('Second visit for ' + d.name + ' within two weeks — bring samples.'); });
    var unmetOthers = unmet.filter(function(d){ return d.influence !== 'decider'; });
    if(unmetOthers.length) steps.push('Still to meet: ' + names(unmetOthers) + '.');
    if(!steps.length && !gaps.length) steps.push('Decision map complete — keep the champion warm and the decision maker informed.');
    return res;
  }

  // Prescriptions distributed — the growth view: weekly and monthly counts
  // per DOCTOR and per CLINIC (center), with growth vs the previous period.
  function rxGrowth(opts){
    var docs = doctorAnalytics(opts);
    var pct = function(cur, prev){ return prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0); };
    var byDoctor = docs.filter(function(d){ return d.handovers.prescription > 0; }).map(function(d){
      return { name: d.name, clinicName: d.clinicName, rep: d.rep,
        week: d.handovers.rxWeek, lastWeek: d.handovers.rxLastWeek, weekGrowth: pct(d.handovers.rxWeek, d.handovers.rxLastWeek),
        month: d.handovers.rxMonth, lastMonth: d.handovers.rxLastMonth, monthGrowth: pct(d.handovers.rxMonth, d.handovers.rxLastMonth),
        total: d.handovers.prescription };
    }).sort(function(a, b){ return b.month - a.month || b.total - a.total; });
    var byClinicMap = {};
    docs.forEach(function(d){
      if(!(d.handovers.prescription > 0)) return;
      var a = byClinicMap[d.clinicId] || (byClinicMap[d.clinicId] = { name: d.clinicName, rep: d.rep, week: 0, lastWeek: 0, month: 0, lastMonth: 0, total: 0, doctors: 0 });
      a.week += d.handovers.rxWeek; a.lastWeek += d.handovers.rxLastWeek;
      a.month += d.handovers.rxMonth; a.lastMonth += d.handovers.rxLastMonth;
      a.total += d.handovers.prescription; a.doctors++;
    });
    var byClinic = Object.keys(byClinicMap).map(function(k){
      var a = byClinicMap[k];
      a.weekGrowth = pct(a.week, a.lastWeek); a.monthGrowth = pct(a.month, a.lastMonth);
      return a;
    }).sort(function(a, b){ return b.month - a.month || b.total - a.total; });
    var sum = function(list, f){ return list.reduce(function(s2, x){ return s2 + x[f]; }, 0); };
    return { byDoctor: byDoctor, byClinic: byClinic,
      totals: { week: sum(byDoctor, 'week'), lastWeek: sum(byDoctor, 'lastWeek'),
        weekGrowth: pct(sum(byDoctor, 'week'), sum(byDoctor, 'lastWeek')),
        month: sum(byDoctor, 'month'), lastMonth: sum(byDoctor, 'lastMonth'),
        monthGrowth: pct(sum(byDoctor, 'month'), sum(byDoctor, 'lastMonth')),
        total: sum(byDoctor, 'total') } };
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
  function erpTotals(rows, opts){
    var isEx = (opts && opts.isExchange) || function(){ return false; };
    var t = { net: 0, gross: 0, sret: 0, lines: 0, invoices: {}, returns: {}, bySalesman: {}, from: null, to: null };
    (rows || []).forEach(function(r){
      t.net += r.net; t.gross += r.gross;
      if(isEx(r)) t.exchanged = Math.round(((t.exchanged || 0) + returnValue(r)) * 1000) / 1000;
      else t.sret += returnValue(r);
      t.lines++;
      (r.type === 'return' ? t.returns : t.invoices)[r.doc] = 1;
      var s = t.bySalesman[r.salesman] || (t.bySalesman[r.salesman] = { net: 0, sret: 0, lines: 0 });
      s.net += r.net; s.sret += returnValue(r); s.lines++;
      if(!t.from || r.date < t.from) t.from = r.date;
      if(!t.to || r.date > t.to) t.to = r.date;
    });
    t.invoiceCount = Object.keys(t.invoices).length;
    t.returnCount = Object.keys(t.returns).length;
    return t;
  }
  // ==== RETURNS OF EARLIER INVOICES ====
  // A return document names the invoice it reverses in its remarks
  // ("Philip SINV0076017"). When that invoice belongs to an earlier month,
  // the ERP still deducts the return in the month it was booked — so a rep's
  // new month opens with last month's goods coming back. The 'origin' policy
  // moves such returns to the month of the original invoice instead.
  function erpRefFromRemarks(text){
    var m = String(text || '').match(/S\s*INV\s*[-#:]?\s*(\d{4,})/i);
    return m ? 'SINV' + m[1] : null;
  }
  function erpDocNo(doc){ var m = String(doc || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : null; }
  // Context across every stored row: when each invoice was issued, and the
  // lowest invoice number seen in each month (an earlier number = an earlier month).
  function returnContext(rows){
    var invoiceDates = {}, minNo = {};
    (rows || []).forEach(function(r){
      if(r.type !== 'invoice' || !r.date) return;
      if(!invoiceDates[r.doc] || r.date < invoiceDates[r.doc]) invoiceDates[r.doc] = r.date;
      var n = erpDocNo(r.doc), mo = r.date.slice(0, 7);
      if(n != null && (minNo[mo] == null || n < minNo[mo])) minNo[mo] = n;
    });
    return { invoiceDates: invoiceDates, minNo: minNo };
  }
  // {prior, date, known} for a return that reverses an earlier month's invoice; null otherwise.
  function returnOrigin(r, ctx){
    if(!r || r.type !== 'return' || !r.ref || !ctx) return null;
    var mo = String(r.date || '').slice(0, 7);
    var d = ctx.invoiceDates[r.ref];
    if(d) return d.slice(0, 7) < mo ? { prior: true, date: d, known: true } : { prior: false, date: d, known: true };
    var n = erpDocNo(r.ref), mn = ctx.minNo[mo];
    if(n != null && mn != null && n < mn){
      var prev = new Date(mo + '-01T00:00:00'); prev.setDate(0); // last day of the month before
      return { prior: true, date: localDateStr(prev), known: false };
    }
    return null;
  }
  // policy 'origin': prior-invoice returns are re-dated to the original invoice's
  // month (its exact date when known, else the last day of the month before).
  // policy 'erp' (or anything else): rows unchanged, as the ERP reports them.
  function applyReturnPolicy(rows, policy, ctx){
    if(policy !== 'origin') return rows || [];
    ctx = ctx || returnContext(rows);
    return (rows || []).map(function(r){
      var o = returnOrigin(r, ctx);
      if(!o || !o.prior) return r;
      var c = {}; for(var k in r) c[k] = r[k];
      c.origDate = r.date; c.date = o.date; c.priorReturn = true; c.originKnown = o.known;
      return c;
    });
  }

  // The heart of the evaluation: ERP invoices vs app visits, per app rep.
  // opts: {rows, visits, clinics, erpMap, repMap, from, to}
  function reconcileErp(opts){
    var isExRec = (opts && opts.isExchange) || function(){ return false; };
    var rows = (opts.rows || []).filter(function(r){ return inRange(r.date, opts.from, opts.to); });
    var repMap = opts.repMap || {};
    var clinics = opts.clinics || [];
    var dd = dedupeVisits(filterVisitsByRange(opts.visits, opts.from, opts.to));
    var out = { perRep: [], unmatchedCustomers: [], window: { from: opts.from, to: opts.to } };
    var attr = function(r){ return erpRowRep(r, clinics, opts.erpMap, repMap); };
    var reps = {};
    rows.forEach(function(r){ var rep = attr(r); if(rep) reps[rep] = 1; });
    dd.unique.forEach(function(v){ if(v.rep) reps[v.rep] = 1; if(v.withRep) reps[v.withRep] = 1; });
    var unmatchedSet = {};
    Object.keys(reps).sort().forEach(function(rep){
      var erpRows = rows.filter(function(r){ return attr(r) === rep; });
      // A visit means a FIELD visit, and a joint attendee is credited too —
      // so calls/remote orders never fake a visit→invoice link, and a joint
      // rep's real visit isn't flagged as "invoiced with no visit".
      var appVisits = dd.unique.filter(function(v){ return repWasThere(v, rep) && isFieldVisit(v); });
      var byCust = {};
      erpRows.forEach(function(r){
        var c = byCust[r.customer] || (byCust[r.customer] = { net: 0, sret: 0, docs: {} });
        c.net += r.net; c.sret += returnValue(r); c.docs[r.doc] = 1;
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
          returns: Math.round(erpRows.reduce(function(s, r){ return s + (isExRec(r) ? 0 : returnValue(r)); }, 0) * 1000) / 1000,
          exchanged: Math.round(erpRows.reduce(function(s, r){ return s + (isExRec(r) ? returnValue(r) : 0); }, 0) * 1000) / 1000,
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

  // ---- Doctors: one person, one record ----
  // The same doctor was reaching a clinic's list several times (typed twice,
  // added from two devices, imported with a different "Dr." prefix), and
  // several names typed in one box became one "doctor". These helpers give
  // every screen a single rule for what counts as the same person.
  function normDoctorName(s){
    return String(s || '').toLowerCase()
      .replace(/\b(dr|doctor|prof|professor|mr|mrs|ms)\.?\s*/g, ' ')
      .replace(/(^|\s)(الدكتورة|الدكتور|دكتورة|دكتور|أ\.د\.?|د\.?)(?=\s|$)\s*/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }
  // "Dr. Ahmed, Dr. Sara / د. نور و د. علي" → four names. (No \b: JavaScript
  // word boundaries do not understand Arabic letters — a standalone "و" is
  // one surrounded by spaces.)
  function splitDoctorNames(input){
    return String(input || '').split(/\s*(?:,|،|;|\/|&|\n|\+|\s+و\s+|\band\b)\s*/i)
      .map(function(s){ return s.trim(); }).filter(function(s){ return normDoctorName(s); });
  }
  // Collapse duplicates by normalized name. The first record survives and
  // absorbs any field the duplicate had filled (title, phone, birthday,
  // cadence, notes, handovers). Returns the merged list and {lostId: keptId}.
  function dedupeDoctors(list){
    var out = [], byName = {}, remap = {};
    (list || []).forEach(function(d){
      if(!d || typeof d !== 'object') return;
      var key = normDoctorName(d.name);
      if(!key){ out.push(d); return; }
      var keep = byName[key];
      if(!keep){ byName[key] = d; out.push(d); return; }
      ['title', 'phone', 'birthday', 'cadence'].forEach(function(f){ if(!keep[f] && d[f]) keep[f] = d[f]; });
      if(d.notes && (keep.notes || '').indexOf(d.notes) < 0) keep.notes = keep.notes ? keep.notes + ' · ' + d.notes : d.notes;
      if(Array.isArray(d.handovers) && d.handovers.length) keep.handovers = (keep.handovers || []).concat(d.handovers);
      if(d.id != null && d.id !== keep.id) remap[d.id] = keep.id;
    });
    return { doctors: out, remap: remap };
  }
  // Union of two devices' doctor lists for the same clinic: by id first, then
  // by person — nothing either side added is lost, nobody appears twice.
  function mergeDoctorLists(local, cloud){
    var have = {};
    var merged = (local || []).filter(Boolean).slice();
    merged.forEach(function(d){ have[d.id] = 1; });
    (cloud || []).forEach(function(d){ if(d && d.id != null && !have[d.id]){ merged.push(d); have[d.id] = 1; } });
    return dedupeDoctors(merged);
  }

  // ---- ERP sales storage split ----
  // Every uploaded period's rows used to sit inside ONE cloud document. A
  // month of invoice lines is ~250 KB, so that document grew past what a
  // phone can read or write inside the app's save timeouts (and towards the
  // cloud's hard 1 MB document cap) — imports then silently never landed.
  // Now the index document keeps only the light period headers; each
  // period's packed rows live in their own chunk documents, addressed by
  // period id + revision (the revision changes whenever the rows do).
  var ERP_CHUNK_ROWS = 1200;
  var ERP_CHUNK_BYTES = 350000; // JSON bytes per chunk document — a third of the cloud's 1 MB cap
  function erpRowsKey(p){ return 'erpRows:' + p.id + ':' + (p.rev || 0); }
  // Rows → chunk arrays bounded by BOTH row count and JSON size, so a future
  // export with long remarks or product names can never push one document
  // past the cloud's limit. Always yields at least one (possibly empty) chunk.
  function erpChunkRows(rows, chunkRows, chunkBytes){
    chunkRows = chunkRows || ERP_CHUNK_ROWS; chunkBytes = chunkBytes || ERP_CHUNK_BYTES;
    var chunks = [], cur = [], bytes = 2;
    for(var i = 0; i < rows.length; i++){
      var len = JSON.stringify(rows[i]).length + 1;
      if(cur.length && (cur.length >= chunkRows || bytes + len > chunkBytes)){ chunks.push(cur); cur = []; bytes = 2; }
      cur.push(rows[i]); bytes += len;
    }
    chunks.push(cur);
    return chunks;
  }
  // In-memory sales (periods carry rows) → {index, docs:{chunkKey: rows[]}}.
  // A period whose rows could not be read (rowsMissing) keeps its stored
  // reference untouched and emits no documents: its chunks stay in the cloud
  // for the next successful read, and are never overwritten with nothing.
  function erpSplitForStorage(sales, chunkRows, chunkBytes){
    var index = Object.assign({}, sales || {}, { periods: [] });
    var docs = {};
    ((sales && sales.periods) || []).forEach(function(p){
      if(!p) return;
      var head;
      if(p.rowsMissing && p.rowsRef){
        head = Object.assign({}, p); delete head.rows; delete head.rowsMissing;
        index.periods.push(head);
        return;
      }
      var rows = Array.isArray(p.rows) ? p.rows : [];
      var key = erpRowsKey(p);
      var parts = erpChunkRows(rows, chunkRows, chunkBytes);
      for(var i = 0; i < parts.length; i++) docs[key + ':' + i] = parts[i];
      head = Object.assign({}, p, { rowsRef: { key: key, chunks: parts.length, count: rows.length } });
      delete head.rows; delete head.rowsMissing;
      index.periods.push(head);
    });
    return { index: index, docs: docs };
  }
  // Every chunk key an index references (nothing for legacy inline rows).
  function erpChunkKeys(index){
    var keys = [];
    ((index && index.periods) || []).forEach(function(p){
      if(!p || !p.rowsRef) return;
      if(Array.isArray(p.rows) && !p.rowsMissing) return; // legacy inline rows need no chunks; a missing period (rows:[]) does
      for(var i = 0; i < (p.rowsRef.chunks || 0); i++) keys.push(p.rowsRef.key + ':' + i);
    });
    return keys;
  }
  // Index + chunk docs {key: rows[]} → in-memory sales. A period whose chunks
  // could not be read comes back with rows:[] and rowsMissing:true (listed in
  // `missing`) so the caller can refuse to save over it. Legacy periods that
  // still carry rows inline pass straight through.
  function erpAssemble(index, docs){
    docs = docs || {};
    var sales = Object.assign({ periods: [] }, index || {}, { periods: [] });
    var missing = [];
    ((index && index.periods) || []).forEach(function(p){
      if(!p) return;
      if(Array.isArray(p.rows) && !(p.rowsMissing && p.rowsRef)){ sales.periods.push(p); return; }
      var ref = p.rowsRef, rows = [], ok = !!ref;
      if(ref){
        for(var i = 0; i < (ref.chunks || 0); i++){
          var part = docs[ref.key + ':' + i];
          if(!Array.isArray(part)){ ok = false; break; }
          rows = rows.concat(part);
        }
        if(ok && ref.count != null && rows.length !== ref.count) ok = false;
      }
      var q = Object.assign({}, p, { rows: ok ? rows : [] });
      if(ok) delete q.rowsMissing; else { q.rowsMissing = true; missing.push(p.id); }
      sales.periods.push(q);
    });
    return { sales: sales, missing: missing };
  }
  // Merge-on-save for the index: two devices can each import a file. A
  // period the cloud has and we do not is kept — unless it was deliberately
  // replaced or deleted (a tombstone in `removed`, from either side). On a
  // shared id the HIGHER revision wins (every change to a period's rows bumps
  // its rev), ties go to local. Periods taken from the cloud arrive as bare
  // headers (`added` counts them) — the caller must fetch their rows.
  // Tombstones expire after 60 days so the index never grows without bound.
  function erpMergeIndex(local, cloud, now){
    now = now || Date.now();
    var out = Object.assign({}, local || {});
    var removed = Object.assign({}, (cloud && cloud.removed) || {}, (local && local.removed) || {});
    Object.keys(removed).forEach(function(id){ if(!(removed[id] > now - 60 * 86400000)) delete removed[id]; });
    var cloudById = {};
    ((cloud && cloud.periods) || []).forEach(function(p){ if(p && p.id != null) cloudById[p.id] = p; });
    var have = {}, added = 0, periods = [];
    ((local && local.periods) || []).forEach(function(p){
      if(!p || removed[p.id]) return;
      var c = cloudById[p.id];
      if(c && (c.rev || 0) > (p.rev || 0) && !Array.isArray(c.rows)){ periods.push(c); added++; }
      else periods.push(p);
      have[p.id] = 1;
    });
    ((cloud && cloud.periods) || []).forEach(function(p){
      if(!p || have[p.id] || removed[p.id]) return;
      periods.push(p); have[p.id] = 1; added++;
    });
    out.periods = periods;
    out.removed = removed;
    // who-is-who: per name, the most recent decision wins (repMapAt stamps;
    // an unstamped entry counts as oldest; ties go to local)
    var lm = (local && local.repMapGlobal) || {}, cm = (cloud && cloud.repMapGlobal) || {};
    var la = (local && local.repMapAt) || {}, ca = (cloud && cloud.repMapAt) || {};
    var repMap = {}, repMapAt = {};
    Object.keys(cm).forEach(function(k){ repMap[k] = cm[k]; if(ca[k]) repMapAt[k] = ca[k]; });
    Object.keys(lm).forEach(function(k){
      var mine = la[k] || 0, theirs = ca[k] || 0;
      if(!(k in cm) || mine >= theirs){ repMap[k] = lm[k]; if(mine) repMapAt[k] = mine; }
    });
    out.repMapGlobal = repMap;
    out.repMapAt = repMapAt;
    out.seeds = Object.assign({}, (cloud && cloud.seeds) || {}, (local && local.seeds) || {});
    // chunk documents nobody references any more, with the moment they were
    // first seen orphaned (the earliest sighting wins) — deleted only later
    var orphans = Object.assign({}, (local && local.orphans) || {});
    Object.keys((cloud && cloud.orphans) || {}).forEach(function(k){ var c = cloud.orphans[k]; if(!(orphans[k] <= c)) orphans[k] = c; });
    out.orphans = orphans;
    return { merged: out, added: added };
  }
  // Global overlap invariant: for one salesman and one calendar day there is
  // exactly ONE uploaded period — the most recently IMPORTED file wins. Every
  // import enforces this on the device that imports; enforcing it again after
  // every merge with the cloud means two devices importing overlapping files,
  // or an index write that landed after the app had given up on it, can never
  // double-count a day. Precedence is importedAt (immutable), so bumping a
  // period's revision when its rows are stripped never reorders anything and
  // the pass is idempotent. Older overlapping periods lose the winner's
  // salesmen over the winner's date span; a period left with no rows is
  // tombstoned. A period whose rows are not on this device is never stripped,
  // but still claims its salesmen (from its who-is-who map).
  // opts.keyOf(row, period) / opts.nameKey(name, period): how a salesman is
  // identified (the app keys on the rep a name maps to, so a re-spelled ERP
  // name never counts as a second person). Default: the raw name.
  function erpEnforceNoOverlap(sales, now, opts){
    now = now || Date.now();
    var keyOf = (opts && opts.keyOf) || function(r){ return r[8]; };
    var nameKey = (opts && opts.nameKey) || function(n){ return n; };
    var periods = ((sales && sales.periods) || []).filter(Boolean);
    var order = periods.slice().sort(function(a, b){
      var ia = String(a.importedAt || ''), ib = String(b.importedAt || '');
      return ib.localeCompare(ia) || (b.rev || 0) - (a.rev || 0);
    });
    var removed = Object.assign({}, (sales && sales.removed) || {});
    var claimed = {}; // salesman -> [{from, to}] taken by newer periods
    var replacement = {}, dropped = {}, changed = 0;
    order.forEach(function(p){
      var readable = Array.isArray(p.rows) && !p.rowsMissing;
      var salesmen = {};
      if(readable) p.rows.forEach(function(r){ salesmen[keyOf(r, p)] = 1; });
      else Object.keys(p.repMap || {}).forEach(function(k){ salesmen[nameKey(k, p)] = 1; });
      if(readable){
        var kept = p.rows.filter(function(r){
          var spans = claimed[keyOf(r, p)];
          if(!spans) return true;
          for(var i = 0; i < spans.length; i++) if(r[0] >= spans[i].from && r[0] <= spans[i].to) return false;
          return true;
        });
        if(kept.length !== p.rows.length){
          changed++;
          if(!kept.length){ removed[p.id] = now; dropped[p.id] = 1; }
          else {
            var net = 0, from = null, to = null;
            kept.forEach(function(r){ net += (r[6] || 0); if(!from || r[0] < from) from = r[0]; if(!to || r[0] > to) to = r[0]; });
            replacement[p.id] = Object.assign({}, p, { rows: kept, rowCount: kept.length, net: Math.round(net * 1000) / 1000,
              from: from || p.from, to: to || p.to, rev: now });
          }
        }
      }
      // claim AFTER being stripped: a stripped period claims only what it still spans
      var q = replacement[p.id] || p;
      if(!dropped[p.id] && q.from && q.to) Object.keys(salesmen).forEach(function(sm){ (claimed[sm] = claimed[sm] || []).push({ from: q.from, to: q.to }); });
    });
    var out = Object.assign({}, sales || {}, {
      periods: periods.filter(function(p){ return !dropped[p.id]; }).map(function(p){ return replacement[p.id] || p; }),
      removed: removed,
    });
    return { sales: out, changed: changed };
  }

  // ---- Minimal XLSX reader (no libraries) ----
  // .xlsx is a ZIP of XML files; browsers and Node both ship the pieces we
  // need (DataView + DecompressionStream). Returns [{name, rows[][]}].
  function xmlUnescape(s){
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);|&#x([0-9a-f]+);/gi, function(m, d, h){ var n = d ? parseInt(d, 10) : parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }) // "&#8212;" → "—"
      .replace(/&amp;/g, '&');
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
      var cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      var cellValue = function(attrs, body){
        var t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
        if(t === 'inlineStr'){
          var it = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          return it ? xmlUnescape(it[1]) : '';
        }
        var vm = body.match(/<v>([\s\S]*?)<\/v>/);
        return vm ? (t === 's' ? (shared[parseInt(vm[1], 10)] || '') : xmlUnescape(vm[1])) : '';
      };
      var colOf = function(letters){ var col = 0; for(var L = 0; L < letters.length; L++) col = col * 26 + (letters.charCodeAt(L) - 64); return col; };
      // Walk <row> by <row>: some generators omit the r="A1" cell address
      // (cells are then simply sequential), and a self-closing <row/> must not
      // swallow its neighbours.
      var rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, rm, nextRow = 0, sawRow = false;
      while((rm = rowRe.exec(xml))){
        sawRow = true;
        var rAttr = (rm[1].match(/\br="(\d+)"/) || [])[1];
        var rowIdx = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
        nextRow = rowIdx + 1;
        var colSeq = 0, cm;
        var rowBody = rm[2] || '';
        while((cm = cellRe.exec(rowBody))){
          var ref = cm[1].match(/\br="([A-Z]+)(\d+)"/);
          var col = ref ? colOf(ref[1]) : colSeq + 1;
          colSeq = col;
          (rows[rowIdx] = rows[rowIdx] || [])[col - 1] = cellValue(cm[1], cm[2] || '');
        }
      }
      if(!sawRow){ // no <row> wrappers at all — address every cell by its r= attribute
        var m;
        while((m = cellRe.exec(xml))){
          var ref2 = m[1].match(/\br="([A-Z]+)(\d+)"/);
          if(!ref2) continue;
          (rows[parseInt(ref2[2], 10) - 1] = rows[parseInt(ref2[2], 10) - 1] || [])[colOf(ref2[1]) - 1] = cellValue(m[1], m[2] || '');
        }
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
  // Products the catalog is missing: every item of `builtIn` (e.g. the
  // Intensiv list) not in the catalog by name or code, plus every product sold
  // in the ERP files under a brand the catalog has nothing of (services,
  // delivery, packaging, marketing items and kits excluded). Each comes with
  // the usual invoiced unit price (gross ÷ qty, most frequent), how many were
  // sold and the last invoice date. Nothing is added here — the supervisor
  // ticks what to add. Pure.
  var NON_PRODUCT_RE = /maintenance|delivery|packaging|service|marketing|inspection fee|freight|shipping/i;
  function catalogGaps(products, rows, builtIn){
    var key = function(n){ return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
    var names = {}, ids = {}, brands = {};
    (products || []).forEach(function(p){ if(!p) return; names[key(p.name)] = 1; if(p.id != null) ids[key(p.id)] = 1; brands[normBrand(p.brand)] = 1; });
    var out = [], taken = {};
    (builtIn || []).forEach(function(p){
      if(names[key(p.name)] || (p.id != null && ids[key(p.id)])) return;
      taken[key(p.name)] = 1;
      var c = {}; for(var k in p) c[k] = p[k];
      out.push({ product: c, source: 'list', sold: 0, last: null });
    });
    var agg = {}, listIdx = {};
    out.forEach(function(x, i){ listIdx[key(x.product.name)] = i; });
    (rows || []).forEach(function(r){
      var b = normBrand(r.brand), k = key(r.product);
      if(listIdx[k] != null && r.type !== 'return'){ var li = out[listIdx[k]]; li.sold += Number(r.qty) || 0; if(!li.last || r.date > li.last) li.last = r.date; }
      if(!k || NON_PRODUCT_RE.test(r.brand || '') || NON_PRODUCT_RE.test(r.product || '') || b === 'bundles' || brands[b] || names[k] || taken[k]) return;
      var a = agg[k] || (agg[k] = { name: String(r.product).replace(/\s+/g, ' ').trim(), brand: String(r.brand || 'Other').trim(), prices: {}, sold: 0, last: '' });
      if(r.qty > 0 && r.gross > 0){ var u = Math.round(r.gross / r.qty * 1000) / 1000; a.prices[u] = (a.prices[u] || 0) + 1; }
      if(r.type !== 'return'){ a.sold += Number(r.qty) || 0; if(r.date > a.last) a.last = r.date; }
    });
    Object.keys(agg).forEach(function(k){
      var a = agg[k], best = null;
      Object.keys(a.prices).forEach(function(u){ if(best == null || a.prices[u] > a.prices[best] || (a.prices[u] === a.prices[best] && +u > +best)) best = u; });
      out.push({ product: { id: 'erp-' + slugify(a.name), name: a.name, brand: a.brand, cat: a.brand, price: best == null ? null : +best, stock: true },
        source: 'erp', sold: a.sold, last: a.last || null });
    });
    return out.sort(function(x, y){ return x.product.brand.localeCompare(y.product.brand) || (x.source === y.source ? 0 : x.source === 'list' ? -1 : 1) || x.product.name.localeCompare(y.product.name); });
  }
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
  // documents. Count each row once, and always NET of the return's own
  // discount ("Discount. Sales Ret") — the gross return column is bigger than
  // the discounted order it reverses, so gross would overstate every return.
  // On SRT documents the Net Sales column is already net-of-discount (and
  // negative), so it is the primary source there.
  function returnValue(r){
    var dd = Math.max(0, r.dsret || 0); // a negative discount cell must never inflate a return
    if(r.type === 'return'){
      var v = Math.abs(r.net || 0);
      if(v > 0) return v;
      return Math.max(0, (r.sret || 0) - dd);
    }
    if(r.sret > 0) return Math.max(0, r.sret - dd);
    return 0;
  }
  function returnsAnalysis(rows, opts){
    // An EXCHANGE (تبديل) is stock swapped, not money lost — the supervisor
    // marks those lines and they leave the returns figures completely,
    // reported as their own bucket instead.
    var isEx = (opts && opts.isExchange) || function(){ return false; };
    var all = (rows || []).filter(function(r){ return returnValue(r) > 0; });
    var ret = all.filter(function(r){ return !isEx(r); });
    var exch = all.filter(function(r){ return isEx(r); });
    // With clinics provided, branch customers roll up to ONE family line so a
    // multi-branch clinic never looks like it returned twice.
    var unify = null;
    if(opts && opts.clinics){
      var fmap = clinicFamilies(opts.clinics);
      unify = function(cust){
        var m = matchCustomer(String(cust || '').trim(), opts.clinics, opts.erpMap);
        if(m.method === 'map') return null; // an explicit override stays its own line
        var famKey = m.clinicId ? (m.family || fmap.byClinic[m.clinicId]) : null;
        if(famKey && fmap.fams[famKey]){
          var fam = fmap.fams[famKey];
          return { key: '@fam:' + famKey, label: fam.label + ' (' + fam.count + ')' };
        }
        return null;
      };
    }
    var agg = function(key){
      var d = {}, labels = {};
      ret.forEach(function(r){
        var k = r[key] || '—';
        if(key === 'customer' && unify){
          var u = unify(r[key]);
          if(u){ k = u.key; labels[k] = u.label; }
        }
        d[k] = (d[k] || 0) + returnValue(r);
      });
      return Object.keys(d).map(function(k){ return { name: labels[k] || k, amount: Math.round(d[k] * 1000) / 1000 }; })
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
    var exDocs = {};
    exch.forEach(function(r){ if(r.doc) exDocs[r.doc] = 1; });
    return {
      total: Math.round(ret.reduce(function(s, r){ return s + returnValue(r); }, 0) * 1000) / 1000,
      count: ret.length, docCount: Object.keys(docs).length,
      byBrand: agg('brand'), byCustomer: agg('customer'), detail: detail,
      exchange: {
        total: Math.round(exch.reduce(function(s, r){ return s + returnValue(r); }, 0) * 1000) / 1000,
        count: exch.length, docCount: Object.keys(exDocs).length,
        detail: exch.map(function(r){
          return { date: r.date, doc: r.doc, customer: r.customer || '—', brand: r.brand || '—',
            product: r.product || '', qty: r.qty || 0, amount: Math.round(returnValue(r) * 1000) / 1000 };
        }).sort(function(a, b){ return b.amount - a.amount; }),
      },
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


  // ---------------------------------------------------------------------
  // Product movement: every brand, its products ranked by REAL paid sales,
  // classified fast / mid / slow. Built from stored ERP rows
  // ({date, doc, type, product, qty, net, sret, dsret, brand, customer, ref}).
  //  - paid units   = invoice lines that earned money (net > 0)
  //  - FOC          = free invoice lines minus free lines that came back
  //  - returns      = split into "against an invoice" (ref known) and
  //                   "stock returns without invoice" (no ref) when the data
  //                   carries references at all — shown next to sales, never
  //                   allowed to hide a product's movement; exchange lines the
  //                   supervisor marked (opts.isExchange) are stock swaps
  //  - velocity     = per month, from the product's first paid sale (or the
  //                   start of the data) to the last date in the data, with a
  //                   floor (2 months; the data span when it is shorter) so a
  //                   weeks-old launch is not crowned on 2 invoices
  //  - classes      = fast: 4+ invoices/month, or 100+ units/month on 3+
  //                   invoices · slow: under 1 invoice/month or a single sale
  //                   · mid: the rest · none: never sold for money
  //  - old / new ERP codes of one product (IME / INT / OLD suffixes) merge
  // Marketing brands and internal marketing accounts, delivery, maintenance
  // and packaging lines are not products and are left out.
  var PM_NONPRODUCT = /marketing|delivery|maintenance|packaging/i;
  var PM_ISO = /^\d{4}-\d{2}-\d{2}$/;
  function pmNormName(n){
    return String(n || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/)
      .filter(function(t){ return t && t !== 'ime' && t !== 'int' && t !== 'old'; }).join(' ');
  }
  function pmLoose(n){ return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function pmMonths(a, b){ // 'YYYY-MM-DD' strings → months (30.44 days)
    var ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
    return Math.max(0, ms) / 86400000 / 30.44;
  }
  function pmDaysBetween(a, b){ return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function productMovement(rows, opts){
    opts = opts || {};
    var minWin = opts.minWindow != null ? opts.minWindow : 2;
    var fastInv = opts.fastInvoices != null ? opts.fastInvoices : 4;
    var fastUnits = opts.fastUnits != null ? opts.fastUnits : 100;
    var slowInv = opts.slowInvoices != null ? opts.slowInvoices : 1;
    var isExchange = typeof opts.isExchange === 'function' ? opts.isExchange : function(){ return false; };
    var list = (rows || []).filter(function(r){
      return r && r.product && PM_ISO.test(String(r.date || '')) && !isNaN(Date.parse(r.date + 'T00:00:00Z'))
        && !PM_NONPRODUCT.test(String(r.brand || '')) && !/marketing/i.test(String(r.customer || ''));
    });
    var out = { from: null, to: null, months: 0, rows: list.length, hasRefs: false, provisional: false, brands: [], sold: 0, products: 0, counts: { fast: 0, mid: 0, slow: 0, none: 0 } };
    if(!list.length) return out;
    var d0 = null, d1 = null;
    list.forEach(function(r){
      if(!d0 || r.date < d0) d0 = r.date; if(!d1 || r.date > d1) d1 = r.date;
      if(r.type === 'return' && r.ref) out.hasRefs = true;
    });
    out.from = d0; out.to = d1; out.months = pmMonths(d0, d1);
    var span = Math.max(out.months, 1 / 30.44);
    out.provisional = span < 2;
    var floor = Math.min(minWin, Math.max(span, 1));
    var l3Start = new Date(Date.parse(d1 + 'T00:00:00Z') - 91 * 86400000).toISOString().slice(0, 10);
    var P = {}, rawNames = {};
    list.forEach(function(r){
      var bkey = normBrand(r.brand), pkey = bkey + '||' + pmNormName(r.product);
      var d = P[pkey];
      if(!d) d = P[pkey] = { bkey: bkey, brandNames: {}, names: {}, hasPaid: false, paid: 0, paidKd: 0, foc: 0, focBack: 0, retInv: 0, retNoInv: 0, exchanged: 0, kd: 0, invs: {}, custs: {}, months: {}, byMonth: {}, first: null, last: null, l3: 0 };
      var q = +r.qty || 0, net = +r.net || 0, b = String(r.brand || '').trim(), n = String(r.product || '').trim();
      d.brandNames[b] = (d.brandNames[b] || 0) + 1;
      (rawNames[pkey] = rawNames[pkey] || {})[n] = 1;
      d.kd += net;
      var retLine = r.type === 'return' || (r.sret > 0 && !(net > 0)); // legacy shape: a return valued in the Sales Return column of an invoice line
      if(retLine){
        var rv = returnValue(r);
        if(net === 0) d.kd -= rv;                       // valued only in the return column
        if(isExchange(r)){ d.exchanged += Math.abs(q); return; }
        if(net === 0 && rv === 0){ d.focBack += Math.abs(q); return; } // free goods coming back
        if(r.ref) d.retInv += Math.abs(q); else d.retNoInv += Math.abs(q);
        return;
      }
      if(!(net > 0)){ d.foc += Math.max(q, 0); return; }
      d.hasPaid = true; d.paid += q; d.paidKd += net; d.names[n] = (d.names[n] || 0) + q;
      if(r.doc) d.invs[r.doc] = 1;
      d.custs[String(r.customer || '').trim().toLowerCase()] = 1;
      var ym = r.date.slice(0, 7); d.months[ym] = 1; d.byMonth[ym] = (d.byMonth[ym] || 0) + q;
      if(r.date > l3Start) d.l3 += q;
      if(!d.first || r.date < d.first) d.first = r.date;
      if(!d.last || r.date > d.last) d.last = r.date;
    });
    var pick = function(o){ var best = null; Object.keys(o).forEach(function(x){ if(best === null || o[x] > o[best]) best = x; }); return best; };
    var brands = {};
    Object.keys(P).forEach(function(k){
      var d = P[k];
      var names = Object.keys(rawNames[k] || {});
      d.name = Object.keys(d.names).length ? pick(d.names) : (names.slice().sort(function(a, b){ return a.length - b.length; })[0] || '');
      var seen = {}; seen[pmLoose(d.name)] = 1;
      d.otherNames = names.filter(function(n){ var key = pmLoose(n); if(seen[key]) return false; seen[key] = 1; return true; });
      d.brand = pick(d.brandNames);
      d.ret = d.retInv + d.retNoInv;
      d.netUnits = d.paid - d.ret;
      d.focNet = d.foc - d.focBack;
      var start = d.first ? (d.first > d0 ? d.first : d0) : d0;
      d.window = Math.max(floor, pmMonths(start, d1));
      d.invoices = Object.keys(d.invs).length; d.customers = Object.keys(d.custs).length; d.monthsActive = Object.keys(d.months).length;
      d.upm = d.paid / d.window; d.ipm = d.invoices / d.window; d.l3pm = d.l3 / 3;
      d.price = d.paid ? d.paidKd / d.paid : 0;
      var flags = [];
      if(!d.hasPaid){
        d.cls = 'none';
        if(d.foc > 0) flags.push({ k: 'focOnly', units: d.foc });
        if(d.ret > 0) flags.push({ k: 'returnsOnly', units: d.ret });
      } else {
        // the units path needs repeat business too: one bulk invoice is not a fast mover;
        // a product sold once in the whole data is slow whatever the span
        if(d.ipm >= fastInv || (d.upm >= fastUnits && d.invoices >= 3)) d.cls = 'fast';
        else if(d.invoices < 2 || d.ipm < slowInv) d.cls = 'slow';
        else d.cls = 'mid';
        if(d.ret >= 10 && d.ret >= 0.25 * d.paid) flags.push({ k: 'returns', pct: Math.round(d.ret / d.paid * 100), noInv: out.hasRefs && d.retNoInv >= 0.5 * d.ret });
        if(d.paid > 0 && d.netUnits <= 0) flags.push({ k: 'exceed' });
        var age = pmDaysBetween(d.first, d1);
        if(age <= 92 && pmDaysBetween(d0, d1) > 92) flags.push({ k: 'new', first: d.first });
        else if(d.paid >= 50 && pmDaysBetween(d0, d1) > 92){
          var top = pick(d.byMonth);
          if(d.byMonth[top] >= 0.6 * d.paid) flags.push({ k: 'fill', pct: Math.round(d.byMonth[top] / d.paid * 100), month: top });
        }
        var idle = pmDaysBetween(d.last, d1);
        if(idle >= 60) flags.push({ k: 'stale', days: idle });
        if(age > 92 && d.l3 > 0 && d.l3pm < 0.4 * d.upm) flags.push({ k: 'decline' });
        if(d.exchanged > 0) flags.push({ k: 'exchanged', units: d.exchanged });
      }
      if(d.otherNames.length) flags.push({ k: 'merged', names: d.otherNames });
      d.flags = flags;
      var B = brands[d.bkey] || (brands[d.bkey] = { key: d.bkey, names: {}, kd: 0, paid: 0, retInv: 0, retNoInv: 0, foc: 0, sold: 0, counts: { fast: 0, mid: 0, slow: 0, none: 0 }, products: [] });
      B.names[d.brand] = (B.names[d.brand] || 0) + 1;
      B.kd += d.kd; B.paid += d.paid; B.retInv += d.retInv; B.retNoInv += d.retNoInv; B.foc += d.focNet; B.counts[d.cls]++; if(d.hasPaid) B.sold++;
      B.products.push(d);
    });
    var byPaid = function(a, b){ return (a.hasPaid ? 0 : 1) - (b.hasPaid ? 0 : 1) || b.paid - a.paid || b.invoices - a.invoices || b.kd - a.kd || b.foc - a.foc; };
    out.brands = Object.keys(brands).map(function(k){
      var B = brands[k];
      B.brand = pick(B.names); delete B.names;
      B.products.sort(byPaid);
      var cum = 0;
      B.products.forEach(function(d, i){
        d.rank = i + 1;
        if(d.paid > 0 && B.paid > 0){ d.share = d.paid / B.paid; d.abc = cum < 0.80 * B.paid - 1e-9 ? 'A' : (cum < 0.95 * B.paid - 1e-9 ? 'B' : 'C'); cum += d.paid; }
        else { d.share = 0; d.abc = null; }
        delete d.brandNames; delete d.names; delete d.invs; delete d.custs; delete d.months; delete d.byMonth; delete d.bkey;
        out.counts[d.cls]++; out.products++; if(d.hasPaid) out.sold++;
      });
      B.netUnits = B.paid - B.retInv - B.retNoInv;
      return B;
    }).sort(function(a, b){ return b.kd - a.kd || b.paid - a.paid; });
    return out;
  }

  return {
    uid, localDateStr, todayStr, fmtDate, daysBetween, esc, safeUrl, initials,
    money, slugify, getWeekDates, getMonthDates, isWorkday, workingDaysBetween, followStatus, safeParse,
    csvEscape, orderGross, orderNet, orderTotals,
    computeScoreForVisits, computeRepScore, calcStreak, calendarDayItems, isFieldVisit, repWasThere,
    inRange, filterVisitsByRange, rangeSummary, pctDelta, dormantClinics, missedPlans,
    contactCount, coachInsights,
    erpNum, erpDate, erpDateOrder, parseCsvText, detectErpColumns, parseErpCsv, parseErpPdfText,
    parseErpFile, levenshtein, guessRepMap, normClinicName, isErpChannel,
    matchCustomer, erpRowRep, clinicRepOn, clinicSharedOn, parseDistribution, planDistribution, applyDistributionPlan, dedupeVisits, erpTotals, reconcileErp, clinicCoverage, erpWeeklyTrend, erpRefFromRemarks, returnContext, returnOrigin, applyReturnPolicy,
    parseTargetsFile, readXlsx, parseDsrTargets, normBrand,
    normDoctorName, splitDoctorNames, dedupeDoctors, mergeDoctorLists, mergeDayPlans3, mergeRecycleBin, sameFirstName,
    unpackErpRows, erpPeriodsOf, erpRevenueRange, erpMtd, crossInvoices, weeklyReport, weeklyHighlights, weeklyStory, weeklyPages, valuePerPerson, clinicInvoices, discountSummary, addDaysStr, foldProducts, storyGate, teamSalesLikeForLike, isInternalAccount, monthlyTrend, catalogGaps, targetOf, kpiScorecard, isGovClinic, KPI_DEFAULTS, KPI_ITEMS, erpAttributedRows, monthAchievement, teamAchievement, dailyDigest,
    visitMonth, visitHome, visitsPartition, visitsAssemble, visitsArchKey, visitsStrayIds, VISITS_ARCH_PREFIX,
    erpRowsKey, erpSplitForStorage, erpChunkRows, erpChunkKeys, erpAssemble, erpMergeIndex, erpEnforceNoOverlap, ERP_CHUNK_ROWS, ERP_CHUNK_BYTES,
    forecastMonthEnd, returnsAnalysis, returnValue, focAnalysis, isMarketingRow, isFocRow, clinicFamilies, allocateClinicTargets, unitSellPlan, doctorAnalytics, rxGrowth, daysToBirthday, DOC_ROLES, DOC_INFLUENCE, DOC_STAGES, doctorRecordCompleteness, clinicDecisionMap, parseContactRows, parseContactWorkbook, parseClinicRepSheet, matchClinicHint, normClinicHint, normPerson, phoneKey, samePerson, dedupeContacts, splitPersonHint, splitPeople, clinicDisplayName, parseDateLoose, matchSpecialty,
    detectClinicColumns, parseClinicRows, focLinesAnnotated,
    matchCatalogProduct, crossSellPlan,
    productMovement, pmNormName
  };
});
