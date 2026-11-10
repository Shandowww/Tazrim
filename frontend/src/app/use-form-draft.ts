import {useLayoutEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {FormDraftWriter,formDraftScope,formDraftEnvelope,formValuesMatchShape} from '../../../src/form-drafts.js'
import {nativeVaultSession,vaultGeneration} from './vault-session'
import {useFinancialDraft,useDraftGuard} from './draft-guard'
import type {DraftEntry} from './draft-registry'
import type {BudgetResponse} from './budget-api'

type Input<T>={budgetId:string;base:BudgetResponse;kind:string;record?:string;period?:string;context?:string;values:T;baseline:unknown;restore:(values:T)=>void;enabled?:boolean;mutationPending?:boolean}
/** Raw editor state only. Callers explicitly exclude secrets and reusable approvals. */
export function useFormDraft<T>(entry:DraftEntry,input:Input<T>){
 const {reportNotice}=useDraftGuard()
 const location=useLocation(),scope=formDraftScope({...input,accountId:input.base.accountId}),[view,setView]=useState({ready:false,status:''}),[unresolved,setUnresolved]=useState(false),[reload,setReload]=useState(0),[localSaving,setLocalSaving]=useState(false),writer=useRef<FormDraftWriter|null>(null),latest=useRef(input),entryRef=useRef(entry),mounted=useRef(false),saving=useRef(false),restored=useRef(false),initialRaw=useRef(JSON.stringify(input.values)),scopeRef=useRef(scope),saveToken=useRef<symbol|null>(null)
 latest.current=input;entryRef.current=entry;scopeRef.current=scope
 const baselineKey=JSON.stringify(input.baseline),raw=JSON.stringify(input.values),enabled=input.enabled!==false,edited=raw!==initialRaw.current
 useLayoutEffect(()=>{saving.current=false;saveToken.current=null;setUnresolved(false);setLocalSaving(false)},[scope])
 useLayoutEffect(()=>{
  mounted.current=true;restored.current=false;initialRaw.current=JSON.stringify(input.values);setView({ready:false,status:'בודקים טיוטה במכשיר…'})
  if(!enabled){setView({ready:true,status:''});return()=>{mounted.current=false}}
  const base=input.base,epoch=vaultGeneration(),session=nativeVaultSession(input.budgetId,base),rawAtLoad=JSON.stringify(input.values)
  const instance=new FormDraftWriter({scope,revision:base.revision,baseline:input.baseline,href:'/next'+location.pathname+location.search,key:session?.key,keyId:base.vault?.keyId??'',current:()=>epoch===vaultGeneration()&&(!base.vault||!!session&&session===nativeVaultSession(input.budgetId,base))})
  writer.current=instance
  void instance.ready.then(result=>{
   if(!mounted.current||writer.current!==instance)return
   if(result){
    if(result.conflict||!formValuesMatchShape(result.value.values,input.values)||JSON.stringify(latest.current.values)!==rawAtLoad){instance.conflict=true;setView({ready:true,status:'הטיוטה נשמרה בנפרד: הנתונים או ההרשאות השתנו. אפשר לייצא או להסיר אותה בהגדרות הטיוטות.'});return}
    // Restoration never sets confirmation, prepared commands, or retry state.
    latest.current.restore(result.value.values as T);restored.current=true
   }
   setView({ready:true,status:result?'הטיוטה שוחזרה מהמכשיר':''})
  }).catch(e=>{if(mounted.current&&writer.current===instance)setView({ready:true,status:e instanceof Error?e.message:'לא ניתן לפתוח טיוטה במכשיר.'})})
  return()=>{mounted.current=false;instance.stop();if(writer.current===instance)writer.current=null}
 },[scope,enabled,input.base.revision,baselineKey,reload])
 useLayoutEffect(()=>{if(!enabled||!view.ready||!(entry.dirty||edited)||saving.current)return;const instance=writer.current;if(!instance||instance.conflict)return
  try{instance.stage(input.values)}catch(e){setView(v=>({...v,status:e instanceof Error?e.message:'הטיוטה אינה נתמכת.'}));return}
  const timer=setTimeout(()=>{void persist(instance)},250);return()=>clearTimeout(timer)
 },[raw,view.ready,enabled,entry.dirty,edited,input.base.revision])
 const persist=async(instance=writer.current)=>{if(!instance||scopeRef.current!==scope)return false;try{
  if(instance.loadFailure){const loaded=await instance.retryLoad();if(loaded){instance.conflict=true;throw Error('נמצאה טיוטה קודמת שלא נבדקה. העותק נשמר בנפרד; אפשר לייצא או להסיר אותו בהגדרות.')}}
  instance.stage(latest.current.values);if(mounted.current)setView(v=>({...v,status:'שומר טיוטה במכשיר…'}));await instance.flush()
  if(mounted.current&&writer.current===instance)setView(v=>({...v,status:'טיוטה שמורה במכשיר · טרם נשמרה בתקציב'}));return true
 }catch(e){if(mounted.current&&writer.current===instance)setView(v=>({...v,status:(e instanceof Error?e.message:'לא ניתן לשמור טיוטה במכשיר.')+' יש לשמור או לנסות שוב לפני יציאה.'}));return false}}
 const capture=()=>{if(scopeRef.current!==scope)return null;const instance=writer.current;if(!instance)return null;instance.stage(latest.current.values);return{instance,generation:instance.generation}}
 const confirmSaved=async(snapshot:ReturnType<typeof capture>,message='השמירה בתקציב הושלמה.')=>{if(!snapshot)return;try{await snapshot.instance.remove(snapshot.generation)}catch{reportNotice(message+' ניקוי טיוטת המכשיר נכשל; העותק הישן ידרוש בדיקה בהגדרות הטיוטות.')}}
 const saveWith=async(operation=entryRef.current.save)=>{
  if(saving.current||!operation||scopeRef.current!==scope)return false
  const instance=writer.current,rawAtSave=JSON.stringify(latest.current.values)
  const token=Symbol();saveToken.current=token;saving.current=true;setLocalSaving(true)
  try{
   // Begin the explicit command synchronously so its existing busy/input guards
   // apply immediately. Local storage never delays or authorizes a financial request.
   if(instance&&!instance.conflict)instance.stage(latest.current.values)
   const generation=instance?.generation,result=operation();void result.catch(()=>{})
   if(instance&&!instance.conflict)try{await instance.flush()}catch{}
   const ok=await result
   if(mounted.current&&scopeRef.current===scope)setUnresolved(!ok)
   if(ok&&instance&&generation!==undefined&&(JSON.stringify(latest.current.values)===rawAtSave||!entryRef.current.dirty)){try{const removed=await instance.remove(generation);if(removed&&mounted.current&&writer.current!==instance)setReload(t=>t+1)}catch{reportNotice('השמירה בתקציב הושלמה. ניקוי טיוטת המכשיר נכשל; העותק הישן ידרוש בדיקה בהגדרות הטיוטות.')}}
   return ok
  }catch(e){if(mounted.current&&scopeRef.current===scope)setUnresolved(true);throw e}finally{if(saveToken.current===token){saving.current=false;saveToken.current=null;if(mounted.current&&scopeRef.current===scope)setLocalSaving(false)}}
 }

 const discard=async()=>{if(scopeRef.current!==scope)return false;const instance=writer.current;if(!instance)return false
  try{if(!await instance.remove())return false;if(mounted.current){entryRef.current.discard();setUnresolved(false);setView({ready:true,status:''})}return true}catch(e){if(mounted.current)setView(v=>({...v,status:e instanceof Error?e.message:'לא ניתן להסיר טיוטה.'}));return false}}

 useFinancialDraft({...entry,dirty:entry.dirty||edited,busy:entry.busy||localSaving||!view.ready,save:entry.dirty&&entry.save?()=>saveWith():undefined,mutationPending:input.mutationPending||unresolved,
  local:enabled?{status:view.status,discard,export:()=>formDraftEnvelope(scope,latest.current.base.revision,latest.current.values,latest.current.baseline,'/next'+location.pathname+location.search),restored:restored.current,durable:()=>!saving.current&&!!writer.current&&view.ready&&writer.current.durable()&&JSON.stringify(writer.current.latest)===JSON.stringify(latest.current.values),flush:()=>saving.current?Promise.resolve(false):persist()}:undefined})
 return {save:()=>saveWith(),saveWith,capture,confirmSaved,ready:view.ready,status:view.status}
}
