# -*- coding: utf-8 -*-
"""أدلة العيادات: تحليل فواتير رانوفا أيمن + مريم زهير على مستوى الحساب والطلب."""
import json
from collections import defaultdict, Counter
from itertools import combinations

recs = json.load(open('raw.json'))
TEAM = {'Ranova Ayman Mohammed', 'Mariam Zohair '}
CLIN = {'Clinics', 'Hospital', 'Doctors', 'Government'}

team = [r for r in recs if r['Name'] in TEAM]
inv  = [r for r in team if r['Customer Class'] in CLIN and r['Type']=='SalesInvoice' and (r['Net Sales'] or 0)!=0]
ret  = [r for r in team if r['Customer Class'] in CLIN and r['Type']=='SalesReturn']

# ---------- الطلبات لكل عيادة ----------
orders = defaultdict(dict)
for r in inv:
    o = orders[r['Account']].setdefault(r['Invoice#'], {'date': r['Date'], 'prod': set(), 'val': 0.0})
    o['prod'].add(r['Product'].strip()); o['val'] += r['Net Sales']; o['date'] = min(o['date'], r['Date'])
N_CLINICS = len(orders)

accounts = []
for a, os_ in orders.items():
    seq = sorted(os_.values(), key=lambda o: o['date'])
    accounts.append({'account': a, 'orders': len(seq), 'value': round(sum(o['val'] for o in seq),1),
                     'first': seq[0]['date'], 'last': seq[-1]['date'],
                     'lines': sum(len(o['prod']) for o in seq),
                     'brands': len({r['Brand'] for r in inv if r['Account']==a}),
                     'repeat': len(seq) >= 2})
accounts.sort(key=lambda a: -a['value'])

# ---------- الأصناف ----------
P = defaultdict(lambda: {'u':0,'kd':0.0,'acc':set(),'inv':set(),'pairs':set(),'first':'9999','last':'0','brand':'','ret':0})
for r in inv:
    p = P[r['Product'].strip()]
    p['u'] += r['Quantity']; p['kd'] += r['Net Sales']; p['acc'].add(r['Account']); p['inv'].add(r['Invoice#'])
    p['pairs'].add((r['Account'], r['Invoice#'])); p['brand'] = r['Brand']
    p['first'] = min(p['first'], r['Date']); p['last'] = max(p['last'], r['Date'])
for r in ret:
    P[r['Product'].strip()]['ret'] += -(r['Quantity'] or 0)

opener, repeater = Counter(), Counter()
for a, os_ in orders.items():
    seq = sorted(os_.values(), key=lambda o: o['date'])
    for p in seq[0]['prod']: opener[p] += 1
    for o in seq[1:]:
        for p in o['prod']: repeater[p] += 1

ev = []
for name, p in P.items():
    if not p['acc']: continue
    c = defaultdict(int)
    for a,i in p['pairs']: c[a] += 1
    rep = sum(1 for a in c if c[a] >= 2)
    na = len(p['acc'])
    role = ('فاتح حساب' if opener[name] >= 3 and opener[name] >= repeater[name]/4
            else 'محرّك إعادة طلب' if repeater[name] >= 8
            else 'مكمّل' if na >= 3 else 'حساب واحد')
    role_en = {'فاتح حساب':'Door-opener','محرّك إعادة طلب':'Repeat engine','مكمّل':'Add-on','حساب واحد':'Single account'}[role]
    ev.append({'product':name,'brand':p['brand'],'units':p['u'],'kd':round(p['kd'],1),
               'clinics':na,'penetration':na/N_CLINICS,'orders':len(p['inv']),
               'repeat_clinics':rep,'repeat_rate':rep/na,'opener':opener[name],'repeat_orders':repeater[name],
               'first':p['first'],'last':p['last'],'returns':p['ret'],'role':role,'role_en':role_en})
ev.sort(key=lambda e: -e['kd'])

# ---------- السلال ----------
bask = defaultdict(set)
for r in inv: bask[r['Invoice#']].add(r['Product'].strip())
pairc = Counter()
for s in bask.values():
    for a,b in combinations(sorted(s), 2): pairc[(a,b)] += 1
pairs = [{'a':a,'b':b,'together':c,
          'share_a': c/len(P[a]['inv']) if P[a]['inv'] else 0,
          'share_b': c/len(P[b]['inv']) if P[b]['inv'] else 0}
         for (a,b),c in pairc.most_common(25)]

# ---------- القنوات الحقيقية للفريق ----------
chan = defaultdict(lambda: {'kd':0.0,'acc':set()})
for r in team:
    if r['Type']=='SalesInvoice' and (r['Net Sales'] or 0)==0: continue
    c = chan[r['Customer Class'].strip()]
    c['kd'] += r['Net Sales'] or 0; c['acc'].add(r['Account'])
channels = sorted([{'class':k,'kd':round(v['kd'],1),'accounts':len(v['acc'])} for k,v in chan.items()],
                  key=lambda x:-x['kd'])

json.dump({'n_clinics':N_CLINICS,'accounts':accounts,'products':ev,'pairs':pairs,'channels':channels,
           'n_orders':sum(len(o) for o in orders.values()),
           'team_lines':len(team)}, open('clinic_evidence.json','w'), ensure_ascii=False, indent=1)

print('clinics:', N_CLINICS, '| orders:', sum(len(o) for o in orders.values()), '| products:', len(ev))
print('\nCHANNELS (clinic team, all classes)')
for c in channels: print(f"   {c['class']:28} {c['kd']:9.0f} KD  accounts={c['accounts']}")
print('\nROLE COUNTS', Counter(e['role_en'] for e in ev))
print('\nCORE CANDIDATES (>=8 clinics AND >=30% repeat)')
for e in ev:
    if e['clinics']>=8 and e['repeat_rate']>=0.30:
        print(f"   {e['product'][:52]:54} {e['brand'][:12]:13} clinics={e['clinics']:3} ({e['penetration']*100:3.0f}%) repeat={e['repeat_rate']*100:3.0f}% opener={e['opener']:2} kd={e['kd']:7.0f}  {e['role_en']}")
