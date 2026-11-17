import {useEffect,useState,type ReactNode} from 'react'
import {useLocation} from 'react-router-dom'
import {House,Landmark,Target,PanelRightClose,PanelRightOpen,Files,ChartNoAxesCombined,CalendarDays,Settings,CircleHelp,ChevronDown} from 'lucide-react'
import Link from './link'
import {useInterfaceMode} from './interface-mode'
import {withViewQuery} from './navigation-query'
import {visibleNavigation,navigationSection,currentNavigationItem} from './navigation-sections'
const icons={overview:House,accounts:Landmark,reports:Files,spending:ChartNoAxesCombined,planning:CalendarDays,savings:Target,settings:Settings,help:CircleHelp}
export function DesktopNavigation({notifications,controls}:{notifications?:ReactNode;controls:ReactNode}){
 const {pathname,search}=useLocation(),{mode}=useInterfaceMode(),current=navigationSection(pathname)
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('budgit-desktop-navigation')==='collapsed'}catch{return false}})
 const [expanded,setExpanded]=useState<string|null>(current)
 useEffect(()=>setExpanded(current),[current])
 const toggle=()=>setCollapsed(value=>{try{localStorage.setItem('budgit-desktop-navigation',value?'expanded':'collapsed')}catch{}return !value})
 const sections=visibleNavigation(mode),href=(path:string)=>withViewQuery(path,search,import.meta.env.DEV)
 const renderSection=(section:typeof sections[number])=>{
  const Icon=icons[section.key as keyof typeof icons],primary=section.items[0][0],selected=currentNavigationItem(pathname,section),active=current===section.key,open=!collapsed&&expanded===section.key
  const secondary=section.items.slice(1),hasChildren=secondary.length>0||section.tools.length>0
  return <div className="desktop-navigation-section" key={section.key} data-current={active||undefined}>
   <div className="desktop-navigation-row"><Link href={href(primary)} aria-label={section.label} title={collapsed?section.label:undefined} aria-current={active&&selected===primary?'page':undefined}><Icon size={20} aria-hidden/>{!collapsed&&<span>{section.label}</span>}</Link>{!collapsed&&hasChildren&&<button type="button" className="desktop-section-toggle" aria-label={'כלי '+section.label} aria-expanded={open} aria-controls={'desktop-tools-'+section.key} onClick={()=>setExpanded(open?null:section.key)}><ChevronDown size={15} aria-hidden/></button>}</div>
   {hasChildren&&open&&<div id={'desktop-tools-'+section.key} className="desktop-navigation-subnav">{secondary.map(([path,label])=><Link key={path} href={href(path)} aria-current={selected===path?'page':undefined}>{label}</Link>)}{section.tools.length>0&&<details open={section.tools.some(([path])=>selected===path)||undefined}><summary>ניהול וכלים נוספים</summary>{section.tools.map(([path,label])=><Link key={path} href={href(path)} aria-current={selected===path?'page':undefined}>{label}</Link>)}</details>}</div>}
  </div>
 }
 return <aside className="desktop-navigation" data-collapsed={collapsed}>
  <div className="desktop-navigation-heading">
   {!collapsed&&<Link className="desktop-navigation-brand" href={href('/')}>Budgit</Link>}
   {notifications}
   <button type="button" className="desktop-navigation-collapse" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed?'הרחבת תפריט':'צמצום תפריט'}>{collapsed?<PanelRightOpen size={21} aria-hidden/>:<PanelRightClose size={21} aria-hidden/>}</button>
  </div>
  <nav aria-label="ניווט ראשי במחשב">{sections.filter(section=>!['settings','help'].includes(section.key)).map(renderSection)}</nav>
  {!collapsed&&<div className="desktop-navigation-controls">{controls}</div>}
  <nav className="desktop-navigation-footer" aria-label="הגדרות ועזרה">{sections.filter(section=>['settings','help'].includes(section.key)).map(renderSection)}</nav>
 </aside>
}
