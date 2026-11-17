import {HouseholdOutlook} from './household-outlook'
import {MoneyAmount} from './money-amount'
import {useEffect,useMemo} from 'react'
import {useNavigate,useLocation} from 'react-router-dom'
import {ChevronLeft,ArrowDownLeft,ArrowUpRight,CreditCard} from 'lucide-react'
import Link from './link'
import {householdHistory} from './household-model'
import {budgetDetailView} from './detail-adapter'
import {householdCategory} from './household-categories'
import {withViewQuery} from './navigation-query'

const money=(n:number|null)=>n===null?'חסר דיווח':new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',minimumFractionDigits:0,maximumFractionDigits:2}).format(n)
const label=(month:string)=>new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'))
const shortLabel=(month:string)=>new Intl.DateTimeFormat('he-IL',{month:'short',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'))

export function HomeMonthPicker({plan,asOf,compact=false}:{plan:any;asOf:string;compact?:boolean}){
 const location=useLocation(),navigate=useNavigate(),history=householdHistory(plan,asOf),query=new URLSearchParams(location.search),requested=query.get('year')+'-'+String(query.get('month')||'').padStart(2,'0')
 const selected=history.rows.find(row=>row.month===requested)??history.rows.at(-1)!
 const change=(month:string)=>navigate(withViewQuery('/?year='+month.slice(0,4)+'&month='+Number(month.slice(5)),location.search,import.meta.env.DEV),{state:location.state,preventScrollReset:true})
 return <label className={'home-month-picker'+(compact?' home-month-picker-compact':'')}><span className="sr-only">חודש בתמונה הכללית</span><select aria-label="חודש בתמונה הכללית" value={selected.month} title={label(selected.month)} onChange={event=>change(event.target.value)}>{history.rows.map(row=><option key={row.month} value={row.month}>{compact?shortLabel(row.month)+' '+row.month.slice(0,4):label(row.month)}</option>)}</select></label>
}

export function HouseholdHome({plan,asOf}:{plan:any;asOf:string}){
 const location=useLocation(),navigate=useNavigate(),history=householdHistory(plan,asOf)
 const query=new URLSearchParams(location.search),requested=query.get('year')+'-'+String(query.get('month')||'').padStart(2,'0')
 const selected=history.rows.find(row=>row.month===requested)??history.rows.at(-1)!
 const incoming=(row:any)=>row.income===null?null:row.income+(row.incomingTransfers??0)
 const values=history.rows.flatMap(row=>[incoming(row),row.spending,row.cardTotal]).filter(value=>value!==null) as number[]
 const max=Math.max(1,...values),min=Math.min(0,...values),range=max-min,baseline=-min/range*100
 const href=(path:string,month=selected.month)=>withViewQuery(path+(path.includes('?')?'&':'?')+'year='+month.slice(0,4)+'&month='+Number(month.slice(5)),location.search,import.meta.env.DEV)
 const state={householdFrom:location.pathname+location.search}
 const categories=useMemo(()=>{
  const [year,month]=selected.month.split('-')
  const period={year,month,asOf}
  const {positiveCategories}=budgetDetailView(plan,period)
  return Object.entries(positiveCategories as Record<string,number>).filter(([,amount])=>amount>0).sort((a,b)=>b[1]-a[1])
 },[plan,selected.month,asOf])
 const categoryTotal=categories.reduce((sum,[,amount])=>sum+amount,0)
 useEffect(()=>{if(history.latest&&!history.rows.some(row=>row.month===requested))navigate(href('/',selected.month),{replace:true,state:location.state})},[history.latest,requested,selected.month,location.search,location.state,navigate])
 const metrics=[{title:'כניסות',value:incoming(selected),Icon:ArrowDownLeft,tone:'income',note:'הכנסות והעברות נכנסות'},{title:'הוצאות',value:selected.spending,Icon:ArrowUpRight,tone:'expense',note:'לפי הדיווחים שנקלטו'},{title:'מתוכן בכרטיסים',value:selected.cardTotal,Icon:CreditCard,tone:'cards',note:'כלול בסך ההוצאות'}]
 return <div className="household-page household-home">
  <h1 className="home-mobile-title sr-only">תמונה כללית</h1>
  <div className="home-heading">
   <div><p className="home-eyebrow">התקציב שלך, במבט אחד</p><h1>תמונה כללית</h1></div>
   <div className="home-heading-actions">
    <HomeMonthPicker plan={plan} asOf={asOf}/>
   </div>
  </div>
  <section className="home-summary" aria-label={'סיכום '+label(selected.month)}>
   {metrics.map(({title,value,Icon,tone,note})=><div className="home-metric" data-tone={tone} key={title}><div className="home-metric-label"><span>{title}</span><Icon size={17} aria-hidden/></div><strong data-missing={value===null}><MoneyAmount value={value}/></strong><span className="home-metric-note">{note}</span></div>)}
  </section>
  <p className="home-data-note">{selected.partial?'דיווח חלקי לחודש הזה':selected.reported?'מבוסס על נתונים מדווחים':selected.cardTotal!==null?'דווחו כרטיסים; חסר דיווח בנק.':'עדיין אין דיווח לחודש הזה.'}{(selected.incomingTransfers??0)!==0&&<> · בכניסות נכללות העברות בסך <MoneyAmount value={selected.incomingTransfers}/></>}</p>
  <div className="home-workspace">
   <section className="home-panel home-history" aria-labelledby="home-history-heading">
    <div className="home-panel-heading"><div><h2 id="home-history-heading">תזרים לאורך זמן</h2><p>שישה חודשים · נתונים מדווחים</p></div><div className="home-chart-legend"><span><i data-tone="income"/>כניסות</span><span><i data-tone="expense"/>הוצאות</span><span><i data-tone="cards"/>מתוכן כרטיסים</span></div></div>
    {values.length?<>
     <div className="home-chart">
      <div className="home-chart-axis" aria-hidden="true"><span><MoneyAmount value={max}/></span><span><MoneyAmount value={min}/></span></div>
      <div className="home-chart-months" role="group" aria-label="בחירת חודש דיווח">
       {history.rows.map(row=><Link key={row.month} className="home-chart-month" href={href('/',row.month)} aria-current={selected.month===row.month?'date':undefined} aria-label={`${label(row.month)}: כניסות ${money(incoming(row))}, הוצאות ${money(row.spending)}, כרטיסים ${money(row.cardTotal)}${row.partial?' · חלקי':''}`}><span className="home-chart-bars" style={{'--baseline':baseline+'%'} as any}>{[incoming(row),row.spending,row.cardTotal].map((value,index)=>value===null?<span className="home-chart-missing" key={index} aria-hidden>·</span>:<span key={index} data-tone={['income','expense','cards'][index]} style={{height:Math.max(value===0?1:0,Math.abs(value)/range*100)+'%',bottom:(value>=0?baseline:baseline-Math.abs(value)/range*100)+'%'}}/>)}</span><span className="home-chart-month-label">{shortLabel(row.month)}</span></Link>)}
      </div>
     </div>
     <p className="home-chart-caption">כרטיסים הם חלק מההוצאות. חודשים ללא דיווח מסומנים בנקודה.</p>
    </>:<div className="home-empty"><p>התמונה תתמלא עם הדוח הראשון</p><span>כאן יופיעו הכנסות והוצאות לאורך החודשים. הוספת דוחות זמינה בתפריט.</span></div>}
   </section>
   <section className="home-panel home-categories" aria-labelledby="home-categories-heading">
    <div className="home-panel-heading"><div><h2 id="home-categories-heading">לאן הלך הכסף?</h2><p>רכישות בפירוט · לפני זיכויים</p></div></div>
    {categories.length?<div className="home-category-list">{categories.slice(0,5).map(([name,amount])=><Link href={href('/categories?category='+encodeURIComponent(name))} key={name} state={state} className="home-category-item"><span className="home-category-dot" style={{background:householdCategory(name,plan).color}} aria-hidden/><span className="home-category-name">{name}<span>{Math.round(amount/categoryTotal*100)}% מהפירוט</span></span><MoneyAmount value={amount}/><ChevronLeft size={14} aria-hidden/></Link>)}</div>:<div className="home-empty"><p>עדיין אין פירוט לתקופה הזו</p><span>סכומי הדיווח שמעל נשארים זמינים גם בלי פירוט רכישות.</span></div>}
    <Link className="home-panel-link" href={href('/categories')} state={state}>כל הקטגוריות<ChevronLeft size={16} aria-hidden/></Link>
   </section>
  </div>
  <HouseholdOutlook plan={plan} asOf={asOf} anchor={selected.month}/>
 </div>
}
