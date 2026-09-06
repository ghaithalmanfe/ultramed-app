# -*- coding: utf-8 -*-
import json, datetime
from collections import defaultdict

END = datetime.date(2026, 9, 6)
d = json.load(open('list.json'))
def n(x): return x or 0

PRO_BRANDS = {'UNIVET','B&L Biotech','SCHEU','Intensiv','Combo/Bundle/Kit (أطقم مخصصة)','EverBrands'}

for o in d:
    o['units']   = n(o['قطع مبيعة (مدفوعة)'])
    o['upm']     = n(o['قطع / شهر'])
    o['upm3']    = n(o['آخر 3 أشهر: قطع / شهر'])
    o['ipm']     = n(o['فواتير / شهر'])
    o['cust']    = n(o['عدد العملاء'])
    o['kd']      = n(o['صافي المبيعات KD'])
    o['px']      = n(o['متوسط سعر القطعة KD'])
    o['ret_inv'] = n(o['مرتجعات على فواتير 2026'])
    o['ret_stk'] = n(o['مرتجعات مخزون بدون فاتورة'])
    o['ret']     = o['ret_inv'] + o['ret_stk']
    o['note']    = o['ملاحظات'] or ''
    o['cls']     = o['التصنيف / Class'].split(' / ')[0]
    last = o['آخر بيع']
    o['days'] = (END - datetime.date(*map(int,last.split('-')))).days if last else 999
    tot = n(o['قطع فريق العيادات']) + n(o['قطع القنوات الأخرى'])
    o['clinic_share'] = (n(o['قطع فريق العيادات'])/tot) if tot > 0 else (1.0 if o['brand'] in PRO_BRANDS else 0.0)
    o['ret_ratio'] = (o['ret']/o['units']) if o['units'] else 0
    o['ret_inv_ratio'] = (o['ret_inv']/o['units']) if o['units'] else 0
    o['ret_stk_ratio'] = (o['ret_stk']/o['units']) if o['units'] else 0

# ---------- القناة ----------
def channel(o):
    if o['brand'] in PRO_BRANDS or o['px'] >= 100: return 'عيادات'
    cs = o['clinic_share']
    if cs >= 0.75: return 'عيادات'
    if cs <= 0.20: return 'صيدليات'
    return 'صيدليات + عيادات'
for o in d: o['channel'] = channel(o)

# ---------- الصحة ----------
def issues(o):
    f=[]
    if o['units'] and o['ret'] >= o['units']: f.append('المرتجعات ≥ المبيعات (صافي الحركة صفر أو سالب)')
    if o['ret_inv_ratio'] >= 0.20: f.append('مرتجعات من العملاء %d%% من المبيع' % round(o['ret_inv_ratio']*100))
    if 'تراجع' in o['note']: f.append('تراجع: آخر 3 أشهر أقل من 40%% من المعدل (%.0f مقابل %.0f قطعة/شهر)' % (o['upm3'], o['upm']))
    if o['days'] > 60: f.append('لم يُبع منذ %d يوم' % o['days'])
    if o['ret_stk_ratio'] >= 0.35 and o['ret'] < o['units']: f.append('مرتجعات مخزون بدون فاتورة %d%% (تصفية رفوف/بضاعة سنوات سابقة — ليست رفض عميل)' % round(o['ret_stk_ratio']*100))
    if 'تعبئة أولية' in o['note']: f.append('تعبئة أولية: جزء كبير من البيع في شهر واحد')
    if 'منتج جديد' in o['note']: f.append('منتج جديد — قاعدة بيانات قصيرة')
    return f
for o in d: o['issues'] = issues(o)
def blocked(o):
    return any(i.startswith(('المرتجعات ≥','مرتجعات من العملاء','تراجع:','لم يُبع منذ')) for i in o['issues'])
BLOCKING = ('المرتجعات ≥','مرتجعات من العملاء','تراجع:')

# ---------- المعدات المهنية: التصنيف بالقيمة لا بعدد الفواتير ----------
for o in d:
    o['pro_equip'] = (o['px'] >= 100)

# ---------- المرحلة 1 ----------
CEIL = 8
by_brand = defaultdict(list)
for o in d: by_brand[o['brand']].append(o)

