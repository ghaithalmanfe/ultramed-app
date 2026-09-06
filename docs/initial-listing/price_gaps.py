# -*- coding: utf-8 -*-
"""فجوات وتعارضات التسعير — ما يمنع إصدار عرض سعر اليوم."""
import json
from collections import defaultdict
d  = json.load(open('classified.json'))
pl = json.load(open('pricelist.json'))

TOL = 0.05   # فرق ≤ 5% = تقريب/تباين طبيعي · أكثر = تعارض حقيقي
gaps = {'no_price':[], 'conflict':[], 'dup_sku':[], 'no_movement':[], 'thin_margin':[]}

for o in sorted(d, key=lambda o:-o['kd']):
    if o['phase'] in (1,2) and o['rrp'] is None and o['units'] > 0:
        gaps['no_price'].append({'brand':o['brand'],'brand_en':o['brand_en'],'product':o['المنتج / Product'],
            'phase':o['phase'],'kd':o['kd'],'px':o['px'],'channel':o['channel'],'channel_en':o['channel_en'],'units':o['units']})
    if o['rrp'] and o['erp_list'] and abs(o['erp_list']-o['rrp'])/o['rrp'] > TOL:
        gaps['conflict'].append({'brand':o['brand'],'brand_en':o['brand_en'],'product':o['المنتج / Product'],
            'phase':o['phase'],'rrp':o['rrp'],'erp':o['erp_list'],'diff':(o['erp_list']-o['rrp'])/o['rrp'],'kd':o['kd'],
            'src':o['rrp_src'],'rrp_name':o['rrp_name']})
    if o['margin_pharm'] is not None and o['margin_pharm'] < 0.22 and o['phase'] in (1,2):
        gaps['thin_margin'].append({'brand':o['brand'],'brand_en':o['brand_en'],'product':o['المنتج / Product'],
            'phase':o['phase'],'rrp':o['rrp'],'eff':o['pharm_eff'],'foc':o['pharm_foc'],'margin':o['margin_pharm'],
            'units':o['pharm_units'],'kd':o['kd']})

sku_rows = defaultdict(list)
for p in pl:
    if p['sku'] and not p['sku'].startswith('WEB-'): sku_rows[p['sku']].append(p)
for sku, rows in sorted(sku_rows.items(), key=lambda x:-len(x[1])):
    if len(rows) > 1:
        gaps['dup_sku'].append({'sku':sku,'count':len(rows),
            'items':[{'name':r['Name'],'price':r['price'],'brand':r['Brand']} for r in rows],
            'barcode':rows[0]['Barcode']})
for p in pl:
    if not p['_matched']:
        gaps['no_movement'].append({'name':p['Name'],'brand':p['Brand'],'price':p['price'],
            'sku':p['sku'],'reason':p['_level'] or 'لا يقابله صنف في حركة 2026'})

json.dump(gaps, open('price_gaps.json','w'), ensure_ascii=False, indent=1)
for k,v in gaps.items(): print(k, len(v))
print('\n--- تعارضات مادية (>5%) ---')
for c in gaps['conflict']:
    print(f"   {c['product'][:46]:48} قائمة={c['rrp']:8.2f} ERP={c['erp']:8.2f} فرق={c['diff']*100:+6.1f}% kd={c['kd']:7.0f}")
print('\n--- هوامش رقيقة للصيدلية (<22%) ---')
for t in gaps['thin_margin']:
    print(f"   {t['product'][:46]:48} RRP={t['rrp']:7.2f} فعلي={t['eff']:6.2f} مجاني={t['foc']*100:3.0f}% هامش={t['margin']*100:5.1f}%")
