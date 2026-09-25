# -*- coding: utf-8 -*-
"""متوسط الشراء الشهري والربعي لكل عيادة — 2025 و 2026 (حتى 24/09/2026).

قناة العيادات بدأت في 2025 (لا حسابات طبية في 2024 تحت أي فئة)، فالنافذة القابلة للمقارنة سنتان.
  «الشراء»           = صافي المبيعات بالدينار (الفواتير ناقص المرتجعات).
  «شهر نشط»          = شهر فيه طلب مدفوع واحد على الأقل.
  «متوسط/شهر نشط»    = الإجمالي ÷ الأشهر النشطة — ماذا تشتري العيادة حين تشتري.
  «متوسط/شهر معياري» = الإجمالي ÷ (الأيام من أول طلب حتى 24/09/2026 ÷ 30.44) — يعاقب الانقطاع.
  المقارنة السنوية على نافذة متطابقة: 01/01→24/09 من كل سنة، فلا حاجة لأي تقدير.
  الربع الثالث 2026 = 86 يوماً من 92 (وُسم صراحةً).
"""
import json, datetime
from collections import defaultdict

END = datetime.date(2026, 9, 24)
recs = json.load(open('raw2.json'))
CLIN = {'Clinics','Hospital','Doctors','Government'}
CLS_AR = {'Clinics':'عيادة','Hospital':'مستشفى','Doctors':'طبيب','Government':'جهة حكومية'}
CLS_EN = {'Clinics':'Clinic','Hospital':'Hospital','Doctors':'Doctor','Government':'Government'}
REP_AR = {'Ranova Ayman Mohammed':'رانوفا أيمن','Mariam Zohair':'مريم زهير'}

MONTHS = ['2025-%02d' % m for m in range(1,13)] + ['2026-%02d' % m for m in range(1,10)]
M_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
M_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
MONTH_LABEL_AR = [f'{M_AR[int(m[5:7])-1]} {m[:4]}' for m in MONTHS]
MONTH_LABEL_EN = [f'{M_EN[int(m[5:7])-1]} {m[:4]}' for m in MONTHS]

QUARTERS = [('2025-Q1',['2025-01','2025-02','2025-03'],90),  ('2025-Q2',['2025-04','2025-05','2025-06'],91),
            ('2025-Q3',['2025-07','2025-08','2025-09'],92),  ('2025-Q4',['2025-10','2025-11','2025-12'],92),
            ('2026-Q1',['2026-01','2026-02','2026-03'],90),  ('2026-Q2',['2026-04','2026-05','2026-06'],91),
            ('2026-Q3',['2026-07','2026-08','2026-09'],86)]  # 86 من 92 — ناقص
Q_FULL = {'2026-Q3':92}
# نوافذ مقارنة متطابقة بين السنتين. القناة بدأت 05/2025، فنافذة «من أول السنة» تُضخّم النمو
# لأن يناير–أبريل 2025 أصفار — لذلك النافذة الأساسية تبدأ من مايو.
WINDOWS = {'ytd':('-01-01','-09-24'), 'may':('-05-01','-09-24'), 'q3':('-07-01','-09-24')}

lines = [r for r in recs if r['Customer Class'] in CLIN]

A = defaultdict(lambda: {'cls':'','reps':set(),'brands':set(),'skus':set(),'net_m':defaultdict(float),
                         'inv_m':defaultdict(set),'inv':set(),'net':0.0,'gross':0.0,'ret':0.0,
                         'units':0.0,'foc':0.0,'first':None,'last':None,
                         'win':defaultdict(float),'win_inv':defaultdict(set),'net_y':defaultdict(float)})
