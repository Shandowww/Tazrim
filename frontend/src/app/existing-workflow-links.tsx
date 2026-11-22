import {useEffect,useState} from 'react'
import {useInterfaceMode} from './interface-mode'
import {modeAllows} from './interface-mode-model'
import {useLocation} from 'react-router-dom'
import {withViewQuery} from './navigation-query'
import {loadExpectations} from './report-expectations-api'
import {loadWallet} from './wallet-api'
import type {BudgetState} from './use-budget'
import Link from './link'
const groups=[
 {label:'חשבון ושיתוף',links:[['/settings/profile','פרופיל והחשבון המחובר'],['/settings/spaces','מרחבים ושיתוף']]},
 {label:'פרטיות ושחזור',links:[['/settings/security','הצפנה, נעילה ושחזור'],['/settings/device-draft','טיוטות במכשיר'],['/settings/history','יומן שינויים וגיבוי']]},
 {label:'חיבורים',links:[['/settings/purchase-notes','פתקי קנייה'],['/settings/gmail','חיבור Gmail'],['/incoming?sync=settings','מקורות דוחות ותזמון']]},
]
/** Settings reads existing capability facts only. Financial ownership is not server administration. */
export function ExistingWorkflowLinks({budget,fixture}:{budget:BudgetState;fixture:boolean}){
 const {search}=useLocation(),{mode}=useInterfaceMode(),[facts,setFacts]=useState<{scope:string;admin:boolean;wallet:boolean;failed:boolean}|null>(null),[retry,setRetry]=useState(0)
 const actor=budget.status==='ready'?budget.value:null,scope=actor?actor.accountId+'/'+budget.budgetId:'',viewer=budget.status==='ready'&&budget.spaces.find(space=>space.id===budget.budgetId)?.role==='viewer'
 useEffect(()=>{
  setFacts(null);if(!actor||fixture)return
  let active=true
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000)
  void Promise.allSettled([loadExpectations(budget.budgetId,actor,c.signal),viewer?Promise.resolve(null):loadWallet(budget.budgetId,actor,new Date().toISOString().slice(0,7),c.signal)]).then(([actions,wallet])=>{
   if(active&&!c.signal.aborted)setFacts({scope,admin:actions.status==='fulfilled'&&actions.value.actions.backupAdmin===true,wallet:wallet.status==='fulfilled'&&!!wallet.value?.connections.some(connection=>!connection.revoked),failed:actions.status==='rejected'||wallet.status==='rejected'})
  }).finally(()=>clearTimeout(timer))
  c.signal.addEventListener('abort',()=>{if(active)setFacts(previous=>previous??{scope,admin:false,wallet:false,failed:true})},{once:true})
  return()=>{active=false;clearTimeout(timer);c.abort()}
 },[scope,actor?.accountEmail,fixture,viewer,retry])
 const current=facts?.scope===scope?facts:null,visible=groups.map(group=>({...group,links:group.links.filter(([path])=>modeAllows(mode,path))})).filter(group=>group.links.length)
 return <section className="surface household-bank"><h2 className="font-semibold">הגדרות נוספות</h2>{visible.map(group=><details key={group.label}><summary className="min-h-11 py-3 text-sm">{group.label}</summary><ul className="divide-y">{group.links.map(([path,label])=><li key={path}><Link className="flex min-h-11 items-center py-2 text-sm text-primary" href={withViewQuery(path,search,import.meta.env.DEV)}>{label}</Link></li>)}</ul>{group.label==='חיבורים'&&current?.wallet&&<Link className="flex min-h-11 items-center text-sm text-primary" href={withViewQuery('/settings/wallet',search,import.meta.env.DEV)}>ניהול חיבורי Wallet קיימים</Link>}</details>)}{current?.admin&&<details><summary className="min-h-11 py-3 text-sm">ניהול השרת</summary><Link className="flex min-h-11 items-center text-sm text-primary" href={withViewQuery('/settings/drive',search,import.meta.env.DEV)}>גיבוי ב־Google Drive</Link><Link className="flex min-h-11 items-center text-sm text-primary" href={withViewQuery('/settings/access',search,import.meta.env.DEV)}>ניהול כניסה לשרת</Link></details>}{current?.failed&&<p role="status" className="text-sm text-muted-foreground">לא ניתן לבדוק את כל החיבורים וההרשאות. <button type="button" className="min-h-11 text-primary underline" onClick={()=>setRetry(value=>value+1)}>בדיקה שוב</button></p>}</section>
}
