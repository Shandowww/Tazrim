import {validatePlan} from '../../../src/budget.js'
import {inboxHash,inboxReceiptPresent} from '../../../src/report-inbox-model.js'
import {decodeCSV,inspectCSV} from '../../../tools/bank-csv/parser.mjs'
import {inspectIntake} from '../../../tools/bank-csv/intake-reader.mjs'
import {reportFileEligibility} from './report-library-api.ts'
export interface ReportReaderOptions{workerFactory?:(url:string)=>Worker;timeoutMs?:number;includeAccountIdentity?:boolean;reviewRecordedSource?:boolean}
/** Reuse the existing bounded readers. This inspects source bytes only; it never stores or applies financial data. */
export async function inspectReportSource(plan:any,name:string,bytes:Uint8Array,signal:AbortSignal,options:ReportReaderOptions={}){
 reportFileEligibility(name,bytes.byteLength);if(!validatePlan(plan)||plan.format)throw Error('יש לפתוח תקציב גלוי כדי לבדוק את המקור בתצוגה הזו.');if(signal.aborted)throw Error('קריאת הדוח בוטלה.')
 const hash=await inboxHash(bytes);if(signal.aborted)throw Error('קריאת הדוח בוטלה.')
 if(plan.importMigrationGuards?.receipts.includes(hash))return{hash,skip:true,kind:'bank',reason:'המקור סומן במעבר חשבון. קליטה חוזרת במרחב הזה חסומה.'}
 const receipt=plan.reportInbox?.receipts.find((r:any)=>r.hash===hash);if(receipt&&await inboxReceiptPresent(plan,receipt)){if(options.reviewRecordedSource)return {...await readReportContent(name,bytes,signal,options),target:receipt.target,recordedSource:true};return{hash,skip:true,kind:receipt.kind,target:receipt.target,reason:'המקור כבר נקלט ונמצא בתקציב.'}}
 return readReportContent(name,bytes,signal,options)
}

/** Pure bounded extraction, shared by approved private arrivals and budget review. */
export async function readReportContent(name:string,bytes:Uint8Array,signal:AbortSignal,options:ReportReaderOptions={}){
 reportFileEligibility(name,bytes.byteLength);if(signal.aborted)throw Error('קריאת הדוח בוטלה.');const hash=await inboxHash(bytes)
 let parsed:any
 if(/\.csv$/i.test(name))parsed=inspectIntake([inspectCSV(decodeCSV(bytes).text)])
 else{const data=await runReportWorker(name,bytes,signal,options,/\.pdf$/i.test(name)?'pdf':'intake');parsed=data.intake??inspectIntake([data.inspection])}
 if(signal.aborted)throw Error('קריאת הדוח בוטלה.');if(!parsed||!['bank','card','ambiguous','sheets'].includes(parsed.kind))throw Error('לא ניתן לזהות את מבנה הדוח.');if(parsed.kind==='bank'&&(!Array.isArray(parsed.records)||parsed.records.some((r:any)=>!r.valid||r.currency!=='ILS')))throw Error('בדוח הבנק יש שורות שלא ניתן לקרוא או מטבע לא נתמך. אין קליטה חלקית של הדוח.')
 return{...parsed,hash,identityKey:parsed.identity?await inboxHash(parsed.identity):'',skip:false}
}

async function runReportWorker(name:string,bytes:Uint8Array,signal:AbortSignal,options:ReportReaderOptions,action:string){
 if(signal.aborted)throw Error('קריאת הדוח בוטלה.');const worker=(options.workerFactory??(url=>new Worker(url)))('/bank-import/xlsx-worker.js');let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{}
  try{return await new Promise<any>((resolve,reject)=>{const id=crypto.randomUUID();abort=()=>reject(Error('קריאת הדוח בוטלה.'));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Error('קריאת הדוח ארכה מדי. אפשר לנסות קובץ קטן יותר.')),Math.min(20000,Math.max(1,options.timeoutMs??20000)));worker.onmessage=event=>{if(event.data?.id!==id)return;event.data.error?reject(Error(String(event.data.error))):resolve(event.data)};worker.onerror=()=>reject(Error('לא ניתן לקרוא את הדוח. המקור והתקציב נשארו ללא שינוי.'));const copy=bytes.slice();worker.postMessage({id,includeAccountIdentity:options.includeAccountIdentity===true,action,bytes:copy.buffer,format:/\.xls$/i.test(name)?'xls':'xlsx'})})}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate()}
}

export async function readMappingSource(name:string,bytes:Uint8Array,signal:AbortSignal,options:ReportReaderOptions={}){
 if(!/\.(csv|xlsx?)$/i.test(name))return null
 reportFileEligibility(name,bytes.byteLength)
 if(signal.aborted)throw Error('קריאת הדוח בוטלה.')
 if(/\.csv$/i.test(name))return inspectCSV(decodeCSV(bytes).text)
 const loaded=await runReportWorker(name,bytes,signal,options,'load')
 const populated=loaded.sheets?.filter((sheet:any)=>!sheet.empty)??[]
 return populated.length===1&&!populated[0].hidden?loaded.inspection??null:null
}
