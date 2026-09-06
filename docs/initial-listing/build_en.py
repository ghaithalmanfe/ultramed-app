# -*- coding: utf-8 -*-
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

d = json.load(open('classified.json'))
EV = json.load(open('clinic_evidence.json'))
TOT_KD = sum(o['kd'] for o in d)
NC = EV['n_clinics']
P1 = [o for o in d if o['phase']==1]
def cnt(ch): return sum(1 for o in P1 if o['channel_en']==ch)
CLIN_KD = next(c['kd'] for c in EV['channels'] if c['class']=='Clinics')

NAVY='1F3864'; BLUE='2E5FA3'; GREEN='1E7145'; GOLD='B07D00'; GREY='595959'
P1F='E2EFDA'; P2F='FFF2CC'; P3F='FCE4D6'; XF='F2F2F2'
thin = Side(style='thin', color='BFBFBF')
BORD = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook(); wb.remove(wb.active)

def sheet(name):
    ws = wb.create_sheet(name)
    ws.sheet_view.showGridLines = False
    return ws

def title_block(ws, title, subtitle, width):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    c = ws.cell(1,1,title); c.font = Font(bold=True, size=16, color='FFFFFF')
    c.fill = PatternFill('solid', fgColor=NAVY); c.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
    c = ws.cell(2,1,subtitle); c.font = Font(size=10, color=GREY)
    c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[2].height = 32

def header_row(ws, r, headers, widths, fill=BLUE):
    for i,(h,w) in enumerate(zip(headers,widths), start=1):
        c = ws.cell(r,i,h)
        c.font = Font(bold=True, size=10, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=fill)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORD
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[r].height = 34
    ws.freeze_panes = ws.cell(r+1,1)

# ============================================================ 1) PROPOSAL
ws = sheet('Proposal')
title_block(ws, 'UltraMed — Initial Listing 2026',
    'Proposal to management  ·  A three-phase product listing for price quotations — pharmacies first, then clinics  ·  Built on actual ERP sales movement, 03/01/2026 → 06/09/2026', 8)
ws.column_dimensions['A'].width = 3
for col,w in zip('BCDEFGH',[26,16,16,16,16,16,34]): ws.column_dimensions[col].width = w

r = 4
def h2(text):
    global r
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r,2,text); c.font = Font(bold=True, size=12, color='FFFFFF')
    c.fill = PatternFill('solid', fgColor=BLUE); c.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[r].height = 22; r += 1
