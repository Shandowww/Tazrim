import {clone,validatePlan} from '../../../src/budget.js'
import {bankIdentity,bankMovementSource} from '../../../src/bank-import-model.js'
import {loanPaymentCandidates} from './loan-payment-candidates.ts'

/** Enrich exact existing identities only. Never import a movement or recalculate money. */
export async function prepareLoanSourceRecovery(plan:any,id:string,search:string,parsed:any){
 if(!validatePlan(plan)||parsed?.kind!=='bank'||!Array.isArray(parsed.records)||parsed.records.length>30000||parsed.records.some((row:any)=>!row.valid||row.currency!=='ILS'))throw Error('יש לבחור דוח בנק תקין עם תנועות מקור מלאות.')
 const {account,missingSourceRows}=loanPaymentCandidates(plan,id,search),missing=new Map<string,any>(missingSourceRows.map((row:any)=>[row.key,row])),matches=new Map<string,any>(),ambiguous=new Set<string>()
 if(!account||!missing.size)throw Error('אין תנועות חסרות פרטי מקור בחשבון ובתקופה שנבחרו.')
 for(const raw of parsed.records){
  const row=await bankIdentity(raw,account),stored=missing.get(row.key)
  if(!stored||stored.fingerprint!==row.fingerprint||stored.cents!==row.amountCents||stored.month!==row.date?.slice(0,7))continue
  if(matches.has(row.key)){ambiguous.add(row.key);continue}matches.set(row.key,bankMovementSource(row,false))
 }
 const next=clone(plan);let restored=0
 for(const entry of next.bankImport.entries)if(matches.has(entry.key)&&!ambiguous.has(entry.key)){entry.source=matches.get(entry.key);restored++}
 if(!restored)throw Error('לא נמצאה התאמה מדויקת לתנועות החסרות בתקופה שנבחרה. יש לבחור את דוח הבנק המקורי; שום נתון לא שונה.')
 if(!validatePlan(next)||JSON.stringify(next).length>2000000)throw Error('לא ניתן לאמת את פרטי המקור. שום נתון לא שונה.')
 return {plan:next,restored,remaining:missing.size-restored,ambiguous:ambiguous.size}
}
