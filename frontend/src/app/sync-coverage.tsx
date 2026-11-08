import {useEffect,useRef,useState} from 'react'
import {useLocation,useNavigate,useNavigationType} from 'react-router-dom'
import {useDraftGuard} from './draft-guard'
import {Check,Minus,Clock,FileWarning,ChevronRight,ChevronLeft} from 'lucide-react'
import {monthAt} from '../../../src/budget.js'
import {isVault} from '../../../src/vault.js'
import {AccessError} from './budget-api'
import type {BudgetState} from './use-budget'
import {loadExpectations,type ExpectationsSnapshot} from './report-expectations-api'
import {syncCoverage,type CoverageState} from './sync-center-model'
import Link from './link'

const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50'
const labels:Record<CoverageState,string>={file:'נקלט','no-transactions':'ללא פעילות',pending:'לבדיקה',missing:'חסר',partial:'כיסוי חלקי',open:'חודש פתוח','not-required':'לא נדרש'}
const tones:Record<CoverageState,string>={file:'bg-primary/10 text-primary','no-transactions':'bg-muted text-muted-foreground',pending:'bg-primary/10 text-primary',missing:'bg-destructive/10 text-destructive',partial:'bg-destructive/10 text-destructive',open:'bg-muted text-muted-foreground','not-required':'bg-muted text-muted-foreground'}
const monthName=(month:string)=>new Intl.DateTimeFormat('he-IL',{month:'short',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))
function StatusIcon({state}:{state:CoverageState}){const Icon=state==='file'?Check:state==='pending'||state==='open'?Clock:state==='missing'||state==='partial'?FileWarning:Minus;return <Icon size={18} aria-hidden="true"/>}
export function SyncCoverage({budget,href,change,tick}:{budget:Extract<BudgetState,{status:'ready'}>;href:(path:string,route?:any)=>string;change:(values:Record<string,string|null>)=>string;tick:number}){
 const navigate=useNavigate(),guard=useDraftGuard(),go=(values:Record<string,string|null>)=>guard.run(()=>void navigate(change(values),{preventScrollReset:true})),{search}=useLocation(),query=new URLSearchParams(search),parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),day=['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-'),asOf=day.slice(0,7)
 const [snapshot,setSnapshot]=useState<ExpectationsSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0)
 const detailHeading=useRef<HTMLHeadingElement>(null),navigationType=useNavigationType(),selectedMonth=query.get('coverageMonth')
 useEffect(()=>{if(selectedMonth&&snapshot&&navigationType!=='POP'){detailHeading.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})}},[selectedMonth,snapshot,navigationType])
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');loadExpectations(budget.budgetId,budget.value,abort.signal).then(value=>{if(!abort.signal.aborted)setSnapshot(value)}).catch(error=>{if(!abort.signal.aborted){if(error instanceof AccessError)budget.invalidate(error.message);else setError(error.message)}}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});return()=>abort.abort()},[budget.budgetId,budget.value.accountId,budget.value.revision,tick,refresh])
 if(!snapshot)return <section className="space-y-3">{loading?<p role="status">בודקים אילו דוחות חסרים…</p>:<><p role="alert">{error}</p><button className={button} onClick={()=>setRefresh(value=>value+1)}>ניסיון נוסף</button></>}</section>
 const plan=snapshot.budget.value.plan as any
 if(!plan||isVault(plan))return <p className="surface rounded-xl p-4">יש לפתוח את התקציב כדי לבדוק אילו דוחות חסרים.</p>
 const requested=query.get('coverageEnd'),defaultEnd=monthAt(asOf,-1)<plan.startMonth?asOf:monthAt(asOf,-1),end=requested&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested)&&requested>=plan.startMonth&&requested<=asOf?requested:defaultEnd
 const rows=syncCoverage(plan,end,day,snapshot.actions.reports,snapshot.actions.expectations),row=rows.find(row=>row.kind+':'+row.id===query.get('coverageEntity'))??rows[0],selected=row?.months.find(cell=>cell.month===query.get('coverageMonth'))
 const missing=rows.reduce((sum,row)=>sum+row.months.filter(cell=>['missing','partial'].includes(cell.state)).length,0),pending=rows.reduce((sum,row)=>sum+row.months.filter(cell=>cell.state==='pending').length,0)
 const previous=monthAt(end,-6)<plan.startMonth?plan.startMonth:monthAt(end,-6),next=monthAt(end,6)>asOf?asOf:monthAt(end,6)
 return <section className="space-y-4" aria-label="מפת דוחות חסרים">
  <p className="text-sm text-muted-foreground"><bdi>{budget.spaces.find(space=>space.id===budget.budgetId)?.name}</bdi> · לפי חודש הדוח בבנק וחודש החיוב בכרטיס</p>
  {loading&&<p role="status" className="text-sm">מעדכנים את מצב הדוחות…</p>}
  {error&&<div className="surface space-y-2 rounded-xl border border-destructive p-3"><p role="alert" className="text-sm">{error} מוצגים הנתונים מהבדיקה הקודמת.</p><button className={button} disabled={loading} onClick={()=>setRefresh(value=>value+1)}>ניסיון נוסף</button></div>}
  {selected&&row?<section className="surface space-y-4 rounded-xl p-4">
   <Link className={button} href={change({coverageMonth:null})}><ChevronRight size={18} aria-hidden="true"/>חזרה למפת החודשים</Link>
   <h3 ref={detailHeading} tabIndex={-1} className="font-semibold outline-none"><bdi>{row.label}</bdi> · {monthName(selected.month)} <bdi>{selected.month.slice(0,4)}</bdi></h3>
   <p className="flex items-center gap-2"><StatusIcon state={selected.state}/>{labels[selected.state]}{selected.overdue&&' · עבר מועד הדיווח הצפוי'}</p>
   {['missing','partial'].includes(selected.state)&&<><p className="text-sm">{selected.state==='partial'?'נקלט רק חלק מהחודש. יש להוריד מהבנק דוח המכסה את החודש המלא.':'יש להוריד את הדוח המתאים מאתר הבנק או חברת האשראי.'} שמרו אותו בתיקיית הסנכרון והריצו את הקיצור, או העלו אותו כאן.</p>{['manual','bank'].includes(selected.evidence)&&<p className="text-sm text-muted-foreground">קיים סכום {selected.evidence==='manual'?'שהוזן ידנית':'מדוח הבנק'}, אך עדיין חסר קובץ הדוח.</p>}<Link className={button} href={href('/incoming?sync=add&syncFrom=missing')}>העלאת דוח לתיבת הסנכרון</Link></>}
   {selected.state==='pending'&&<><p className="text-sm">{selected.failed?'המקור הגיע, אך הטיפול בו לא הושלם. יש לבדוק את השגיאה בדוח.':'הדוח כבר הגיע וממתין לבדיקה. אין צורך להוריד אותו שוב.'}</p><Link className={button} href={href('/upload/'+encodeURIComponent(selected.reportId!)+'/group?'+new URLSearchParams({kind:row.kind,target:row.id,syncReturn:change({coverageMonth:null})}))}>המשך בדיקת הדוח</Link></>}
   {selected.state==='file'&&<p className="text-sm">הדוח כבר נקלט. אין צורך להעלות אותו שוב.</p>}
   {selected.state==='no-transactions'&&<p className="text-sm">אישרת שאין בחודש הזה עסקאות או חיובים. אין צורך בדוח נוסף.</p>}
   {selected.state==='open'&&<p className="text-sm">החודש עדיין פתוח. הוא אינו נספר כדוח חסר של חודש שהסתיים.</p>}
   {selected.state==='not-required'&&<p className="text-sm">החודש הוחרג בהגדרות הדוחות הצפויים.</p>}
   {row.kind==='card'&&selected.month<asOf&&['missing','no-transactions'].includes(selected.state)&&<Link className={button} href={href('/cards/'+encodeURIComponent(row.id)+'/no-activity?'+new URLSearchParams({year:selected.month.slice(0,4),month:String(Number(selected.month.slice(5)))}))}>{selected.state==='no-transactions'?'בדיקת אישור ללא פעילות':'לא היו עסקאות בחודש הזה?'}</Link>}
   <Link className="flex min-h-11 items-center text-sm underline" href={href('/upload?'+new URLSearchParams({kind:row.kind,target:row.id,year:selected.month.slice(0,4),month:String(Number(selected.month.slice(5)))}))}>דוחות החשבון והחודש</Link>
  </section>:<>
   <div className="flex items-center justify-between gap-2"><button className={button} aria-label="שישה חודשים קודמים" disabled={monthAt(end,-5)<=plan.startMonth} onClick={()=>go({coverageEnd:previous,coverageMonth:null})}><ChevronRight size={18} aria-hidden="true"/></button><label className="min-w-0 flex-1 text-center text-xs text-muted-foreground">שישה חודשים עד<input type="month" className="block min-h-11 w-full min-w-0 rounded-xl border bg-card px-2 text-sm text-foreground" aria-label="חודש אחרון במפת הדוחות" min={plan.startMonth} max={asOf} value={end} onChange={event=>{if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)&&event.target.value>=plan.startMonth&&event.target.value<=asOf)go({coverageEnd:event.target.value,coverageMonth:null})}}/></label><button className={button} aria-label="שישה חודשים הבאים" disabled={end>=asOf} onClick={()=>go({coverageEnd:next,coverageMonth:null})}><ChevronLeft size={18} aria-hidden="true"/></button></div>
   <p role="status" className="text-sm"><bdi>{missing}</bdi> דוחות חסרים או חלקיים · <bdi>{pending}</bdi> ממתינים לבדיקה בתקופה</p>
   <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-muted-foreground">{(['file','missing','pending','open','no-transactions','not-required'] as CoverageState[]).map(state=><span key={state} className="flex items-center gap-1"><StatusIcon state={state}/>{labels[state]}</span>)}</div>
   {row?<><label className="block text-xs text-muted-foreground">חשבון או כרטיס<select className="mt-1 min-h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground" value={row.kind+':'+row.id} onChange={event=>go({coverageEntity:event.target.value,coverageMonth:null})}>{rows.map(row=><option key={row.kind+row.id} value={row.kind+':'+row.id}>{row.kind==='bank'?'בנק':'כרטיס'} · {row.label} {row.alias}</option>)}</select></label><article className="surface space-y-3 rounded-xl p-4"><h3 className="text-sm font-semibold"><bdi>{row.label}</bdi>{row.alias&&<> · <bdi>{row.alias}</bdi></>}</h3><div className="grid grid-cols-3 gap-2 sm:grid-cols-6" dir="rtl">{row.months.map(cell=><Link key={cell.month} className={'flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-xs '+tones[cell.state]} aria-label={row.label+', '+cell.month+', '+labels[cell.state]+(cell.overdue?' · באיחור':'')} href={change({coverageEntity:row.kind+':'+row.id,coverageMonth:cell.month})}><span>{monthName(cell.month)} <bdi>{cell.month.slice(2,4)}</bdi></span><StatusIcon state={cell.state}/><span>{labels[cell.state]}</span></Link>)}</div></article></>:<p className="surface rounded-xl p-4 text-sm">אין חשבונות או חודשים למעקב בתקופה הזאת.</p>}
   <p className="text-xs text-muted-foreground">לחיצה על חודש מציגה מה צריך לעשות. קובץ שטרם זוהה אינו נחשב לדוח שנקלט. חוסר בקובץ אינו בהכרח איחור במועד הדיווח.</p>
  </>}
  <Link className="flex min-h-11 items-center text-sm underline" href={href('/settings/report-expectations')}>מועדי דוחות וחודשים שלא נדרשים</Link>
 </section>
}