def para(text, bold=False):
    global r
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r,2,text); c.font = Font(size=10, bold=bold)
    c.alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    ws.row_dimensions[r].height = max(16, 15*(len(text)//120 + 1)); r += 1
def gap(n=1):
    global r; r += n

p1kd = sum(o['kd'] for o in d if o['phase']==1)
h2('The proposal in two lines')
para('Our movement file holds 244 items, 227 of which actually sold during 2026. Presenting all of them to a pharmacy or a clinic on a first visit is neither possible nor useful.')
para('This proposal selects %d items only (Phase 1). Those %d carry %.1f%% of 2026 sales on their own. They are offered as one standard opening list, then expanded over two further phases according to how the customer responds.' % (len(P1), len(P1), p1kd/TOT_KD*100), bold=True)
para('Phase 1 is backed by a separate reading of the clinic team\'s invoices (Ranova Ayman + Mariam Zohair): %d clinic accounts · %d orders · %s KD — see the "Clinic Evidence" sheet.' % (NC, EV['n_orders'], format(round(CLIN_KD),',')))
gap()

h2('The three phases')
rows = [('Phase','Name','Items','2026 value (KD)','Share of sales','Brands','Role in the quotation')]
for ph, nm, role in [(1,'Core Listing','Presented to every customer on the first visit · permanent stock · the backbone of the quotation'),
                     (2,'Expansion','Added after a first successful order, or when the customer asks to widen the shelf'),
                     (3,'On Demand','Not offered up front · quoted only on request · no stock commitment')]:
    it=[o for o in d if o['phase']==ph]
    rows.append((ph, nm, len(it), round(sum(o['kd'] for o in it)), sum(o['kd'] for o in it)/TOT_KD,
                 len(set(o['brand'] for o in it)), role))
it=[o for o in d if o['phase']==0]
rows.append(('—','Outside the initial listing — for review', len(it), round(sum(o['kd'] for o in it)), sum(o['kd'] for o in it)/TOT_KD,
             len(set(o['brand'] for o in it)), 'Dormant or no paid sales · management decision: clear or delist'))
for i,row in enumerate(rows):
    for j,v in enumerate(row, start=2):
        c = ws.cell(r,j,v); c.border = BORD
        if i==0:
            c.font = Font(bold=True, size=10, color='FFFFFF'); c.fill = PatternFill('solid', fgColor=NAVY)
            c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        else:
            c.font = Font(size=10, bold=(j==2))
            c.alignment = Alignment(horizontal='left' if j in (3,8) else 'center', vertical='center', wrap_text=True)
            c.fill = PatternFill('solid', fgColor=[P1F,P2F,P3F,XF][i-1])
            if j==5: c.number_format = '#,##0'
            if j==6: c.number_format = '0.0%'
    ws.row_dimensions[r].height = 30; r += 1
gap()

h2('What the clinic-team invoice analysis added (Ranova Ayman + Mariam Zohair)')
para('I read the invoices line by line at account and order level, not only at item level. Three findings changed the listing:')
para('1)  The 127,059 KD attributed to the "clinic team" is not all clinics. Its real split:')
for i,row in enumerate([('Channel','Net sales KD','Accounts')] + [(c['class'].strip(), round(c['kd']), c['accounts']) for c in EV['channels'] if c['kd']>0]):
    for j,v in enumerate(row, start=2):
        c = ws.cell(r,j,v); c.border = BORD
        if i==0:
            c.font = Font(bold=True, size=10, color='FFFFFF'); c.fill = PatternFill('solid', fgColor=NAVY)
        else:
            c.font = Font(size=10, bold=(j==2)); c.fill = PatternFill('solid', fgColor='F7F7F7')
            if j==3: c.number_format = '#,##0'
        c.alignment = Alignment(horizontal='left' if j==2 else 'center', vertical='center')
    ws.row_dimensions[r].height = 18; r += 1
para('    Clinical accounts (clinics + hospitals + doctors + the ministry) come to %d accounts worth %s KD, of which clinics alone are %s KD across %d accounts — the rest is online and pharmacy. The listing is built on that figure, not the aggregate.' % (NC, format(round(sum(c['kd'] for c in EV['channels'] if c['class'] in ('Clinics','Hospital','Doctors','Government'))),','), format(round(CLIN_KD),','), next(c['accounts'] for c in EV['channels'] if c['class']=='Clinics')))
para('2)  UNIVET (23,884 KD) sold to no clinic at all in 2026 — its entire value came through two direct/online accounts (Customers-Univet and My Fatoorah). Loupes are fitted to each doctor\'s own prescription, so they are a direct appointment sale, not a line on a quotation. Their channel was moved to "Direct / Online" and they left the clinic offer.')
para('3)  Promotion on evidence: 4 items were lifted into Phase 1 despite a lower class in the movement file, because their reach and reorder rate among clinics exceed what the company-wide invoice count shows (the three remaining Intensiv strip grits + Philips Protective Clean 4300 BLACK).')
gap()

h2('Why this order — the commercial logic')
para('1)  A pharmacy does not buy a catalogue, it buys turnover. An item we invoice weekly is an item that turns on the pharmacy shelf too — so it leads the offer and opens the account at the lowest risk to both sides.')
para('2)  Opening an account with slow items freezes the pharmacy\'s working capital and closes the door on the rest of the portfolio. Phase 3 items are the single biggest reason a customer refuses to reorder, which is why they are kept out of the first offer entirely.')
para('3)  Pharmacies first, then clinics: a pharmacy decides faster and on a shorter cycle, so it establishes turnover and reputation. The clinic offer is then built on top of that, resting on higher-value professional items with a longer decision cycle.')
para('4)  Every brand is represented in Phase 1 — even brands with no fast-moving item (B&L · SCHEU · custom kits) enter through their highest-value item ("brand anchor"), keeping the brand present in the offer without overloading it.')
para('5)  What brings a customer back is not what opens the account: 13 of %d clinics opened with a Waterpik unit, while the most repeated item in follow-up orders is the Intensiv OS80XC strip (43 repeat orders). The first-visit offer and the follow-up offer are therefore different — the "Clinic Evidence" and "Clinic Baskets" sheets set this out.' % NC)
gap()

h2('Proposed rollout')
plan = [
    ('Weeks 1–2','Approve and price Phase 1','Issue one standard pharmacy quotation (%d items) and a separate clinic quotation (%d items) · set minimum stock levels on all Priority A items' % (cnt('Pharmacies')+cnt('Pharmacies + Clinics'), cnt('Clinics')+cnt('Pharmacies + Clinics'))),
    ('Weeks 3–6','Pharmacy coverage','Visit pharmacies with the Phase 1 offer only · measure: accounts opened and 30-day reorder rate'),
    ('Weeks 7–10','Expand in pharmacies + work the clinic base','Add Phase 2 items to accounts that have reordered at least once · and %d clinic accounts are live (%d have reordered): priority to those silent more than 90 days — see "Clinic Accounts"' % (NC, sum(1 for a in EV['accounts'] if a['repeat']))),
    ('Weeks 11–12','Review','Review each phase against actual figures · promote items from Phase 2 to Phase 1 and demote what has not moved · decide on clearance for the "outside the listing" items'),
]
for i,row in enumerate([('Timing','Step','Detail')] + plan):
    ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=8)
    for j,v in zip([2,3,4], row):
        c = ws.cell(r,j,v); c.border = BORD
        if i==0:
            c.font = Font(bold=True, size=10, color='FFFFFF'); c.fill = PatternFill('solid', fgColor=NAVY)
            c.alignment = Alignment(horizontal='center', vertical='center')
        else:
            c.font = Font(size=10, bold=(j==3)); c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
    for j in (5,6,7,8): ws.cell(r,j).border = BORD
    ws.row_dimensions[r].height = 30 if i else 20; r += 1
gap()

h2('What we ask management to approve')
para('•  Adopt the Phase 1 items as the official opening list, and commit to not offering Phase 3 items up front on any visit.')
para('•  Fix a single price and standard terms (opening quantity + margin) for the Phase 1 items before the reps go out, so the offer does not differ from one rep to another.')
para('•  Decide on the 59 items outside the initial listing: clearance or delisting — they consume stock and shelf space against no matching movement.')
para('•  Decide on UNIVET: treat it as a direct, by-appointment sale (each loupe is cut to the doctor\'s prescription) rather than a line item on a quotation — or give it its own separate offer mechanism.')
para('•  Note: pricing and margins are outside the scope of this document. This is a listing built on movement, not a price list.', bold=True)

# ============================================================ PHASE SHEETS
PHASE_META = {
 1: ('Phase 1 — Core Listing', P1F, 'The core listing · presented to every customer on the first visit · permanent stock'),
 2: ('Phase 2 — Expansion',    P2F, 'Added after a first successful order or on customer request — not part of the opening quotation'),
 3: ('Phase 3 — On Demand',    P3F, 'Not offered up front · quoted only on request · no stock commitment'),
}
HEAD = ['#','Brand','Product','Code','Proposed channel','Priority','Current class','Units/month','Last 3 months units/month','Invoices/month','Customers','Units sold 2026','Net sales KD','Avg price/unit KD','Why it sits in this phase','Watch-out']
W    = [ 5, 22, 54, 18, 18, 9, 14, 10, 12, 11, 11, 12, 13, 13, 48, 48]

for ph in (1,2,3):
    name, fill, sub = PHASE_META[ph]
    items = sorted([o for o in d if o['phase']==ph], key=lambda o: (o['channel'] != 'صيدليات', -o['kd']))
    ws = sheet(name)
    kd = sum(o['kd'] for o in items)
    title_block(ws, name,
        '%s  ·  %d items · %d brands · %s KD of 2026 sales (%.1f%% of total)  —  pharmacies first, then clinics'
        % (sub, len(items), len(set(o['brand'] for o in items)), format(round(kd),','), kd/TOT_KD*100), len(HEAD))
    header_row(ws, 3, HEAD, W)
    r = 4
    for i,o in enumerate(items, start=1):
        vals = [i, o['brand_en'], o['المنتج / Product'], o['الكود / Code'] or '—', o['channel_en'], o['prio'],
                o['cls_en'], round(o['upm'],1), round(o['upm3'],1), round(o['ipm'],2), o['cust'], o['units'],
                round(o['kd'],1), round(o['px'],2), o['reason_en'], ' · '.join(o['issues_en']) or '—']
        for j,v in enumerate(vals, start=1):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
            c.alignment = Alignment(horizontal='left' if j in (2,3,15,16) else 'center', vertical='center', wrap_text=(j in (3,15,16)))
            if j == 13: c.number_format = '#,##0.0'
            if j in (8,9,14): c.number_format = '#,##0.00'
            if j in (11,12): c.number_format = '#,##0'
            if j == 6: c.font = Font(size=9, bold=True, color={'A':GREEN,'B':GOLD,'C':GREY}[o['prio']])
            if j == 5: c.fill = PatternFill('solid', fgColor={'Pharmacies':'E7F0FA','Clinics':'FBE9E7','Pharmacies + Clinics':'F0EAF7','Direct / Online':'EDEDED'}[o['channel_en']])
            if j == 16 and o['issues_en']: c.font = Font(size=9, color='9C0006')
        ws.cell(r,1).fill = PatternFill('solid', fgColor=fill)
        ws.row_dimensions[r].height = 26; r += 1
    ws.auto_filter.ref = 'A3:%s%d' % (get_column_letter(len(HEAD)), r-1)
    for j in range(1, len(HEAD)+1):
        c = ws.cell(r,j); c.border = BORD; c.fill = PatternFill('solid', fgColor=NAVY)
        c.font = Font(bold=True, size=10, color='FFFFFF'); c.alignment = Alignment(horizontal='center', vertical='center')
    ws.cell(r,2,'Total'); ws.cell(r,12, sum(o['units'] for o in items)).number_format='#,##0'
    ws.cell(r,13, round(kd,1)).number_format='#,##0'
    ws.row_dimensions[r].height = 22

# ============================================================ CHANNEL SHEETS
def channel_sheet(sname, chans, title, sub, clinic=False):
    items = [o for o in d if o['phase'] in (1,2,3) and o['channel_en'] in chans]
    items.sort(key=lambda o: (o['phase'], {'A':0,'B':1,'C':2}[o['prio']], -o['kd']))
    ws = sheet(sname)
    H = ['#','Phase','Priority','Brand','Product','Code','Current class','Units/month','Invoices/month','Customers','Units sold 2026','Net sales KD','Avg price/unit KD','Note for the rep']
    WW= [ 5, 8, 9, 22, 56, 18, 14, 10, 12, 11, 12, 13, 13, 54]
    if clinic:
        H  = H[:13]  + ['Clinics buying (of %d)' % NC, 'Reach %', 'Reordered %', 'Opened the account', 'Repeat orders', 'Role'] + H[13:]
        WW = WW[:13] + [13, 10, 12, 13, 12, 16] + WW[13:]
    p1 = [o for o in items if o['phase']==1]
    title_block(ws, title, '%s  ·  Phase 1: %d items · Phase 2: %d · Phase 3: %d  —  the opening quotation is Phase 1 only'
        % (sub, len(p1), len([o for o in items if o['phase']==2]), len([o for o in items if o['phase']==3])), len(H))
    header_row(ws, 3, H, WW)
    r = 4
    for i,o in enumerate(items, start=1):
        note = ' · '.join(o['issues_en']) if o['issues_en'] else ('Offer on the first visit' if o['phase']==1 else ('Add after a first reorder' if o['phase']==2 else 'On request only — no stock commitment'))
        vals = [i, o['phase'], o['prio'], o['brand_en'], o['المنتج / Product'], o['الكود / Code'] or '—', o['cls_en'],
                round(o['upm'],1), round(o['ipm'],2), o['cust'], o['units'], round(o['kd'],1), round(o['px'],2)]
        if clinic:
            vals += [o['cl_clinics'], o['cl_pen'], o['cl_repeat'], o['cl_opener'], o['cl_reorders'], o['cl_role_en']]
        vals += [note]
        nlast = len(vals)
        for j,v in enumerate(vals, start=1):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
            c.alignment = Alignment(horizontal='left' if j in (4,5,nlast) else 'center', vertical='center', wrap_text=(j in (5,nlast)))
            if j == 12: c.number_format = '#,##0.0'
            if j in (8,13): c.number_format = '#,##0.00'
            if j in (10,11): c.number_format = '#,##0'
            if j == 2: c.fill = PatternFill('solid', fgColor={1:P1F,2:P2F,3:P3F}[o['phase']]); c.font = Font(size=9, bold=True)
            if j == 3: c.font = Font(size=9, bold=True, color={'A':GREEN,'B':GOLD,'C':GREY}[o['prio']])
            if clinic and j in (15,16): c.number_format = '0%'
            if clinic and j == 14 and o['cl_clinics'] == 0: c.font = Font(size=9, bold=True, color='9C0006')
            if clinic and j == 19:
                c.font = Font(size=9, bold=True, color={'Door-opener':GREEN,'Repeat engine':BLUE,'Add-on':GOLD,'Single account':GREY,'No clinic sales':'9C0006'}[o['cl_role_en']])
        ws.row_dimensions[r].height = 26; r += 1
    ws.auto_filter.ref = 'A3:%s%d' % (get_column_letter(len(H)), r-1)

channel_sheet('Pharmacy Listing', ('Pharmacies','Pharmacies + Clinics'),
    'Pharmacy Listing',
    'Items that genuinely turn outside the clinic channel (hypermarkets · pharmacies · online)')
channel_sheet('Clinic Listing', ('Clinics','Pharmacies + Clinics'),
    'Clinic Listing',
    'Backed by clinic-team invoices: %d clinic accounts · %d orders · UNIVET excluded (direct/online sale)' % (NC, EV['n_orders']), clinic=True)


# ============================================================ CLINIC EVIDENCE
ROLE_C = {'Door-opener':GREEN,'Repeat engine':BLUE,'Add-on':GOLD,'Single account':GREY}
ws = sheet('Clinic Evidence')
prods = sorted(EV['products'], key=lambda e: -e['kd'])
title_block(ws, 'Clinic Evidence — from the invoices of Ranova Ayman and Mariam Zohair',
    'Every item sold to a clinic, hospital or doctor account in 2026 · %d clinics · %d orders · %d items  —  reach and reorder rate, not company-wide invoice count, govern the clinic listing'
    % (NC, EV['n_orders'], len(prods)), 13)
H = ['#','Brand','Product','Units to clinics','Net KD from clinics','Clinics buying','Reach % (of ' + str(NC) + ')','Orders','Clinics that reordered','Reorder rate','Opened the account','Repeat orders','Role']
WD= [5,20,56,13,15,13,14,10,15,12,14,12,17]
header_row(ws, 3, H, WD)
r = 4
for i,e in enumerate(prods, start=1):
    vals=[i, e['brand'], e['product'], e['units'], e['kd'], e['clinics'], e['penetration'], e['orders'],
          e['repeat_clinics'], e['repeat_rate'], e['opener'], e['repeat_orders'], e['role_en']]
    for j,v in enumerate(vals, start=1):
        c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
        c.alignment = Alignment(horizontal='left' if j in (2,3) else 'center', vertical='center', wrap_text=(j==3))
        if j in (7,10): c.number_format = '0%'
        if j == 5: c.number_format = '#,##0.0'
        if j == 4: c.number_format = '#,##0'
        if j == 13: c.font = Font(size=9, bold=True, color=ROLE_C[e['role_en']])
        if j == 6 and e['clinics'] >= 8: c.font = Font(size=9, bold=True, color=GREEN)
    ws.row_dimensions[r].height = 24; r += 1
ws.auto_filter.ref = 'A3:M%d' % (r-1)

# ============================================================ CLINIC ACCOUNTS
ws = sheet('Clinic Accounts')
acc = EV['accounts']
rep = sum(1 for a in acc if a['repeat'])
title_block(ws, 'Clinic Accounts — the target list',
    '%d accounts bought in 2026 · %d of them reordered (%.0f%%) · %d orders at an average of %.0f KD  —  "last order" sets the visit priority'
    % (len(acc), rep, rep/len(acc)*100, EV['n_orders'], sum(a['value'] for a in acc)/EV['n_orders']), 9)
H = ['#','Account','Orders','Net sales KD','Avg order KD','Brands','First order','Last order','Status']
WD= [5,52,10,14,14,10,13,13,30]
header_row(ws, 3, H, WD)
import datetime as _dt
END = _dt.date(2026,9,6)
r = 4
for i,a in enumerate(acc, start=1):
    days = (END - _dt.date(*map(int, a['last'].split('-')))).days
    state = ('Active' if days <= 45 else 'Needs a visit (%d days silent)' % days if days <= 90 else 'Lapsed — %d days silent' % days)
    if not a['repeat']: state = 'One order only — never reordered'
    vals=[i, a['account'], a['orders'], a['value'], round(a['value']/a['orders'],1), a['brands'], a['first'], a['last'], state]
    for j,v in enumerate(vals, start=1):
        c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
        c.alignment = Alignment(horizontal='left' if j in (2,9) else 'center', vertical='center')
        if j in (4,5): c.number_format = '#,##0.0'
        if j == 9: c.font = Font(size=9, bold=True, color=(GREEN if days<=45 and a['repeat'] else GOLD if days<=90 else '9C0006'))
    ws.row_dimensions[r].height = 22; r += 1
ws.auto_filter.ref = 'A3:I%d' % (r-1)

# ============================================================ CLINIC BASKETS
ws = sheet('Clinic Baskets')
title_block(ws, 'Clinic Baskets — what is ordered with what',
    'The item pairs that most often appear in a single clinic order · the basis for bundles and for the page order of the quotation', 5)
H = ['#','First item','Second item','Times ordered together','Reading']
WD= [5,54,54,16,48]
header_row(ws, 3, H, WD)
r = 4
for i,p in enumerate(EV['pairs'][:20], start=1):
    lead = (p['a'] if p['share_a']>=p['share_b'] else p['b'])[:36]
    read = 'Always offer together — %.0f%% of "%s" orders include the other' % (max(p['share_a'],p['share_b'])*100, lead)
    vals=[i, p['a'], p['b'], p['together'], read]
    for j,v in enumerate(vals, start=1):
        c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
        c.alignment = Alignment(horizontal='left' if j in (2,3,5) else 'center', vertical='center', wrap_text=(j in (2,3,5)))
    ws.row_dimensions[r].height = 26; r += 1

# ============================================================ OUTSIDE THE LISTING
items = sorted([o for o in d if o['phase']==0], key=lambda o: (-o['kd'], o['brand']))
ws = sheet('Outside the Listing')
title_block(ws, 'Outside the initial listing — for management review',
    '%d items: either no paid sales at all in 2026, or no sale in more than 120 days · they enter no phase · decision needed: clear / delist / relaunch' % len(items), 9)
H3 = ['#','Brand','Product','Code','Units sold 2026','Net sales KD','Last sale','Days without a sale','Reason for exclusion']
W3 = [5,24,58,18,14,14,13,14,58]
header_row(ws, 3, H3, W3, fill=GREY)
r = 4
for i,o in enumerate(items, start=1):
    vals = [i, o['brand_en'], o['المنتج / Product'], o['الكود / Code'] or '—', o['units'], round(o['kd'],1),
            o['آخر بيع'] or '—', o['days'] if o['days']<999 else '—', o['reason_en']]
    for j,v in enumerate(vals, start=1):
        c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
        c.alignment = Alignment(horizontal='left' if j in (2,3,9) else 'center', vertical='center', wrap_text=(j in (3,9)))
        if j==6: c.number_format='#,##0.0'
        if j==5: c.number_format='#,##0'
    ws.row_dimensions[r].height = 24; r += 1
ws.auto_filter.ref = 'A3:I%d' % (r-1)

# ============================================================ CRITERIA
ws = sheet('Criteria')
title_block(ws, 'Criteria used to build this listing',
    'Every item in this file was placed in its phase by a written, repeatable rule that can be re-applied to any later period — not by personal judgement', 8)
ws.column_dimensions['A'].width = 3
for col,w in zip('BCDEFGH',[34,22,22,22,22,22,28]): ws.column_dimensions[col].width = w
r = 4

def table(rows, headers):
    global r
    for j,h in enumerate(headers, start=2):
        c = ws.cell(r,j,h); c.font = Font(bold=True, size=10, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=NAVY); c.border = BORD
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[r].height = 26; r += 1
    for row in rows:
        for j,v in enumerate(row, start=2):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=10, bold=(j==2))
            c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
        ws.row_dimensions[r].height = 30; r += 1

