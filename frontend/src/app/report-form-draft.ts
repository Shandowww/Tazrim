import {reportInboxDraft} from '../../../src/report-inbox-controller.js'
// Reuse the original serializer for choices. Parsed rows and source bytes stay in
// the source library and are reloaded/verified by the existing group loader.
const keys=['storedId','storedRevision','hash','target','payer','decisions','directIncluded','monthDecisions','bankOptions','skip','from','to','activityCycle','activityTotal']
export function groupFormValues(ui:any){const draft=reportInboxDraft(ui,'react-group-review-v1');return{items:draft.items.map((item:any)=>Object.fromEntries(keys.filter(k=>item[k]!==undefined).map(k=>[k,item[k]]))),categoryChoices:draft.categoryChoices,bankChoices:draft.bankChoices,newAccounts:draft.newAccounts,newCards:draft.newCards,startMonth:draft.startMonth,guided:draft.guided??null}}
export function restoreGroupForm(ui:any,value:ReturnType<typeof groupFormValues>){
 const next=structuredClone(ui)
 if(value.items.length!==next.items.filter((i:any)=>!i.storedDuplicate).length)throw Error('מקורות הקבוצה השתנו. הטיוטה נשמרה בנפרד.')
 for(const item of value.items){const target=next.items.find((i:any)=>i.storedId===item.storedId);if(!target||target.hash!==item.hash||target.storedRevision!==item.storedRevision)throw Error('מקור או גרסת דוח השתנו. הטיוטה נשמרה בנפרד.');for(const key of keys)if(Object.hasOwn(item,key))target[key]=item[key];if(target.activity)target.activityConfirmed=false}
 next.categoryChoices=new Map(value.categoryChoices);next.bankChoices=new Map(value.bankChoices);next.newAccounts=value.newAccounts;next.newCards=value.newCards;next.startMonth=value.startMonth;next.guided=value.guided
 return next
}
