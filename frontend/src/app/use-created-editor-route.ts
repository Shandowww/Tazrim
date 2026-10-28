import {useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useDraftGuard} from './draft-guard'

/** Only redirect an acknowledged creation after its draft has unregistered.
 * A user's Save and Continue destination takes priority over the edit route. */
export function useCreatedEditorRoute(href:string|null,message:string,scope?:string){
 const navigate=useNavigate(),guard=useDraftGuard()
 useEffect(()=>{
  if(!href||guard.navigationPending)return
  const state=guard.registry.getSnapshot()
  if(!state.dirty&&!state.busy)void navigate(href,{replace:true,state:{setupSavedMessage:message,...(scope?{setupSavedScope:scope}:{})}})
 },[href,message,scope,navigate,guard])
}
