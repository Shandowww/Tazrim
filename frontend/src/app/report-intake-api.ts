import {AccessError,loadBudgetSnapshot,type BudgetSpace} from './budget-api.ts'
import {isVault} from '../../../src/vault.js'
import {reportFileEligibility} from './report-library-api.ts'
import {inboxHash} from '../../../src/report-inbox-model.js'
import type {IncomingBinding,RoutingBudget} from './incoming-report-routing.ts'
export interface IncomingReport {id:string;name:string;sourceHash:string;size:number;revision:number;createdAt:string;verificationState:'awaiting_verification'|'verified'|'routed';approvedAt:string|null;route:null|{budget:string;kind:string;target:string;reportId:string}}
export interface IncomingConnection {id:string;label:string;revoked:number;last_attempt:string|null;last_success:string|null;last_error:string|null;created_at:string}
export interface IncomingSnapshot {accountId:string;accountEmail:string;intakeIdentityBound:true;storageConsented:boolean;reports:IncomingReport[];connections:IncomingConnection[];bindings:IncomingBinding[]}
const idOK=(id:any)=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),hashOK=(value:any)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
export class IncomingRequestError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status}}
async function request(accountId:string,path='',options:RequestInit={},fetcher:typeof fetch=fetch){
 const response=await fetcher('/api/report-intake'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'x-budget-account-id':accountId,...options.headers}})
 if(response.status===401)throw new AccessError('החיבור לחשבון פג. יש להיכנס מחדש.')
 let value:any;try{value=await response.json()}catch{throw Error('לא ניתן לאמת את תוצאת הפעולה. אפשר לבדוק שוב את אותה פעולה.')}
 if(!response.ok)throw new IncomingRequestError(typeof value?.error==='string'?value.error:'תיבת הסנכרון אינה זמינה. אפשר לנסות שוב.',response.status)
 return value
}
export async function loadIncomingInbox(accountId:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<IncomingSnapshot>{
 const value=await request(accountId,'',{signal},fetcher)
 if(value?.accountId!==accountId||typeof value.accountEmail!=='string')throw new AccessError('החשבון השתנה. יש לפתוח מחדש את תיבת הסנכרון.')
 if(value.intakeIdentityBound!==true||typeof value.storageConsented!=='boolean'||!Array.isArray(value.reports)||value.reports.length>500||new Set(value.reports.map((r:any)=>r?.id)).size!==value.reports.length||value.reports.some((r:any)=>!idOK(r?.id)||typeof r.name!=='string'||!hashOK(r.sourceHash)||!Number.isInteger(r.revision)||r.revision<1||!Number.isInteger(r.size)||r.size<1||r.size>5*1024*1024||!['awaiting_verification','verified','routed'].includes(r.verificationState)||!Number.isFinite(Date.parse(r.createdAt))||r.route&&(!idOK(r.route.reportId)||!['bank','card'].includes(r.route.kind)||typeof r.route.budget!=='string'||typeof r.route.target!=='string'))||!Array.isArray(value.connections)||value.connections.some((c:any)=>!idOK(c?.id)||typeof c.label!=='string'||![0,1].includes(c.revoked))||!Array.isArray(value.bindings)||value.bindings.some((b:any)=>!hashOK(b?.identityKey)||!['bank','card'].includes(b.kind)||typeof b.budget!=='string'||typeof b.target!=='string'||!Number.isInteger(b.revision)||b.revision<1))throw Error('לא ניתן לאמת את תיבת הסנכרון.')
 return value
}
export async function updateIncoming(accountId:string,input:any,fetcher:typeof fetch=fetch){return request(accountId,'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)},fetcher)}
export function incomingConnectionDraft(label:string){const bytes=crypto.getRandomValues(new Uint8Array(32));return {action:'connect',id:crypto.randomUUID(),label,secret:btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}}
export async function storeIncomingSource(accountId:string,file:File,fetcher:typeof fetch=fetch){
 reportFileEligibility(file.name,file.size);const bytes=new Uint8Array(await file.arrayBuffer()),hash=await inboxHash(bytes)
 const value=await request(accountId,'',{method:'PUT',headers:{'Content-Type':'application/octet-stream','x-report-name':encodeURIComponent(file.name)},body:bytes as BodyInit},fetcher)
 if(value?.stored!==true||!idOK(value.receiptId)||value.sourceHash!==hash)throw Error('אישור הקבלה אינו תואם לקובץ. המקור נשאר במכשיר; יש לבדוק את התיבה לפני המשך.')
 return value
}
export async function incomingSource(accountId:string,report:IncomingReport,purpose:'original'|'parse',signal:AbortSignal,fetcher:typeof fetch=fetch){
 const response=await fetcher('/api/report-intake?id='+encodeURIComponent(report.id)+'&purpose='+purpose,{credentials:'same-origin',cache:'no-store',signal,headers:{'x-budget-account-id':accountId}})
 if(response.status===401)throw new AccessError('החיבור לחשבון פג. יש להיכנס מחדש.')
 if(!response.ok)throw Error(purpose==='parse'?'הפענוח אינו מאושר לקובץ הזה. יש לרענן ולבדוק את האישור.':'המקור לא נטען. אפשר לנסות שוב.')
 const bytes=new Uint8Array(await response.arrayBuffer());reportFileEligibility(report.name,bytes.byteLength)
 if(bytes.byteLength!==report.size||await inboxHash(bytes)!==report.sourceHash||response.headers.get('x-source-hash')!==report.sourceHash)throw Error('קובץ המקור אינו תואם לקבלה. הפענוח נעצר.')
 return bytes
}
export async function incomingRoutingBudgets(accountId:string,spaces:BudgetSpace[],signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<RoutingBudget[]>{
 return Promise.all(spaces.map(async space=>{const snapshot=await loadBudgetSnapshot(space.id,signal,fetcher,accountId);return {id:space.id,name:space.name,role:snapshot.spaces.find(s=>s.id===space.id)!.role,revision:snapshot.value.revision,plan:snapshot.value.plan,locked:!snapshot.value.plan||isVault(snapshot.value.plan)}}))
}
