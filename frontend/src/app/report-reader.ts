import {validatePlan} from '../../../src/budget.js'
import {inboxHash,inboxReceiptPresent} from '../../../src/report-inbox-model.js'
import {decodeCSV,inspectCSV} from '../../../tools/bank-csv/parser.mjs'
import {inspectIntake} from '../../../tools/bank-csv/intake-reader.mjs'
import {reportFileEligibility} from './report-library-api.ts'
export interface ReportReaderOptions{workerFactory?:(url:string)=>Worker;timeoutMs?:number}
/** Reuse the existing bounded readers. This inspects source bytes only; it never stores or applies financial data. */
export async function inspectReportSource(plan:any,name:string,bytes:Uint8Array,signal:AbortSignal,options:ReportReaderOptions={}){
 reportFileEligibility(name,bytes.byteLength);if(!validatePlan(plan)||plan.format)throw Error('יש לפתוח תקציב גלוי כדי לבדוק את המקור בתצוגה הזו.');if(signal.aborted)throw Error('קריאת הדוח בוטלה.')
 const hash=await inboxHash(bytes);if(signal.aborted)throw Error('קריאת הדוח בוטלה.')
 if(plan.importMigrationGuards?.receipts.includes(hash))return{hash,skip:true,kind:'bank',reason:'המקור סומן במעבר חשבון. קליטה חוזרת במרחב הזה חסומה.'}
 const receipt=plan.reportInbox?.receipts.find((r:any)=>r.hash===hash);if(receipt&&await inboxReceiptPresent(plan,receipt))return{hash,skip:true,kind:receipt.kind,target:receipt.target,reason:'המקור כבר נקלט ונמצא בתקציב.'}
 let parsed:any
 if(/\.csv$/i.test(name))parsed=inspectIntake([inspectCSV(decodeCSV(bytes).text)])
 else{if(signal.aborted)throw Error('קריאת הדוח בוטלה.');const worker=(options.workerFactory??(url=>new Worker(url)))('/bank-import/xlsx-worker.js');let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{}
  try{const data:any=await new Promise((resolve,reject)=>{const id=crypto.randomUUID();abort=()=>reject(Error('קריאת הדוח בוטלה.'));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Error('קריאת הדוח ארכה מדי. אפשר לנסות קובץ קטן יותר.')),Math.min(20000,Math.max(1,options.timeoutMs??20000)));worker.onmessage=event=>{if(event.data?.id!==id)return;event.data.error?reject(Error(String(event.data.error))):resolve(event.data)};worker.onerror=()=>reject(Error('לא ניתן לקרוא את הדוח. המקור והתקציב נשארו ללא שינוי.'));const copy=bytes.slice();worker.postMessage({id,action:/\.pdf$/i.test(name)?'pdf':'intake',bytes:copy.buffer,format:/\.xls$/i.test(name)?'xls':'xlsx'})});parsed=data.intake??inspectIntake([data.inspection])}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate()}
 }
 if(signal.aborted)throw Error('קריאת הדוח בוטלה.');if(!parsed||!['bank','card','ambiguous','sheets'].includes(parsed.kind))throw Error('לא ניתן לזהות את מבנה הדוח.');if(parsed.kind==='bank'&&(!Array.isArray(parsed.records)||parsed.records.some((r:any)=>!r.valid||r.currency!=='ILS')))throw Error('בדוח הבנק יש שורות שלא ניתן לקרוא או מטבע לא נתמך. אין קליטה חלקית של הדוח.')
 return{...parsed,hash,identityKey:parsed.identity?await inboxHash(parsed.identity):'',skip:false}
}
