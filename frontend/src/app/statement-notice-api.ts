import {AccessError,loadBudgetSnapshot,type BudgetResponse} from './budget-api.ts'
import {loadReportSource,type StoredReport} from './report-library-api.ts'
export interface StatementNotice{id:string;category:string;issuer:string;text:string;page:number;attention:boolean;needsReview:boolean;sourceId:string;sourceName:string;sourceHash:string;target:string|null;evidence:string;dates:{date:string;wording:string}[];amounts:string[];sources:{id:string;name:string;page:number}[]}
export interface StatementScan{source:StoredReport&{sourceHash:string};status:'pending'|'complete'|'unsupported'|'failed';revision:number;count:number}
export interface StatementNoticeSnapshot{accountId:string;accountEmail:string;budgetId:string;noticeIdentityBound:true;notices:StatementNotice[];scans:StatementScan[]}
const path=(budget:string)=>'/api/statement-notices?budget='+encodeURIComponent(budget)
async function checkActor(budgetId:string,actor:BudgetResponse,signal:AbortSignal,fetcher:typeof fetch){const current=await loadBudgetSnapshot(budgetId,signal,fetcher);if(current.value.accountId!==actor.accountId||current.value.accountEmail!==actor.accountEmail)throw new AccessError('החשבון השתנה. יש לפתוח מחדש את העדכונים.');if(current.value.plan?.format==='monthly-flow-encrypted-v1')throw new AccessError('יש לפתוח את התקציב כדי לבדוק הודעות.');return current}
export async function loadStatementNotices(budgetId:string,actor:BudgetResponse,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<StatementNoticeSnapshot>{
 await checkActor(budgetId,actor,signal,fetcher)
 const response=await fetcher(path(budgetId),{credentials:'same-origin',cache:'no-store',signal,headers:{'x-budget-account-id':actor.accountId}})
 if([401,403,404].includes(response.status))throw new AccessError('הגישה לעדכונים השתנתה. יש לפתוח את המרחב מחדש.')
 if(!response.ok)throw Error('העדכונים לא נטענו. אפשר לנסות לרענן.')
 const value=await response.json()
 if(value.accountId!==actor.accountId||value.accountEmail!==actor.accountEmail||value.budgetId!==budgetId)throw new AccessError('החשבון השתנה בזמן טעינת העדכונים.')
 if(value.noticeIdentityBound!==true||!Array.isArray(value.notices)||!Array.isArray(value.scans)||value.notices.some((notice:any)=>!notice||!/^[a-f0-9]{64}$/.test(notice.id)||typeof notice.text!=='string'||!Array.isArray(notice.sources))||value.scans.some((scan:any)=>!scan?.source?.id||!['pending','complete','unsupported','failed'].includes(scan.status)||!Number.isSafeInteger(scan.revision)))throw Error('תגובת העדכונים אינה תקינה.')
 await checkActor(budgetId,actor,signal,fetcher);return value
}
export function readStatementText(name:string,bytes:Uint8Array,signal:AbortSignal,workerFactory=(url:string)=>new Worker(url)):Promise<{page:number;text:string}[]>{
 const format=name.split('.').at(-1)?.toLowerCase(),worker=workerFactory('/bank-import/xlsx-worker.js')
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),finish=(error?:Error,pages?:any)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(pages)},abort=()=>finish(Error('בדיקת ההודעות בוטלה.')),timer=setTimeout(()=>finish(Error('קריאת הודעות הדוח ארכה מדי. אפשר לנסות שוב.')),20000)
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}
  worker.onmessage=event=>{if(event.data?.id!==id)return;if(event.data.error){finish(Error(String(event.data.error)));return}if(!Array.isArray(event.data.pages)){finish(Error('לא נמצא טקסט קריא בדוח.'));return}finish(undefined,event.data.pages)}
  worker.onerror=()=>finish(Error('לא ניתן לקרוא את הודעות הדוח.'));const copy=bytes.slice();worker.postMessage({id,action:'notice-text',format,bytes:copy.buffer},[copy.buffer])
 })
}
export async function scanStatementNotices(budgetId:string,actor:BudgetResponse,scan:StatementScan,signal:AbortSignal,bytes?:Uint8Array,fetcher:typeof fetch=fetch){
 const current=await checkActor(budgetId,actor,signal,fetcher)
 if(current.spaces.find(space=>space.id===budgetId)?.role==='viewer')throw Error('בדיקת הודעות חדשות דורשת הרשאת עריכה.')
 const source=bytes??await loadReportSource(budgetId,actor,scan.source,signal,fetcher),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',source as BufferSource))].map(value=>value.toString(16).padStart(2,'0')).join('')
 if(hash!==scan.source.sourceHash)throw Error('קובץ המקור השתנה. יש לטעון אותו מחדש.')
 let pages:{page:number;text:string}[]=[],status='complete'
 try{pages=await readStatementText(scan.source.name,source,signal);if(!pages.some(page=>page.text.trim()))status='unsupported'}catch(error){if(signal.aborted)throw error;status='failed'}
 await checkActor(budgetId,actor,signal,fetcher)
 const response=await fetcher(path(budgetId),{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json','x-budget-account-id':actor.accountId},body:JSON.stringify({sourceId:scan.source.id,sourceHash:hash,revision:scan.revision,status,pages:status==='complete'?pages:[]})})
 const result=await response.json();if(!response.ok)throw Error(result.error||'לא ניתן לאשר את שמירת בדיקת ההודעות. אפשר לנסות שוב.')
 if(result.accountId!==actor.accountId||result.budgetId!==budgetId||result.noticeIdentityBound!==true||result.ok!==true)throw new AccessError('לא התקבל אישור בדיקה לחשבון ולמרחב הנכונים.')
 return status
}
export async function scanNewStatement(budgetId:string,actor:BudgetResponse,sourceId:string,bytes:Uint8Array|undefined,signal:AbortSignal){
 const snapshot=await loadStatementNotices(budgetId,actor,signal),scan=snapshot.scans.find(value=>value.source.id===sourceId)
 if(!scan)throw Error('קובץ המקור לא זמין לבדיקת הודעות.')
 if(scan.status==='complete')return scan.status
 return scanStatementNotices(budgetId,actor,scan,signal,bytes)
}
