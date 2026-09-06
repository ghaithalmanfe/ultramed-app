# -*- coding: utf-8 -*-
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

d = json.load(open('classified.json'))
TOT_KD = sum(o['kd'] for o in d)

NAVY   = '1F3864'; BLUE = '2E5FA3'; LIGHT = 'DCE6F1'
GREEN  = '1E7145'; GOLD = 'B07D00'; GREY = '595959'
P1F = 'E2EFDA'; P2F = 'FFF2CC'; P3F = 'FCE4D6'; XF = 'F2F2F2'

thin = Side(style='thin', color='BFBFBF')
BORD = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook(); wb.remove(wb.active)

def sheet(name, rtl=True):
    ws = wb.create_sheet(name)
    ws.sheet_view.rightToLeft = rtl
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

# ============================================================== 1) المقترح
ws = sheet('المقترح')
title_block(ws, 'UltraMed — Initial Listing 2026  ·  القائمة الأولية المقترحة',
            'مقترح مُقدَّم إلى الإدارة  ·  خطة اعتماد قائمة أصناف من 3 مراحل لعروض الأسعار — الصيدليات أولاً ثم العيادات  ·  مبني على حركة البيع الفعلية من ERP للفترة 03/01/2026 → 06/09/2026', 8)
ws.column_dimensions['A'].width = 3
for col,w in zip('BCDEFGH',[26,15,15,15,15,15,30]): ws.column_dimensions[col].width = w

r = 4
def h2(text):
    global r
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r,2,text); c.font = Font(bold=True, size=12, color='FFFFFF')
    c.fill = PatternFill('solid', fgColor=BLUE); c.alignment = Alignment(horizontal='right', vertical='center')
    ws.row_dimensions[r].height = 22; r += 1
