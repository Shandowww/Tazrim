import {useEffect, useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {useLocation} from 'react-router-dom'
import {Check, ChevronLeft, FolderOpen, RefreshCw, Settings, Upload, UserRound, X} from 'lucide-react'
import Link from './link'
import {withViewQuery} from './navigation-query'
import {SignOutForm} from './session-controls'
import type {BudgetSpace} from './use-budget'

/** Secondary destinations live with the account, leaving the phone bar for pages. */
type AccountMenuProps = {
  spaces: BudgetSpace[]
  budgetId: string
  selectBudget: (id: string) => void
  email?: string
  demo?: boolean
  refreshApp: () => void
  refreshPending: boolean
}

export function AccountMenu({spaces,budgetId,selectBudget,email,demo=false,refreshApp,refreshPending}: AccountMenuProps) {
  const [open,setOpen]=useState(false)
  const {pathname,search}=useLocation()
  useEffect(()=>setOpen(false),[pathname,search])
  useEffect(()=>{
    const desktop=window.matchMedia('(min-width: 768px)')
    const closeOnDesktop=()=>{if(desktop.matches)setOpen(false)}
    desktop.addEventListener('change',closeOnDesktop)
    return ()=>desktop.removeEventListener('change',closeOnDesktop)
  },[])
  const initial=email?.trim().charAt(0).toLocaleUpperCase() || null
  const links=[
    ['/incoming','מרכז הדוחות',FolderOpen],
    ['/upload','העלאת דוחות',Upload],
    ['/settings','הגדרות',Settings],
  ] as const
  return <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="household-account-trigger" aria-label={email?`תפריט חשבון: ${email}`:'תפריט חשבון'} title="תפריט חשבון">
      {initial?<span aria-hidden>{initial}</span>:<UserRound aria-hidden size={20}/>}
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Content dir="rtl" className="household-account-card" aria-describedby={undefined}>
        <div className="household-account-card-head">
          <div className="household-account-avatar" aria-hidden>{initial||<UserRound size={22}/>}</div>
          <div className="min-w-0 flex-1"><Dialog.Title>החשבון שלי</Dialog.Title><p className="truncate text-sm text-muted-foreground">{email?<bdi dir="ltr">{email}</bdi>:demo?'מצב הדגמה':'חשבון מחובר'}</p></div>
          <Dialog.Close className="household-account-close" aria-label="סגירת תפריט חשבון"><X size={18}/></Dialog.Close>
        </div>
        {spaces.length>0&&<section className="household-account-spaces" aria-label="מרחב תקציב">
          <p>מרחב תקציב</p>
          {spaces.map(space=>{
            const current=space.id===budgetId
            const name=space.id==='personal'?'אישי':space.name
            const content=<><span><bdi>{name}</bdi>{space.role==='viewer'&&<small>צפייה בלבד</small>}</span>{current&&<Check size={18} aria-hidden/>}</>
            return spaces.length===1
              ? <div key={space.id} className="household-account-space" data-current={current}>{content}</div>
              : <button key={space.id} type="button" className="household-account-space" data-current={current} aria-pressed={current} onClick={()=>{setOpen(false);selectBudget(space.id)}}>{content}</button>
          })}
        </section>}
        <nav aria-label="כלים והגדרות">
          {links.map(([href,label,Icon])=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} onClick={()=>setOpen(false)} className="household-account-link"><Icon size={19} aria-hidden/><span>{label}</span><ChevronLeft size={17} aria-hidden/></Link>)}
        </nav>
        <button type="button" className="household-account-link w-full text-start disabled:opacity-50" disabled={refreshPending&&!demo} onClick={()=>{setOpen(false);refreshApp()}}>
          <RefreshCw size={19} aria-hidden/><span>{refreshPending&&!demo?'מרעננים…':'רענון האפליקציה והנתונים'}</span>
        </button>
        {!demo&&<SignOutForm compact/>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
