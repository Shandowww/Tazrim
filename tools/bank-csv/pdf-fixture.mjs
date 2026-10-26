// Synthetic One Zero-shaped text geometry and PDF; no customer content.
const labels=['יתרה','זיכויים','חיובים','פרטי הפעולה','תאריך ערך','תאריך תנועה'];
const edges=[130,218,302,386,459,533];
function item(str,end,y,size=10){return {str,dir:/[א-ת]/.test(str)?'rtl':'ltr',transform:[size,0,0,size,end-str.length*size/2,y],width:str.length*size/2,height:size};}
export function pdfTextFixture({pages=1}={}){
 const rows=[['01/01/2026','01/01/2026','עמלה לדוגמה',10,0,90],['02/01/2026','02/01/2026','ביטול עמלה לדוגמה',-10,0,100],['03/01/2026','03/01/2026','משכורת לדוגמה',0,1200.25,1300.25]];
 const result=Array.from({length:pages},()=>({width:595,height:842,items:labels.map((label,i)=>item(label,edges[i],520))}));
 result[0].items.unshift(item('ONE ZERO Digital Bank LTD',533,760),item('פירוט של תנועות שקליות בחשבון',533,740),item('01/01/2026 - 31/01/2026',533,720));
 for(const [i,label]of ['יתרה קודמת:','סך כל החיובים:','סך כל הזיכויים:','יתרה חדשה:'].entries()){result[0].items.push(item(label,533,600-i*14),item(['100.00','0.00','1200.25','1300.25'][i],423,600-i*14));}
 rows.forEach((r,i)=>{const p=pages===1?0:i===0?0:1,y=495-(pages===1?i:i===0?0:i-1)*25;const [date,valueDate,description,debit,credit,balance]=r;[balance.toFixed(2),credit.toFixed(2),debit.toFixed(2),description,valueDate,date].forEach((s,c)=>result[p].items.push(item(s,edges[c],y,c===3?7:10)));});
 return result;
}
export function pdfFixture(pages=pdfTextFixture()){
 const objects=[];const add=s=>{objects.push(s);return objects.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');add(`<< /Type /Pages /Kids [${pages.map((_,i)=>`${i?6+i*2:3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
 add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>');
 add('<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>');
 add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>');
 const cmap='/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Identity def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end';
 const stream=s=>`<< /Length ${s.length} >>\nstream\n${s}\nendstream`;add(stream(cmap));
 for(const [index,page]of pages.entries()){
  if(index)add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ${7+index*2} 0 R >>`);
  const commands=page.items.map(i=>`BT /F1 ${i.transform[0]} Tf 1 0 0 1 ${i.transform[4]} ${i.transform[5]} Tm <${[...(/[א-ת]/.test(i.str)?[...i.str].reverse().join(''):i.str)].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('')}> Tj ET`).join('\n');add(stream(commands));
 }
 let out='%PDF-1.7\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const start=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return new TextEncoder().encode(out);
}
