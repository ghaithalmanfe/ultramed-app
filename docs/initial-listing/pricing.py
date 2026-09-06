# -*- coding: utf-8 -*-
"""التسعير الفعلي لكل صنف حسب القناة.

التمييز الجوهري: نحن نُفوتر بسعر القائمة كاملاً ونمنح بضاعة مجانية (FOC).
لذلك «السعر الفعلي للقطعة» = صافي المبيعات ÷ كل القطع المُسلَّمة (المدفوعة + المجانية)،
وهو ما تدفعه الصيدلية فعلياً عن كل قطعة على الرف، وعليه يُحسب هامشها من سعر الجمهور.
"""
import json
from collections import defaultdict

recs = json.load(open('raw.json'))
d    = json.load(open('classified.json'))

GRP = {'Hypermarkets and Supermarkets':'هايبر','Pharmacy':'صيدليات','Clinics':'عيادات','Hospital':'عيادات',
       'Doctors':'عيادات','Government':'عيادات','Online Customers':'أونلاين','Platform Customers':'أونلاين',
       'Other Customers':'أخرى'}
GRP_EN = {'هايبر':'Hypermarkets','صيدليات':'Pharmacies','عيادات':'Clinics','أونلاين':'Online','أخرى':'Other'}
MKT = {'Marketing and Advertisement','Marketing TePe','Marketing Univet','Marketing Philips',
       'Marketing Waterpik','Marketing The Breath co.'}

agg = defaultdict(lambda: defaultdict(lambda: {'paid':0.0,'foc':0.0,'gross':0.0,'net':0.0,'lines':0,'acc':set()}))
for r in recs:
    if r['Type'] != 'SalesInvoice': continue
    if (r['Quantity'] or 0) <= 0: continue
    if any(m in (r['Account'] or '') for m in ('Marketing',)): continue
    g = GRP.get((r['Customer Class'] or '').strip(), 'أخرى')
    a = agg[r['Product'].strip()][g]
    net = r['Net Sales'] or 0
    if net == 0: a['foc'] += r['Quantity']
    else:        a['paid'] += r['Quantity']
    a['gross'] += r['Sales Gross'] or 0
    a['net']   += net
    a['lines'] += 1
    a['acc'].add(r['Account'])

price = {}
for prod, groups in agg.items():
    rec = {}
    for g, a in groups.items():
        units = a['paid'] + a['foc']
        if units <= 0: continue
        rec[g] = {
            'paid': round(a['paid']), 'foc': round(a['foc']),
            'foc_share': a['foc']/units,
            'list_px': round(a['gross']/units, 3) if units else None,   # سعر القائمة كما في ERP
            'paid_px': round(a['net']/a['paid'], 3) if a['paid'] else None,
            'eff_px':  round(a['net']/units, 3),                        # السعر الفعلي للقطعة المُسلَّمة
            'net': round(a['net'], 1), 'lines': a['lines'], 'accounts': len(a['acc']),
        }
    if rec: price[prod] = rec
json.dump(price, open('channel_price.json','w'), ensure_ascii=False, indent=1)

for o in d:
    c = price.get(o['المنتج / Product'].strip(), {})
    o['ch_price'] = c
    for g, key in (('هايبر','hyper'),('صيدليات','pharm'),('عيادات','clin'),('أونلاين','online')):
        o[key+'_eff'] = c.get(g,{}).get('eff_px')
        o[key+'_foc'] = c.get(g,{}).get('foc_share')
        o[key+'_units'] = (c.get(g,{}).get('paid',0) + c.get(g,{}).get('foc',0)) or 0
    o['erp_list'] = next((c[g]['list_px'] for g in ('هايبر','صيدليات','عيادات','أونلاين') if g in c), None)
    # الهامش عند سعر الجمهور، بالسعر الفعلي لكل قناة
    o['margin_pharm'] = ((o['rrp'] - o['pharm_eff'])/o['rrp']) if (o['rrp'] and o['pharm_eff']) else None
    o['margin_hyper'] = ((o['rrp'] - o['hyper_eff'])/o['rrp']) if (o['rrp'] and o['hyper_eff']) else None
    o['margin_clin']  = ((o['rrp'] - o['clin_eff'])/o['rrp'])  if (o['rrp'] and o['clin_eff'])  else None
    # تحقق: هل سعر القائمة في ERP يطابق سعر الجمهور في قائمة الأسعار؟
    o['price_match'] = (abs(o['erp_list'] - o['rrp']) < 0.01) if (o['rrp'] and o['erp_list']) else None

json.dump(d, open('classified.json','w'), ensure_ascii=False, indent=1)

P1=[o for o in d if o['phase']==1]
ok = [o for o in d if o['price_match'] is True]; bad=[o for o in d if o['price_match'] is False]
print('أصناف يطابق فيها سعر ERP سعر قائمة الأسعار:', len(ok), '| يختلف:', len(bad))
print('\n--- اختلاف بين سعر ERP وسعر قائمة الأسعار ---')
for o in sorted(bad, key=lambda o:-o['kd']):
    print(f"   {o['المنتج / Product'][:48]:50} قائمة الأسعار={o['rrp']:8.2f}  ERP={o['erp_list']:8.2f}  kd={o['kd']:8.0f} ph={o['phase']}")
print('\n--- المرحلة 1: الهامش الفعلي للصيدلية (صافي ÷ كل القطع المُسلَّمة) ---')
rows=[o for o in P1 if o['margin_pharm'] is not None]
for o in sorted(rows, key=lambda o:o['margin_pharm']):
    print(f"   {o['المنتج / Product'][:44]:46} RRP={o['rrp']:7.2f} فعلي={o['pharm_eff']:7.2f} مجاني={o['pharm_foc']*100:4.0f}% هامش={o['margin_pharm']*100:5.1f}% قطع={o['pharm_units']:5.0f}")
print(f'\nأصناف المرحلة 1 التي بيعت لصيدليات فعلاً: {len(rows)} من {len(P1)}')
