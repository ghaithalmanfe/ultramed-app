// Minimal .xlsx writer (inline strings) + synthetic "Ultramed_Sales3_28" file:
// August rows straight from the app's seed, September 1–21 rows synthesized.
const fs = require('fs'), zlib = require('zlib');
function crc32(buf){ let c, crc = 0xFFFFFFFF; for(let n=0;n<buf.length;n++){ c=(crc^buf[n])&0xFF; for(let k=0;k<8;k++) c=c&1?(c>>>1)^0xEDB88320:c>>>1; crc=(crc>>>8)^c; } return (crc^0xFFFFFFFF)>>>0; }
function zip(entries){
  const parts=[], cd=[]; let off=0;
  for(const [name,data] of entries){
    const raw=Buffer.from(data,'utf8'), comp=zlib.deflateRawSync(raw), n=Buffer.from(name);
    const h=Buffer.alloc(30); h.writeUInt32LE(0x04034b50,0); h.writeUInt16LE(20,4); h.writeUInt16LE(0,6); h.writeUInt16LE(8,8); h.writeUInt16LE(0,10); h.writeUInt16LE(0,12);
    h.writeUInt32LE(crc32(raw),14); h.writeUInt32LE(comp.length,18); h.writeUInt32LE(raw.length,22); h.writeUInt16LE(n.length,26); h.writeUInt16LE(0,28);
    parts.push(h,n,comp);
    const c=Buffer.alloc(46); c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0,8); c.writeUInt16LE(8,10); c.writeUInt16LE(0,12); c.writeUInt16LE(0,14);
    c.writeUInt32LE(crc32(raw),16); c.writeUInt32LE(comp.length,20); c.writeUInt32LE(raw.length,24); c.writeUInt16LE(n.length,28); c.writeUInt16LE(0,30); c.writeUInt16LE(0,32); c.writeUInt16LE(0,34); c.writeUInt16LE(0,36); c.writeUInt32LE(0,38); c.writeUInt32LE(off,42);
    cd.push(c,n); off+=h.length+n.length+comp.length;
  }
  const cdb=Buffer.concat(cd), e=Buffer.alloc(22); e.writeUInt32LE(0x06054b50,0); e.writeUInt16LE(0,4); e.writeUInt16LE(0,6); e.writeUInt16LE(entries.length,8); e.writeUInt16LE(entries.length,10); e.writeUInt32LE(cdb.length,12); e.writeUInt32LE(off,16); e.writeUInt16LE(0,20);
  return Buffer.concat([...parts,cdb,e]);
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const col=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
function sheetXml(rows){
  let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((r,ri)=>{ x+='<row r="'+(ri+1)+'">'; r.forEach((v,ci)=>{ if(v==null||v==='') return; const ref=col(ci)+(ri+1); if(typeof v==='number') x+='<c r="'+ref+'"><v>'+v+'</v></c>'; else x+='<c r="'+ref+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>'; }); x+='</row>'; });
  return x+'</sheetData></worksheet>';
}
function xlsx(sheets){
  const entries=[
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'],
    ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml', sheetXml(s.rows)]),
  ];
  return zip(entries);
}
// Writes the synthetic September sales file (961 lines: 146 for the team's two
// salesmen, the rest for salesmen mapped to "not my team") and returns its path.
function makeSalesFixture(outPath){
  const os = require('os'), path = require('path');
  const out = outPath || path.join(os.tmpdir(), 'Ultramed_Sales3_28.xlsx');
  const argv = process.argv; process.argv = [argv[0], __filename, out];
  try{ buildAndWrite(out); } finally { process.argv = argv; }
  return out;
}
module.exports = { xlsx, makeSalesFixture };
function buildAndWrite(out){
  const seed=require(require('path').join(process.env.WWW || require('path').join(__dirname, '..', '..', '..', 'www'), 'sales-seed-aug26.json'));
  const HDR=['Date','Invoice #','Type','Product','Qty','Gross','Net Sales','Sales Return','Name','Brand','Customer','Class','Discount. Sales Ret'];
  const rows=[HDR];
  const dmy=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
  // September 1–21: 146 lines, both reps, clinics + channels, a few returns.
  const prods=[['Waterpik Cordless Plus BLACK','WATERPIK',35],['C3 Plaque Defense Brush Head White','Philips Export BV',11.5],['Sonicare 4100','Philips Export BV',49],['Tepe Interdental Mixed','TEPE',3.25],['Flash Tongue Scraper Pink','FLASH',4.5],['GC Tooth Mousse','GC',9.75]];
  const custM=[['Dental 8 Clinic','Clinics'],['My Fatoorah','Online Customers'],['Sultan Center','Hypermarkets and Supermarkets'],['Smile Care Clinic','Clinics'],['Al Salam Hospital','Hospitals']];
  const custR=[['Crown Dental Center','Dental Centers'],['My Fatoorah','Online Customers'],['Sultan Center','Hypermarkets and Supermarkets'],['Bright Dental Center','Dental Centers'],['Al Salam Hospital','Hospitals']];
  const sm=['Mariam Zohair','Ranova Ayman Mohammed'];
  const others=['Mr. Sundeep Kohli','Reem Omar'];
  let inv=75800, n=0;
  for(let i=0;i<961;i++){
    const day=1+Math.floor((i<146?i:i-146)*21/(i<146?146:815)); const iso='2026-09-'+String(day).padStart(2,'0');
    const p=prods[i%prods.length], s=i<146?sm[i%2]:others[i%2]; const cust=(s===sm[0]?custM:custR); const c=cust[(i*7)%cust.length];
    const qty=1+(i%4), gross=Math.round(p[2]*qty*1000)/1000, net=Math.round(gross*0.8*1000)/1000;
    const isRet = i%29===17;
    if(i%3===0) inv++;
    rows.push([dmy(iso), (isRet?'SRT00':'SINV00')+inv, isRet?'SalesReturn':'SalesInvoice', p[0], qty, isRet?0:gross, isRet?-net:net, isRet?net:0, s, p[1], c[0], c[1], 0]);
  }
  fs.writeFileSync(out, xlsx([{name:'Sales',rows}]));
}
if(require.main===module){ const out = makeSalesFixture(process.argv[2]); console.log('wrote', out); }