h2('1 — Where the numbers come from')
para('ERP file (MonthlySalesSummary) for 03/01/2026 → 06/09/2026 = 8.1 months · 11,893 invoice and return lines · all salesmen and all channels (hypermarkets · pharmacies · online · clinics).')
para('"Units sold" = quantity on invoice lines that carry value (Net Sales ≠ 0). Free-of-charge goods and internal marketing-account movement are excluded entirely from the movement figures — they do not represent real market demand.')
para('Monthly rates are calculated from an item\'s first paid sale to the end of the period, with a floor of 3 months — so an item a few weeks old does not appear to be fast-moving.')
gap()

h2('2 — The movement-speed criterion (the basis of the phases)')
table([
    ('Fast-moving','≥ 4 paid invoices per month (roughly weekly) or ≥ 100 paid units per month','69 items'),
    ('Mid-moving','From 1 invoice up to fewer than 4 invoices per month, and under 100 units per month','57 items'),
    ('Slow-moving','Fewer than one invoice per month','101 items'),
    ('No paid sales','Appears in the file with free goods or returns only, no sale carrying value','17 items'),
], ['Class','Definition','Count'])
para('Why invoice count, and not unit count, is the primary criterion: an invoice means a customer decided to buy. Ten thousand units across two invoices is stock-filling at one customer, not market movement.', bold=True)
gap()

