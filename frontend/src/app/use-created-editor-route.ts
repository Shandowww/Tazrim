import {useEffect} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {useDraftGuard} from './draft-guard'
import {householdReplaceState} from './household-model'

/** Only redirect an acknowledged creation after its draft has unregistered.
 * A user's Save and Continue destination takes priority over the edit route. */
export function useCreatedEditorRoute(href:string|null,message:string,scope?:string){
 const navigate=useNavigate(),location=useLocation(),guard=useDraftGuard()
 useEffect(()=>{
  if(!href||guard.navigationPending)return
  if(location.pathname+location.search===href&&location.state?.setupSavedMessage===message&&(!scope||location.state?.setupSavedScope===scope))return
  const state=guard.registry.getSnapshot()
  if(!state.dirty&&!state.busy)void navigate(href,{replace:true,state:householdReplaceState(location,href,{setupSavedMessage:message,...(scope?{setupSavedScope:scope}:{})})})
 },[href,message,scope,navigate,guard,location])
}
