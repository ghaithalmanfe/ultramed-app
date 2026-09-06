# -*- coding: utf-8 -*-
"""ربط قائمة الأسعار (سعر البيع للجمهور) بقائمة الأصناف.

سياسة محافظة: لا يُسنَد سعر إلا بمطابقة يمكن الدفاع عنها.
  مستوى 1 «كود فريد»       : كود المنتج في قائمة الأسعار غير مكرر ويطابق كود ERP.
  مستوى 2 «مطابقة مُراجَعة» : عائلة منتج واضحة بسعر واحد لكل ألوانها، رُوجعت يدوياً.
  مستوى 3 «غير مؤكد»        : كود مكرر أو تعارض في السعر — لا يُسنَد سعر، ويُدرج في ورقة الفجوات.
"""
import json, re
from collections import defaultdict

pl = json.load(open('pricelist.json'))
d  = json.load(open('classified.json'))

for p in pl:
    p['price'] = float(p['Price (د.ك)']) if (p['Price (د.ك)'] or '').strip() else None
    p['sku']   = (p['SKU/ID'] or '').strip()
    p['_matched'] = False; p['_targets'] = []; p['_level'] = None

# ---------- الأكواد المكررة داخل قائمة الأسعار ----------
sku_rows = defaultdict(list)
for p in pl:
    if p['sku'] and not p['sku'].startswith('WEB-'): sku_rows[p['sku']].append(p)
DUP_SKU = {s for s, rows in sku_rows.items() if len(rows) > 1}

# ---------- فهرس أكواد القائمة ----------
code_items = defaultdict(list)   # token -> [items]
exact_items = defaultdict(list)  # full code string -> [items]
for o in d:
    full = (o['الكود / Code'] or '').strip()
    if full: exact_items[full.lower()].append(o)
    for c in re.split(r'[,\s]+', full):
        if c: code_items[c.strip().lower()].append(o)
byname = {o['المنتج / Product'].strip().lower(): o for o in d}

# ---------- مطابقة العائلات المُراجَعة يدوياً ----------
FAMILY = {
 'Cordless Plus Water Flosser': ['Waterpik Cordless Plus BLACK','Waterpik Cordless Plus WHITE'],
 'Philips One by Sonicare Battery Toothbrush': [
    'PhilipsOne Battery Toothbrush BY Sonicare, Midnight Blue','PhilipsOne Battery Toothbrush By Sonicare, Mint Blue',
    'PhilipsOne Battery Toothbrush by Sonicare, Miami Coral','PhilipsOne Battery Toothbrush by Sonicare, Mango Yellow'],
 'Philips One by Sonicare Brush Heads': [
    'PhilipsOne brush head Midnight Blue','PhilipsOne brush head Mint Blue',
    'PhilipsOne brush head Miami Coral','PhilipsOne brush head Mango Yellow'],
 'Philips Sonicare ProtectiveClean 4300': ['Protective Clean 4300 BLACK','Protective Clean 4300 LIGHT BLUE'],
 'Tongue Scraper with Travel Pouch': ['Flash Tongue Scraper Pink','Flash Tongue Scraper Dark Blue'],
 'Undo Pimple Patches': ['Undo Pimple Patches'],
 'Undo Microneedle Pimple Patches': ['Undo Microneedle Patches'],
 'Undo Nose Patches': ['Undo Nose Patches'],
 'Mini Fridge': ['Mini Fridge 4L SLRE01B Black','Mini Fridge 4L SLRE01P Pink','Mini Fridge 4L SLRE01B1 White'],
 'TePe Supreme - Soft - Toothbrush Pack of 3 (2+1 Free)': ['Supreme Soft 3-pack Blister INT'],
 'TePe Supreme Soft - Sustainable Toothbrush': ['Supreme Soft Blister INT SRP'],
 'TePe Nova Toothbrush - Soft - Pack of 3 (2+1 Free)':   ['Nova Soft Blister 3-pack Blister INT'],
 'TePe Nova Toothbrush - X Soft - Pack of 3 (2+1 Free)': ['Nova X-Soft Blister 3-pack Blister INT'],
 'TePe Nova Soft - Sustainable Toothbrush':   ['Nova Soft Blister INT SRP'],
 'TePe Nova X-soft - Sustainable Toothbrush': ['Nova X-Soft Blister INT SRP'],
 'TePe Choice Toothbrush': ['Choice Regular Soft INT SRP'],
 'TePe Colour Soft Toothbrush Pack Of 3': ['Colour Soft 3-pack Blister INT'],
 'Philips Sonicare Compact Flosser 1000 - Blue':   ['Compact Flosser 1000 BLUE'],
 'Philips Sonicare Compact Flosser 1000 - Purple': ['Compact Flosser 1000 PURPLE'],
 'Philips One by Sonicare Brush Heads ': [],
 'Flash Kids Flosser - Sea Animal Shapes': ['Flash Kids Flosser Sea Animal'],
 'Perfect White Black Remineralisation Repair Whitening Charcoal Toothpaste': ['Perfect White Black Toothpaste 100ML'],
 'Perfect White Extreme White Teeth Whitening Toothpaste': ['Perfect White Extreme White Toothpaste 100 ML'],
 'Philips Sonicare W2 Optimal White': ['W2 Optimal White Brush Head','W2 Optimal White Brush Head Black'],
 'TePe EasyFit - M/L': ['EasyFit M/L INT'],
 'TePe EasyFit - S/M': ['EasyFit S/M INT'],
 'TePe Implant Care Kit': ['Implant Care Kit'],
 'TePe Original Black (1.5 mm) Interdental Brush':  ['Idb Black Blister 1.5mm'],
 'TePe Original Blue (0.6 mm) Interdental Brush':   ['Idb Blue Blister 0.6 Mm'],
 'TePe Original Grey (1.3 mm) Interdental Brush':   ['Idb Grey Blister 1.3mm'],
 'TePe Original Orange (0.45 mm) Interdental Brush':['Idb Orange Blister 0.45 Mm'],
 'TePe Original Pink (0.4 mm) Interdental Brush':   ['Idb Pink Blister 0.4 Mm'],
 'TePe Original Red (0.5 mm) Interdental Brush':    ['Idb Red Blister 0.5 Mm'],
 'TePe Original Yellow (0.7 mm) Interdental Brush': ['Idb Yellow Blister 0.7 Mm'],
 'TePe Original Interdental Brush Mixed Pack': ['Idb Mixed Pack Blister Int.'],
 'Extra Soft Interdental Brush Mixed Pack': ['Extra Soft Interdental Brush Mixed Pack'],
 'TePe Angle Mixed Pack': ['IDB Angle Blister Mixed pack all sizes'],
 'Philips Sonicare Rechargeable Toothbrush 5300 Series': [
    'Philips Sonicare Rechargeable Toothbrush 5300  Series Black','Philips Sonicare Rechargeable Toothbrush 5300  Series White'],
 'Philips Sonicare C1 ProResults': ['C1 ProResults Brush Heads'],
}