h2('3 — How items were distributed across the three phases')
table([
    ('Phase 1 — Core','Fast-moving + clean on the quality filter + within the brand\'s top 8 items by units. The cap of 8 prevents one brand from swallowing the whole quotation.','%d items' % len(P1)),
    ('Phase 1 — "Brand anchor"','A brand with no clean fast mover enters through its two highest-value items, provided they sold within the last 90 days and reached 10 units or 500 KD — so every brand stays present in the opening offer.','UNIVET · B&L · SCHEU · custom kits · Silonn · EverBrands'),
    ('Phase 2 — Expansion','Clean mid-movers · + fast movers cut by the top-8 cap · + fast movers carrying a flag (decline or customer returns), offered conditionally · + professional equipment worth ≥ 500 KD','%d items' % sum(1 for o in d if o['phase']==2)),
    ('Phase 3 — On Demand','Slow-moving but still alive: last sale within 120 days — quoted on request with no stock commitment','54 items'),
    ('Outside the listing','No paid sales in 2026, or dormant for more than 120 days','59 items'),
], ['Phase','Rule','Result'])
gap()

h2('4 — Exclusion criteria for Phase 1 (the quality filter)')
para('A fast-moving item does not enter the core listing if any of these applies — listing it would mean selling the customer a problem rather than a product:')
table([
    ('Returns ≥ sales','The item\'s net movement is zero or negative — review before offering it at all'),
    ('Customer returns ≥ 20% of units sold','A genuine rejection at customer level (return linked to an invoice)'),
    ('Declining: last 3 months under 40% of the period average','The item is fading — a new offer should not be built on it'),
    ('No sale in more than 60 days','It has dropped out of movement despite its earlier class'),
], ['Reason for exclusion','Why'])
para('An important distinction: "non-invoice stock returns" (hypermarket shelf clearance / prior-year goods) are NOT used to exclude an item — they are not a customer rejection. They are shown as a watch-out instead, to be taken into account when setting the opening order quantity.', bold=True)
gap()

