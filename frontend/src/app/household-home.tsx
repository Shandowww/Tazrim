import {useEffect, useMemo} from 'react'
import {useNavigate,useLocation} from 'react-router-dom'
import {Calculator,Landmark,NotebookPen,ChevronLeft,Upload} from 'lucide-react'
import Link from './link'
import {householdHistory} from './household-model'
import {budgetDetailView} from './detail-adapter'
import {householdCategory} from './household-categories'
import {withViewQuery} from './navigation-query'
const money=(n:number|null)=>n===null?'חסר':new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',minimumFractionDigits:0,maximumFractionDigits:2}).format(n)
const label=(m:string)=>new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T00:00:00Z'))
export function HouseholdHome({plan,asOf}:{plan:any;asOf:string}){
 const location=useLocation(),navigate=useNavigate(),history=householdHistory(plan,asOf),query=new URLSearchParams(location.search),requested=query.get('year')+'-'+String(query.get('month')||'').padStart(2,'0')
 const selected=history.rows.find(r=>r.month===requested)??history.rows.at(-1)!,values=history.rows.flatMap(r=>[r.income===null?null:r.income+(r.incomingTransfers??0),r.spending,r.cardTotal]).filter((n:any)=>n!==null) as number[]
 const max=Math.max(1,...values),min=Math.min(0,...values),range=max-min,baseline=-min/range*100
 const href=(path:string,month=selected.month)=>withViewQuery(path+'?year='+month.slice(0,4)+'&month='+Number(month.slice(5)),location.search,import.meta.env.DEV)
 const state={householdFrom:location.pathname+location.search}
 const incoming=(r:any)=>r.income===null?null:r.income+(r.incomingTransfers??0)
 const categoryPreview=useMemo(() => {
  const [year, month]=selected.month.split('-')
  const period={year,month,asOf}
  const {positiveCategories}=budgetDetailView(plan,period)
  return Object.entries(positiveCategories as Record<string,number>)
   .filter(([,amount])=>amount>0)
   .sort((a,b)=>b[1]-a[1])
 }, [plan, selected.month, asOf])
 const categorySegments=categoryPreview.slice(0,5)
 const other=categoryPreview.slice(5).reduce((total,[,amount])=>total+amount,0)
 useEffect(()=>{if(history.latest&&!history.rows.some(r=>r.month===requested))navigate(href('/',selected.month),{replace:true,state:location.state})},[history.latest,requested,selected.month,location.search,location.state,navigate])
 return <div className="household-page household-home"><div className="household-title"><div><h1>תמונה כללית</h1><p>{history.latest?'דיווח אחרון · '+label(history.latest):'עדיין אין דיווחים'}</p></div><Link className="household-update" href={href('/upload')} state={state}><Upload size={18}/>עדכון</Link></div>
 <section className="surface household-history"><h2>שישה חודשים במבט</h2><div className="household-legend"><span><i className="income"/>כניסות</span><span><i className="expense"/>הוצאות</span><span><i className="cards"/>מתוכן כרטיסים</span></div><div className="household-scale"><bdi>{money(max)}</bdi><span>סכום חודשי · ₪</span></div><div className="household-months" role="group" aria-label="בחירת חודש דיווח">{history.rows.map(r=><Link key={r.month} href={href('/',r.month)} aria-current={selected.month===r.month?'date':undefined} aria-label={`${label(r.month)}: כניסות ${money(incoming(r))}, הוצאות ${money(r.spending)}, כרטיסים ${money(r.cardTotal)}${r.partial?' · חלקי':''}`}><span className="household-bars" style={{'--baseline':baseline+'%'} as any}>{[incoming(r),r.spending,r.cardTotal].map((value,i)=>value===null?<span key={i} className="household-missing" aria-hidden>·</span>:<span key={i} className={['income','expense','cards'][i]} style={{height:Math.max(value===0?1:0,Math.abs(value)/range*100)+'%',bottom:(value>=0?baseline:baseline-Math.abs(value)/range*100)+'%'}}/> )}</span><span>{new Intl.DateTimeFormat('he-IL',{month:'short',timeZone:'UTC'}).format(new Date(r.month+'-01T00:00:00Z'))}</span></Link>)}</div>{min<0&&<p className="household-scale">טווח התרשים: <bdi>{money(min)} – {money(max)}</bdi></p>}
 <div className="household-selected" aria-live="polite"><h3>{label(selected.month)}{selected.partial?' · דיווח חלקי':''}</h3><div className="household-totals">{[['כניסות',incoming(selected)],['הוצאות',selected.spending],['מתוכן כרטיסים',selected.cardTotal]].map(([name,value])=><div key={name as string}><span>{name}</span><strong><bdi>{money(value as number|null)}</bdi></strong></div>)}</div>{(selected.incomingTransfers??0)!==0&&<p>הכניסות כוללות הכנסות והעברות נכנסות: <bdi>{money(selected.incomingTransfers)}</bdi></p>}{!selected.reported&&<p>{selected.cardTotal!==null?'דווחו כרטיסים; חסר דיווח בנק.':'אין דיווח לחודש הזה.'}</p>}</div></section>
 <Link href={href('/categories')} state={state} className="surface household-category">
  <div className="household-category-heading"><strong>לאן הלך הכסף?</strong><span>{label(selected.month)}</span><ChevronLeft size={20}/></div>
  {categorySegments.length>0&&<>
   <span>רכישות עם פירוט</span>
   <div className="household-category-strip" aria-hidden="true">
    {categorySegments.map(([category,amount])=><span key={category} style={{flexGrow:amount,background:householdCategory(category,plan).color}}/>)}
    {other>0&&<span style={{flexGrow:other,background:'var(--household-cat-neutral)'}}/>}
   </div>
  </>}
 </Link>
 <div className="household-shortcuts">{[['/checks','צ׳קים',history.checks===1?'צ׳ק ממתין':history.checks+' ממתינים',NotebookPen],['/loans','הלוואות',history.loans===1?'הלוואה פעילה':history.loans+' פעילות',Landmark],['/plans/scenario','מחשבון','בדיקת רכישה',Calculator]].map(([path,title,caption,Icon]:any)=><Link className="surface" href={href(path)} state={state} key={path}><Icon size={21}/><strong>{title}</strong><span>{caption}</span></Link>)}</div></div>
}
