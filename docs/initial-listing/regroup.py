# -*- coding: utf-8 -*-
"""إعادة بناء القائمة على مستوى «عائلة المنتج» بدل كود ERP.

المشكلتان اللتان يصلحهما هذا السكربت:
  1. تكرار: كل لون/حجم/بوكس ترويجي كان سطراً مستقلاً في عرض السعر.
  2. تسرّب: معدات وقطع غيار ومستهلكات مهنية دخلت عرض الصيدليات.

المدخلات: items.json (الأصناف بأرقامها) + families.json (مخرجات المراجعة: عائلة ونوع وقناة لكل صنف).
"""
import json
from collections import defaultdict

P = '/tmp/claude-0/-home-user-ultramed-app/5e83bd61-89ed-55af-b6db-bc42151bf489/scratchpad/'
items = json.load(open(P + 'items.json'))
review = json.load(open(P + 'families.json'))

# ---------- خريطة الحكم لكل صنف ----------
def nkey(n): return ' '.join(str(n).replace('\xa0',' ').split()).lower()
J = {}
for b in review['brands']:
    rule = {r['product']: r for r in b['rulings']}
    for s in b['skus']:
        r = rule.get(s['product'])
        ch = s['channel']
        if r and not r['stays']:
            ch = r['move_to']                       # المراجع الخصم أخرجه من الصيدليات
        J[nkey(s['product'])] = {
            'family': s['family'].strip(), 'variant': (s['variant'] or '').strip(),
            'item_type': s['item_type'], 'channel': ch, 'reason': s['reason'],
            'evicted': bool(r and not r['stays']), 'evict_why': (r or {}).get('why', ''),
        }

TYPE_AR = {'standalone_product':'منتج','accessory_or_spare':'ملحق / قطعة غيار','promo_pack':'عبوة ترويجية',
           'equipment':'معدة','professional_consumable':'مستهلك مهني','trade_bulk_pack':'عبوة تجارية','service_or_nonproduct':'خدمة'}
TYPE_EN = {'standalone_product':'Product','accessory_or_spare':'Accessory / spare','promo_pack':'Promo pack',
           'equipment':'Equipment','professional_consumable':'Professional consumable','trade_bulk_pack':'Trade pack','service_or_nonproduct':'Service'}
CH_AR = {'pharmacy':'صيدليات','clinic':'عيادات','both':'صيدليات + عيادات','direct_online':'مباشر / أونلاين','do_not_list':'لا يُدرج'}
CH_EN = {'pharmacy':'Pharmacies','clinic':'Clinics','both':'Pharmacies + Clinics','direct_online':'Direct / Online','do_not_list':'Not listed'}

unmatched = [i['المنتج'] for i in items if nkey(i['المنتج']) not in J]

# ---------- تجميع العائلات ----------
def num(x): return x or 0
fam = defaultdict(lambda: {'skus': [], 'brand': '', 'family': ''})
for i in items:
    j = J.get(nkey(i['المنتج']))
    if not j: continue
    key = (i['البراند'], j['family'])
    f = fam[key]; f['brand'] = i['البراند']; f['family'] = j['family']
    f['skus'].append({**i, **j})