for o in d: o['phase'] = None; o['reason'] = ''

for br, items in by_brand.items():
    fast_ok = sorted([o for o in items if o['cls'].startswith('سريع') and not blocked(o)],
                     key=lambda o: (-o['units'], -o['kd']))
    core = fast_ok[:CEIL]
    for o in core:
        o['phase'] = 1
        o['reason'] = 'سريع الحركة: %.1f فاتورة/شهر · %.0f قطعة/شهر · %d عميل' % (o['ipm'], o['upm'], o['cust'])
    for o in fast_ok[CEIL:]:
        o['phase'] = 2
        o['reason'] = 'سريع الحركة لكن خارج أعلى %d أصناف في البراند — يُضاف بعد ثبات المرحلة 1' % CEIL
    if not core:  # قاطرة البراند: براند بلا أي صنف سريع سليم
        cand = sorted([o for o in items if o['days'] <= 90 and (o['units'] >= 10 or o['kd'] >= 500)],
                      key=lambda o: -o['kd'])[:2]
        for o in cand:
            o['phase'] = 1
            o['reason'] = 'قاطرة البراند: أعلى صنف قيمةً في براند بلا أصناف سريعة (%.0f د.ك · %d عميل · آخر بيع قبل %d يوم)' % (o['kd'], o['cust'], o['days'])

# ---------- المرحلة 2 ----------
for o in d:
    if o['phase']: continue
    if o['units'] == 0: continue
    if o['cls'].startswith('متوسط') and o['days'] <= 90 and not any(i.startswith(BLOCKING) for i in o['issues']):
        o['phase'] = 2; o['reason'] = 'متوسط الحركة: %.1f فاتورة/شهر · %d عميل — طلب ثابت لكن أقل تكراراً' % (o['ipm'], o['cust'])
    elif o['cls'].startswith('سريع'):
        o['phase'] = 2; o['reason'] = 'سريع الحركة لكن عليه ملاحظة: ' + ' · '.join(o['issues'])
    elif o['pro_equip'] and o['days'] <= 120 and o['kd'] >= 500:
        o['phase'] = 2; o['reason'] = 'معدة مهنية: تقاس بالقيمة لا بعدد الفواتير (%.0f د.ك من %d عميل)' % (o['kd'], o['cust'])

# ---------- المرحلة 3 / خارج القائمة ----------
for o in d:
    if o['phase']: continue
    if o['units'] == 0:
        o['phase'] = 0; o['reason'] = 'بلا بيع مدفوع في 2026 — ' + (o['note'] or 'يُراجع قبل أي إدراج')
    elif o['days'] <= 120:
        o['phase'] = 3; o['reason'] = 'بطيء الحركة لكنه حيّ: %.2f فاتورة/شهر · آخر بيع قبل %d يوم' % (o['ipm'], o['days'])
    else:
        o['phase'] = 0; o['reason'] = 'راكد: لم يُبع منذ %d يوم — يُراجع (تصفية / سحب من القائمة)' % o['days']

# ---------- الأولوية داخل المرحلة ----------
for ph in (1,2,3):
    items = sorted([o for o in d if o['phase']==ph], key=lambda o:-o['kd'])
    tot = sum(o['kd'] for o in items) or 1
    run=0
    for o in items:
        run += o['kd']
        o['prio'] = 'A' if run/tot <= 0.60 else ('B' if run/tot <= 0.90 else 'C')

json.dump(d, open('classified.json','w'), ensure_ascii=False, indent=1)

tot_kd = sum(o['kd'] for o in d)
print('إجمالي المبيعات:', round(tot_kd))
for ph,name in [(1,'المرحلة 1'),(2,'المرحلة 2'),(3,'المرحلة 3'),(0,'خارج القائمة')]:
    it=[o for o in d if o['phase']==ph]
    kd=sum(o['kd'] for o in it)
    print(f'{name}: {len(it)} صنف · {round(kd)} د.ك · {kd/tot_kd*100:.1f}% · براندات {len(set(o["brand"] for o in it))}')
    if ph==1:
        for br in sorted(set(o['brand'] for o in it)):
            sub=[o for o in it if o['brand']==br]
            print('    ',br, len(sub), round(sum(x['kd'] for x in sub)))

