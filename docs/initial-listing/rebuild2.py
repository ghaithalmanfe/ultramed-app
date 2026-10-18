# -*- coding: utf-8 -*-
"""أوراق إضافية: تفصيل العائلات · الملحقات · العروض الترويجية · ما تغيّر — وتحديث أرقام المقترح والمعايير."""
import json, sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

AR = (sys.argv[1] if len(sys.argv) > 1 else 'ar') == 'ar'
SRC = '/home/user/ultramed-app/docs/initial-listing/UltraMed-Initial-Listing-2026%s.xlsx' % ('' if AR else '-EN')
P = '/tmp/claude-0/-home-user-ultramed-app/5e83bd61-89ed-55af-b6db-bc42151bf489/scratchpad/'
FAMS = json.load(open(P + 'regrouped.json'))['families']
def t(a,e): return a if AR else e
ALIGN='right' if AR else 'left'
NAVY='1F3864'; BLUE='2E5FA3'; GREEN='1E7145'; GOLD='B07D00'; GREY='595959'; RED='9C0006'
P1F='E2EFDA'; P2F='FFF2CC'; P3F='FCE4D6'
thin=Side(style='thin',color='BFBFBF'); BORD=Border(left=thin,right=thin,top=thin,bottom=thin)
wb=openpyxl.load_workbook(SRC)
def mk(name, idx=None):
    if name in wb.sheetnames: del wb[name]
    ws = wb.create_sheet(name, idx) if idx is not None else wb.create_sheet(name)
    ws.sheet_view.rightToLeft=AR; ws.sheet_view.showGridLines=False; return ws
def title_block(ws,title,sub,width):
    ws.merge_cells(start_row=1,start_column=1,end_row=1,end_column=width)
    c=ws.cell(1,1,title); c.font=Font(bold=True,size=16,color='FFFFFF')
    c.fill=PatternFill('solid',fgColor=NAVY); c.alignment=Alignment(horizontal='center',vertical='center')
    ws.row_dimensions[1].height=30
    ws.merge_cells(start_row=2,start_column=1,end_row=2,end_column=width)
    c=ws.cell(2,1,sub); c.font=Font(size=10,color=GREY)
    c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True); ws.row_dimensions[2].height=36
def header_row(ws,r,H,W,fill=BLUE):
    for i,(h,w) in enumerate(zip(H,W),start=1):
        c=ws.cell(r,i,h); c.font=Font(bold=True,size=10,color='FFFFFF')
        c.fill=PatternFill('solid',fgColor=fill); c.border=BORD
        c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[r].height=34; ws.freeze_panes=ws.cell(r+1,1)

TYPE_AR={'standalone_product':'منتج','accessory_or_spare':'ملحق / قطعة غيار','promo_pack':'عبوة ترويجية',
         'equipment':'معدة','professional_consumable':'مستهلك مهني','trade_bulk_pack':'عبوة تجارية','service_or_nonproduct':'خدمة'}
TYPE_EN={'standalone_product':'Product','accessory_or_spare':'Accessory / spare','promo_pack':'Promo pack',
         'equipment':'Equipment','professional_consumable':'Professional consumable','trade_bulk_pack':'Trade pack','service_or_nonproduct':'Service'}
ty=lambda k: TYPE_AR[k] if AR else TYPE_EN[k]

idx_after_clinic = wb.sheetnames.index(t('عرض العيادات','Clinic Listing')) + 1

# ================= 1) تفصيل العائلات =================
ws=mk(t('تفصيل العائلات','Family Detail'), idx_after_clinic)
multi=[f for f in FAMS if f['sku_count']>1]
H=[t('#','#'),t('البراند','Brand'),t('المنتج (عائلة)','Product (family)'),t('قناة العائلة','Family channel'),
   t('مرحلة العائلة','Family phase'),t('كود ERP داخلها','ERP SKU inside it'),t('اللون/الحجم','Variant'),
   t('نوع الصنف','SKU type'),t('قطع 2026','Units 2026'),t('صافي KD','Net KD'),t('كان في المرحلة','Was in phase')]
W=[5,20,44,16,12,56,24,18,11,12,12]
title_block(ws,t('تفصيل العائلات — أي كود ERP دخل أي عائلة','Family detail — which ERP SKU went into which family'),
  t('%d عائلة تضم أكثر من كود · لا شيء حُذف من الملف، بل جُمعت الأكواد تحت منتجها. هذه الورقة تُثبت أن كل كود له مكان.'
    % len(multi),
    '%d families contain more than one SKU · nothing was deleted from the file, the SKUs were gathered under their product. This sheet proves every SKU has a home.'
    % len(multi)), len(H))
