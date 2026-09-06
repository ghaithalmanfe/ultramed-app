# -*- coding: utf-8 -*-
"""دمج أدلة فواتير فريق العيادات (رانوفا + مريم) في تصنيف القائمة."""
import json
d = json.load(open('classified.json'))
E = json.load(open('clinic_evidence.json'))
N = E['n_clinics']
ev = {e['product'].strip().lower(): e for e in E['products']}

DIRECT_BRANDS = {'UNIVET'}          # تبيع عبر حسابات مباشرة/أونلاين لا عبر العيادات
PROMOTED, FLAGGED, RECHANNELED = [], [], []

for o in d:
    e = ev.get(o['المنتج / Product'].strip().lower())
    o['cl_clinics']   = e['clinics']        if e else 0
    o['cl_pen']       = e['penetration']    if e else 0.0
    o['cl_orders']    = e['orders']         if e else 0
    o['cl_repeat']    = e['repeat_rate']    if e else 0.0
    o['cl_opener']    = e['opener']         if e else 0
    o['cl_reorders']  = e['repeat_orders']  if e else 0
    o['cl_kd']        = e['kd']             if e else 0.0
    o['cl_role']      = e['role']           if e else 'لا بيع للعيادات'
    o['cl_role_en']   = e['role_en']        if e else 'No clinic sales'
    o['cl_last']      = e['last']           if e else None

    # 1) تصحيح القناة: براند يبيع عبر حسابات مباشرة/أونلاين لا عبر العيادات
    if o['brand'] in DIRECT_BRANDS:
        if o['channel'] != 'مباشر / أونلاين':
            RECHANNELED.append(o['المنتج / Product'])
        o['channel'] = 'مباشر / أونلاين'
        o['channel_en'] = 'Direct / Online'

    # 2) ترقية بدليل العيادات: ≥8 عيادات و ≥30% إعادة طلب
    if e and e['clinics'] >= 8 and e['repeat_rate'] >= 0.30 and o['phase'] != 1:
        PROMOTED.append(o['المنتج / Product'])
        o['phase'] = 1
        o['reason']    = 'دليل العيادات: %d عيادة من %d (%.0f%%) · %.0f%% منها أعادت الطلب · %d طلب — جزء من نظام يُباع كمجموعة' % (
                          e['clinics'], N, e['penetration']*100, e['repeat_rate']*100, e['orders'])
        o['reason_en'] = 'Clinic evidence: %d of %d clinics (%.0f%%) · %.0f%% of them reordered · %d orders — part of a system sold as a set' % (
                          e['clinics'], N, e['penetration']*100, e['repeat_rate']*100, e['orders'])

    # 3) تنبيه اعتماد على حساب واحد
    if o['phase'] == 1 and o['channel'] == 'عيادات':
        if o['cl_clinics'] == 0:
            o['issues'].append('لا بيع لأي عيادة في 2026 — القيمة كلها من حساب مباشر/أونلاين')
            o['issues_en'].append('No sales to any clinic in 2026 — the whole value comes from a direct/online account')
            FLAGGED.append(o['المنتج / Product'])
        elif o['cl_clinics'] <= 2:
            o['issues'].append('اعتماد على %d عيادة فقط من %d — قاعدة عملاء هشّة' % (o['cl_clinics'], N))
            o['issues_en'].append('Depends on only %d of %d clinics — a fragile customer base' % (o['cl_clinics'], N))
            FLAGGED.append(o['المنتج / Product'])
        elif o['cl_repeat'] == 0:
            o['issues'].append('لم تُعِد أي عيادة طلبه (%d عيادات اشترته مرة واحدة)' % o['cl_clinics'])
            o['issues_en'].append('No clinic has reordered it (%d clinics bought once)' % o['cl_clinics'])
            FLAGGED.append(o['المنتج / Product'])

# إعادة حساب الأولوية بعد الترقيات
for ph in (1,2,3):
    items = sorted([o for o in d if o['phase']==ph], key=lambda o: -o['kd'])
    tot = sum(o['kd'] for o in items) or 1
    run = 0
    for o in items:
        run += o['kd']
        o['prio'] = 'A' if run/tot <= 0.60 else ('B' if run/tot <= 0.90 else 'C')

json.dump(d, open('classified.json','w'), ensure_ascii=False, indent=1)
print('promoted:', len(PROMOTED), PROMOTED)
print('re-channeled to Direct/Online:', len(RECHANNELED))
print('flagged:', len(FLAGGED))
from collections import Counter
tot=sum(o['kd'] for o in d)
for ph in (1,2,3,0):
    it=[o for o in d if o['phase']==ph]
    print(f'phase {ph}: {len(it)} items · {sum(o["kd"] for o in it):.0f} KD · {sum(o["kd"] for o in it)/tot*100:.1f}%')
print(Counter(o['channel_en'] for o in d if o['phase']==1))
