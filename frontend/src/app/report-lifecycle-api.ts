import {AccessError,type BudgetResponse} from './budget-api.ts'
export interface ReportLifecycle {
 lifecycle:'new'|'partial'|'digested';completedAt:number|null;removalAt:number|null
 originalRemoved:boolean;removedAt:number|null;retentionReason:string|null;review:any
 reviewRevision:number;completionKind:'import'|'duplicate'|'declared-duplicate'|null;applied:boolean;automaticRemovalEnabled:boolean
}
export class ReportLifecycleError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status}}
export async function updateReportLifecycle(budget:string,base:BudgetResponse,source:{id:string;sourceHash:string;revision:number},action:string,extra:Record<string,unknown>={},fetcher:typeof fetch=fetch):Promise<ReportLifecycle>{
 const response=await fetcher('/api/report-lifecycle?budget='+encodeURIComponent(budget)+'&id='+encodeURIComponent(source.id),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-budget-account-id':base.accountId},body:JSON.stringify({action,sourceHash:source.sourceHash,revision:source.revision,budgetRevision:base.revision,...extra})})
 if(response.status===401||response.status===403||response.status===404)throw new AccessError('החשבון או הגישה לדוח השתנו. יש לפתוח מחדש.')
 const value=await response.json();if(!response.ok)throw new ReportLifecycleError(value.error||'מצב הדוח לא אושר. יש לרענן ולבדוק לפני ניסיון נוסף.',response.status)
 if(value.ok!==true||!['new','partial','digested'].includes(value.lifecycle))throw Error('תוצאת הטיפול לא אומתה. יש לפתוח מחדש את הדוח לפני פעולה נוספת.')
 return value
}