for r in lines:
    a = A[r['Account']]; m = r['Date'][:7]; yr = r['Date'][:4]; net = r['Net Sales'] or 0
    a['cls'] = a['cls'] or r['Customer Class']; a['reps'].add(r['Name'])
    a['net_m'][m] += net; a['net'] += net; a['net_y'][yr] += net
    for wk,(ws_,we_) in WINDOWS.items():
        if yr + ws_ <= r['Date'] <= yr + we_: a['win'][(wk,yr)] += net
    if r['Type'] == 'SalesInvoice':
        a['gross'] += r['Sales Gross'] or 0
        if net != 0:
            a['inv'].add(r['Invoice#']); a['inv_m'][m].add(r['Invoice#'])
            a['units'] += r['Quantity'] or 0; a['brands'].add(r['Brand']); a['skus'].add(r['Product'])
            a['first'] = min(a['first'] or r['Date'], r['Date']); a['last'] = max(a['last'] or r['Date'], r['Date'])
            for wk,(ws_,we_) in WINDOWS.items():
                if yr + ws_ <= r['Date'] <= yr + we_: a['win_inv'][(wk,yr)].add(r['Invoice#'])
        else: a['foc'] += r['Quantity'] or 0
    else: a['ret'] += -(net)

rows = []
for name, a in A.items():
    if not a['first']: continue
    first = datetime.date(*map(int, a['first'].split('-')))
    last  = datetime.date(*map(int, a['last'].split('-')))
    span  = ((END - first).days + 1) / 30.44
    active = [m for m in MONTHS if a['inv_m'][m]]
    q = {k: round(sum(a['net_m'][m] for m in ms), 1) for k, ms, _ in QUARTERS}
    W = {wk:(a['win'].get((wk,'2025'),0.0), a['win'].get((wk,'2026'),0.0)) for wk in WINDOWS}
    n25, n26 = W['may']          # النافذة الأساسية: مايو → 24 سبتمبر
    born26 = a['first'][:4] == '2026'
    y25, y26 = a['net_y'].get('2025',0.0), a['net_y'].get('2026',0.0)
    if a['net'] <= 0 and a['ret'] > 0 and y26 == 0:
                                     life, life_en = 'إرجاع كامل — لم يتحول إلى شراء', 'Fully returned — never converted'
    elif born26:                     life, life_en = 'جديدة في 2026', 'New in 2026'
    elif y26 == 0:                   life, life_en = 'مفقودة — لم تشترِ في 2026', 'Lost — no purchase in 2026'
    elif n25 == 0:                   life, life_en = 'عادت في نافذة 2026', 'Returned in the 2026 window'
    elif n26 > n25 * 1.1:            life, life_en = 'نامية', 'Growing'
    elif n26 < n25 * 0.9:            life, life_en = 'متراجعة', 'Declining'
    else:                            life, life_en = 'مستقرة', 'Stable'
    silent = (END - last).days
    if   silent <= 45:  st, st_en = 'نشطة', 'Active'
    elif silent <= 90:  st, st_en = 'تحتاج زيارة', 'Needs a visit'
    else:               st, st_en = 'منقطعة', 'Lapsed'
    if len(a['inv']) == 1: st, st_en = 'طلب واحد فقط', 'One order only'
    rows.append({
      'account':name, 'cls_ar':CLS_AR[a['cls']], 'cls_en':CLS_EN[a['cls']],
      'reps_ar':' + '.join(REP_AR.get(x,x) for x in sorted(a['reps'])), 'reps_en':' + '.join(sorted(a['reps'])),
      'first':a['first'], 'last':a['last'], 'silent':silent,
      'orders':len(a['inv']), 'net':round(a['net'],1), 'gross':round(a['gross'],1), 'ret':round(a['ret'],1),
      'units':round(a['units']), 'foc':round(a['foc']), 'brands':len(a['brands']), 'skus':len(a['skus']),
      'active_months':len(active), 'span_months':round(span,2),
      'avg_active':round(a['net']/len(active),1) if active else 0,
      'avg_span':round(a['net']/span,1) if span>0 else 0,
      'avg_order':round(a['net']/len(a['inv']),1) if a['inv'] else 0,
      'orders_per_month':round(len(a['inv'])/span,2) if span>0 else 0,
      'monthly':{m:round(a['net_m'][m],1) for m in MONTHS},
      'orders_monthly':{m:len(a['inv_m'][m]) for m in MONTHS},
      'q':q,
      'win25':round(n25,1), 'win26':round(n26,1),
      'growth':((n26-n25)/n25) if n25 else None,
      'ytd25':round(W['ytd'][0],1), 'ytd26':round(W['ytd'][1],1),
      'net25':round(y25,1), 'net26':round(y26,1),
      'q325':round(W['q3'][0],1),  'q326':round(W['q3'][1],1),
      'q3_growth':((W['q3'][1]-W['q3'][0])/W['q3'][0]) if W['q3'][0] else None,
      'win25_orders':len(a['win_inv'].get(('may','2025'),())), 'win26_orders':len(a['win_inv'].get(('may','2026'),())),
      'life_ar':life, 'life_en':life_en, 'status_ar':st, 'status_en':st_en,
    })