header_row(ws,3,H,W)
r=4
for f in sorted(multi,key=lambda f:-f['kd']):
    for s in sorted(f['skus'],key=lambda s:-s['kd']):
        vals=[len([1]),f['brand'],f['family'],f['channel_ar'] if AR else f['channel_en'],f['phase'] or '—',
              s['product'],s['variant'] or '—',ty(s['type']),s['units'],s['kd'],s['phase'] or '—']
        for j,v in enumerate(vals,start=1):
            c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=9)
            c.alignment=Alignment(horizontal=ALIGN if j in (2,3,6,7) else 'center',vertical='center',wrap_text=(j in (3,6)))
            if j==10: c.number_format='#,##0.0'
            if j==9: c.number_format='#,##0'
            if j==8 and s['type'] in ('promo_pack','accessory_or_spare','trade_bulk_pack'):
                c.font=Font(size=9,bold=True,color=GOLD)
        ws.cell(r,1,r-3)
        ws.row_dimensions[r].height=22; r+=1
ws.auto_filter.ref='A3:%s%d'%(get_column_letter(len(H)),r-1)

# ================= 2) الملحقات وقطع الغيار =================
acc=[f for f in FAMS if f['item_type'] in ('accessory_or_spare','trade_bulk_pack')]
ws=mk(t('الملحقات وقطع الغيار','Accessories & Spares'), idx_after_clinic+1)
H=[t('#','#'),t('البراند','Brand'),t('الملحق (عائلة)','Accessory (family)'),t('النوع','Type'),t('عدد الأكواد','SKUs'),
   t('قطع 2026','Units 2026'),t('صافي KD','Net KD'),t('القناة','Channel'),t('سعر الجمهور KD','Consumer price KD'),
   t('لماذا خارج العرض الافتتاحي','Why it is out of the opening offer')]
W=[5,20,48,18,10,11,12,18,14,56]
title_block(ws,t('الملحقات وقطع الغيار — تُباع مع جهازها لا كسطر في عرض السعر','Accessories and spares — sold with their device, not as a line on the quotation'),
  t('%d عائلة ملحق بقيمة %s د.ك. رؤوس فرش بديلة وأطراف Waterpik وفوهات وشواحن وعبوات تجارية. إدراجها في عرض افتتاحي يُضخّم القائمة ويُربك الصيدلية — تُعرض عند بيع الجهاز أو عند طلب العميل.'
    % (len(acc), format(round(sum(f['kd'] for f in acc)),',')),
    '%d accessory families worth %s KD. Replacement brush heads, Waterpik tips, nozzles, chargers and trade packs. Listing them in an opening offer inflates the list and confuses the pharmacy — they are offered with the device or on request.'
    % (len(acc), format(round(sum(f['kd'] for f in acc)),','))), len(H))
header_row(ws,3,H,W,fill=GREY)
r=4
for i,f in enumerate(sorted(acc,key=lambda f:-f['kd']),1):
    vals=[i,f['brand'],f['family'],ty(f['item_type']),f['sku_count'],f['units'],f['kd'],
          f['channel_ar'] if AR else f['channel_en'],f['rrp'] if f['rrp'] else '—',f['reason']]
    for j,v in enumerate(vals,start=1):
        c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=9)
        c.alignment=Alignment(horizontal=ALIGN if j in (2,3,10) else 'center',vertical='center',wrap_text=(j in (3,10)))
        if j==7: c.number_format='#,##0.0'
        if j in (5,6): c.number_format='#,##0'
        if j==9 and isinstance(v,(int,float)): c.number_format='#,##0.00'
    ws.row_dimensions[r].height=24; r+=1
ws.auto_filter.ref='A3:%s%d'%(get_column_letter(len(H)),r-1)

# ================= 3) العروض الترويجية =================
promos=[(f,s) for f in FAMS for s in f['skus'] if s['type']=='promo_pack']
ws=mk(t('العروض الترويجية','Promo Packs'), idx_after_clinic+2)
H=[t('#','#'),t('البراند','Brand'),t('المنتج الأصلي','Base product'),t('العبوة الترويجية','Promo pack'),
   t('قطع 2026','Units 2026'),t('صافي KD','Net KD'),t('المنتج الأصلي في المرحلة','Base product phase'),t('كيف تُدار','How to handle it')]
W=[5,20,44,56,11,12,16,46]
title_block(ws,t('العروض الترويجية — عرض على منتج قائم لا صنف جديد','Promo packs — an offer on an existing product, not a new item'),
  t('%d عبوة ترويجية كانت تظهر كأصناف مستقلة في القائمة، فتضاعف عدد أسطر نفس المنتج. مكانها الصحيح: أداة تفاوض على المنتج الأصلي.'
    % len(promos),
    '%d promo packs used to appear as separate items, doubling the rows for the same product. Their right place: a negotiating tool on the base product.'
    % len(promos)), len(H))
