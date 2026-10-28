import {clone,isUnconfiguredBudget} from '../../../src/budget.js'
import {inboxHash,inboxTarget} from '../../../src/report-inbox-model.js'
import {reportInboxPayer} from '../../../src/report-inbox-controller.js'
import {loadReportLibrary,loadReportSource} from './report-library-api.ts'
import {loadStoredReport,loadReportMerchantRules,type StoredReportDetail} from './report-review-api.ts'
import {inspectReportSource} from './report-reader.ts'
import type {BudgetResponse} from './budget-api.ts'
export async function loadReportGroup(budgetId:string,base:BudgetResponse,ids:string[],signal:AbortSignal,fetcher:typeof fetch=fetch,reimport=false){
 if(!base.plan||base.plan.format||!ids.length||ids.length>10||new Set(ids).size!==ids.length)throw Error('יש לפתוח תקציב גלוי ולבחור עד עשרה דוחות שונים.')
 const library=await loadReportLibrary(budgetId,base,signal,fetcher),roots=await Promise.all(ids.map(id=>loadStoredReport(budgetId,base,id,signal,fetcher))),drafts=roots.filter(source=>source.state!=='committed').map(source=>source.draft).filter(Boolean)
 if(reimport&&(ids.length!==1||roots[0].state!=='committed'))throw Error('יש לבחור מקור יחיד שכבר נקלט לבדיקה מחודשת.')
 if(drafts.some(d=>d.version!==1||!Array.isArray(d.items))||new Set(drafts.map(d=>d.groupId)).size>1)throw Error('אין למזג קבוצות שמורות שונות. יש להמשיך בכל קבוצה בנפרד.')
 const draft=drafts[0],active=library.reports.filter(r=>!['committed','archived'].includes(r.state)),selected=new Set([...ids,...(draft?.items??[]).filter((item:any)=>active.some(r=>r.id===item.storedId)).map((item:any)=>item.storedId)])
 if(selected.size>10)throw Error('הקבוצה כוללת יותר מעשרה מקורות. יש להמשיך בממשק הקיים.')
 const sources:StoredReportDetail[]=await Promise.all([...selected].map(id=>loadStoredReport(budgetId,base,id,signal,fetcher)))
 if(sources.some(source=>source.state==='archived'||source.state==='committed'&&!reimport||source.state!=='committed'&&source.draft&&source.draft.groupId!==draft?.groupId))throw Error('מקור בקבוצה כבר טופל או שייך לקבוצה אחרת.')
 const ui:any={blank:isUnconfiguredBudget(base.plan),startMonth:draft?.startMonth??base.plan.startMonth,groupId:draft?.groupId??crypto.randomUUID(),items:[],newAccounts:clone(draft?.newAccounts??[]),newCards:clone(draft?.newCards??[]),categoryChoices:new Map(draft?.categoryChoices??[]),bankChoices:new Map(draft?.bankChoices??[]),duplicates:0,error:'',merchantRules:[]}
 let totalBytes=0
 for(const source of sources){
  const bytes=await loadReportSource(budgetId,base,source,signal,fetcher);totalBytes+=bytes.length;if(totalBytes>20*1024*1024)throw Error('אפשר לבדוק עד20MB של מקורות בקבוצה.');if(await inboxHash(bytes)!==source.sourceHash)throw Error('קובץ המקור אינו תואם לקבלה השמורה; הקבוצה לא נפתחה.')
  const saved=draft?.items.find((item:any)=>item.storedId===source.id)
  if(saved&&(saved.storedRevision!==source.revision||saved.hash!==source.sourceHash))throw Error('קבוצת הדוחות השתנתה; החלטות שמורות לא הוחלפו.')
  let item:any=saved?clone(saved):{id:source.id,name:source.name,size:bytes.length,target:'',payer:'',decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},skip:false,storedId:source.id,storedRevision:source.revision,storedCommitted:source.state==='committed'}
  if(!saved||saved.error){try{Object.assign(item,await inspectReportSource(base.plan,source.name,bytes,signal));delete item.error;item.target||=inboxTarget(base.plan,item);item.payer||=reportInboxPayer(base.plan,item.target)}catch(e){item.error=e instanceof Error?e.message:'לא ניתן לפענח את המקור.'}}
  ui.items.push(item)
 }
 if(ui.items.some((item:any)=>item.kind==='card'))ui.merchantRules=await loadReportMerchantRules(budgetId,base,signal,fetcher)
 if(signal.aborted)throw Error('פתיחת הקבוצה בוטלה.')
 return{ui,sources,activitySupported:library.activityCycleReceipts===true}
}

/** UI copies must preserve the original controller's Maps/Sets; budget JSON cloning drops their decisions. */
export function copyReportGroupUi(ui:any){return structuredClone(ui)}