rows.sort(key=lambda x:-x['net'])

T = {'accounts':len(rows), 'net':round(sum(r['net'] for r in rows),1), 'orders':sum(r['orders'] for r in rows),
     'ret':round(sum(r['ret'] for r in rows),1),
     'monthly':{m:round(sum(r['monthly'][m] for r in rows),1) for m in MONTHS},
     'orders_monthly':{m:sum(r['orders_monthly'][m] for r in rows) for m in MONTHS},
     'active_accounts':{m:sum(1 for r in rows if r['orders_monthly'][m]>0) for m in MONTHS},
     'q':{k:round(sum(r['q'][k] for r in rows),1) for k,_,_ in QUARTERS},
     'win25':round(sum(r['win25'] for r in rows),1), 'win26':round(sum(r['win26'] for r in rows),1),
     'ytd25':round(sum(r['ytd25'] for r in rows),1), 'ytd26':round(sum(r['ytd26'] for r in rows),1),
     'q325':round(sum(r['q325'] for r in rows),1),  'q326':round(sum(r['q326'] for r in rows),1)}
T['growth']    = (T['win26']-T['win25'])/T['win25'] if T['win25'] else None
T['q3_growth'] = (T['q326']-T['q325'])/T['q325'] if T['q325'] else None
T['ytd_growth']= (T['ytd26']-T['ytd25'])/T['ytd25'] if T['ytd25'] else None

json.dump({'rows':rows,'total':T,'months':MONTHS,'label_ar':MONTH_LABEL_AR,'label_en':MONTH_LABEL_EN,
           'quarters':[[k,d] for k,_,d in QUARTERS],'q_full':Q_FULL,'end':str(END),'windows':WINDOWS},
          open('clinic_avg.json','w'), ensure_ascii=False, indent=1)

print('عيادات بشراء فعلي:', T['accounts'], '| طلبات:', T['orders'], '| صافي:', T['net'])
print('\nالشهري (كل العيادات):')
for m,l in zip(MONTHS, MONTH_LABEL_AR):
    print(f"   {l:14} {T['monthly'][m]:9.0f} د.ك  طلبات {T['orders_monthly'][m]:3}  عيادات نشطة {T['active_accounts'][m]:3}")
print('\nالأرباع:')
for k,_,dy in QUARTERS:
    mark = '  ← ناقص (%d من 92 يوماً)' % dy if k in Q_FULL else ''
    print(f"   {k}  {T['q'][k]:9.0f} د.ك   ({dy} يوم){mark}")
print(f"\nنوافذ متطابقة بين السنتين:")
print(f"   01/05→24/09 (الأساسية — القناة بدأت 05/2025):  2025 = {T['win25']:>9,.0f}   2026 = {T['win26']:>9,.0f}   {T['growth']*100:+.1f}%")
print(f"   01/07→24/09 (الربع الثالث، 86 يوماً لكل سنة):   2025 = {T['q325']:>9,.0f}   2026 = {T['q326']:>9,.0f}   {T['q3_growth']*100:+.1f}%")
print(f"   01/01→24/09 (مضلِّلة: 01–04/2025 أصفار):        2025 = {T['ytd25']:>9,.0f}   2026 = {T['ytd26']:>9,.0f}   {T['ytd_growth']*100:+.1f}%")
from collections import Counter
print('\nدورة الحياة:', dict(Counter(r['life_ar'] for r in rows)))
print('الحالة       :', dict(Counter(r['status_ar'] for r in rows)))