h2('5 — Channel assignment (pharmacies / clinics)')
table([
    ('Pharmacies','Clinic team accounts for ≤ 20% of the item\'s units — the item genuinely turns outside the clinic channel','%d items in Phase 1' % cnt('Pharmacies')),
    ('Clinics','Clinic team accounts for ≥ 75%, or the brand is professional by nature (UNIVET · B&L · SCHEU · Intensiv · custom kits · EverBrands), or avg price ≥ 100 KD','%d items in Phase 1' % cnt('Clinics')),
    ('Pharmacies + Clinics','Between 20% and 75% — offered in both channels at the same price','%d items in Phase 1' % cnt('Pharmacies + Clinics')),
    ('Direct / Online','A brand whose whole value comes from direct or online accounts rather than clinics — it enters neither the pharmacy nor the clinic offer','%d items in Phase 1 (UNIVET)' % cnt('Direct / Online')),
], ['Channel','Rule','In Phase 1'])
gap()

h2('6 — A separate criterion for the clinic listing (from the invoice analysis)')
para('The clinic listing is not built on the company-wide invoice count, but on the clinic team\'s own invoices (Ranova Ayman + Mariam Zohair) at account and order level: %d clinic, hospital and doctor accounts · %d orders · %d items.' % (NC, EV['n_orders'], len(EV['products'])))
table([
    ('Reach','How many of the %d clinics bought the item — an item bought by two clinics is a deal, not a listing' % NC,'First criterion'),
    ('Reorder rate','How many of its buyers came back for it in a later order — this is what separates a real item from an initial fill','Second criterion'),
    ('Promotion on evidence','An item reaching ≥ 8 clinics with ≥ 30% reorder rate enters Phase 1 whatever its class in the movement file','4 items promoted'),
    ('Dependency flag','A Phase 1 item on the clinic channel resting on ≤ 2 clinics, or that no clinic has reordered, is flagged explicitly','6 items flagged'),
    ('Channel correction','A brand whose entire value comes from direct/online accounts rather than clinics leaves the clinic offer','UNIVET — 23,884 KD'),
], ['Criterion','Definition','Effect'])
para('Why the distinction matters: the "clinic team" figure in the movement file (127,059 KD) includes online, government and pharmacy accounts. Actual clinics are 65,253 KD across %d accounts — building a listing on the larger number means building it for a customer who does not exist.' % NC, bold=True)
gap()

