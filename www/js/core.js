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

  return {
    uid, localDateStr, todayStr, fmtDate, daysBetween, esc, safeUrl, initials,
    money, slugify, getWeekDates, getMonthDates, followStatus, safeParse,
    csvEscape, orderGross, orderNet, orderTotals,
    computeScoreForVisits, computeRepScore, calcStreak, calendarDayItems,
    inRange, filterVisitsByRange, rangeSummary, pctDelta, dormantClinics, missedPlans,
    contactCount, coachInsights
  };
});
