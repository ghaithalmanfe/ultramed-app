# -*- coding: utf-8 -*-
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

d = json.load(open('classified.json'))
TOT_KD = sum(o['kd'] for o in d)

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
para('This proposal selects 53 items only (Phase 1). Those 53 carry %.1f%% of 2026 sales on their own. They are offered as one standard opening list, then expanded over two further phases according to how the customer responds.' % (p1kd/TOT_KD*100), bold=True)
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

h2('Why this order — the commercial logic')
para('1)  A pharmacy does not buy a catalogue, it buys turnover. An item we invoice weekly is an item that turns on the pharmacy shelf too — so it leads the offer and opens the account at the lowest risk to both sides.')
para('2)  Opening an account with slow items freezes the pharmacy\'s working capital and closes the door on the rest of the portfolio. Phase 3 items are the single biggest reason a customer refuses to reorder, which is why they are kept out of the first offer entirely.')
para('3)  Pharmacies first, then clinics: a pharmacy decides faster and on a shorter cycle, so it establishes turnover and reputation. The clinic offer is then built on top of that, resting on higher-value professional items with a longer decision cycle.')
para('4)  Every brand is represented in Phase 1 — even brands with no fast-moving item (UNIVET · B&L · SCHEU · custom kits) enter through their highest-value item ("brand anchor"), keeping the brand present in the offer without overloading it.')
gap()

h2('Proposed rollout')
plan = [
    ('Weeks 1–2','Approve and price Phase 1','Issue one standard pharmacy quotation (41 items) and a separate clinic quotation (14 items) · set minimum stock levels on all Priority A items'),
    ('Weeks 3–6','Pharmacy coverage','Visit pharmacies with the Phase 1 offer only · measure: accounts opened and 30-day reorder rate'),
    ('Weeks 7–10','Expand in pharmacies + launch clinics','Add Phase 2 items to accounts that have reordered at least once · start the clinic offer (professional Phase 1 + Phase 2 equipment)'),
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
            if j == 5: c.fill = PatternFill('solid', fgColor={'Pharmacies':'E7F0FA','Clinics':'FBE9E7','Pharmacies + Clinics':'F0EAF7'}[o['channel_en']])
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
def channel_sheet(sname, chans, title, sub):
    items = [o for o in d if o['phase'] in (1,2,3) and o['channel_en'] in chans]
    items.sort(key=lambda o: (o['phase'], {'A':0,'B':1,'C':2}[o['prio']], -o['kd']))
    ws = sheet(sname)
    H = ['#','Phase','Priority','Brand','Product','Code','Current class','Units/month','Invoices/month','Customers','Units sold 2026','Net sales KD','Avg price/unit KD','Note for the rep']
    WW= [ 5, 8, 9, 22, 56, 18, 14, 10, 12, 11, 12, 13, 13, 54]
    p1 = [o for o in items if o['phase']==1]
    title_block(ws, title, '%s  ·  Phase 1: %d items · Phase 2: %d · Phase 3: %d  —  the opening quotation is Phase 1 only'
        % (sub, len(p1), len([o for o in items if o['phase']==2]), len([o for o in items if o['phase']==3])), len(H))
    header_row(ws, 3, H, WW)
    r = 4
    for i,o in enumerate(items, start=1):
        note = ' · '.join(o['issues_en']) if o['issues_en'] else ('Offer on the first visit' if o['phase']==1 else ('Add after a first reorder' if o['phase']==2 else 'On request only — no stock commitment'))
        vals = [i, o['phase'], o['prio'], o['brand_en'], o['المنتج / Product'], o['الكود / Code'] or '—', o['cls_en'],
                round(o['upm'],1), round(o['ipm'],2), o['cust'], o['units'], round(o['kd'],1), round(o['px'],2), note]
        for j,v in enumerate(vals, start=1):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
            c.alignment = Alignment(horizontal='left' if j in (4,5,14) else 'center', vertical='center', wrap_text=(j in (5,14)))
            if j == 12: c.number_format = '#,##0.0'
            if j in (8,13): c.number_format = '#,##0.00'
            if j in (10,11): c.number_format = '#,##0'
            if j == 2: c.fill = PatternFill('solid', fgColor={1:P1F,2:P2F,3:P3F}[o['phase']]); c.font = Font(size=9, bold=True)
            if j == 3: c.font = Font(size=9, bold=True, color={'A':GREEN,'B':GOLD,'C':GREY}[o['prio']])
        ws.row_dimensions[r].height = 26; r += 1
    ws.auto_filter.ref = 'A3:%s%d' % (get_column_letter(len(H)), r-1)

channel_sheet('Pharmacy Listing', ('Pharmacies','Pharmacies + Clinics'),
    'Pharmacy Listing',
    'Items that genuinely turn outside the clinic channel (hypermarkets · pharmacies · online)')
channel_sheet('Clinic Listing', ('Clinics','Pharmacies + Clinics'),
    'Clinic Listing',
    'Items the clinic team actually sells, or professional by nature (avg price ≥ 100 KD)')

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
    ('Phase 1 — Core','Fast-moving + clean on the quality filter + within the brand\'s top 8 items by units. The cap of 8 prevents one brand from swallowing the whole quotation.','53 items'),
    ('Phase 1 — "Brand anchor"','A brand with no clean fast mover enters through its two highest-value items, provided they sold within the last 90 days and reached 10 units or 500 KD — so every brand stays present in the opening offer.','UNIVET · B&L · SCHEU · custom kits · Silonn · EverBrands'),
    ('Phase 2 — Expansion','Clean mid-movers · + fast movers cut by the top-8 cap · + fast movers carrying a flag (decline or customer returns), offered conditionally · + professional equipment worth ≥ 500 KD','78 items'),
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
    ('Pharmacies','Clinic team accounts for ≤ 20% of the item\'s units — the item genuinely turns outside the clinic channel','39 items in Phase 1'),
    ('Clinics','Clinic team accounts for ≥ 75%, or the brand is professional by nature (UNIVET · B&L · SCHEU · Intensiv · custom kits · EverBrands), or avg price ≥ 100 KD','12 items in Phase 1'),
    ('Pharmacies + Clinics','Between 20% and 75% — offered in both channels at the same price','2 items in Phase 1'),
], ['Channel','Rule','In Phase 1'])
gap()

