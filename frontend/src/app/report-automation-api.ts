import {AccessError} from './budget-api'
export interface AutomationJob {
 id:string;status:'queued'|'working'|'review'|'attention'|'rejected'|'imported';revision:number
 budget?:string;target?:string;kind?:string;reportId?:string;stale?:boolean;manualOnly?:boolean;message?:string;noticeState?:string
 summary?:{months:string[];counts:{new:number;duplicates:number;conflicts:number;questions:number};warnings:string[];before:{month:string;values:Record<string,number>}[];after:{month:string;values:Record<string,number>}[]|null;cardTotal:number|null}
}
export interface AutomationSnapshot {available:boolean;accountId?:string;automaticFinancialWrites:false;policies?:{budget:string;enabled:number;revision:number}[];jobs?:AutomationJob[]}
async function request(accountId:string,options:RequestInit,fetcher:typeof fetch){
 const response=await fetcher('/api/report-automation',{credentials:'same-origin',cache:'no-store',...options,headers:{'x-budget-account-id':accountId,...options.headers}})
 if(response.status===401)throw new AccessError('החיבור לחשבון פג. יש להיכנס מחדש.')
 const value=await response.json()
 if(!response.ok)throw Error(value.error||'לא ניתן לעדכן את הכנת הדוחות. יש לרענן ולנסות שוב.')
 return value
}
export async function loadAutomation(accountId:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<AutomationSnapshot>{
 const value=await request(accountId,{signal},fetcher)
 if(typeof value.available!=='boolean'||value.automaticFinancialWrites!==false||value.available&&(value.accountId!==accountId||!Array.isArray(value.policies)||!Array.isArray(value.jobs)))throw new AccessError('לא ניתן לאמת את החשבון של הצעות הדוחות.')
 return value
}
export async function updateAutomation(accountId:string,input:unknown,fetcher:typeof fetch=fetch){return request(accountId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)},fetcher)}