def para(text, bold=False, indent=0):
    global r
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r,2,text); c.font = Font(size=10, bold=bold)
    c.alignment = Alignment(horizontal='right', vertical='top', wrap_text=True, indent=indent)
    ws.row_dimensions[r].height = max(16, 15*(len(text)//110 + 1)); r += 1
def gap(n=1):
    global r; r += n

h2('الخلاصة في سطرين')
para('عندنا 244 صنفاً في ملف الحركة، منها 227 صنفاً بيع فعلياً خلال 2026. لا يمكن — ولا يجب — عرضها كلها على الصيدلية أو العيادة في أول زيارة.')
para('هذا المقترح يختار 53 صنفاً فقط (المرحلة 1) تُغطي وحدها %.1f%% من مبيعات 2026، وتُقدَّم كقائمة أولى موحّدة، ثم تُوسَّع على مرحلتين حسب استجابة العميل.' % (sum(o['kd'] for o in d if o['phase']==1)/TOT_KD*100), bold=True)
gap()

h2('المراحل الثلاث')
rows = [
    ('المرحلة','الاسم','عدد الأصناف','قيمة 2026 (د.ك)','حصة من المبيعات','براندات','الدور في عرض السعر'),
]
for ph, nm, role in [(1,'القائمة الأساسية — Core Listing','تُعرض على كل عميل في أول زيارة · مخزون دائم · هي أساس عرض السعر'),
                     (2,'التوسعة — Expansion','تُضاف بعد أول أوردر ناجح أو عند طلب العميل توسيع الرف'),
                     (3,'حسب الطلب — On Demand','لا تُعرض ابتداءً · تُسعَّر عند الطلب فقط · بدون التزام مخزون')]:
    it = [o for o in d if o['phase']==ph]
    rows.append((ph, nm, len(it), round(sum(o['kd'] for o in it)), sum(o['kd'] for o in it)/TOT_KD,
                 len(set(o['brand'] for o in it)), role))
it = [o for o in d if o['phase']==0]
rows.append(('—','خارج القائمة الأولية — للمراجعة', len(it), round(sum(o['kd'] for o in it)), sum(o['kd'] for o in it)/TOT_KD,
             len(set(o['brand'] for o in it)), 'أصناف راكدة أو بلا بيع مدفوع · قرار إداري: تصفية أو سحب'))
for i,row in enumerate(rows):
    for j,v in enumerate(row, start=2):
        c = ws.cell(r,j,v)
        c.border = BORD
        if i==0:
            c.font = Font(bold=True, size=10, color='FFFFFF'); c.fill = PatternFill('solid', fgColor=NAVY)
            c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        else:
            c.font = Font(size=10, bold=(j==2))
            c.alignment = Alignment(horizontal='center' if j!=8 and j!=3 else 'right', vertical='center', wrap_text=True)
            c.fill = PatternFill('solid', fgColor=[P1F,P2F,P3F,XF][i-1])
            if j==5: c.number_format = '#,##0'
            if j==6: c.number_format = '0.0%'
    ws.row_dimensions[r].height = 30; r += 1
gap()

h2('لماذا هذا الترتيب — المنطق التجاري')
para('1)  الصيدلية لا تشتري كتالوجاً، تشتري «دوران». الصنف الذي يُفوتر أسبوعياً عندنا هو الصنف الذي يدور على رف الصيدلية أيضاً — فيُعرض أولاً ليُفتح الحساب بأقل مخاطرة على الطرفين.')
para('2)  فتح الحساب بأصناف بطيئة يُجمّد رأس مال الصيدلية ويُغلق الباب أمام باقي المحفظة. المرحلة 3 هي السبب الأول لرفض إعادة الطلب، لذلك أُخرجت من العرض الأول تماماً.')
para('3)  الصيدليات أولاً ثم العيادات: الصيدلية قرارها أسرع ودورتها أقصر، فتُثبِّت الدوران والسمعة؛ ثم يُبنى على ذلك عرض العيادات الذي يعتمد على أصناف مهنية أعلى قيمة ودورة قرار أطول.')
para('4)  كل براند مُمثَّل في المرحلة 1 — حتى البراندات التي لا تملك صنفاً سريعاً (UNIVET · B&L · SCHEU · الأطقم) دخلت بأعلى صنف قيمةً فيها («قاطرة البراند»)، حفاظاً على وجود البراند في العرض دون إثقاله.')
gap()

h2('خطة التنفيذ المقترحة')
plan = [
    ('الأسبوع 1–2','اعتماد المرحلة 1 وتسعيرها','إصدار عرض سعر موحّد للصيدليات (41 صنفاً) وعرض منفصل للعيادات (14 صنفاً) · تثبيت حد أدنى للمخزون على أصناف الأولوية A'),
    ('الأسبوع 3–6','تغطية الصيدليات','زيارة الصيدليات بعرض المرحلة 1 فقط · قياس: نسبة الحسابات المفتوحة ومعدل إعادة الطلب خلال 30 يوماً'),
    ('الأسبوع 7–10','التوسعة داخل الصيدليات + إطلاق العيادات','إضافة أصناف المرحلة 2 للحسابات التي أعادت الطلب مرة واحدة على الأقل · بدء عرض العيادات (المرحلة 1 المهنية + المرحلة 2 معدات)'),
    ('الأسبوع 11–12','المراجعة','مراجعة أداء كل مرحلة على أرقام فعلية · ترقية أصناف من 2 إلى 1 وتنزيل ما لم يتحرك · قرار التصفية لأصناف «خارج القائمة»'),
]
for i,row in enumerate([('التوقيت','الخطوة','التفاصيل')] + plan):
    ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=8)
    for j,v in zip([2,3,4], row):
        c = ws.cell(r,j,v); c.border = BORD
        if i==0:
            c.font = Font(bold=True, size=10, color='FFFFFF'); c.fill = PatternFill('solid', fgColor=NAVY)
            c.alignment = Alignment(horizontal='center', vertical='center')
        else:
            c.font = Font(size=10, bold=(j==3)); c.alignment = Alignment(horizontal='right', vertical='center', wrap_text=True)
    for j in (5,6,7,8): ws.cell(r,j).border = BORD
    ws.row_dimensions[r].height = 30 if i else 20; r += 1
gap()

h2('المطلوب من الإدارة')
para('•  اعتماد أصناف المرحلة 1 كقائمة رسمية أولى، والالتزام بعدم عرض أصناف المرحلة 3 ابتداءً في أي زيارة.')
para('•  اعتماد سعر ثابت وشروط موحّدة (كمية أولى + هامش) لأصناف المرحلة 1 قبل نزول المندوبين، حتى لا يختلف العرض من مندوب لآخر.')
para('•  قرار في 59 صنفاً «خارج القائمة الأولية»: تصفية أو سحب — لأنها تستهلك مخزوناً ومساحة عرض بلا حركة مقابلة.')
para('•  ملاحظة: التسعير والهوامش خارج نطاق هذا المستند — هذه قائمة أصناف مبنية على الحركة، لا قائمة أسعار.', bold=True)

# ============================================================== أوراق المراحل
PHASE_META = {
 1: ('المرحلة 1 — الأساسية', P1F, 'القائمة الأساسية · تُعرض على كل عميل في أول زيارة · مخزون دائم'),
 2: ('المرحلة 2 — التوسعة',  P2F, 'تُضاف بعد أول أوردر ناجح أو عند طلب العميل — لا تدخل عرض السعر الأول'),
 3: ('المرحلة 3 — حسب الطلب', P3F, 'لا تُعرض ابتداءً · تُسعَّر عند الطلب فقط · بدون التزام مخزون'),
}
HEAD = ['#','البراند','المنتج','الكود','القناة المقترحة','الأولوية','التصنيف الحالي','قطع/شهر','آخر 3 أشهر قطع/شهر','فواتير/شهر','عدد العملاء','قطع مبيعة 2026','صافي المبيعات KD','متوسط سعر القطعة KD','سبب الإدراج في المرحلة','تنبيه / نقطة انتباه']
W    = [ 5, 20, 52, 18, 16, 8, 14, 9, 11, 9, 9, 11, 13, 12, 46, 46]

def write_rows(ws, items, start, fill):
    r = start
    for i,o in enumerate(items, start=1):
        vals = [i, o['brand'], o['المنتج / Product'], o['الكود / Code'] or '—', o['channel'], o['prio'],
                o['cls'], round(o['upm'],1), round(o['upm3'],1), round(o['ipm'],2), o['cust'], o['units'],
                round(o['kd'],1), round(o['px'],2), o['reason'], ' · '.join(o['issues']) or '—']
        for j,v in enumerate(vals, start=1):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
            c.alignment = Alignment(horizontal='right' if j in (2,3,15,16) else 'center', vertical='center', wrap_text=(j in (3,15,16)))
            if j in (13,): c.number_format = '#,##0.0'
            if j in (8,9,14): c.number_format = '#,##0.00'
            if j in (11,12): c.number_format = '#,##0'
            if j == 6:
                c.font = Font(size=9, bold=True, color={'A':GREEN,'B':GOLD,'C':GREY}[o['prio']])
            if j == 5:
                c.fill = PatternFill('solid', fgColor={'صيدليات':'E7F0FA','عيادات':'FBE9E7','صيدليات + عيادات':'F0EAF7'}[o['channel']])
            if j == 16 and o['issues']:
                c.font = Font(size=9, color='9C0006')
        ws.cell(r,1).fill = PatternFill('solid', fgColor=fill)
        ws.row_dimensions[r].height = 26
        r += 1
    return r

for ph in (1,2,3):
    name, fill, sub = PHASE_META[ph]
    items = sorted([o for o in d if o['phase']==ph], key=lambda o: (o['channel'] != 'صيدليات', -o['kd']))
    ws = sheet(name)
    kd = sum(o['kd'] for o in items)
    title_block(ws, name,
        '%s  ·  %d صنفاً · %d براند · %s د.ك من مبيعات 2026 (%.1f%% من الإجمالي)  —  الصيدليات أولاً ثم العيادات'
        % (sub, len(items), len(set(o['brand'] for o in items)), format(round(kd),','), kd/TOT_KD*100), len(HEAD))
    header_row(ws, 3, HEAD, W)
    end = write_rows(ws, items, 4, fill)
    ws.auto_filter.ref = 'A3:%s%d' % (get_column_letter(len(HEAD)), end-1)
    # صف الإجمالي
    for j in range(1, len(HEAD)+1):
        c = ws.cell(end,j); c.border = BORD; c.fill = PatternFill('solid', fgColor=NAVY); c.font = Font(bold=True, size=10, color='FFFFFF')
        c.alignment = Alignment(horizontal='center', vertical='center')
    ws.cell(end,2,'الإجمالي'); ws.cell(end,12, sum(o['units'] for o in items)).number_format='#,##0'
    ws.cell(end,13, round(kd,1)).number_format='#,##0'
    ws.row_dimensions[end].height = 22

# ============================================================== أوراق القنوات
def channel_sheet(sname, chans, title, sub):
    items = [o for o in d if o['phase'] in (1,2,3) and o['channel'] in chans]
    items.sort(key=lambda o: (o['phase'], {'A':0,'B':1,'C':2}[o['prio']], -o['kd']))
    ws = sheet(sname)
    HEAD2 = ['#','المرحلة','الأولوية','البراند','المنتج','الكود','التصنيف الحالي','قطع/شهر','فواتير/شهر','عدد العملاء','قطع مبيعة 2026','صافي المبيعات KD','متوسط سعر القطعة KD','ملاحظة للمندوب']
    W2    = [ 5, 9, 8, 20, 54, 18, 14, 9, 9, 9, 11, 13, 12, 52]
    p1 = [o for o in items if o['phase']==1]
    title_block(ws, title, '%s  ·  المرحلة 1: %d صنفاً · المرحلة 2: %d · المرحلة 3: %d  —  عرض السعر الأول = أصناف المرحلة 1 فقط'
                % (sub, len(p1), len([o for o in items if o['phase']==2]), len([o for o in items if o['phase']==3])), len(HEAD2))
    header_row(ws, 3, HEAD2, W2)
    r = 4
    for i,o in enumerate(items, start=1):
        note = ' · '.join(o['issues']) if o['issues'] else ('يُعرض في أول زيارة' if o['phase']==1 else ('يُضاف بعد أول إعادة طلب' if o['phase']==2 else 'عند الطلب فقط — بدون التزام مخزون'))
        vals = [i, o['phase'], o['prio'], o['brand'], o['المنتج / Product'], o['الكود / Code'] or '—', o['cls'],
                round(o['upm'],1), round(o['ipm'],2), o['cust'], o['units'], round(o['kd'],1), round(o['px'],2), note]
        for j,v in enumerate(vals, start=1):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
            c.alignment = Alignment(horizontal='right' if j in (4,5,14) else 'center', vertical='center', wrap_text=(j in (5,14)))
            if j in (12,): c.number_format = '#,##0.0'
            if j in (8,13): c.number_format = '#,##0.00'
            if j in (10,11): c.number_format = '#,##0'
            if j == 2: c.fill = PatternFill('solid', fgColor={1:P1F,2:P2F,3:P3F}[o['phase']]); c.font = Font(size=9, bold=True)
            if j == 3: c.font = Font(size=9, bold=True, color={'A':GREEN,'B':GOLD,'C':GREY}[o['prio']])
        ws.row_dimensions[r].height = 26; r += 1
    ws.auto_filter.ref = 'A3:%s%d' % (get_column_letter(len(HEAD2)), r-1)

channel_sheet('عرض الصيدليات', ('صيدليات','صيدليات + عيادات'),
    'قائمة الصيدليات — Pharmacy Listing',
    'الأصناف التي تدور فعلياً خارج قناة العيادات (هايبرماركت · صيدليات · أونلاين)')
channel_sheet('عرض العيادات', ('عيادات','صيدليات + عيادات'),
    'قائمة العيادات — Clinic Listing',
    'الأصناف التي يبيعها فريق العيادات فعلياً أو ذات الطابع المهني (سعر القطعة ≥ 100 د.ك)')

# ============================================================== خارج القائمة
items = sorted([o for o in d if o['phase']==0], key=lambda o: (-o['kd'], o['brand']))
ws = sheet('خارج القائمة')
title_block(ws, 'خارج القائمة الأولية — للمراجعة الإدارية',
    '%d صنفاً: إما بلا أي بيع مدفوع في 2026، أو لم يُبع منذ أكثر من 120 يوماً · لا تدخل أي مرحلة · مطلوب قرار: تصفية / سحب / إعادة إطلاق' % len(items), 9)
HEAD3 = ['#','البراند','المنتج','الكود','قطع مبيعة 2026','صافي المبيعات KD','آخر بيع','أيام بلا بيع','سبب الاستبعاد']
W3 = [5,22,58,18,13,14,13,12,58]
header_row(ws, 3, HEAD3, W3, fill=GREY)
r = 4
for i,o in enumerate(items, start=1):
    vals = [i, o['brand'], o['المنتج / Product'], o['الكود / Code'] or '—', o['units'], round(o['kd'],1),
            o['آخر بيع'] or '—', o['days'] if o['days']<999 else '—', o['reason']]
    for j,v in enumerate(vals, start=1):
        c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=9)
        c.alignment = Alignment(horizontal='right' if j in (2,3,9) else 'center', vertical='center', wrap_text=(j in (3,9)))
        if j==6: c.number_format='#,##0.0'
        if j==5: c.number_format='#,##0'
    ws.row_dimensions[r].height = 24; r += 1
