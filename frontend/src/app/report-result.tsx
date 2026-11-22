import {useState} from 'react'
import Link from './link'
import {ReportRetentionNotice,lifecycleLabels} from './report-guided-review'
import {updateReportLifecycle} from './report-lifecycle-api'
import {loadReportSource} from './report-library-api'
import type {StoredReportDetail} from './report-review-api'
import type {BudgetState} from './use-budget'
import type {BudgetResponse} from './budget-api'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
import {bankMatchLinkKey} from '../../../src/report-bank-match.js'
export async function downloadReportOriginal(budgetId:string,base:BudgetResponse,source:StoredReportDetail){
 const bytes=await loadReportSource(budgetId,base,source,new AbortController().signal),url=URL.createObjectURL(new Blob([bytes as BlobPart]));const a=document.createElement('a');a.href=url;a.download=source.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function SavedMatchDecisions({source}:{source:StoredReportDetail}){
 if(source.completionKind==='declared-duplicate'||(!source.applied&&source.completionKind!=='duplicate'))return null
 const item=source.draft?.items?.find((entry:any)=>entry.storedId===source.id)
 const decisions=Object.entries<string>(item?.decisions??{}).filter(([key,decision])=>decision&&(item?.kind==='bank'?/^\d+$/.test(key)&&(decision==='same'||decision==='new'||bankMatchLinkKey(decision)):key!=='statementReplacement'))
 if(!decisions.length)return null
 const linked=decisions.filter(([,decision])=>decision!=='new').length
 const byLine=new Map(decisions)
 const bankRows=item?.kind==='bank'?(item.records??[]).filter((row:any)=>byLine.has(String(row.line))):[]
 const currency=new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'})
 return <details className="min-w-0 rounded-xl border px-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">החלטות שנשמרו בבדיקת הכפילויות</summary>
  <p className="pb-3"><bdi>{linked}</bdi> קישורים לרישומים קיימים · <bdi>{decisions.length-linked}</bdi> אושרו כתנועות נפרדות</p>
  {bankRows.length>0&&<BankDecisionReceipt rows={bankRows} byLine={byLine} currency={currency}/>}
 </details>
}
function BankDecisionReceipt({rows,byLine,currency}:{rows:any[];byLine:Map<string,string>;currency:Intl.NumberFormat}){
 const [limit,setLimit]=useState(10)
 return <><ul className="divide-y">{rows.slice(0,limit).map(row=><li key={row.line} className="py-2 [overflow-wrap:anywhere]"><p><bdi>{row.description}</bdi></p><p className="text-muted-foreground"><bdi dir="ltr">{row.date}</bdi> · <bdi dir="ltr">{currency.format(row.amountCents/100)}</bdi> · {byLine.get(String(row.line))==='new'?'תנועה נפרדת':'רישום קיים'}</p></li>)}</ul>{limit<rows.length&&<button type="button" className="min-h-11 underline" onClick={()=>setLimit(count=>count+10)}>הצגת עוד החלטות</button>}</>
}
export function ReportResult({budget,base,sources}:{budget:BudgetState;base:BudgetResponse;sources:StoredReportDetail[]}){
 const [reports,setReports]=useState(sources),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),href=usePeriodHref()
 const resolve=async(source:StoredReportDetail)=>{if(busy)return;setBusy(true);setError('');try{const result=await updateReportLifecycle(budget.budgetId,base,source,'resolve-categories',{confirmUncategorized:confirmed});setReports(rows=>rows.map(row=>row.id===source.id?{...row,...result}:row));setConfirmed(false)}catch(e){setError(e instanceof Error?e.message:'השלמת הסיווג לא אושרה.')}finally{setBusy(false)}}
 return <div className="space-y-4">{error&&<p role="alert">{error}</p>}{reports.map(source=><section key={source.id} className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold"><bdi>{source.name}</bdi> · {lifecycleLabels[source.lifecycle??'partial']}</h2><p>זו תוצאת הטיפול השמורה. פתיחתה אינה משנה נתונים כספיים.</p><SavedMatchDecisions source={source}/><ReportRetentionNotice report={source}/><Link href={href('/upload/history')} className="inline-flex min-h-11 items-center underline">היסטוריית הקליטה וביטול נתמך</Link>{!source.originalRemoved&&<button className="min-h-11 rounded-xl border px-4" disabled={busy} onClick={()=>{setError('');void downloadReportOriginal(budget.budgetId,base,source).catch(e=>setError(e.message))}}>הורדת המקור</button>}{source.lifecycle==='partial'&&source.applied&&<><p>אפשר להשלים את הקטגוריות בפרטי ההוצאות. פעולה זו אינה קולטת שוב את הסכומים.</p><ul className="space-y-2">{((base.plan as any)?.details??[]).filter((row:any)=>row.method===source.target&&row.statement?.dueDate===source.draft?.items?.find((item:any)=>item.storedId===source.id)?.report?.dueDate).slice(0,100).map((row:any)=><li key={row.id}><Link className="inline-flex min-h-11 items-center underline" href={href('/details/'+encodeURIComponent(row.id)+'/annotate')}><bdi>{row.name}</bdi> · {row.category??'לסיווג'}</Link></li>)}</ul><Link className="inline-flex min-h-11 items-center underline" href={href('/categories')}>כל פרטי ההוצאות</Link><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>את הפרטים שנותרו בחרתי להשאיר ללא קטגוריה</label><button disabled={busy} className="min-h-11 rounded-xl border px-4" onClick={()=>void resolve(source)}>בדיקה וסיום הסיווג</button></>}{!source.originalRemoved&&(source.state==='committed'||source.completionKind==='declared-duplicate'||source.completionKind==='duplicate'&&source.draft?.items?.length===1)&&<Link className="inline-flex min-h-11 items-center underline" href={href('/upload/'+source.id+'/group?reimport=1')}>בדיקה מחודשת של המקור</Link>}</section>)}<Link className="inline-flex min-h-11 items-center underline" href={href('/incoming')}>חזרה לסנכרון דוחות</Link></div>
}
