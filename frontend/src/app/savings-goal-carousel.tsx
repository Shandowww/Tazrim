import {useRef,useState,type PointerEvent} from 'react'
import {ChevronLeft,ChevronRight} from 'lucide-react'
import {savingsProjection} from '../../../src/budget.js'
import {SavingsPainting} from './savings-art'
import {savingsIconLabels} from './savings-goal-command'
import {useDraftGuard} from './draft-guard'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
import Link from './link'

type Goal={id:string;name:string;current:number;target:number;monthly:number;icon:string;deadline?:string}
const money=(n:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(n)
const control='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'

/** Original savings presentation: one goal, filling artwork, wrapped arrows and swipe. */
export function SavingsGoalCarousel({goals,asOf,confirmed}:{goals:Goal[];asOf:string;confirmed:boolean}){
 const [selected,setSelected]=useState(goals[0]?.id??'')
 const touch=useRef<{id:number;x:number;y:number}|null>(null)
 const guard=useDraftGuard(),href=usePeriodHref()
 const index=Math.max(0,goals.findIndex(goal=>goal.id===selected)),goal=goals[index]
 const choose=(next:number)=>{if(goals.length)guard.run(()=>setSelected(goals[(next+goals.length)%goals.length].id))}
 const start=(event:PointerEvent<HTMLElement>)=>{
  touch.current=null
  if(!event.isPrimary||event.button!==0||(event.target as HTMLElement).closest('a,button,input,select,textarea,summary,[role=slider]'))return
  touch.current={id:event.pointerId,x:event.clientX,y:event.clientY}
  event.currentTarget.setPointerCapture(event.pointerId)
 }
 const end=(event:PointerEvent<HTMLElement>)=>{
  const initial=touch.current;touch.current=null
  if(!initial||initial.id!==event.pointerId)return
  const dx=event.clientX-initial.x,dy=event.clientY-initial.y
  // Same threshold and RTL direction as the original data-sg-swipe gesture.
  if(Math.abs(dx)>=60&&Math.abs(dx)>=Math.abs(dy)*1.4)choose(index+(dx>0?1:-1))
 }
 if(!goal)return <section className="surface rounded-2xl p-6 text-sm">עדיין אין מטרות. אפשר להוסיף את המטרה הראשונה.</section>
 const projection=savingsProjection(goal.current,goal.target,0,goal.monthly,asOf,true)
 return <section className="surface min-w-0 space-y-4 rounded-3xl p-4 sm:p-6" role="region" aria-roledescription="קרוסלה" aria-label="מטרות החיסכון" tabIndex={0}
  style={{touchAction:'pan-y pinch-zoom'}} onPointerDown={start} onPointerUp={end} onPointerCancel={()=>{touch.current=null}} onLostPointerCapture={()=>{touch.current=null}}
  onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();choose(index+(event.key==='ArrowRight'?1:-1))}}}>
  <div className="flex min-w-0 items-center justify-between gap-3">
   <h2 className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]"><bdi>{goal.name}</bdi></h2>
   <p role="status" aria-live="polite" aria-atomic="true" className="shrink-0 text-xs text-muted-foreground">{index+1} מתוך {goals.length} מטרות</p>
  </div>
  <div className="flex min-w-0 items-center gap-1 sm:gap-4">
   {goals.length>1&&<button type="button" className={control} aria-label="המטרה הבאה" onClick={()=>choose(index+1)}><ChevronRight aria-hidden className="h-5 w-5"/></button>}
   <div className="min-w-0 flex-1"><SavingsPainting icon={goal.icon} current={goal.current} target={goal.target} name={goal.name} confirmed={confirmed}/></div>
   {goals.length>1&&<button type="button" className={control} aria-label="המטרה הקודמת" onClick={()=>choose(index-1)}><ChevronLeft aria-hidden className="h-5 w-5"/></button>}
  </div>
  <p className="text-center tabular-nums"><strong className="text-2xl"><bdi>{money(goal.current)}</bdi></strong><span className="block text-sm text-muted-foreground">מתוך <bdi>{money(goal.target)}</bdi></span></p>
  <p className="text-center text-sm text-muted-foreground">קצב מתוכנן: <bdi>{money(goal.monthly)}</bdi> בחודש. {projection?.count===0?'הסכום המשויך כבר מכסה את היעד.':projection?.month?<>מועד הגעה משוער: <bdi dir="ltr">{projection.month}</bdi></>:'אין מועד הגעה לפי הקצב הזה.'}</p>
  <p className="text-center text-sm text-muted-foreground">{savingsIconLabels[goal.icon]}{goal.deadline?<> · יעד לתאריך <bdi dir="ltr">{goal.deadline}</bdi></>:null}</p>
  {goals.length>1&&<nav aria-label="בחירת מטרת חיסכון" className="max-w-full overflow-x-auto"><div className="mx-auto flex w-max gap-1">{goals.map((item,i)=><button key={item.id} type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={'הצגת המטרה '+item.name} aria-pressed={i===index} onClick={()=>choose(i)}><span aria-hidden className={'h-2 rounded-full bg-primary motion-reduce:transition-none '+(i===index?'w-6':'w-2 opacity-30')}/></button>)}</div></nav>}
  <nav aria-label={'פעולות עבור '+goal.name} className="grid gap-2 sm:grid-cols-3">
   <Link className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm text-primary" href={href('/savings/'+encodeURIComponent(goal.id)+'/edit')}>עריכת מטרה</Link>
   <Link className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm text-primary" href={href('/savings/'+encodeURIComponent(goal.id)+'/deposit')}>דיווח הפקדה</Link>
   <Link className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm text-destructive" href={href('/savings/'+encodeURIComponent(goal.id)+'/remove')}>הסרת מטרה</Link>
  </nav>
 </section>
}