ws.auto_filter.ref = 'A3:I%d' % (r-1)

# ============================================================== المعايير
ws = sheet('المعايير')
title_block(ws, 'المعايير المعتمدة في بناء هذه القائمة',
    'كل صنف في هذا الملف وُضع في مرحلته بقاعدة مكتوبة قابلة لإعادة التطبيق على أي فترة لاحقة — لا باجتهاد شخصي', 8)
ws.column_dimensions['A'].width = 3
for col,w in zip('BCDEFGH',[30,20,20,20,20,20,26]): ws.column_dimensions[col].width = w
r = 4

def crit_table(rows, headers, widths=None):
    global r
    for j,h in enumerate(headers, start=2):
        c = ws.cell(r,j,h); c.font = Font(bold=True, size=10, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=NAVY); c.border = BORD
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[r].height = 26; r += 1
    for row in rows:
        span = 2 + len(headers) - 1
        for j,v in enumerate(row, start=2):
            c = ws.cell(r,j,v); c.border = BORD; c.font = Font(size=10, bold=(j==2))
            c.alignment = Alignment(horizontal='right', vertical='center', wrap_text=True)
        if len(row) < len(headers):
            pass
        ws.row_dimensions[r].height = 30; r += 1

h2('أولاً — مصدر الأرقام')
para('ملف ERP (MonthlySalesSummary) للفترة 03/01/2026 → 06/09/2026 = 8.1 شهر · 11,893 سطر فاتورة ومرتجع · كل المندوبين وكل القنوات (هايبرماركت · صيدليات · أونلاين · عيادات).')
para('«قطع مبيعة» = الكمية في سطور الفواتير ذات القيمة (Net Sales ≠ 0). المجاني (FOC) وحركة حسابات التسويق الداخلية مستبعدة تماماً من أرقام الحركة — لأنها لا تعبّر عن طلب حقيقي من السوق.')
para('المعدلات الشهرية محسوبة من أول بيع مدفوع للصنف حتى نهاية الفترة، بحد أدنى 3 أشهر — كي لا يظهر صنف عمره أسابيع وكأنه سريع الحركة.')
gap()