h2('6 — A separate criterion for professional equipment')
para('Professional equipment (avg price ≥ 100 KD: UNIVET loupes · Intensiv handpieces · B&L kits) is judged on value, not on invoice count. One unit at 981 KD is not "slow-moving" in any commercial sense — such goods are sold one unit at a time to one customer a year. They therefore entered Phases 1 and 2 on a value criterion (≥ 500 KD within the last 120 days) even though they invoice less than once a month.', bold=True)
gap()

h2('7 — Priority within each phase (A / B / C)')
table([
    ('A','The items making up the first 60% of the phase\'s value — offered first, and never allowed to go out of stock'),
    ('B','The next band, up to 90% of the phase\'s value'),
    ('C','The last 10% of value — they complete the shelf; do not open a visit with them'),
], ['Priority','Definition'])
gap()

h2('8 — Limits of this reading (stated for honesty)')
para('•  The period covers only 8.1 months of 2026, with no comparison against 2025 — so year-on-year growth or decline does not show.')
para('•  The classification reflects what we sold, not what the market wants: an item we never presented properly will look "slow" without being so — which is why Phase 3 is "on demand", not "for delisting".')
para('•  New items (first sale within the last 3 months) rest on a short history, and are flagged as such in the watch-out column.')
para('•  Non-invoice returns may relate to goods sold in earlier years, so they are not charged against 2026 performance.')
para('•  Pricing, margins and commercial agreements are entirely outside the scope of this document.')

wb.save('UltraMed-Initial-Listing-2026-EN.xlsx')
print('saved')
