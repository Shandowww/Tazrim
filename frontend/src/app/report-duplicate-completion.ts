import {reportInboxDraftForWrite} from '../../../src/report-inbox-controller.js'
import {loadStoredReport,saveStoredReportGroupDraft,type StoredReportDetail} from './report-review-api.ts'
import {updateReportLifecycle} from './report-lifecycle-api.ts'
import type {BudgetResponse} from './budget-api.ts'

export function wholeDuplicateReview(review:any){return !!review?.items?.length&&!review.issues&&review.items.every((item:any)=>item.already&&!item.skip&&!item.error&&!item.activity&&!item.sheets&&['bank','card'].includes(item.kind))}
export function prepareDuplicateCompletion(sources:StoredReportDetail[],review:any,base:BudgetResponse){
 if(!wholeDuplicateReview(review)||sources.length!==review.items.length||sources.some(source=>!review.items.some((item:any)=>item.storedId===source.id&&item.hash===source.sourceHash&&item.storedRevision===source.revision)))throw Error('יש לבדוק מחדש את כל מקורות הדוח הכפול.')
 const proposal=structuredClone(review)
 proposal.guided={version:1,step:'summary',done:['account','figures','categories','exceptions','summary'],categories:'resolved',budgetRevision:base.revision}
 const committed=sources.every(source=>source.state==='committed')
 if(sources.some(source=>source.state==='committed')&&(!committed||sources.length!==1))throw Error('יש לפתוח מקור שכבר נקלט בנפרד להשלמת הטיפול.')
 const draft=reportInboxDraftForWrite(proposal,committed?[]:proposal.items,'react-duplicate-review-v1')
 return {sources:structuredClone(sources),draft,committed}
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)
export async function finishDuplicateCompletion(budgetId:string,base:BudgetResponse,command:ReturnType<typeof prepareDuplicateCompletion>,fetcher:typeof fetch=fetch){
 const load=(id:string)=>loadStoredReport(budgetId,base,id,new AbortController().signal,fetcher)
 let current=await Promise.all(command.sources.map(source=>load(source.id)))
 if(current.some((source,index)=>source.sourceHash!==command.sources[index].sourceHash))throw Error('המקור השתנה. יש לפתוח מחדש את הבדיקה.')
 if(current.every(source=>source.lifecycle==='digested'))return current
 const partlyCompleted=current.some(source=>source.lifecycle==='digested')
 if(partlyCompleted){
  for(const source of current){const saved=source.activeDraft??source.draft,choice=saved?.items?.find((item:any)=>item.storedId===source.id),expected=command.draft.items.find((item:any)=>item.storedId===source.id);if(saved?.groupId!==command.draft.groupId||saved?.guided?.categories!=='resolved'||!choice||['kind','target','payer','hash'].some(key=>choice[key]!==expected?.[key])||choice.skip)throw Error('חלק מהקבוצה כבר הושלם והבחירות השתנו. יש לפתוח מחדש את הקבוצה.')}
 }else if(!current.every(source=>canonical(source.activeDraft??source.draft)===canonical(command.draft))){
  if(current.some((source,index)=>source.revision!==command.sources[index].revision))throw Error('הדוח השתנה במכשיר אחר. יש לפתוח מחדש את הבדיקה.')
  if(command.committed)await updateReportLifecycle(budgetId,base,current[0],'save-review',{draft:command.draft,reviewRevision:command.sources[0].reviewRevision??0},fetcher)
  else await saveStoredReportGroupDraft(budgetId,base,command.sources,command.draft,'ready',fetcher)
  current=await Promise.all(command.sources.map(source=>load(source.id)))
 }
 for(const source of current){
  const latest=await load(source.id)
  if(latest.lifecycle==='digested')continue
  if(latest.sourceHash!==source.sourceHash||latest.revision!==source.revision)throw Error('המקור השתנה בזמן הבדיקה. יש לפתוח אותו מחדש.')
  const result=await updateReportLifecycle(budgetId,base,latest,'complete-duplicate',{},fetcher)
  if(result.lifecycle!=='digested'||result.completionKind!=='duplicate')throw Error('לא הוכחה השלמה של כל הדוח. המקור נשמר לבדיקה.')
 }
 const completed=await Promise.all(command.sources.map(source=>load(source.id)))
 if(!completed.every(source=>source.lifecycle==='digested'))throw Error('חלק מהדוחות עדיין דורשים טיפול. אפשר לבדוק שוב את אותה השלמה.')
 return completed
}