h2('ثانياً — معيار سرعة الحركة (الأساس الذي بُنيت عليه المراحل)')
crit_table([
    ('سريع الحركة','≥ 4 فواتير مدفوعة شهرياً (أي بيع أسبوعي تقريباً) أو ≥ 100 قطعة مدفوعة شهرياً','69 صنفاً'),
    ('متوسط الحركة','من فاتورة واحدة إلى أقل من 4 فواتير شهرياً، وأقل من 100 قطعة شهرياً','57 صنفاً'),
    ('بطيء الحركة','أقل من فاتورة واحدة شهرياً','101 صنف'),
    ('بلا بيع مدفوع','ظهر في الملف بمجاني أو مرتجع فقط، بدون أي بيع بقيمة','17 صنفاً'),
], ['الفئة','التعريف','العدد'])
para('السبب في اعتماد «عدد الفواتير» لا «عدد القطع» كمعيار أول: الفاتورة تعني عميلاً قرر الشراء. عشرة آلاف قطعة في فاتورتين هي تعبئة مخزون عند عميل واحد، لا حركة سوق.', bold=True)
gap()

h2('ثالثاً — قواعد توزيع الأصناف على المراحل الثلاث')
crit_table([
    ('المرحلة 1 — الأساسية','سريع الحركة + سليم صحياً + ضمن أعلى 8 أصناف في البراند (بعدد القطع). سقف الـ 8 يمنع أن يبتلع براند واحد عرض السعر.','53 صنفاً'),
    ('المرحلة 1 — «قاطرة البراند»','البراند الذي لا يملك أي صنف سريع سليم يدخل بأعلى صنفين قيمةً فيه، بشرط بيع خلال آخر 90 يوماً و(10 قطع أو 500 د.ك) — حتى يبقى كل براند حاضراً في العرض الأول.','UNIVET · B&L · SCHEU · الأطقم · Silonn · EverBrands'),
    ('المرحلة 2 — التوسعة','متوسط الحركة السليم · + سريع خرج من سقف الـ 8 · + سريع عليه ملاحظة (تراجع أو مرتجعات عملاء) يُعرض بشرط · + معدات مهنية بقيمة ≥ 500 د.ك','78 صنفاً'),
    ('المرحلة 3 — حسب الطلب','بطيء الحركة لكنه ما زال حيّاً: آخر بيع خلال 120 يوماً — يُسعَّر عند الطلب بدون التزام مخزون','54 صنفاً'),
    ('خارج القائمة','بلا بيع مدفوع في 2026، أو راكد أكثر من 120 يوماً','59 صنفاً'),
], ['المرحلة','القاعدة','النتيجة'])
gap()

