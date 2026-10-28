import {useRef,useState} from 'react'
import {reportStorageDisclosure} from '../../../src/report-inbox-controller.js'
import {AccessError,type BudgetResponse} from './budget-api'
import {consentReportStorage} from './report-library-api'
import {useFinancialDraft} from './draft-guard'
export function ReportStorageConsent({budgetId,base,onSaved,onDenied}:{budgetId:string;base:BudgetResponse;onSaved:(message:string)=>void;onDenied:(message:string)=>void}){
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState(''),flight=useRef(false)
 const save=async()=>{if(flight.current||!confirmed)return false;flight.current=true;setBusy(true);setAttempted(true);setError('');try{const saved=await consentReportStorage(budgetId,base,true);setConfirmed(false);setAttempted(false);onSaved(saved.recovered?'אישור שמירת הדוחות אומת מול המרחב.':'אושרה שמירת הדוחות והתקדמות הבדיקה בתיבה הנפרדת.');return true}catch(e){if(e instanceof AccessError)onDenied(e.message);else setError(e instanceof Error?e.message:'האישור לא נשמר.');return false}finally{flight.current=false;setBusy(false)}}
 useFinancialDraft({kind:'security',dirty:confirmed||attempted,busy,discard:()=>{setConfirmed(false);setAttempted(false);setError('')},save:confirmed?save:undefined})
 return <section className="surface space-y-3 rounded-xl border border-primary p-4"><h2 className="font-semibold">שמירת דוחות בנפרד מהתקציב המוצפן</h2><p className="text-sm">{reportStorageDisclosure}</p><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={confirmed} disabled={busy||attempted} onChange={e=>setConfirmed(e.target.checked)}/>אני בעל המרחב ומאשר שמירת דוחות והתקדמות שהשרת יכול לקרוא</label><button className="min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50" disabled={!confirmed||busy} onClick={()=>void save()}>{busy?'בודקים את האישור…':attempted?'בדיקת אותו אישור שוב':'אישור שמירה נפרדת של דוחות'}</button>{error&&<p role="alert" className="text-sm">{error}</p>}</section>
}