# ---------- تعارضات السعر: منتجان متطابقان اسماً بسعرين ----------
CONFLICT = [
 ('Philips Sonicare 1100 Series', 'Philips Sonicare Rechargeable Toothbrush 1100 Series'),
 ('Philips Sonicare 2100 Series', 'Philips Sonicare Rechargeable Toothbrush 2100 Series'),
]
conflict_names = {n for pair in CONFLICT for n in pair}

for o in d:
    o['rrp'] = None; o['rrp_src'] = None; o['rrp_name'] = None

quarantined = []
for p in pl:
    targets, level = [], None
    if p['Name'] in FAMILY:
        targets = [byname[n.strip().lower()] for n in FAMILY[p['Name']] if n.strip().lower() in byname]
        level = 'مطابقة مُراجَعة'
    elif p['sku'] and not p['sku'].startswith('WEB-'):
        if p['sku'] in DUP_SKU:
            quarantined.append(p); p['_level'] = 'كود مكرر — لم يُسنَد'
            continue
        targets = exact_items.get(p['sku'].lower()) or code_items.get(p['sku'].lower()) or []
        level = 'كود فريد'
    if p['Name'] in conflict_names and p['Name'] not in FAMILY:
        quarantined.append(p); p['_level'] = 'تعارض سعر — لم يُسنَد'
        continue
    if targets:
        p['_matched'] = True; p['_level'] = level
        p['_targets'] = [o['المنتج / Product'] for o in targets]
        for o in targets:
            o['rrp'] = p['price']; o['rrp_src'] = level; o['rrp_name'] = p['Name']

# ---------- الهامش ----------
for o in d:
    o['margin'] = ((o['rrp'] - o['px']) / o['rrp']) if (o['rrp'] and o['rrp'] > 0 and o['px']) else None

json.dump(d,  open('classified.json','w'), ensure_ascii=False, indent=1)
json.dump(pl, open('pricelist.json','w'),  ensure_ascii=False, indent=1)

P1=[o for o in d if o['phase']==1]
print('صفوف قائمة الأسعار:', len(pl), '| مطابَقة:', sum(1 for p in pl if p['_matched']), '| محجوزة (كود مكرر/تعارض):', len(quarantined))
print('أصناف القائمة بسعر معتمد:', sum(1 for o in d if o['rrp'] is not None), '/', len(d))
print('المرحلة 1 بسعر معتمد:', sum(1 for o in P1 if o['rrp'] is not None), '/', len(P1))
print('\n--- المرحلة 1 بلا سعر ---')
for o in sorted([o for o in P1 if o['rrp'] is None], key=lambda o:-o['kd']):
    print(f"   {o['brand'][:16]:18} {o['المنتج / Product'][:52]:54} kd={o['kd']:8.0f} px={o['px']:7.2f} {o['channel']}")
print('\n--- الهوامش (المرحلة 1) ---')
for o in sorted([o for o in P1 if o['margin'] is not None], key=lambda o:o['margin']):
    print(f"   {o['المنتج / Product'][:48]:50} RRP={o['rrp']:7.2f} سعرنا={o['px']:7.2f} هامش={o['margin']*100:5.1f}%")
