import {useEffect,useRef,useState} from 'react'
import {originalDeviceWriter,originalPlanPayload} from './device-draft-writer'
import type {BudgetResponse} from './budget-api'
/** Full valid plans only, using the original encrypted device payload and writer. */
export function usePlanDeviceDraft(input:{budgetId:string;base:BudgetResponse;month:string;dirty:boolean;busy:boolean;enabled:boolean;value:string;prepare:()=>any}){
 const [status,setStatus]=useState(''),writer=useRef<ReturnType<typeof originalDeviceWriter>|null>(null),prepare=useRef(input.prepare);prepare.current=input.prepare
 useEffect(()=>{if(!input.enabled)return;const instance=originalDeviceWriter(input.budgetId,input.base,(plan:any)=>originalPlanPayload(input.base,plan,input.month));writer.current=instance;return()=>{instance.stop();writer.current=null}},[input.budgetId,input.base,input.month,input.enabled])
 useEffect(()=>{if(!input.enabled||!input.dirty||input.busy)return;let active=true;setStatus('שומר טיוטה במכשיר…');const timer=setTimeout(()=>{let plan;try{plan=prepare.current()}catch{setStatus('השדות עדיין אינם שלמים. יש להשלים אותם לפני יציאה; העותק המקומי הקודם נשמר.');return}void writer.current?.write(plan).then(()=>{if(active)setStatus('טיוטה מוצפנת שמורה במכשיר · טרם נשמרה בתקציב')}).catch(e=>{if(active)setStatus(e instanceof Error?e.message:'לא ניתן לשמור טיוטה במכשיר. יש לשמור לפני יציאה.')})},250);return()=>{active=false;clearTimeout(timer)}},[input.value,input.dirty,input.busy,input.enabled,input.base,input.month])
 return input.dirty?status:''
}
