import {cashAccountList,cashPayerCandidates,assignCashPayers} from '../../../src/budget.js'
import {prepareDetailSave,type DetailDraft} from './detail-management-command.ts'
export function needsChequePayer(plan:any,draft:DetailDraft,create:boolean){return create&&draft.method==='checks'&&draft.accounting==='additional'&&draft.status!=='cancelled'&&cashAccountList(plan).length>1}
/** Compose the original save and payer transitions; no new accounting rules. */
export function prepareDetailWithPayer(plan:any,id:string,draft:DetailDraft,create:boolean,payer=''){
 if(typeof payer!=='string')throw Error('יש לבחור חשבון משלם תקין.')
 if(needsChequePayer(plan,draft,create)&&!payer)throw Error('יש לבחור את החשבון שממנו ייפרע הצ׳ק.')
 const next=prepareDetailSave(plan,id,draft,create)
 if(!payer)return next
 if(!create||!cashAccountList(next).some((a:any)=>a.id===payer)||!cashPayerCandidates(next).details.some((row:any)=>row.id===id))throw Error('השיוך אינו זמין לצ׳ק או לחשבון שנבחר.')
 return assignCashPayers(next,{details:{[id]:payer}})
}