header_row(ws,3,H,W,fill=GOLD)
r=4
for i,(f,s) in enumerate(sorted(promos,key=lambda x:-x[1]['kd']),1):
    vals=[i,f['brand'],f['family'],s['product'],s['units'],s['kd'],f['phase'] or '—',
          t('تُعرض كبروموشن على «%s» عند التفاوض','Offer it as a promotion on "%s" during negotiation') % f['family'][:36]]
    for j,v in enumerate(vals,start=1):
        c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=9)
        c.alignment=Alignment(horizontal=ALIGN if j in (2,3,4,8) else 'center',vertical='center',wrap_text=(j in (3,4,8)))
        if j==6: c.number_format='#,##0.0'
        if j==5: c.number_format='#,##0'
    ws.row_dimensions[r].height=24; r+=1
ws.auto_filter.ref='A3:%s%d'%(get_column_letter(len(H)),r-1)

# ================= 4) ما تغيّر =================
ws=mk(t('ما تغيّر','What Changed'), 1)
LISTED=[f for f in FAMS if f['channel']!='do_not_list' and f['phase'] in (1,2,3)]
ph1=[f for f in LISTED if f['phase']==1]
phar1=[f for f in ph1 if f['channel'] in ('pharmacy','both')]
clin1=[f for f in ph1 if f['channel'] in ('clinic','both')]
acc_n=len([f for f in FAMS if f['item_type'] in ('accessory_or_spare','trade_bulk_pack')])
ws.column_dimensions['A'].width=3
for col,w in zip('BCDEFGH',[34,18,18,18,18,18,40]): ws.column_dimensions[col].width=w
title_block(ws,t('ما تغيّر في هذه النسخة — تصحيح','What changed in this version — a correction'),
  t('النسخة السابقة بُنيت على أكواد ERP، فظهر كل لون وكل عبوة ترويجية كصنف مستقل، وتسرّبت معدات وقطع غيار إلى عرض الصيدليات. هذه النسخة مبنية على عائلة المنتج.',
    'The previous version was built on ERP SKUs, so every colour and every promo pack appeared as a separate item, and equipment and spare parts leaked into the pharmacy offer. This version is built on the product family.'), 8)
r=4
def h2(x):
    global r
    ws.merge_cells(start_row=r,start_column=2,end_row=r,end_column=8)
    c=ws.cell(r,2,x); c.font=Font(bold=True,size=12,color='FFFFFF')
    c.fill=PatternFill('solid',fgColor=BLUE); c.alignment=Alignment(horizontal=ALIGN,vertical='center')
    ws.row_dimensions[r].height=22; r+=1
