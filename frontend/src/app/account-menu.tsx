import {useEffect, useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {useLocation} from 'react-router-dom'
import {BookOpen, ChevronLeft, FolderOpen, HelpCircle, Settings, Upload, UserRound, X} from 'lucide-react'
import Link from './link'
import {withViewQuery} from './navigation-query'

/** Secondary destinations live with the account, leaving the phone bar for pages. */
export function AccountMenu({email}: {email?: string}) {
  const [open,setOpen]=useState(false)
  const {pathname,search}=useLocation()
  useEffect(()=>setOpen(false),[pathname,search])
  const initial=email?.trim().charAt(0).toLocaleUpperCase() || null
  const links=[
    ['/incoming','מרכז הדוחות',FolderOpen],
    ['/upload','העלאת דוחות',Upload],
    ['/more','כל הכלים',BookOpen],
    ['/settings','הגדרות',Settings],
    ['/about','עזרה',HelpCircle],
  ] as const
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="household-account-trigger" aria-label={email?`תפריט חשבון: ${email}`:'תפריט חשבון'} title="תפריט חשבון">
      {initial?<span aria-hidden>{initial}</span>:<UserRound aria-hidden size={20}/>}
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="household-account-scrim"/>
      <Dialog.Content dir="rtl" className="household-account-card" aria-describedby={undefined}>
        <div className="household-account-card-head">
          <div className="household-account-avatar" aria-hidden>{initial||<UserRound size={22}/>}</div>
          <div className="min-w-0 flex-1"><Dialog.Title>החשבון שלי</Dialog.Title><p dir="auto" className="truncate text-sm text-muted-foreground">{email||'מצב הדגמה'}</p></div>
          <Dialog.Close className="household-account-close" aria-label="סגירת תפריט חשבון"><X size={18}/></Dialog.Close>
        </div>
        <nav aria-label="כלים והגדרות">
          {links.map(([href,label,Icon])=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} onClick={()=>setOpen(false)} className="household-account-link"><Icon size={19} aria-hidden/><span>{label}</span><ChevronLeft size={17} aria-hidden/></Link>)}
        </nav>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