h2('رابعاً — معايير الاستبعاد من المرحلة 1 (فلتر الجودة)')
para('صنف سريع الحركة لا يدخل القائمة الأساسية إذا انطبق عليه أحد هذه — لأن إدراجه يعني بيع مشكلة للعميل لا منتجاً:')
crit_table([
    ('المرتجعات ≥ المبيعات','صافي حركة الصنف صفر أو سالب — يُراجع قبل أي عرض'),
    ('مرتجعات من العملاء ≥ 20% من المبيع','رفض حقيقي على مستوى العميل (مرتجع مرتبط بفاتورة)'),
    ('تراجع: آخر 3 أشهر أقل من 40% من معدل الفترة','الصنف ينطفئ — لا يُبنى عليه عرض جديد'),
    ('لم يُبع منذ أكثر من 60 يوماً','انقطع عن الحركة رغم تصنيفه السابق'),
], ['سبب الاستبعاد','لماذا'])
para('تمييز مهم: «مرتجعات مخزون بدون فاتورة» (تصفية رفوف / بضاعة سنوات سابقة من الهايبرماركت) لا تُستخدم للاستبعاد — لأنها ليست رفضاً من عميل، لكنها تُعرض كتنبيه في عمود الملاحظات لتُؤخذ في الحسبان عند تحديد كمية أول أوردر.', bold=True)
gap()

