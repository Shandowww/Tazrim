import {ArrowDownLeft,Landmark,NotebookPen,ShoppingBag} from 'lucide-react'
import {useLocation} from 'react-router-dom'
import Link from './link'
import {useInterfaceMode} from './interface-mode'
import {visibleNavigation,navigationSection,currentNavigationItem} from './navigation-sections'
import {withViewQuery} from './navigation-query'
const workspacePages=['/accounts','/accounts/transfers','/incoming','/upload','/upload/history','/monthly','/notices','/settings/report-expectations','/categories','/search','/analysis','/recurring','/plans','/income','/loans','/checks','/plans/scenario','/savings','/savings/accounts','/savings/allocation','/savings/transfers','/savings/schedule']
const planningIcons:Partial<Record<string,typeof ShoppingBag>>={
 '/plans':ShoppingBag,'/income':ArrowDownLeft,'/loans':Landmark,'/checks':NotebookPen,
}
/** Phone task tools replace the long, flat More menu; desktop keeps them in its active sidebar group. */
export function WorkspaceNavigation(){
 const {pathname,search}=useLocation(),{mode}=useInterfaceMode(),section=visibleNavigation(mode).find(section=>section.key===navigationSection(pathname))
 if(!section||section.items.length+section.tools.length<2||!workspacePages.includes(pathname))return null
 const selected=currentNavigationItem(pathname,section),href=(path:string)=>withViewQuery(path,search,import.meta.env.DEV)
 return <nav className="workspace-navigation" data-section={section.key} aria-label={'כלי '+section.label} data-tab-swipe-ignore>{section.items.map(([path,label])=>{
  const Icon=section.key==='planning'?planningIcons[path]:undefined
  return <Link href={href(path)} key={path} aria-current={selected===path?'page':undefined}>
   {Icon?<><Icon size={20} aria-hidden/><span>{label}</span></>:label}
  </Link>
 })}{section.tools.length>0&&<details open={section.tools.some(([path])=>selected===path)||undefined}><summary>כלים נוספים</summary>{section.tools.map(([path,label])=><Link href={href(path)} key={path} aria-current={selected===path?'page':undefined}>{label}</Link>)}</details>}</nav>
}
