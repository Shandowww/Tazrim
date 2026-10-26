importScripts('./vendor/xlsx-mini.js');
const reader=import('./xlsx-reader.mjs');let workbook=null,fullReader=false;
self.onmessage=async({data})=>{
 try{
  if(data.action==='bank-pdf'){const api=await import('./pdf-reader.mjs');const inspection=await api.readOneZeroPDF(new Uint8Array(data.bytes));self.postMessage({id:data.id,inspection});return;}
  if(data.action==='pdf'){const api=await import('./pdf-reader.mjs');const parsed=await api.readReportPDF(new Uint8Array(data.bytes));self.postMessage({id:data.id,...parsed});return;}
  const api=await reader;
  if(data.action==='load'||data.action==='billing'||data.action==='intake'){
   if(data.format==='xls'&&!fullReader){importScripts('./vendor/xlsx-full.js');fullReader=true;}
   const next=api.readExcel(new Uint8Array(data.bytes),XLSX,data.format??'xlsx'),sheets=api.listSheets(next),selected=sheets.find(s=>!s.hidden&&!s.empty)??sheets.find(s=>!s.empty)??sheets[0];
   if(data.action==='intake'){const {inspectIntake}=await import('./intake-reader.mjs');self.postMessage({id:data.id,intake:inspectIntake(sheets.filter(s=>!s.empty).map(s=>({...api.inspectSheet(next,s.name,XLSX),sheetName:s.name})))});return;}
   if(data.action==='billing'){const {parseCalBilling}=await import('./cal-billing.mjs');const report=parseCalBilling(sheets.filter(s=>!s.empty).map(s=>api.inspectSheet(next,s.name,XLSX)));if(report){self.postMessage({id:data.id,billingProposal:report});return;}}
   let inspection=null,notice='';try{inspection=api.inspectSheet(next,selected.name,XLSX);}catch(e){notice=e.message;}
   workbook=next;self.postMessage({id:data.id,sheets,selected:selected.name,inspection,notice});
  }else if(data.action==='sheet')self.postMessage({id:data.id,inspection:api.inspectSheet(workbook,data.name,XLSX)});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