h2('خامساً — معيار توزيع القناة (صيدليات / عيادات)')
crit_table([
    ('صيدليات','حصة فريق العيادات ≤ 20% من قطع الصنف — الصنف يدور فعلياً خارج قناة العيادات','39 صنفاً في المرحلة 1'),
    ('عيادات','حصة فريق العيادات ≥ 75%، أو براند مهني بطبيعته (UNIVET · B&L · SCHEU · Intensiv · الأطقم · EverBrands)، أو متوسط سعر القطعة ≥ 100 د.ك','12 صنفاً في المرحلة 1'),
    ('صيدليات + عيادات','ما بين 20% و75% — يُعرض في القناتين بنفس السعر','صنفان في المرحلة 1'),
], ['القناة','القاعدة','في المرحلة 1'])
gap()

h2('سادساً — معيار خاص بالمعدات المهنية')
para('المعدات المهنية (متوسط سعر القطعة ≥ 100 د.ك: لوبات UNIVET · هاندبيس Intensiv · أطقم B&L) تُقاس بالقيمة لا بعدد الفواتير. جهاز واحد بـ 981 د.ك ليس «بطيء الحركة» بالمعنى التجاري — طبيعة السلعة أن تُباع بالقطعة لعميل واحد في السنة. لذلك دخلت المرحلتين 1 و2 بمعيار القيمة (≥ 500 د.ك خلال آخر 120 يوماً) رغم أن عدد فواتيرها أقل من واحدة شهرياً.', bold=True)
gap()

h2('سابعاً — معيار الأولوية داخل كل مرحلة (A / B / C)')
crit_table([
    ('A','الأصناف التي تُشكّل أول 60% من قيمة المرحلة — تُعرض أولاً ولا يُقبل نفادها من المخزون'),
    ('B','الشريحة التالية حتى 90% من قيمة المرحلة'),
    ('C','آخر 10% من القيمة — تُكمّل الرف ولا تُبدأ بها الزيارة'),
], ['الأولوية','التعريف'])
gap()

h2('ثامناً — حدود هذه القراءة (يجب ذكرها للأمانة)')
para('•  الفترة 8.1 شهر فقط من سنة 2026 — بلا مقارنة بسنة 2025، فلا يظهر النمو أو التراجع السنوي.')
para('•  التصنيف مبني على ما بعناه نحن، لا على ما يطلبه السوق: صنف لم نعرضه جيداً سيظهر «بطيئاً» وهو ليس كذلك — لذلك المرحلة 3 هي «حسب الطلب» وليست «للسحب».')
para('•  الأصناف الجديدة (أول بيع خلال آخر 3 أشهر) قاعدة بياناتها قصيرة، ومُشار إليها بتنبيه في عمود الملاحظات.')
para('•  المرتجعات بدون فاتورة قد تعود لبضاعة بيعت في سنوات سابقة، فلا تُحمَّل على أداء 2026.')
para('•  التسعير والهوامش والاتفاقيات التجارية خارج نطاق هذا المستند تماماً.')

wb.save('UltraMed-Initial-Listing-2026.xlsx')
print('saved')
