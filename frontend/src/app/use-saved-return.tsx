import {useEffect,useState,useSyncExternalStore} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {useDraftGuard} from './draft-guard'
import {householdReplaceState,householdSaveDestination} from './household-model'

export function useSavedReturn(scope:string,fallback?:string){
 const location=useLocation(),navigate=useNavigate(),guard=useDraftGuard()
 const draft=useSyncExternalStore(guard.registry.subscribe,guard.registry.getSnapshot,guard.registry.getSnapshot)
 const [saved,setSaved]=useState<{scope:string;origin:string;message:string}|null>(null)
 useEffect(()=>{
  if(!saved||!scope||saved.scope!==scope||saved.origin!==location.pathname+location.search||guard.navigationPending||draft.dirty||draft.busy)return
  const href=householdSaveDestination(location,fallback)
  setSaved(null)
  void navigate(href,{replace:true,state:householdReplaceState(location,href,{savedReturnMessage:saved.message,savedReturnScope:scope})})
 },[saved,scope,location,fallback,navigate,guard.navigationPending,draft.dirty,draft.busy])
 return (message:string)=>setSaved(message?{scope,origin:location.pathname+location.search,message}:null)
}

export function SavedReturnNotice({scope}:{scope:string}){
 const {state}=useLocation()
 return scope&&state?.savedReturnScope===scope&&typeof state.savedReturnMessage==='string'&&state.savedReturnMessage?<p role="status" className="surface mb-4 rounded-xl p-4 text-sm">{state.savedReturnMessage}</p>:null
}
