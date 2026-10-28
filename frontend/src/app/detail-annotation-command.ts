import {annotateExpenseDetail,assignMerchantDisplayName,merchantDisplayName,cents,clone,validatePlan} from '../../../src/budget.js'
import {budgetDetailView} from './detail-adapter.js'
import {moneyInputCents} from './monthly-report.ts'
export interface AnnotationPartDraft{category:string;amount:string;person:string;event:string}
export interface AnnotationDraft{merchant:string;parts:AnnotationPartDraft[]}
export function annotationSource(plan:any,id:string,options:any){
 if(!validatePlan(plan)||!budgetDetailView(plan,options).rows.some((row:any)=>row.sourceId===id))throw Error('הרשומה אינה זמינה במרחב ובתקופה שנבחרו.')
 const source=plan.details?.find((row:any)=>row.id===id);if(!source)throw Error('הפירוט המקורי אינו זמין.');return source
}
export function initialAnnotationDraft(plan:any,id:string,options:any):AnnotationDraft{
 const source=annotationSource(plan,id,options),stored=plan.detailAnnotations?.find((row:any)=>row.detailId===id),parts=stored?.sourceCents===cents(source.amount)?clone(stored.parts):[{category:source.category,cents:cents(source.amount),person:'',event:''}]
 return{merchant:merchantDisplayName(plan,source.name),parts:parts.map((part:any)=>({category:part.category,amount:String(part.cents/100),person:part.person,event:part.event}))}
}
const signed=(raw:string)=>{const text=raw.trim();return text.startsWith('-')?-moneyInputCents(text.slice(1)):moneyInputCents(text)}
export function annotationFingerprint(draft:AnnotationDraft){return JSON.stringify({merchant:draft.merchant.trim(),parts:draft.parts.map(part=>{let amount:any;try{amount=signed(part.amount)}catch{amount={invalid:part.amount}}return{category:part.category.trim(),amount,person:part.person.trim(),event:part.event.trim()}})})}
export function prepareDetailAnnotation(plan:any,id:string,draft:AnnotationDraft,options:any){
 const source=annotationSource(plan,id,options)
 if(!draft||Object.keys(draft).sort().join(',')!=='merchant,parts'||typeof draft.merchant!=='string'||!draft.merchant.trim()||draft.merchant.length>100||!Array.isArray(draft.parts)||draft.parts.length>20)throw Error('יש לבדוק את שם בית העסק והחלקים.')
 const parts=draft.parts.map(part=>{if(!part||Object.keys(part).sort().join(',')!=='amount,category,event,person'||Object.values(part).some(value=>typeof value!=='string'))throw Error('פרטי החלק אינם תקינים.');return{category:part.category.trim(),cents:signed(part.amount),person:part.person.trim(),event:part.event.trim()}})
 let next=annotateExpenseDetail(plan,id,parts)
 if(draft.merchant.trim()!==merchantDisplayName(plan,source.name))next=assignMerchantDisplayName(next,source.name,draft.merchant.trim())
 return next
}
