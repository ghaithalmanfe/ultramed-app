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
      const p = products.find(x=>x.id===pid);
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
  function computeScoreForVisits(repName, visitList, clinics){
    const base = visitList.filter(v=>v.rep===repName);
    const assigned = clinics.filter(c=>c.rep===repName && c.cls!=='Closed');
    const priorityAssigned = assigned.filter(c=>c.cls==='A'||c.cls==='B');
    const coveredIds = new Set(base.map(v=>v.clinicId));
    const priorityIds = new Set(priorityAssigned.map(c=>c.id));
    const priorityCovered = [...coveredIds].filter(id=>priorityIds.has(id)).length;
    const orders = base.filter(v=>v.orderTaken).length;
    const revenue = base.reduce((s,v)=>s+(v.orderTotal||0),0);
    const contacts = base.reduce((s,v)=>s+contactCount(v),0);
    return {
      visits: base.length, orders, revenue, contacts,
      conversion: base.length ? Math.round(orders/base.length*100) : 0,
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
    // per-rep breakdown from the visits in range
    const byRep = {};
    vis.forEach(v => {
      const r = byRep[v.rep] || (byRep[v.rep] = { rep: v.rep, visits: 0, orders: 0, revenue: 0, contacts: 0 });
      r.visits++;
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
      out.push({ level: 'act', icon: '⏰', key: 'followups',
        title: overdue.length + ' overdue follow-up' + (overdue.length === 1 ? '' : 's'),
        detail: 'Visits already promised to: ' + listNames(overdue.map(c => c.name), 3) +
          '. A promised visit is the easiest sale — book these first.' });
    }

    // 2. Best clinics going quiet = revenue quietly leaking.
    const dorm = dormantClinics(clinics, visits, today, { days: 30 }).filter(c => wantRep(c.rep));
    if(dorm.length){
      out.push({ level: 'act', icon: '😴', key: 'dormant',
        title: dorm.length + ' top clinic' + (dorm.length === 1 ? '' : 's') + ' quiet for 30+ days',
        detail: listNames(dorm.map(c => c.name + ' (' + (c.daysSince === null ? 'never visited' : c.daysSince + 'd') + ')'), 3) +
          '. Class A/B clinics buy the most — put them in next week’s plan.' });
    }

    // 3. Plans that never became visits.
    const missed = missedPlans(dayPlans, visits, today, { daysBack: 14 }).filter(m => wantRep(m.rep));
    if(missed.length){
      out.push({ level: missed.length >= 3 ? 'act' : 'watch', icon: '📅', key: 'missed',
        title: missed.length + ' planned visit' + (missed.length === 1 ? '' : 's') + ' never happened',
        detail: 'Planned in the last 14 days but never logged. Reschedule them from the Today screen so the plan stays real.' });
    }

    // 4. Monthly target pace, per rep with a revenue target set.
    const mStart = today.slice(0, 7) + '-01';
    const daysInMonth = new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate();
    const dayOfMonth = +today.slice(8, 10);
    Object.keys(targets).filter(r => wantRep(r) && targets[r] && targets[r].revenue > 0).sort().forEach(rep => {
      const goal = targets[rep].revenue;
      const mtd = visits.filter(v => v.rep === rep && v.date >= mStart && v.date <= today)
        .reduce(function(sum, v){ return sum + (v.orderTotal || 0); }, 0);
      const expected = goal * dayOfMonth / daysInMonth;
      const daysLeft = daysInMonth - dayOfMonth;
      if(mtd >= goal){
        out.push({ level: 'good', icon: '🏆', key: 'target-' + rep,
          title: rep + ' already hit the monthly target',
          detail: money(mtd) + ' against a ' + money(goal) + ' goal. Everything from here is upside — a great week to push new products.' });
      } else if(mtd < expected * 0.9){
        const perDay = daysLeft > 0 ? Math.ceil((goal - mtd) / daysLeft) : Math.ceil(goal - mtd);
        out.push({ level: 'act', icon: '🎯', key: 'target-' + rep,
          title: rep + ' is behind the monthly target',
          detail: money(mtd) + ' of ' + money(goal) + ' so far. Needs about ' + perDay + ' KD/day for the remaining ' + daysLeft +
            ' day' + (daysLeft === 1 ? '' : 's') + ' — steer the visits toward clinics that already order.' });
      } else {
        out.push({ level: 'good', icon: '🎯', key: 'target-' + rep,
          title: rep + ' is on pace for the monthly target',
          detail: money(mtd) + ' of ' + money(goal) + '. Keep the current rhythm and the target lands on its own.' });
      }
    });

    // 5. Conversion coaching — only once there are enough visits to mean anything.
    if(s.fieldVisits >= 5){
      if(s.conversion < 30){
        out.push({ level: 'act', icon: '🛒', key: 'conversion',
          title: 'Low conversion: ' + s.conversion + '% of visits end with an order',
          detail: 'Lots of walking, little closing. Open the category selling guides before each visit and always ask for the order before leaving.' });
      } else if(s.conversion >= 60){
        out.push({ level: 'good', icon: '🛒', key: 'conversion',
          title: 'Strong closing: ' + s.conversion + '% of visits take an order',
          detail: 'The pitch works. The straightest line to more sales now is simply more visits to the same kind of clinics.' });
      }
    }

    // 6. Contacts met per visit — the multiplier that costs no extra driving.
    if(s.fieldVisits >= 5){
      const perVisit = Math.round(s.contacts / s.fieldVisits * 10) / 10;
      if(perVisit < 1){
        out.push({ level: 'watch', icon: '👥', key: 'contacts',
          title: 'Only ' + perVisit + ' contact' + (perVisit === 1 ? '' : 's') + ' met per visit',
          detail: 'Every extra doctor met in the same clinic is a free lead. Ask reception who else is in today — aim for 2+ per visit.' });
      } else if(perVisit >= 2){
        out.push({ level: 'good', icon: '👥', key: 'contacts',
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
      out.push({ level: 'watch', icon: '🔁', key: 'stuck',
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
        out.push({ level: 'watch', icon: '🥚', key: 'concentration',
          title: share + '% of revenue comes from one clinic',
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
          out.push({ level: 'watch', icon: '🤝', key: 'jointcoach',
            title: top.rep + ' converts at ' + conv(top) + '%, ' + low.rep + ' at ' + conv(low) + '%',
            detail: 'Send them on 2-3 joint visits: ' + low.rep + ' watches how ' + top.rep + ' asks for the order. Log them as joint visits so both get credit.' });
        }
      }
    }

    if(!out.length){
      out.push({ level: 'good', icon: '✅', key: 'allgood',
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
    var neg = s.charAt(0) === '(' || /-\)?$/.test(s);
    s = s.replace(/[()\-]/g, '');
    var v = parseFloat(s);
    if(isNaN(v)) return 0;
    return neg ? -v : v;
  }
  // Accepts dd-mm-yyyy, dd/mm/yyyy or yyyy-mm-dd → ISO yyyy-mm-dd (or null).
  function erpDate(s){
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return s;
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if(m) return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
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
    idx.customer = find([/customer/], /class/);
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
      return v === '@channel' ? { clinicId: null, channel: true }
           : v === '@ignore' ? { clinicId: null, channel: false, ignored: true }
           : { clinicId: v, channel: false };
    }
    if(isErpChannel(cust)) return { clinicId: null, channel: true };
    var n = normClinicName(cust);
    if(!n) return { clinicId: null, channel: false };
    var toks = n.split(' ');
    var best = null, bestScore = 0;
    (clinics || []).forEach(function(c){
      var ct = normClinicName(c.name).split(' ');
      var ov = toks.filter(function(t){ return ct.indexOf(t) >= 0; }).length;
      var need = (toks.length === 1 || ct.length === 1) ? 1 : 2;
      if(ov >= need && ov > bestScore){ best = c.id; bestScore = ov; }
    });
    return { clinicId: best, channel: false };
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
    dd.unique.forEach(function(v){ reps[v.rep] = 1; });
    var unmatchedSet = {};
    Object.keys(reps).sort().forEach(function(rep){
      var erpRows = rows.filter(function(r){ return repMap[r.salesman] === rep; });
      var appVisits = dd.unique.filter(function(v){ return v.rep === rep; });
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
          returns: Math.round(erpRows.reduce(function(s, r){ return s + r.sret; }, 0) * 1000) / 1000,
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

  // ==== COVERAGE BOARD ====
  // One picture of a period: which clinics were visited (with a visit summary
  // each) and which still need a visit — with machine-readable reasons the UI
  // turns into advice. opts: {from, to, today, repFilter, visits, clinics, dayPlans}
  function clinicCoverage(opts){
    var wantRep = function(r){ return opts.repFilter === 'all' || r === opts.repFilter; };
    var pool = (opts.clinics || []).filter(function(c){ return c.cls !== 'Closed' && wantRep(c.rep); });
    var vis = filterVisitsByRange(opts.visits, opts.from, opts.to)
      .filter(function(v){ return wantRep(v.rep) || wantRep(v.withRep); });
    var today = opts.today;
    var byClinic = {};
    vis.forEach(function(v){ (byClinic[v.clinicId] = byClinic[v.clinicId] || []).push(v); });
    var lastEver = {};
    (opts.visits || []).forEach(function(v){
      if(v.date && (!lastEver[v.clinicId] || v.date > lastEver[v.clinicId])) lastEver[v.clinicId] = v.date;
    });

    var visited = pool.filter(function(c){ return byClinic[c.id]; }).map(function(c){
      var list = byClinic[c.id].slice().sort(function(a, b){ return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
      return {
        id: c.id, name: c.name, rep: c.rep, cls: c.cls,
        visits: list.length,
        lastDate: list[0].date,
        calls: list.filter(function(v){ return v.callOnly; }).length,
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
    // 4 dormant 30+ days · 5 follow-up due within a week
    var dorm = dormantClinics(opts.clinics, opts.visits, today, { days: 30 });
    var missed = missedPlans(opts.dayPlans, opts.visits, today, { daysBack: 14 })
      .filter(function(m){ return wantRep(m.rep); });
    var missedByClinic = {};
    missed.forEach(function(m){ (missedByClinic[m.clinicId] = missedByClinic[m.clinicId] || []).push(m); });
    var soon = new Date(today + 'T00:00:00'); soon.setDate(soon.getDate() + 7);
    var soonStr = localDateStr(soon);

    var needsVisit = [];
    pool.forEach(function(c){
      if(byClinic[c.id]) return; // being handled this period
      var reasons = [];
      var fs = followStatus(c.nextFollowUp, today);
      if(fs === 'overdue') reasons.push({ key: 'overdue', weight: 0, date: c.nextFollowUp });
      if(fs === 'today') reasons.push({ key: 'due-today', weight: 1, date: c.nextFollowUp });
      if(missedByClinic[c.id]) reasons.push({ key: 'missed-plan', weight: 2, count: missedByClinic[c.id].length, date: missedByClinic[c.id][0].date });
      var d = null;
      for(var i = 0; i < dorm.length; i++) if(dorm[i].id === c.id){ d = dorm[i]; break; }
      if(d) reasons.push(d.lastVisit === null
        ? { key: 'never-visited', weight: 3 }
        : { key: 'dormant', weight: 4, days: d.daysSince });
      if(fs === 'upcoming' && c.nextFollowUp <= soonStr) reasons.push({ key: 'due-soon', weight: 5, date: c.nextFollowUp });
      if(!reasons.length) return;
      reasons.sort(function(a, b){ return a.weight - b.weight; });
      needsVisit.push({ id: c.id, name: c.name, rep: c.rep, cls: c.cls,
        reasons: reasons, weight: reasons[0].weight,
        lastVisit: lastEver[c.id] || null, nextFollowUp: c.nextFollowUp || null });
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
    money, slugify, getWeekDates, getMonthDates, followStatus, safeParse,
    csvEscape, orderGross, orderNet, orderTotals,
    computeScoreForVisits, computeRepScore, calcStreak, calendarDayItems,
    inRange, filterVisitsByRange, rangeSummary, pctDelta, dormantClinics, missedPlans,
    contactCount, coachInsights,
    erpNum, erpDate, parseCsvText, detectErpColumns, parseErpCsv, parseErpPdfText,
    parseErpFile, levenshtein, guessRepMap, normClinicName, isErpChannel,
    matchCustomer, dedupeVisits, erpTotals, reconcileErp, clinicCoverage
  };
});
