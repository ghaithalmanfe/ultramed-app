# -*- coding: utf-8 -*-
"""إعادة بناء أوراق العرض على مستوى «عائلة المنتج» داخل الملف القائم.

يُستبدل: أوراق المراحل الثلاث + عرض الصيدليات + عرض العيادات (كانت على مستوى كود ERP).
يُضاف  : تفصيل العائلات · الملحقات وقطع الغيار · العروض الترويجية · ما تغيّر.
يُترك كما هو: أدلة العيادات · حسابات العيادات · سلال الطلبات · التسعير والهوامش · فجوات التسعير · خارج القائمة.
"""
import json, sys, shutil
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

AR = (sys.argv[1] if len(sys.argv) > 1 else 'ar') == 'ar'
SRC = '/home/user/ultramed-app/docs/initial-listing/UltraMed-Initial-Listing-2026%s.xlsx' % ('' if AR else '-EN')
P = '/tmp/claude-0/-home-user-ultramed-app/5e83bd61-89ed-55af-b6db-bc42151bf489/scratchpad/'
FAMS = json.load(open(P + 'regrouped.json'))['families']

def t(a, e): return a if AR else e
ALIGN = 'right' if AR else 'left'
NAVY='1F3864'; BLUE='2E5FA3'; GREEN='1E7145'; GOLD='B07D00'; GREY='595959'; RED='9C0006'
P1F='E2EFDA'; P2F='FFF2CC'; P3F='FCE4D6'; XF='F2F2F2'
thin=Side(style='thin', color='BFBFBF'); BORD=Border(left=thin,right=thin,top=thin,bottom=thin)

wb = openpyxl.load_workbook(SRC)
NAMES = {
 'p1': t('المرحلة 1 — الأساسية','Phase 1 — Core Listing'),
 'p2': t('المرحلة 2 — التوسعة','Phase 2 — Expansion'),
 'p3': t('المرحلة 3 — حسب الطلب','Phase 3 — On Demand'),
 'ph': t('عرض الصيدليات','Pharmacy Listing'),
 'cl': t('عرض العيادات','Clinic Listing'),
 'prop': t('المقترح','Proposal'),
 'crit': t('المعايير','Criteria'),
}
order = wb.sheetnames[:]
for k in ('p1','p2','p3','ph','cl'):
    del wb[NAMES[k]]

def mk(name, idx):
    ws = wb.create_sheet(name, idx)
    ws.sheet_view.rightToLeft = AR; ws.sheet_view.showGridLines = False
    return ws
def title_block(ws, title, sub, width):
    ws.merge_cells(start_row=1,start_column=1,end_row=1,end_column=width)
    c=ws.cell(1,1,title); c.font=Font(bold=True,size=16,color='FFFFFF')
    c.fill=PatternFill('solid',fgColor=NAVY); c.alignment=Alignment(horizontal='center',vertical='center')
    ws.row_dimensions[1].height=30
    ws.merge_cells(start_row=2,start_column=1,end_row=2,end_column=width)
    c=ws.cell(2,1,sub); c.font=Font(size=10,color=GREY)
    c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True); ws.row_dimensions[2].height=36
def header_row(ws,r,headers,widths,fill=BLUE):
    for i,(h,w) in enumerate(zip(headers,widths),start=1):
        c=ws.cell(r,i,h); c.font=Font(bold=True,size=10,color='FFFFFF')
        c.fill=PatternFill('solid',fgColor=fill); c.border=BORD
        c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[r].height=36; ws.freeze_panes=ws.cell(r+1,1)

LISTED = [f for f in FAMS if f['channel'] != 'do_not_list' and f['phase'] in (1,2,3)]
def variants_txt(f):
    if f['variant_count'] <= 1: return '—'
    vs = [v for v in f['variants'] if v]
    return '%d: %s' % (len(vs), ' · '.join(vs[:6]) + (' …' if len(vs) > 6 else ''))
def promo_txt(f):
    if not f['promo_count']: return '—'
    return t('%d عبوة ترويجية على نفس المنتج','%d promo pack(s) on the same product') % f['promo_count']

