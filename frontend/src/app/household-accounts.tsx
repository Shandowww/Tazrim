import {PageHeading} from './page-heading'
import {useEffect,useLayoutEffect,useRef} from 'react'
import {flushSync} from 'react-dom'
import {useLocation,useNavigate} from 'react-router-dom'
import {ChevronLeft,ChevronRight,ShoppingBasket,Pill,Fuel,ShoppingBag,House,Landmark,Tag} from 'lucide-react'
import {networkLabel} from '../tazrim/lib/accounts/brands'
import {NetworkMark} from '../tazrim/components/accounts/network-mark'
import {ProviderLogo,hasProviderLogo} from '../tazrim/components/accounts/provider-logo'
import {householdAccounts,selectedWalletCard,nextWalletCard,walletSwipe,cardDetailCoverage} from './household-accounts-model'
import {householdCategory} from './household-categories'
import {accountWorkflows} from './account-workflows'
import {periodFor} from './detail-period'
import {withViewQuery} from './navigation-query'
import {demoHouseholdPlan} from './demo-fixture'
import type {BudgetState} from './use-budget'
import Link from './link'
const remembered=new Map<string,string>(),money=(n:number|null)=>n===null?'אין דיווח':new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:2}).format(n)
const icons={food:ShoppingBasket,pharmacy:Pill,fuel:Fuel,shopping:ShoppingBag,home:House,loans:Landmark,other:Tag}
function WalletDots({cards,selectedId,select,step}:{cards:Array<{id:string;displayName:string;cardLastFour?:string|null}>;selectedId:string;select:(id:string)=>void;step:(delta:number)=>void}){
 const ref=useRef<HTMLDivElement>(null)
 useLayoutEffect(()=>{
  const rail=ref.current,active=rail?.querySelector<HTMLButtonElement>('[aria-pressed=true]')
  if(!rail||!active)return
  if(rail.contains(document.activeElement))active.focus({preventScroll:true})
  const bounds=rail.getBoundingClientRect(),target=active.getBoundingClientRect()
  rail.scrollBy({left:target.left-bounds.left-(rail.clientWidth-target.width)/2,behavior:'instant'})
 },[selectedId,cards.length])
 return <div ref={ref} role="group" aria-label="בחירת כרטיס">{cards.map(card=><button type="button" key={card.id} onClick={()=>select(card.id)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1)}}} aria-label={'הצגת '+card.displayName+' '+(card.cardLastFour??'')} aria-pressed={selectedId===card.id}><span/></button>)}</div>
}
function Overview({plan,scope,viewer}:{plan:any;scope:string;viewer:boolean}){
 const location=useLocation(),navigate=useNavigate(),period=periodFor(location.search),query=new URLSearchParams(location.search),pointer=useRef<{x:number;y:number;id:number;dragging:boolean}|null>(null),stageRef=useRef<HTMLDivElement>(null),swipeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),pendingScroll=useRef<number|null>(null)
 useEffect(()=>()=>{if(swipeTimer.current)clearTimeout(swipeTimer.current)},[scope,period.year,period.month])
 useLayoutEffect(()=>{
  if(pendingScroll.current===null)return
  window.scrollTo({top:pendingScroll.current,behavior:'instant'})
  pendingScroll.current=null
 },[query.get('walletCard')])
 let view:ReturnType<typeof householdAccounts>
 try{view=householdAccounts(plan,period)}catch{return <section className="surface household-empty" role="alert">לא ניתן להציג את נתוני החשבונות. <Link href={withViewQuery('/upload',location.search,import.meta.env.DEV)}>בדיקת הדוחות</Link></section>}
 const selected=selectedWalletCard(view.cards,query.get('walletCard'),remembered.get(scope))
 const index=selected?view.cards.findIndex(c=>c.id===selected.id):-1
 const href=(path:string)=>withViewQuery(path,location.search,import.meta.env.DEV)
 function resetSwipe(immediate=false){
  const stage=stageRef.current
  if(!stage)return
  stage.dataset.dragging=immediate?'true':'false'
  if(!immediate)void stage.offsetWidth
  stage.style.setProperty('--wallet-drag-x','0px')
  if(immediate)requestAnimationFrame(()=>{if(stage.isConnected)stage.dataset.dragging='false'})
 }
 function select(id:string){
  if(!view.cards.some(c=>c.id===id))return
  if(swipeTimer.current){clearTimeout(swipeTimer.current);swipeTimer.current=null}
  resetSwipe(true)
  pendingScroll.current=window.scrollY
  remembered.set(scope,id)
  if(remembered.size>30)remembered.delete(remembered.keys().next().value!)
  const next=new URLSearchParams(location.search)
  next.set('walletCard',id)
  navigate('/accounts?'+next,{replace:true,state:location.state,preventScrollReset:true})
 }
 function step(delta:number){const id=nextWalletCard(view.cards,selected?.id,delta);if(id)select(id)}
 function finishSwipe(start:{x:number;y:number;id:number;dragging:boolean},end:{x:number;y:number},stage:HTMLDivElement){
  if(!start.dragging)return
  const delta=walletSwipe(start,end),next=delta&&nextWalletCard(view.cards,selected?.id,delta)
  if(!next||next===selected?.id){resetSwipe();return}
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){select(next);return}
  const width=stage.querySelector('.household-wallet-selected')?.getBoundingClientRect().width??stage.clientWidth*.78
  stage.dataset.dragging='false'
  void stage.offsetWidth
  stage.style.setProperty('--wallet-drag-x',`${(delta>0?1:-1)*width*1.01}px`)
  swipeTimer.current=setTimeout(()=>{
   swipeTimer.current=null
   stage.dataset.dragging='true'
   stage.style.setProperty('--wallet-drag-x','0px')
   flushSync(()=>select(next))
   requestAnimationFrame(()=>{if(stage.isConnected)stage.dataset.dragging='false'})
  },220)
 }
 const face=(card:typeof selected)=>card&&<div className="household-card-face" data-bank={card.payer?.provider}>
  <div className="household-card-top">
   {card.payer&&hasProviderLogo(card.payer.provider)?<ProviderLogo provider={card.payer.provider}/>:<span><bdi>{card.payer?.name||'כרטיס אשראי'}</bdi></span>}
   {card.cardLastFour&&<bdi dir="ltr">•••• {card.cardLastFour}</bdi>}
  </div>
  <span className="household-card-name"><bdi dir="auto">{card.displayName}</bdi></span>
  <div className="household-card-bottom">{card.cardNetwork&&<span className="household-card-network" data-network={card.cardNetwork} role="img" aria-label={networkLabel(card.cardNetwork)??card.cardNetwork}><NetworkMark network={card.cardNetwork}/></span>}<div className="household-payer">{card.payer?<span>מחויב מ־<bdi>{card.payer.name}</bdi></span>:<span>אין שיוך לחשבון משלם</span>}{hasProviderLogo(card.issuer)&&<ProviderLogo provider={card.issuer}/>} </div></div>
 </div>
 const peeks=selected&&view.cards.length>1?[{id:nextWalletCard(view.cards,selected.id,-1),side:'right'},...(view.cards.length>2?[{id:nextWalletCard(view.cards,selected.id,1),side:'left'}]:[])]:[]
 const coverage=selected?cardDetailCoverage(selected):null
 return <div className="household-page household-accounts"><div className="household-title"><PageHeading>החשבונות והכרטיסים</PageHeading>{!viewer&&<Link className="household-update" href={href('/accounts/new')}>הוספת חשבון</Link>}</div>
 <section className="household-bank-list" aria-label="חשבונות בנק">{view.banks.map(bank=><article className="surface household-bank" key={bank.id}><div className="household-bank-heading"><ProviderLogo provider={bank.provider}/><div><h2><bdi>{bank.displayName}</bdi></h2>{!hasProviderLogo(bank.provider)&&bank.provider&&<p><bdi>{bank.provider}</bdi></p>}</div></div><div className="household-bank-balance"><span>{bank.balance?<>יתרה ל־<bdi dir="ltr">{bank.balance.date.split('-').reverse().join('.')}</bdi></>:'יתרה לא דווחה בתקופה'}</span><strong><bdi>{money(bank.balance?.value??null)}</bdi></strong></div><details><summary>פרטים ופעולות</summary><nav className="household-account-actions">{accountWorkflows('banks',bank.id,viewer).map(action=><Link href={href(action.href)} key={action.href}>{action.label}</Link>)}</nav></details></article>)}{!view.banks.length&&<p className="surface household-empty">עדיין אין חשבונות בנק במרחב.</p>}</section>
 <section className="household-wallet" aria-roledescription="קרוסלה" aria-label="כרטיסי אשראי">
  <div className="household-title"><h2>כרטיסי האשראי</h2><span>{selected?index+1+' מתוך '+view.cards.length:'אין כרטיסים'}</span></div>
  {selected&&<>
   <div ref={stageRef} className="household-wallet-stage"
    onPointerDown={e=>{
     pointer.current=null
     if(!e.isPrimary||e.button!==0||view.cards.length<2||(e.target as Element).closest('button,a,input,select'))return
     pointer.current={x:e.clientX,y:e.clientY,id:e.pointerId,dragging:false}
     e.currentTarget.setPointerCapture(e.pointerId)
    }}
    onPointerMove={e=>{
     const start=pointer.current
     if(!start||start.id!==e.pointerId)return
     const dx=e.clientX-start.x,dy=e.clientY-start.y
     if(!start.dragging&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.2)start.dragging=true
     if(start.dragging){
      e.currentTarget.dataset.dragging='true'
      const width=e.currentTarget.querySelector('.household-wallet-selected')?.getBoundingClientRect().width??e.currentTarget.clientWidth*.78
      e.currentTarget.style.setProperty('--wallet-drag-x',`${Math.max(-width,Math.min(width,dx))}px`)
     }
    }}
    onPointerUp={e=>{
     const start=pointer.current
     pointer.current=null
     if(!start||start.id!==e.pointerId)return
     if(start.dragging)e.preventDefault()
     finishSwipe(start,{x:e.clientX,y:e.clientY},e.currentTarget)
    }}
    onPointerCancel={()=>{pointer.current=null;resetSwipe()}}
    onLostPointerCapture={e=>{if(pointer.current?.id===e.pointerId){pointer.current=null;resetSwipe()}}}
    onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1)}}}>
    {peeks.map(peek=>{const card=view.cards.find(c=>c.id===peek.id)!;return <button type="button" className={'household-wallet-peek '+peek.side} key={card.id} onClick={()=>select(card.id)} aria-label={'הצגת '+card.displayName+' '+(card.cardLastFour??'')}>{face(card)}</button>})}
    <div className="household-wallet-selected" role="group" aria-label={selected.displayName+' '+(selected.cardLastFour??'')}>{face(selected)}</div>
   </div>
   <div className="household-wallet-controls"><button type="button" onClick={()=>step(1)} disabled={view.cards.length<2} aria-label="הכרטיס הבא"><ChevronRight size={20}/></button><WalletDots cards={view.cards} selectedId={selected.id} select={select} step={step}/><button type="button" onClick={()=>step(-1)} disabled={view.cards.length<2} aria-label="הכרטיס הקודם"><ChevronLeft size={20}/></button></div>
   <p className="household-wallet-total">{view.cards.every(c=>c.total!==null)?<>סה״כ בכרטיסים בתקופה: <bdi>{money(view.cards.reduce((s,c)=>s+(c.total??0),0))}</bdi></>:'חסר דיווח בחלק מהכרטיסים'}</p>
  </>}
  {!viewer&&<Link className="household-back" href={href('/card-setup/new')}>הוספת כרטיס</Link>}
 </section>
 {selected&&<section className="surface household-card-detail" aria-live="polite"><div className="household-title"><h2><bdi>{selected.displayName}</bdi>{selected.cardLastFour&&<> · <bdi>{selected.cardLastFour}</bdi></>}</h2><strong><bdi>{money(selected.total)}</bdi></strong></div><p className="household-detail-period">{period.month?period.year+'-'+period.month:'שנת '+period.year}</p>{selected.details.categories.map((row:{category:string;cents:number})=>{const category=householdCategory(row.category,plan),Icon=icons[category.kind as keyof typeof icons];return <Link className="household-category-row" key={row.category} href={href('/categories?card='+encodeURIComponent(selected.id)+'&category='+encodeURIComponent(row.category))}><span style={{color:category.color,background:`color-mix(in srgb, ${category.color} 14%, transparent)`}}><Icon size={19}/></span><span>{row.category}</span><bdi>{money(row.cents/100)}</bdi></Link>})}{coverage?.remainder!=null&&coverage.remainder!==0&&<p className="household-detail-note">{coverage.remainder>=0?'ללא פירוט: ':'הפירוט חורג מסך החיוב ב־'}<bdi>{money(Math.abs(coverage.remainder))}</bdi></p>}{coverage?.detailed===null&&<p className="household-detail-note">אין פירוט שנפרע לתקופה זו.</p>}<details><summary>פרטים ופעולות</summary><nav className="household-account-actions">{accountWorkflows('cards',selected.id,viewer).map(action=><Link href={href(action.href)} key={action.href}>{action.label}</Link>)}</nav></details></section>}
 <details className="surface household-bank"><summary>ניהול חשבונות ודוחות</summary><nav className="household-account-actions">{accountWorkflows('banks','',viewer).concat(accountWorkflows('cards','',viewer)).filter((a,i,all)=>all.findIndex(b=>b.href===a.href)===i).map(action=><Link href={href(action.href)} key={action.href}>{action.label}</Link>)}</nav></details></div>
}
export function HouseholdAccountsPage({budget,fixture}:{budget:BudgetState;fixture:boolean}){
 const {search}=useLocation()
 if(fixture)return <Overview key="demo" plan={demoHouseholdPlan} scope="demo" viewer/>
 if(budget.status==='loading')return <p role="status">טוען חשבונות…</p>
 if(budget.status==='error')return <p role="alert">{budget.message}</p>
 if(!budget.value.plan)return <section className="surface household-empty"><p>עדיין אין תקציב שמור.</p><Link className="household-back" href={withViewQuery('/upload',search,import.meta.env.DEV)}>התחלה מדוח</Link><Link className="household-back" href={withViewQuery('/start',search,import.meta.env.DEV)}>הגדרה ידנית</Link></section>
 if(budget.value.plan.format)return <p>יש לפתוח את התקציב המוצפן.</p>
 return <Overview key={budget.value.accountId+'/'+budget.budgetId} plan={budget.value.plan} scope={budget.value.accountId+'/'+budget.budgetId} viewer={budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'}/>
}