h2('7 — A separate criterion for professional equipment')
para('Professional equipment (avg price ≥ 100 KD: UNIVET loupes · Intensiv handpieces · B&L kits) is judged on value, not on invoice count. One unit at 981 KD is not "slow-moving" in any commercial sense — such goods are sold one unit at a time to one customer a year. They therefore entered Phases 1 and 2 on a value criterion (≥ 500 KD within the last 120 days) even though they invoice less than once a month.', bold=True)
gap()

h2('8 — Priority within each phase (A / B / C)')
table([
    ('A','The items making up the first 60% of the phase\'s value — offered first, and never allowed to go out of stock'),
    ('B','The next band, up to 90% of the phase\'s value'),
    ('C','The last 10% of value — they complete the shelf; do not open a visit with them'),
], ['Priority','Definition'])
gap()

h2('9 — Limits of this reading (stated for honesty)')
para('•  The period covers only 8.1 months of 2026, with no comparison against 2025 — so year-on-year growth or decline does not show.')
para('•  The classification reflects what we sold, not what the market wants: an item we never presented properly will look "slow" without being so — which is why Phase 3 is "on demand", not "for delisting".')
para('•  New items (first sale within the last 3 months) rest on a short history, and are flagged as such in the watch-out column.')
para('•  Non-invoice returns may relate to goods sold in earlier years, so they are not charged against 2026 performance.')
para('•  The clinic evidence rests on Ranova\'s and Mariam\'s invoices only. A clinic served through another rep or through the online channel does not appear in the reach and reorder figures.')
para('•  Pricing, margins and commercial agreements are entirely outside the scope of this document.')

wb.save('UltraMed-Initial-Listing-2026-EN.xlsx')
print('saved')