# ================= English rendering pass (same rules, same data) =================
CLS_EN = {'سريع':'Fast-moving','متوسط':'Mid-moving','بطيء':'Slow-moving','بدون':'No paid sales'}
CH_EN  = {'صيدليات':'Pharmacies','عيادات':'Clinics','صيدليات + عيادات':'Pharmacies + Clinics'}
BR_EN  = {'Combo/Bundle/Kit (أطقم مخصصة)':'Combo/Bundle/Kit (custom kits)'}

def issues_en(o):
    f=[]
    if o['units'] and o['ret'] >= o['units']: f.append('Returns ≥ sales (net movement zero or negative)')
    if o['ret_inv_ratio'] >= 0.20: f.append('Customer returns %d%% of units sold' % round(o['ret_inv_ratio']*100))
    if 'تراجع' in o['note']: f.append('Declining: last 3 months below 40%% of period average (%.0f vs %.0f units/month)' % (o['upm3'], o['upm']))
    if o['days'] > 60: f.append('No sale in %d days' % o['days'])
    if o['ret_stk_ratio'] >= 0.35 and o['ret'] < o['units']: f.append('Non-invoice stock returns %d%% (shelf clearance / prior-year goods — not a customer rejection)' % round(o['ret_stk_ratio']*100))
    if 'تعبئة أولية' in o['note']: f.append('Initial fill: a large share of sales landed in a single month')
    if 'منتج جديد' in o['note']: f.append('New product — short sales history')
    return f

for o in d:
    o['cls_en']     = CLS_EN[o['cls'].split(' ')[0][:5].replace('بدون','بدون')] if o['cls'][:4] not in CLS_EN else CLS_EN[o['cls'][:4]]
    o['brand_en']   = BR_EN.get(o['brand'], o['brand'])
    o['channel_en'] = CH_EN[o['channel']]
    o['issues_en']  = issues_en(o)

# reason_en mirrors the reason built above, rule by rule
for br, items in by_brand.items():
    fast_ok = sorted([o for o in items if o['cls'].startswith('سريع') and not blocked(o)],
                     key=lambda o: (-o['units'], -o['kd']))
    for o in fast_ok[:CEIL]:
        o['reason_en'] = 'Fast-moving: %.1f invoices/month · %.0f units/month · %d customers' % (o['ipm'], o['upm'], o['cust'])
    for o in fast_ok[CEIL:]:
        o['reason_en'] = 'Fast-moving but outside the brand top %d — added once Phase 1 is established' % CEIL
    if not fast_ok:
        for o in sorted([x for x in items if x['days'] <= 90 and (x['units'] >= 10 or x['kd'] >= 500)], key=lambda x:-x['kd'])[:2]:
            o['reason_en'] = 'Brand anchor: highest-value item in a brand with no fast movers (%.0f KD · %d customers · last sale %d days ago)' % (o['kd'], o['cust'], o['days'])
for o in d:
    if o.get('reason_en'): continue
    if o['phase'] == 2:
        if o['cls'].startswith('متوسط'):
            o['reason_en'] = 'Mid-moving: %.1f invoices/month · %d customers — steady but less frequent demand' % (o['ipm'], o['cust'])
        elif o['cls'].startswith('سريع'):
            o['reason_en'] = 'Fast-moving but flagged: ' + ' · '.join(o['issues_en'])
        else:
            o['reason_en'] = 'Professional equipment: judged on value, not invoice count (%.0f KD from %d customers)' % (o['kd'], o['cust'])
    elif o['phase'] == 3:
        o['reason_en'] = 'Slow-moving but alive: %.2f invoices/month · last sale %d days ago' % (o['ipm'], o['days'])
    elif o['phase'] == 0:
        if o['units'] == 0:
            o['reason_en'] = 'No paid sales in 2026 — free-of-charge or returns only; review before any listing'
        else:
            o['reason_en'] = 'Dormant: no sale in %d days — review (clearance / delist)' % o['days']
    else:
        o['reason_en'] = ''

json.dump(d, open('classified.json','w'), ensure_ascii=False, indent=1)
missing = [o['المنتج / Product'] for o in d if not o.get('reason_en')]
print('missing reason_en:', len(missing))
print('sample cls_en:', sorted(set(o['cls_en'] for o in d)))