# ================= أوراق المراحل =================
HEAD=[t('#','#'),t('البراند','Brand'),t('المنتج (عائلة)','Product (family)'),t('القناة','Channel'),t('النوع','Type'),
      t('الأولوية','Priority'),t('أكواد ERP','ERP SKUs'),t('الألوان/المقاسات','Variants'),t('عرض ترويجي','Promo'),
      t('التصنيف','Class'),t('قطع/شهر','Units/month'),t('فواتير/شهر','Invoices/month'),t('عملاء','Customers'),
      t('قطع 2026','Units 2026'),t('صافي KD','Net KD'),t('سعر الجمهور KD','Consumer price KD'),
      t('السعر الفعلي KD','Effective price KD'),t('هامش العميل %','Customer margin %'),t('سبب الإدراج','Why listed')]
W=[5,20,46,16,16,9,22,34,20,13,11,12,10,11,13,13,14,13,44]
PRIO=lambda kd,tot: 'A' if kd>=tot*0.05 else ('B' if kd>=tot*0.01 else 'C')

for key,ph,fill,sub in [('p1',1,P1F,t('تُعرض على كل عميل في أول زيارة · مخزون دائم','Presented to every customer on the first visit · permanent stock')),
                        ('p2',2,P2F,t('تُضاف بعد أول أوردر ناجح','Added after a first successful order')),
                        ('p3',3,P3F,t('تُسعَّر عند الطلب فقط','Quoted on request only'))]:
    rows=sorted([f for f in LISTED if f['phase']==ph], key=lambda f:-f['kd'])
    tot=sum(f['kd'] for f in rows) or 1
    ws=mk(NAMES[key], order.index(NAMES[key]))
    title_block(ws, NAMES[key],
      t('%s  ·  %d عائلة منتج (تمثّل %d كود ERP) · %s د.ك  —  سطر واحد لكل منتج، والألوان والمقاسات خانة داخله لا أسطر مستقلة'
        % (sub, len(rows), sum(f['sku_count'] for f in rows), format(round(tot),',')),
        '%s  ·  %d product families (covering %d ERP SKUs) · %s KD  —  one row per product, with colours and sizes as a column rather than separate rows'
        % (sub, len(rows), sum(f['sku_count'] for f in rows), format(round(tot),','))), len(HEAD))
    header_row(ws,3,HEAD,W)
    r=4
    for i,f in enumerate(rows,1):
        vals=[i,f['brand'],f['family'],f['channel_ar'] if AR else f['channel_en'],f['type_ar'] if AR else f['type_en'],
              PRIO(f['kd'],tot),f['codes'] or '—',variants_txt(f),promo_txt(f),f['cls'],f['upm'],f['ipm'],f['customers'],
              f['units'],f['kd'],f['rrp'] if f['rrp'] else t('بلا سعر','no price'),
              round(f['eff'],2) if f['eff'] else '—', f['margin'] if f['margin'] is not None else '—', f['reason']]
        for j,v in enumerate(vals,start=1):
            c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=9)
            c.alignment=Alignment(horizontal=ALIGN if j in (2,3,7,8,19) else 'center',vertical='center',wrap_text=(j in (3,7,8,19)))
            if j in (11,15,17): c.number_format='#,##0.0'
            if j in (12,16): c.number_format='#,##0.00'
            if j in (13,14): c.number_format='#,##0'
            if j==18 and isinstance(v,float): c.number_format='0%'
            if j==6: c.font=Font(size=9,bold=True,color={'A':GREEN,'B':GOLD,'C':GREY}[vals[5]])
            if j==4: c.fill=PatternFill('solid',fgColor={'صيدليات':'E7F0FA','عيادات':'FBE9E7','صيدليات + عيادات':'F0EAF7','مباشر / أونلاين':'EDEDED',
                                                        'Pharmacies':'E7F0FA','Clinics':'FBE9E7','Pharmacies + Clinics':'F0EAF7','Direct / Online':'EDEDED'}.get(v,'FFFFFF'))
            if j==16 and not f['rrp']: c.font=Font(size=9,bold=True,color=RED)
        ws.cell(r,1).fill=PatternFill('solid',fgColor=fill)
        ws.row_dimensions[r].height=26; r+=1
    for j in range(1,len(HEAD)+1):
        c=ws.cell(r,j); c.border=BORD; c.fill=PatternFill('solid',fgColor=NAVY)
        c.font=Font(bold=True,size=10,color='FFFFFF'); c.alignment=Alignment(horizontal='center',vertical='center')
    ws.cell(r,2,t('الإجمالي','Total')); ws.cell(r,14,sum(f['units'] for f in rows)).number_format='#,##0'
    ws.cell(r,15,round(tot,1)).number_format='#,##0'
    ws.auto_filter.ref='A3:%s%d'%(get_column_letter(len(HEAD)),r-1)

