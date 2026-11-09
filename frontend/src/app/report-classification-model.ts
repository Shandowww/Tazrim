import {budgetFields, creditCards} from '../../../src/budget.js'
import {inboxBankGroupKey} from '../../../src/report-inbox-controller.js'
import {statementMerchant} from '../../../src/card-statement-model.js'
import type {ReviewStep} from './report-guided-review'

export type ReviewCheck={id:string;step:ReviewStep;label:string;source:string;row?:any;month?:string}
export const classificationRowId=(item:number,row:number)=>`report-classification-${item}-${row}`
export const matchReviewId=(item:number,id:string|number)=>`report-match-${item}-${encodeURIComponent(String(id))}`
export const exceptionId=(item:number,question:number)=>`report-check-${item}-${question}`
export const categoryMissing=(value:unknown)=>!String(value??'').trim()||value==='לסיווג'
export function bankClassificationOptions(plan:any,rows:any[]){
 const cards=creditCards(plan)
 return [...budgetFields(plan),['exclude','ללא השפעה על התקציב']].filter(([key]:string[])=>!key.startsWith('card')||cards.some((card:any)=>card.id===key)).filter(([key]:string[])=>rows.every(row=>['salary','otherIncome','incomingTransfers'].includes(key)?row.amountCents>0:key!=='outgoingTransfers'||row.amountCents<0))
}
/** Read-only presentation of the original controller. Does not decide or apply any movement. */
export function reportClassificationRows(review:any){
 return (review?.items??[]).map((item:any,itemIndex:number)=>{
  const rows=item.preview?.rows??(item.kind==='bank'?item.records:item.report?.entries?.map((entry:any)=>({entry})))??[]
  return {item,itemIndex,rows:rows.map((row:any,rowIndex:number)=>{
   const key=item.kind==='bank'?inboxBankGroupKey(item,row):statementMerchant(row.entry?.merchant)
   const groupIndex=item.kind==='bank'?(review.bankReviewGroups??[]).findIndex((group:any)=>group.key===key):-1
   const group=item.kind==='bank'?review.bankReviewGroups?.[groupIndex]:review.cardGroups?.find((group:any)=>group.key===key)
   const current=item.kind==='bank'?row.field:row.existing?.category??(review.categoryChoices.has(key)?review.categoryChoices.get(key):group?.category??row.category)
   const questionIndex=(item.questions??[]).findIndex((q:any)=>q.row&&(item.kind==='bank'?q.row.line===row.line:q.row.id===row.id))
   const monthQuestion=(item.questions??[]).findIndex((q:any)=>q.month===row.date?.slice(0,7))
   const contextQuestion=(item.questions??[]).findIndex((q:any)=>q.type==='statement-conflict'||row.state==='invalid'&&q.type==='invalid')
   const checkIndex=questionIndex>=0?questionIndex:monthQuestion>=0?monthQuestion:contextQuestion
   const match=(item.matchReviews??[]).find((match:any)=>match.id===String(item.kind==='bank'?row.line:row.id))
   const editable=!item.skip&&!item.already&&(item.kind==='bank'?row.state==='new'&&groupIndex>=0:!row.existing&&!!group)
   const status=item.skip?'מחוץ לקליטה':item.statementConflict?'נדרשת השוואה לדוח שכבר נשמר':row.state==='conflict'?'נדרשת בדיקת התאמה':row.state==='migrated'?'מקור ממעבר חשבון — הקליטה חסומה':row.state==='invalid'?'נדרשת בדיקת נתוני המקור':row.existing||['duplicate','duplicate-file'].includes(row.state)||item.already?'כבר קיים בתקציב':item.kind==='bank'?groupIndex<0?'החודש מחוץ לקליטה':review.bankChoices.has(key)?'סיווג שבחרת':row.reviewed?'סווג אוטומטית':current?'הצעה לאישור':'נדרש סיווג':review.categoryChoices.has(key)?'קטגוריה שבחרת':categoryMissing(current)?'קטגוריה להשלמה':'קטגוריה מוצעת'
   return {row,rowIndex,id:classificationRowId(itemIndex,rowIndex),key,groupIndex,group,current,status,editable,checkId:match?matchReviewId(itemIndex,match.id):checkIndex>=0?exceptionId(itemIndex,checkIndex):null}
  })}
 })
}
export function optionalCategoryCounts(review:any){
 const rows=(review?.cardGroups??[]).flatMap((group:any)=>group.rows.map(()=>review.categoryChoices.has(group.key)?review.categoryChoices.get(group.key):group.category))
 return {total:rows.length,missing:rows.filter(categoryMissing).length,classified:rows.filter((value:unknown)=>!categoryMissing(value)).length}
}
export function reportReviewChecks(review:any):ReviewCheck[]{
 const result:ReviewCheck[]=[]
 for(const group of review?.bankGroups??[]){
  const index=review.items.findIndex((item:any)=>(item.preview?.rows??[]).some((row:any)=>row.state==='new'&&!row.reviewed&&inboxBankGroupKey(item,row)===group.key))
  if(index<0)continue
  const rowIndex=review.items[index].preview.rows.findIndex((row:any)=>row.state==='new'&&!row.reviewed&&inboxBankGroupKey(review.items[index],row)===group.key)
  result.push({id:classificationRowId(index,rowIndex),step:'categories',label:'בחירת סוג תנועת הבנק',source:review.items[index].name,row:group.rows[0]})
 }
 for(const [index,item]of (review?.items??[]).entries()){
  if(item.skip)continue
  for(const [qi,q]of (item.questions??[]).entries()){
   const label=q.type==='duplicate'?'בדיקה אם התנועה כבר נרשמה':q.type==='card-match'?'בדיקת התאמה לפירוט שכבר נשמר':q.type==='protected-month'?'בחירת טיפול בחודש מוגן':q.type==='direct'?'בדיקה אם התכנון כבר כלול בדוח':q.type==='statement-conflict'?'השוואה לדוח שכבר נשמר':'בדיקת נתוני המקור'
   result.push({id:['duplicate','card-match'].includes(q.type)?matchReviewId(index,q.type==='duplicate'?q.row.line:q.row.id):exceptionId(index,qi),step:'exceptions',label,source:item.name,row:q.row,month:q.month})
  }
  if(item.warning&&!item.questions?.length)result.push({id:`report-warning-${index}`,step:'exceptions',label:item.warning,source:item.name})
  if(item.error)result.push({id:`report-source-${index}`,step:'account',label:item.error,source:item.name})
 }
 return result
}
