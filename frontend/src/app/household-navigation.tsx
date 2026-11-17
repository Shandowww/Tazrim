import {useState} from 'react'
import {useLocation} from 'react-router-dom'
import {House, Landmark, Target, ListTodo, Tags, ChevronLeft, Search} from 'lucide-react'
import {PageHeading} from './page-heading'
import {useInterfaceMode, InterfaceModeSelector} from './interface-mode'
import {modeAllows} from './interface-mode-model'
import {mainPages, returnDestination, householdTrail, householdFallback} from './household-model'
import {withViewQuery} from './navigation-query'
import {toolGroups} from './tool-catalog'
import Link from './link'
import BackLink from './back-link'

export function HouseholdBack(){
 const location=useLocation()
 if(mainPages.includes(location.pathname))return null
 const fallback=householdFallback(location.pathname,location.search)
 const trail=householdTrail(location.state,location.search)
 const target=returnDestination(trail.at(-1)??withViewQuery(fallback,location.search),location.search)
 return <BackLink iconOnly replace state={{householdTrail:trail.slice(0,-1)}} href={withViewQuery(target,location.search,import.meta.env.DEV)}>חזרה</BackLink>
}

const tabs=[
 {href:'/',label:'ראשי',icon:House},
 {href:'/accounts',label:'חשבונות',icon:Landmark},
 {href:'/plans',label:'תכנון',icon:ListTodo},
 {href:'/savings',label:'מטרות',icon:Target},
 {href:'/categories',label:'קטגוריות',icon:Tags},
]

function activeTab(pathname:string){
 if(pathname==='/')return '/'
 if(/^\/(accounts|banks|cards|card-setup)(\/|$)/.test(pathname))return '/accounts'
 if(/^\/(plans|income|monthly|recurring|loans|checks)(\/|$)/.test(pathname))return '/plans'
 if(/^\/(savings|investment)(\/|$)/.test(pathname))return '/savings'
 if(/^\/categories(\/|$)/.test(pathname))return '/categories'
 return ''
}

/** Only destinations with their own page appear in the phone bar. */
export function HouseholdNavigation(){
 const {pathname,search}=useLocation()
 const {mode}=useInterfaceMode()
 const active=activeTab(pathname)
 return <nav className="household-tabs md:hidden" aria-label="ניווט ראשי">{tabs.filter(tab=>modeAllows(mode,tab.href)).map(({href,label,icon:Icon})=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} aria-label={label} aria-current={active===href?'page':undefined}><Icon size={24} strokeWidth={active===href?2.2:1.8} aria-hidden/><span className="sr-only">{label}</span></Link>)}</nav>
}

/** One searchable home for the actions that do not need a permanent tab. */
export function HouseholdMore(){
 const location=useLocation()
 const {mode}=useInterfaceMode()
 const [query,setQuery]=useState('')
 const needle=query.trim().toLocaleLowerCase('he')
 const visible=toolGroups.map(group=>({title:group.title,items:group.items.filter(([href,label])=>modeAllows(mode,href)&&(!needle||label.toLocaleLowerCase('he').includes(needle)||group.title.toLocaleLowerCase('he').includes(needle)))})).filter(group=>group.items.length)
 return <div className="household-page household-tools">
  <PageHeading>כל הכלים</PageHeading>
  <p className="text-sm text-muted-foreground">תכנון, דוחות, ניהול ופרטיות במקום אחד.</p>
  <label className="household-tools-search"><Search size={19} aria-hidden/><span className="sr-only">חיפוש כלי</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="חיפוש כלי" autoComplete="off"/></label>
  <InterfaceModeSelector/>
  {visible.length?<div className="household-tools-grid">{visible.map(group=><section className="surface household-tools-group" key={group.title}><h2>{group.title}</h2><nav aria-label={group.title}>{group.items.map(([href,label])=><Link key={href} href={withViewQuery(href,location.search,import.meta.env.DEV)} state={{householdFrom:location.pathname+location.search}}><span>{label}</span><ChevronLeft size={17} aria-hidden/></Link>)}</nav></section>)}</div>:<p className="surface rounded-2xl p-4 text-sm">לא נמצאו כלים תואמים במצב התצוגה הנבחר.</p>}
 </div>
}
