import {useLocation} from 'react-router-dom'
import {interfaceLayoutCookie,interfaceLayoutHref} from '../../../src/interface-destination.js'
import {useDraftGuard} from './draft-guard'

export function InterfaceLayoutSetting(){
 const {search}=useLocation(),guard=useDraftGuard()
 return <label className="surface flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-xl p-4"><span>סגנון עיצוב</span><select aria-label="סגנון עיצוב" className="min-h-11 rounded-lg border bg-card px-3 text-sm" value="tazrim" onChange={event=>{const layout=event.target.value;if(layout!=='original')return;guard.run(()=>{try{localStorage.setItem('monthly-flow-design',layout)}catch{}document.cookie=interfaceLayoutCookie(layout,location.protocol==='https:');window.location.assign(interfaceLayoutHref(layout,search))})}}><option value="original">העיצוב המקורי</option><option value="tazrim">Tazrim</option></select></label>
}
