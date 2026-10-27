import {createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react'
import {useBlocker,type BlockerFunction} from 'react-router-dom'
import {DraftRegistry,type DraftEntry} from './draft-registry'
import {ConfirmDialog} from '../tazrim/components/ui/confirm-dialog'
const Context=createContext<{registry:DraftRegistry;run:(action:()=>void)=>void}|null>(null)
export function useDraftGuard(){const value=useContext(Context);if(!value)throw Error('Draft guard provider missing');return value}
export function useFinancialDraft(entry:DraftEntry){const {registry}=useDraftGuard(),id=useId();useLayoutEffect(()=>{registry.set(id,entry)});useLayoutEffect(()=>()=>registry.remove(id),[registry,id])}
type Pending={proceed:()=>void;cancel?:()=>void}
export function DraftGuardProvider({children}:{children:ReactNode}){
 const [registry]=useState(()=>new DraftRegistry()),state=useSyncExternalStore(registry.subscribe,registry.getSnapshot),pendingRef=useRef<Pending|null>(null),[pending,setPending]=useState<Pending|null>(null),[error,setError]=useState<string|null>(null)
 const begin=useCallback((request:Pending)=>{if(pendingRef.current)return;pendingRef.current=request;setPending(request);setError(null)},[])
 const run=useCallback((action:()=>void)=>{const current=registry.getSnapshot();if(current.dirty||current.busy)begin({proceed:action});else action()},[registry,begin])
 const blocker=useBlocker(useCallback<BlockerFunction>(({currentLocation,nextLocation})=>{const current=registry.getSnapshot();return(current.dirty||current.busy)&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search||currentLocation.hash!==nextLocation.hash)},[registry]))
 useEffect(()=>{if(blocker.state==='blocked')begin({proceed:blocker.proceed,cancel:blocker.reset})},[blocker,begin])
 const cancel=()=>{const current=pendingRef.current;pendingRef.current=null;setPending(null);setError(null);current?.cancel?.()}
 const proceed=()=>{const current=pendingRef.current;pendingRef.current=null;setPending(null);setError(null);current?.proceed()}
 useEffect(()=>{
  const unload=(event:BeforeUnloadEvent)=>{const current=registry.getSnapshot();if(current.dirty||current.busy){event.preventDefault();event.returnValue=''}}
  const anchor=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const element=event.target instanceof Element?event.target.closest('a[href]'):null;if(!(element instanceof HTMLAnchorElement)||element.hasAttribute('download')||element.target&&element.target!=='_self')return;const url=new URL(element.href);if(!['http:','https:'].includes(url.protocol))return;const current=registry.getSnapshot();if(current.dirty||current.busy){event.preventDefault();run(()=>window.location.assign(url.href))}}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',anchor)
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',anchor)}
 },[registry,run])
 useEffect(()=>{if(pending&&!state.dirty&&!state.busy)proceed()},[pending,state.dirty,state.busy])
 const save=async()=>{const request=pendingRef.current;setError(null);try{if(!await registry.saveAll()){setError('השינויים לא נשמרו. הטיוטה נשארה פתוחה; אפשר לתקן או לנסות שוב.');return}if(pendingRef.current===request)proceed()}catch{setError('השינויים לא נשמרו. הטיוטה נשארה פתוחה.')}}
 return <Context.Provider value={{registry,run}}>{children}<ConfirmDialog open={!!pending} onOpenChange={open=>{if(!open)cancel()}} onConfirm={()=>{void save()}} title="יש שינויים שעדיין לא נשמרו" description={state.busy?'השמירה עדיין בתהליך. יש להמתין לתוצאה לפני מעבר.':'אפשר לשמור ולהמשיך, לצאת בלי לשמור, או להישאר עם הטיוטה.'} busy={state.busy} confirmDisabled={!state.canSave} error={error}><button type="button" className="w-full rounded-xl border px-4 py-3 text-sm text-destructive disabled:opacity-50" disabled={state.busy} onClick={()=>{if(registry.discardAll())proceed()}}>יציאה ללא שמירה</button></ConfirmDialog></Context.Provider>
}
