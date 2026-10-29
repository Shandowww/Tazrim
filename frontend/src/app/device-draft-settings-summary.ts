import {formBudgetFields,offCardTotal,validatePlan} from '../../../src/budget.js'
import {comparisonLabels} from './comparison-goals-command.ts'
export type DraftSettingChange={id:string;label:string;before:string|number;after:string|number;money:boolean}
/** Read-only presentation of the same original settings fields; no totals or mutations. */
export function deviceDraftSettingChanges(before:any,after:any):DraftSettingChange[]{
 if(!validatePlan(before)||!validatePlan(after))return[]
 const rows:DraftSettingChange[]=[],add=(id:string,label:string,a:string|number,b:string|number,money=false)=>{if(a!==b)rows.push({id,label,before:a,after:b,money})}
 add('profile','שם לתצוגה',before.profileName??'',after.profileName??'');add('month','תחילת התכנון',before.startMonth,after.startMonth);add('opening','יתרת פתיחה',before.opening,after.opening,true);add('buffer','יתרת ביטחון',before.buffer,after.buffer,true);add('horizon','משך התחזית · חודשים',before.horizon,after.horizon)
 const fields=new Map<string,string>([...formBudgetFields(before),...formBudgetFields(after)].map(([key,label]:string[])=>[key,label]))
 for(const [key,label]of fields){const a=key==='offCard'?offCardTotal(before.defaults):before.defaults[key]??0,b=key==='offCard'?offCardTotal(after.defaults):after.defaults[key]??0;add('default-'+key,'הערכה חודשית · '+label,a,b,true)}
 for(const [key,label]of Object.entries(comparisonLabels))add('goal-'+key,(key==='spending'?'תקרת הוצאות':'יעד '+label)+' לחודש',before.goals?.[key]??0,after.goals?.[key]??0,true)
 return rows
}