FAMS = []
for (brand, famname), f in fam.items():
    core = [s for s in f['skus'] if s['item_type'] not in ('promo_pack',)]
    base = core or f['skus']
    sold = [s for s in f['skus'] if num(s.get('قطع مبيعة 2026')) > 0]
    units = sum(num(s.get('قطع مبيعة 2026')) for s in f['skus'])
    kd    = sum(num(s.get('صافي المبيعات KD')) for s in f['skus'])
    # القناة: الأكثر تكراراً بين أصناف العائلة الأساسية، مرجّحة بالقيمة
    chw = defaultdict(float)
    for s in base: chw[s['channel']] += num(s.get('صافي المبيعات KD')) + 1
    channel = max(chw, key=chw.get)
    tyw = defaultdict(float)
    for s in base: tyw[s['item_type']] += num(s.get('صافي المبيعات KD')) + 1
    item_type = max(tyw, key=tyw.get)
    phase = min((s['phase'] for s in f['skus'] if s['phase'] > 0), default=0)
    variants = [s['variant'] for s in core if s['variant']]
    promos   = [s for s in f['skus'] if s['item_type'] == 'promo_pack']
    rrps = [num(s['سعر الجمهور KD']) for s in f['skus'] if isinstance(s.get('سعر الجمهور KD'), (int, float))]
    effs = [num(s['السعر الفعلي للصيدلية KD']) for s in f['skus'] if isinstance(s.get('السعر الفعلي للصيدلية KD'), (int, float))]
    mars = [s['هامش الصيدلية %'] for s in f['skus'] if isinstance(s.get('هامش الصيدلية %'), float)]
    cls_rank = {'سريع الحركة':0, 'متوسط الحركة':1, 'بطيء الحركة':2}
    cls = sorted((s.get('التصنيف الحالي') for s in f['skus'] if s.get('التصنيف الحالي')),
                 key=lambda c: cls_rank.get(c, 3))
    FAMS.append({
        'brand': brand, 'family': famname, 'channel': channel, 'channel_ar': CH_AR[channel], 'channel_en': CH_EN[channel],
        'item_type': item_type, 'type_ar': TYPE_AR[item_type], 'type_en': TYPE_EN[item_type],
        'phase': phase, 'sku_count': len(f['skus']), 'variants': variants, 'variant_count': len(variants),
        'promo_count': len(promos), 'promo_names': [p['المنتج'] for p in promos],
        'units': round(units), 'kd': round(kd, 1),
        'customers': max((num(s.get('عدد العملاء')) for s in f['skus']), default=0),
        'upm': round(sum(num(s.get('قطع/شهر')) for s in f['skus']), 1),
        'ipm': round(max((num(s.get('فواتير/شهر')) for s in f['skus']), default=0), 2),
        'cls': cls[0] if cls else '—',
        'rrp': max(rrps) if rrps else None,
        'eff': (sum(effs) / len(effs)) if effs else None,
        'margin': (sum(mars) / len(mars)) if mars else None,
        'codes': ' · '.join(sorted({str(s['الكود']) for s in f['skus'] if s.get('الكود') and s['الكود'] != '—'}))[:120],
        'skus': [{'product': s['المنتج'], 'variant': s['variant'], 'type': s['item_type'],
                  'phase': s['phase'], 'units': round(num(s.get('قطع مبيعة 2026'))), 'kd': round(num(s.get('صافي المبيعات KD')), 1),
                  'evicted': s['evicted'], 'evict_why': s['evict_why'], 'reason': s['reason']} for s in f['skus']],
        'evicted_any': any(s['evicted'] for s in f['skus']),
        'reason': (base[0]['reason'] if base else ''),
    })
FAMS.sort(key=lambda f: -f['kd'])
json.dump({'families': FAMS, 'unmatched': unmatched}, open(P + 'regrouped.json', 'w'), ensure_ascii=False, indent=1)

from collections import Counter
print('أصناف:', len(items), '| مطابَقة في المراجعة:', len(items) - len(unmatched), '| غير مطابَقة:', len(unmatched))
if unmatched:
    print('  غير مطابَقة:', unmatched[:10])
print('عائلات:', len(FAMS), ' (الاختزال:', len(items), '→', len(FAMS), ')')
print('\nحسب القناة:', dict(Counter(f['channel_ar'] for f in FAMS)))
print('حسب النوع :', dict(Counter(f['type_ar'] for f in FAMS)))
ph1 = [f for f in FAMS if f['phase'] == 1]
print('\nالمرحلة 1:', len(ph1), 'عائلة ·', round(sum(f['kd'] for f in ph1)), 'د.ك')
print('  صيدليات:', sum(1 for f in ph1 if f['channel'] in ('pharmacy','both')),
      '| عيادات:', sum(1 for f in ph1 if f['channel'] in ('clinic','both')))
ev = [s for f in FAMS for s in f['skus'] if s['evicted']]
print('\nأصناف أخرجها المراجع الخصم من عرض الصيدليات:', len(ev))
for s in ev[:25]: print(f"   {s['product'][:58]:60} — {s['evict_why'][:70]}")
