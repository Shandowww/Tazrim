import {formBudgetFields,offCardTotal,updateBudgetSetting,validatePlan} from '../../../src/budget.js'
export function forecastSettingFields(plan:any):[string,string][] {return [...formBudgetFields(plan).filter(([k]:string[])=>!['personalSaving','sharedSaving','personalInvest','sharedInvest'].includes(k)).map(([k,label]:string[])=>['default-'+k,label] as [string,string]),['default-personalInvest','חשבון פרטי · השקעות'],['default-sharedInvest','חשבון משותף · השקעות']]}
export function initialForecastSettings(plan:any):Record<string,string>{return Object.fromEntries([['settings-startMonth',plan.startMonth],['settings-opening',String(plan.opening)],['settings-buffer',String(plan.buffer)],['settings-horizon',String(plan.horizon)],...forecastSettingFields(plan).map(([name])=>[name,String(name==='default-offCard'?offCardTotal(plan.defaults):plan.defaults[name.slice(8)]??0)])])}
export function prepareForecastSettings(plan:any,draft:Record<string,string>){
 if(!validatePlan(plan))throw Error('התקציב אינו זמין לעריכה.')
 const initial=initialForecastSettings(plan);if(Object.keys(draft).sort().join()!==Object.keys(initial).sort().join()||Object.values(draft).some(v=>typeof v!=='string'||v.length>40))throw Error('יש לבדוק את שדות ההגדרה.')
 let next=plan
 for(const [name,raw] of Object.entries(draft)){if(raw===initial[name])continue
  if(name==='settings-startMonth'){if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(raw)||raw>'2090-12')throw Error('יש לבחור חודש תקין.');next=updateBudgetSetting(next,name,raw);continue}
  const text=raw.trim(),value=text===''?0:Number(text);if(text&&!/^-?\d+(?:\.\d{0,2})?$/.test(text)||!Number.isFinite(value)||Math.abs(value)>(name==='default-offCard'?200000000:100000000)||name!=='settings-opening'&&value<0||name==='settings-horizon'&&![12,24,36,60].includes(value))throw Error('יש לבדוק את הסכומים ומשך התחזית.')
  // Equivalent display edits must not redistribute the original off-card components.
  if(value!==Number(initial[name]))next=updateBudgetSetting(next,name,value)
 }
 if(!validatePlan(next))throw Error('השינוי אינו מתאים לנתונים השמורים. יש לבדוק את חודש ההתחלה, הדיווחים והפריטים המתוכננים.')
 return next
}