# ================= أوراق القنوات =================
def channel_sheet(key, chans, title, sub):
    rows=[f for f in LISTED if f['channel'] in chans]
    rows.sort(key=lambda f:(f['phase'], -f['kd']))
    tot=sum(f['kd'] for f in rows) or 1
    ws=mk(NAMES[key], order.index(NAMES[key]))
    H=[t('#','#'),t('المرحلة','Phase'),t('البراند','Brand'),t('المنتج (عائلة)','Product (family)'),t('النوع','Type'),
       t('الألوان/المقاسات المتاحة','Variants available'),t('أكواد ERP','ERP SKUs'),t('عرض ترويجي','Promo'),
       t('التصنيف','Class'),t('قطع/شهر','Units/month'),t('عملاء','Customers'),t('قطع 2026','Units 2026'),t('صافي KD','Net KD'),
       t('سعر الجمهور KD','Consumer price KD'),t('السعر الفعلي KD','Effective price KD'),t('هامش العميل %','Customer margin %'),
       t('ملاحظة للمندوب','Note for the rep')]
    WW=[5,8,20,48,16,36,22,20,13,11,10,11,13,14,14,13,44]
    p1=[f for f in rows if f['phase']==1]
    title_block(ws,title,t('%s  ·  المرحلة 1: %d منتج · المرحلة 2: %d · المرحلة 3: %d  —  سطر واحد لكل منتج'
        % (sub,len(p1),sum(1 for f in rows if f['phase']==2),sum(1 for f in rows if f['phase']==3)),
        '%s  ·  Phase 1: %d products · Phase 2: %d · Phase 3: %d  —  one row per product'
        % (sub,len(p1),sum(1 for f in rows if f['phase']==2),sum(1 for f in rows if f['phase']==3))), len(H))
    header_row(ws,3,H,WW)
    r=4
    for i,f in enumerate(rows,1):
        note = f['reason'] if f['phase']==1 else (t('تُضاف بعد أول إعادة طلب','Add after a first reorder') if f['phase']==2
               else t('عند الطلب فقط — بدون التزام مخزون','On request only — no stock commitment'))
        vals=[i,f['phase'],f['brand'],f['family'],f['type_ar'] if AR else f['type_en'],variants_txt(f),f['codes'] or '—',
              promo_txt(f),f['cls'],f['upm'],f['customers'],f['units'],f['kd'],
              f['rrp'] if f['rrp'] else t('بلا سعر','no price'),round(f['eff'],2) if f['eff'] else '—',
              f['margin'] if f['margin'] is not None else '—',note]
        for j,v in enumerate(vals,start=1):
            c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=9)
            c.alignment=Alignment(horizontal=ALIGN if j in (3,4,6,7,17) else 'center',vertical='center',wrap_text=(j in (4,6,7,17)))
            if j in (10,13,15): c.number_format='#,##0.0'
            if j in (14,): c.number_format='#,##0.00'
            if j in (11,12): c.number_format='#,##0'
            if j==16 and isinstance(v,float): c.number_format='0%'
            if j==2: c.fill=PatternFill('solid',fgColor={1:P1F,2:P2F,3:P3F}[f['phase']]); c.font=Font(size=9,bold=True)
            if j==14 and not f['rrp']: c.font=Font(size=9,bold=True,color=RED)
        ws.row_dimensions[r].height=26; r+=1
    ws.auto_filter.ref='A3:%s%d'%(get_column_letter(len(H)),r-1)

channel_sheet('ph', ('pharmacy','both'), t('عرض الصيدليات','Pharmacy Listing'),
  t('أصناف استهلاكية فقط — بلا قطع غيار ولا معدات ولا عبوات تجارية','Consumer items only — no spare parts, equipment or trade packs'))
channel_sheet('cl', ('clinic','both'), t('عرض العيادات','Clinic Listing'),
  t('مستهلكات ومعدات مهنية + الأصناف التي تعيد العيادة بيعها لمرضاها','Professional consumables and equipment, plus items clinics resell to their patients'))

wb.save(SRC)
print('rebuilt', SRC.split('/')[-1], '| sheets:', len(wb.sheetnames))
