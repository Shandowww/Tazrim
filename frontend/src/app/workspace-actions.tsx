import {useLocation} from 'react-router-dom'
import Link from './link'
import {useInterfaceMode} from './interface-mode'
import {modeAllows} from './interface-mode-model'
import {contextualNavigation} from './navigation-sections'
import {withViewQuery} from './navigation-query'
export function WorkspaceActions(){
 const {pathname,search}=useLocation(),{mode}=useInterfaceMode(),group=contextualNavigation.find(group=>group.paths.includes(pathname)),links=group?.links.filter(([path])=>path.split('?')[0]!==pathname&&modeAllows(mode,path))??[]
 if(!group||!links.length)return null
 return <details className="surface workspace-actions rounded-xl p-4"><summary className="min-h-11 cursor-pointer text-sm">{group.label}</summary><nav className="household-account-actions" aria-label={group.label}>{links.map(([path,label])=><Link key={path} href={withViewQuery(path,search,import.meta.env.DEV)}>{label}</Link>)}</nav></details>
}
