import {useId,useMemo,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {ArrowUpLeft,CalendarDays,ChevronLeft,WalletCards,Landmark,NotebookPen,ShoppingBag,ListTodo} from 'lucide-react'
import Link from './link'
import {useInterfaceMode} from './interface-mode'
import {modeAllows} from './interface-mode-model'
import {MoneyAmount} from './money-amount'
import {withViewQuery} from './navigation-query'
import {forecastCoveragePath,householdOutlook} from './outlook-model'
import {ForecastBuffer} from './forecast-buffer'
const monthLabel=(month:string,short=false)=>new Intl.DateTimeFormat('he-IL',{month:short?'short':'long',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))
const dayLabel=(date:string)=>new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
const icons={card:WalletCards,cheque:NotebookPen,loan:Landmark,purchase:ShoppingBag}
function ForecastActions({scenario,coverage}:{scenario:string;coverage:string}){
 return <nav className="outlook-actions" aria-label="פעולות לתחזית">
  <Link href={scenario}><ShoppingBag size={16} aria-hidden/>בדיקת רכישה</Link>
  <Link href={coverage}><ListTodo size={16} aria-hidden/>בדיקת כיסוי דוחות</Link>
 </nav>
}
function OutlookChart({account,compact=false}:{account:any;compact?:boolean}){
 const gradient=useId().replaceAll(':',''),values=account.rows.map((row:any)=>row.balance).filter((value:any)=>value!==null),min=Math.min(account.buffer,...values),max=Math.max(account.buffer,...values),padding=Math.max((max-min)*.18,250),low=min-padding,high=max+padding
 const bottom=compact?112:170,top=compact?14:24,height=bottom-top,y=(value:number)=>bottom-(value-low)/(high-low)*height,x=(index:number)=>[450,270,90][index],bufferY=y(account.buffer)
 // Each segment stays within its endpoint values. Gaps remain gaps when data is missing.
 const segments=account.rows.slice(1).flatMap((row:any,index:number)=>{const previous=account.rows[index];if(row.balance===null||previous.balance===null)return [];const middle=(x(index)+x(index+1))/2;return [{id:row.month,start:x(index),end:x(index+1),path:`M ${x(index)} ${y(previous.balance)} C ${middle} ${y(previous.balance)}, ${middle} ${y(row.balance)}, ${x(index+1)} ${y(row.balance)}`} ]})
 return <div className={'outlook-chart'+(compact?' outlook-chart-compact':'')}><svg viewBox={'0 0 540 '+(bottom+14)} role="img" aria-label={'יתרת סוף חודש צפויה ב'+account.label+' בשלושת החודשים הקרובים. המספרים מפורטים מתחת לגרף.'}>
  <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={bottom}><stop offset="0%" className="outlook-fill-start"/><stop offset="100%" className="outlook-fill-end"/></linearGradient></defs>
  {[top,(top+bottom)/2,bottom].map(y=><line key={y} x1="30" x2="510" y1={y} y2={y} className="outlook-grid-line"/>)}
  {segments.map((segment:any)=><path key={segment.id} d={segment.path+` L ${segment.end} ${bottom} L ${segment.start} ${bottom} Z`} fill={'url(#'+gradient+')'}/>)}
  <line x1="30" x2="510" y1={bufferY} y2={bufferY} className="outlook-buffer-line"/>
  {segments.map((segment:any)=><path key={segment.id} d={segment.path} fill="none" className="outlook-projection-line"/>)}
  {account.rows.map((row:any,index:number)=>row.balance===null?<text key={row.month} x={x(index)} y={(top+bottom)/2} textAnchor="middle" className="outlook-chart-missing">חסר מידע</text>:<g key={row.month}><line x1={x(index)} x2={x(index)} y1={y(row.balance)+10} y2={bottom} className="outlook-point-guide"/><circle cx={x(index)} cy={y(row.balance)} r="11" className="outlook-point-halo"/><circle cx={x(index)} cy={y(row.balance)} r="5" className="outlook-point" data-low={row.balance<account.buffer}/></g>)}
 </svg><div className="outlook-months">{account.rows.map((row:any)=><div key={row.month}><span>{monthLabel(row.month,true)}</span><strong data-low={row.balance!==null&&row.balance<account.buffer}><MoneyAmount value={row.balance} missing="חסר מידע"/></strong>{!compact&&<small>{row.balanceDate?'הערכה זמנית לסוף החודש':'צפוי בסוף החודש'}</small>}</div>)}</div><p className="outlook-buffer-key"><i aria-hidden/>רף ביטחון <MoneyAmount value={account.buffer}/></p></div>
}
export function HouseholdOutlook({plan,asOf,anchor,fullPage=false}:{plan:any;asOf:string;anchor:string;fullPage?:boolean}){
 const {search}=useLocation(),{mode}=useInterfaceMode(),day=['year','month','day'].map(key=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).find(part=>part.type===key)?.value).join('-'),model=useMemo(()=>householdOutlook(plan,anchor,asOf,day),[plan,anchor,asOf,day]),[accountId,setAccountId]=useState(()=>new URLSearchParams(search).get('outlookAccount')??'')
 const account=model.accounts.find(account=>account.id===accountId)??model.accounts[0],first=account.rows[0],issues=[...new Set(account.rows.flatMap(row=>row.issues))],below=account.rows.find(row=>row.balance!==null&&row.balance<account.buffer)
 const balanceDate=account.rows.find(row=>row.balanceDate)?.balanceDate
 const provisionalNote=balanceDate&&<>הערכה זמנית לפי יתרה מדווחת ל־<time dateTime={balanceDate}><bdi>{dayLabel(balanceDate)}</bdi></time>. בחודש החלקי נכללו רק חיובי כרטיס וצ׳קים מתוארכים אחרי היתרה.</>
 const upcoming=model.upcoming.filter(item=>account.id==='budget'||item.accountId===account.id||!item.accountId),complete=account.rows.every(row=>row.balance!==null),lowest=complete?account.rows.reduce((a,b)=>a.balance! <= b.balance! ? a : b):null
 const href=(path:string,month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(anchor)?anchor:model.start)=>withViewQuery(path+(path.includes('?')?'&':'?')+'year='+month.slice(0,4)+'&month='+Number(month.slice(5)),search,import.meta.env.DEV)
 const scenario=href('/plans/scenario?'+new URLSearchParams({scenarioMonth:first.month,scenarioAccount:account.id}),first.month)
 const coverage=href(forecastCoveragePath(plan,account.id,asOf))
 return <section className={'household-outlook'+(fullPage?' outlook-full-page':'')} aria-label="מבט קדימה">
  {!fullPage&&<div className="outlook-mobile-card home-panel">
   <Link className="outlook-mobile-heading" href={href('/outlook?outlookAccount='+encodeURIComponent(account.id))}><span><ArrowUpLeft size={18} aria-hidden/>מבט קדימה</span><span className="outlook-badge">{balanceDate?'הערכה זמנית':'3 חודשים · הערכה'}</span><ChevronLeft size={18} aria-hidden/></Link>
   {model.accounts.length>1&&<div className="outlook-accounts" role="group" aria-label="חשבון לתחזית מהירה">{model.accounts.map(item=><button type="button" key={item.id} aria-pressed={item.id===account.id} onClick={()=>setAccountId(item.id)}>{item.label}</button>)}</div>}
   {model.accounts.length===1&&<p className="outlook-mobile-account">{account.label}</p>}
   <div className="outlook-mobile-metrics"><div><span>סוף {monthLabel(first.month,true)} · יתרה צפויה</span><strong data-low={first.balance!==null&&first.balance<account.buffer}><MoneyAmount value={first.balance} missing="חסר מידע"/></strong></div><div className="outlook-lowest" data-low={lowest!==null&&lowest.balance!<account.buffer}><span>היתרה הנמוכה{lowest?' · '+monthLabel(lowest.month,true):''}</span><strong><MoneyAmount value={lowest?.balance??null} missing="חסר מידע"/></strong></div></div>
   <p className="outlook-buffer-result"><ForecastBuffer balance={first.balance} buffer={account.buffer}/></p>
   <ForecastActions scenario={scenario} coverage={coverage}/>
   <OutlookChart account={account} compact/>
   {provisionalNote&&<p className="outlook-mobile-status">{provisionalNote}</p>}
   {(!complete||(!balanceDate&&account.stale)||below)&&<p className="outlook-mobile-status" data-warning={!!below}>{!complete?'נדרשת השלמת נתונים לתחזית.':below?'צפויה ירידה מתחת לרף הביטחון ב'+monthLabel(below.month,true)+'.':'חסר דיווח עדכני; התחזית מבוססת על הנתונים השמורים.'}</p>}
   <div className="outlook-mobile-agenda"><div><h3>התשלומים הקרובים</h3><span>{upcoming.length>2?'2 מתוך '+upcoming.length+' בתכנון':''}</span></div>{upcoming.length?<ol>{upcoming.slice(0,2).map(item=>{const Icon=icons[item.kind as keyof typeof icons];return <li key={item.id}><span className="outlook-event-icon" data-kind={item.kind}><Icon size={16} aria-hidden/></span><span className="outlook-event-copy"><strong>{item.title}</strong><small>{item.date?dayLabel(item.date):monthLabel(item.month,true)+' · ללא יום קבוע'}{!item.accountId?' · ללא שיוך חשבון':''}</small></span><MoneyAmount value={item.amount}/></li>})}</ol>:<p>אין תשלומים שמורים לתקופה הזו</p>}</div>
   <Link className="outlook-mobile-link" href={href('/outlook?outlookAccount='+encodeURIComponent(account.id))}><span>לתחזית ולפירוט התשלומים</span><ChevronLeft size={16} aria-hidden/></Link>
   <p className="outlook-mobile-disclaimer">יתרות סוף חודש · התשלומים מוצגים למעקב, ללא חיוב נוסף</p>
  </div>}
  <div className="outlook-expanded">
   <div className="outlook-section-heading"><div>{fullPage?<h1>מבט קדימה</h1>:<h2>מבט קדימה</h2>}<p>{monthLabel(model.start)} — {monthLabel(model.months[2])} · תחזית לפי הנתונים השמורים</p></div><Link href={href('/plans',model.start)}><ArrowUpLeft size={16} aria-hidden/>פריטים מתוכננים</Link></div>
   <div className="outlook-workspace">
    <section className="home-panel outlook-forecast" aria-label="תחזית יתרה"><div className="home-panel-heading"><div><h2>מה צפוי להישאר בחשבון?</h2><p>אחרי ההוצאות וההפקדות שבתכנון</p></div><span className="outlook-badge">{balanceDate?'הערכה זמנית':'הערכה'}</span></div>
     {model.accounts.length>1&&<div className="outlook-accounts" role="group" aria-label="חשבון לתחזית">{model.accounts.map(item=><button type="button" key={item.id} aria-pressed={item.id===account.id} onClick={()=>setAccountId(item.id)}>{item.label}</button>)}</div>}
     <div className="outlook-forecast-summary"><div><span>סוף {monthLabel(first.month,true)} · {account.label}</span><strong><MoneyAmount value={first.balance} missing="חסר מידע לתחזית"/></strong></div><p>{below?<>מתחת לרף הביטחון ב{monthLabel(below.month,true)}</>:issues.length?'יש נתונים להשלמה':'יתרות סוף חודש צפויות'}</p></div>
     <p className="outlook-buffer-result"><ForecastBuffer balance={first.balance} buffer={account.buffer}/></p>
     <ForecastActions scenario={scenario} coverage={coverage}/>
     <OutlookChart account={account}/>
     {(provisionalNote||issues.length>0)?<div className="outlook-data-note">{provisionalNote&&<p>{provisionalNote}</p>}{issues.length>0&&<><p>{issues.join(' · ')}.</p><Link href={href('/accounts')}>בדיקת נתוני החשבונות<ChevronLeft size={14} aria-hidden/></Link></>}</div>:<p className="outlook-data-note">{account.latest?<>בסיס הדיווח: {monthLabel(account.latest)}. </>:null}{account.stale?'חסר דיווח עדכני; התחזית מבוססת על ההערכות והיתרות השמורות. ':''}זו תחזית חודשית; היתרה עשויה להיות נמוכה יותר במהלך החודש.</p>}
    </section>
    <section className="home-panel outlook-upcoming" aria-label="התחייבויות קרובות"><div className="home-panel-heading"><div><h2>מה מתוכנן בקרוב?</h2><p>{account.label} · מועדים ותשלומים שמורים</p></div><CalendarDays size={18} aria-hidden/></div>
     {upcoming.length?<ol className="outlook-upcoming-list">{upcoming.slice(0,5).map(item=>{const Icon=icons[item.kind as keyof typeof icons],canOpen=modeAllows(mode,item.href),content=<><span className="outlook-event-icon" data-kind={item.kind}><Icon size={17} aria-hidden/></span><span className="outlook-event-copy"><strong>{item.title}</strong><small>{item.date?dayLabel(item.date):monthLabel(item.month,true)+' · ללא יום קבוע'} · {item.note}{!item.accountId?' · ללא שיוך חשבון':''}</small></span><span className="outlook-event-amount"><MoneyAmount value={item.amount}/>{canOpen&&<ChevronLeft size={13} aria-hidden/>}</span></>;return <li key={item.id}>{canOpen?<Link href={href(item.href,item.month)}>{content}</Link>:<div>{content}</div>}</li>})}</ol>:<div className="home-empty"><p>אין התחייבויות שמורות לתקופה הזו</p><span>רכישות מתוכננות, צ׳קים ולוחות הלוואה יופיעו כאן.</span></div>}
     <p className="outlook-data-note">רשימת מעקב בלבד; אינה מתווספת לתחזית. הלוואות וצ׳קים למעקב נכללים בתזרים דרך הדיווחים.</p><nav className="outlook-related" aria-label="כלי תכנון">{modeAllows(mode,'/plans')&&<Link href={href('/plans',model.start)}><span className="outlook-related-icon" aria-hidden><ListTodo size={17} strokeWidth={1.8}/></span>התכנון שלי</Link>}<Link href={href('/loans',model.start)}><span className="outlook-related-icon" aria-hidden><Landmark size={17} strokeWidth={1.8}/></span>הלוואות</Link><Link href={href('/checks',model.start)}><span className="outlook-related-icon" aria-hidden><NotebookPen size={17} strokeWidth={1.8}/></span>צ׳קים</Link></nav>
    </section>
   </div>
  </div>
 </section>
}
export function HouseholdOutlookPage({plan,asOf}:{plan:any;asOf:string}){const {search}=useLocation(),q=new URLSearchParams(search),anchor=q.get('year')+'-'+String(q.get('month')||'').padStart(2,'0');return <div className="household-page"><HouseholdOutlook plan={plan} asOf={asOf} anchor={anchor} fullPage/></div>}