def para(x,bold=False):
    global r
    ws.merge_cells(start_row=r,start_column=2,end_row=r,end_column=8)
    c=ws.cell(r,2,x); c.font=Font(size=10,bold=bold)
    c.alignment=Alignment(horizontal=ALIGN,vertical='top',wrap_text=True)
    ws.row_dimensions[r].height=max(16,15*(len(x)//110+1)); r+=1
def tbl(H_,rows,fills=None):
    global r
    for j,h in enumerate(H_,start=2):
        c=ws.cell(r,j,h); c.font=Font(bold=True,size=10,color='FFFFFF')
        c.fill=PatternFill('solid',fgColor=NAVY); c.border=BORD
        c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
    ws.row_dimensions[r].height=26; r+=1
    for i,row in enumerate(rows):
        for j,v in enumerate(row,start=2):
            c=ws.cell(r,j,v); c.border=BORD; c.font=Font(size=10,bold=(j==2))
            c.alignment=Alignment(horizontal=ALIGN if j in (2,len(H_)+1) else 'center',vertical='center',wrap_text=True)
            if fills: c.fill=PatternFill('solid',fgColor=fills[i])
        ws.row_dimensions[r].height=28; r+=1
    r+=1

h2(t('خطآن في النسخة السابقة','Two errors in the previous version'))
para(t('1)  تكرار: القائمة بُنيت على كود ERP لا على المنتج. فرشاة PhilipsOne بأربعة ألوان ظهرت أربعة أسطر، ومعها أربعة بوكسات «+2 free» = ثمانية أسطر لمنتج واحد. وفرش TePe البينية ظهرت تسعة أسطر. ونكهات TheBreath الأربع ظهرت مرتين: عبوة عادية في المرحلة 1 وعبوة ترويجية في المرحلة 2.',
       '1)  Duplication: the list was built on ERP SKUs, not on products. The PhilipsOne toothbrush in four colours appeared as four rows, plus four "+2 free" boxes — eight rows for one product. TePe interdental brushes appeared as nine rows. The four TheBreath flavours appeared twice: a plain bottle in Phase 1 and a promo pack in Phase 2.'), bold=True)
para(t('2)  تسرّب: دخلت عرض الصيدليات أصناف لا تبيعها صيدلية لزبون — ثلاجات Silonn، وستة أطراف Waterpik بديلة، ورؤوس فرش Philips بوسم [RFID] Std TBH وهي عبوات تجارية للعيادات، ومعقّم UV بـ60 د.ك.',
       '2)  Leakage: items a pharmacy does not sell to a consumer entered the pharmacy offer — Silonn mini fridges, six Waterpik replacement tips, Philips brush heads marked [RFID] Std TBH which are trade packs for clinics, and a 60 KD UV sanitiser.'), bold=True)

h2(t('الأثر بالأرقام','The effect in numbers'))
tbl([t('المقياس','Measure'),t('قبل','Before'),t('بعد','After'),t('الفرق','Change'),'','',t('التفسير','Explanation')],
    [[t('أسطر القائمة','Listing rows'),244,len(FAMS),len(FAMS)-244,'','',t('سطر واحد لكل منتج بدل سطر لكل كود','One row per product instead of one per SKU')],
     [t('عرض الصيدليات — المرحلة 1','Pharmacy offer — Phase 1'),42,len(phar1),len(phar1)-42,'','',t('بعد جمع الألوان وإخراج الملحقات والمعدات','After merging colours and removing accessories and equipment')],
     [t('عرض العيادات — المرحلة 1','Clinic offer — Phase 1'),14,len(clin1),len(clin1)-14,'','',t('استقبل ما خرج من عرض الصيدليات','It received what left the pharmacy offer')],
     [t('ملحقات وعبوات تجارية','Accessories and trade packs'),0,acc_n,acc_n,'','',t('خرجت من العروض إلى ورقة مستقلة','Moved out of the offers into their own sheet')],
     [t('عبوات ترويجية','Promo packs'),len(promos),0,-len(promos),'','',t('صارت عرضاً على المنتج الأصلي لا صنفاً','Became an offer on the base product, not an item')]],
    [P1F,P1F,P1F,'FFF2CC','FFF2CC'])

h2(t('كيف تقرأ الورقة الجديدة','How to read the new sheet'))
para(t('كل سطر = منتج واحد. الألوان والمقاسات في خانة «الألوان/المقاسات المتاحة»، والأكواد في خانة «أكواد ERP»، والعرض الترويجي في خانته. لا شيء حُذف — ورقة «تفصيل العائلات» تُظهر أي كود دخل أي عائلة.',
       'Each row is one product. Colours and sizes sit in the "variants available" column, the SKUs in the "ERP SKUs" column, and any promotion in its own column. Nothing was deleted — the "Family Detail" sheet shows which SKU went into which family.'))
para(t('القاعدة الفاصلة للصيدلية: هل يدخل زبون عادي الصيدلية ويشتري هذا الصنف؟ إن كان الجواب لا — فهو عيادة أو ملحق أو معدة، لا سطر في عرض الصيدليات.',
       'The decisive rule for a pharmacy: would an ordinary customer walk into a pharmacy and buy this? If not, it is a clinic item, an accessory or equipment — not a line in the pharmacy offer.'), bold=True)

# ================= 5) تحديث أرقام المقترح =================
prop=wb[t('المقترح','Proposal')]
counts={1:len([f for f in LISTED if f['phase']==1]),2:len([f for f in LISTED if f['phase']==2]),3:len([f for f in LISTED if f['phase']==3])}
kds={p:round(sum(f['kd'] for f in LISTED if f['phase']==p)) for p in (1,2,3)}
tot_all=sum(f['kd'] for f in FAMS) or 1
for row,p in ((11,1),(12,2),(13,3)):
    prop.cell(row,4,counts[p]); prop.cell(row,5,kds[p]); prop.cell(row,6,kds[p]/tot_all)
    prop.cell(row,7,len({f['brand'] for f in LISTED if f['phase']==p}))
prop.cell(6,2,t('هذا المقترح يختار %d منتجاً فقط (المرحلة 1) تُغطي وحدها %.1f%% من مبيعات 2026، وتُقدَّم كقائمة أولى موحّدة. العدّ بالمنتج لا بكود ERP: هذه الـ%d منتجاً تمثّل %d كوداً.'
  % (counts[1], kds[1]/tot_all*100, counts[1], sum(f['sku_count'] for f in LISTED if f['phase']==1)),
  'This proposal selects %d products only (Phase 1), covering %.1f%% of 2026 sales on their own, offered as one standard opening list. Counted by product, not by ERP SKU: these %d products cover %d SKUs.'
  % (counts[1], kds[1]/tot_all*100, counts[1], sum(f['sku_count'] for f in LISTED if f['phase']==1))))

wb.save(SRC)
print('ok', SRC.split('/')[-1], '| sheets:', len(wb.sheetnames))
print('  ', wb.sheetnames)
