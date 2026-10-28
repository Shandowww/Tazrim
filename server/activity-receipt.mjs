import {calActivityReport} from '../dist/server/cal-activity.mjs';
import {reportHash} from './report-crypto.mjs';
/** A stored activity source proves one explicitly reviewed cycle; its raw file hash is never a fictitious monthly receipt. */
export function activityReceiptPresent(plan,draft,sourceId,sourceHash){
 try{const item=draft?.version===1&&draft.items?.find(i=>i.storedId===sourceId&&i.hash===sourceHash&&i.kind==='card'&&i.activity);if(!item)return false;const report=calActivityReport(item.activity,item.activityCycle,item.activityTotal,item.activityConfirmed);if(JSON.stringify(report)!==JSON.stringify(item.report))return false;const bill=plan.cardBilling?.reports?.find(r=>r.cardId===item.target&&r.dueDate===report.dueDate&&r.amount===report.amount);if(!bill)return false;const ids=(plan.details??[]).filter(e=>e.method===item.target&&e.statement?.dueDate===report.dueDate).map(e=>e.id).sort(),proof=reportHash(JSON.stringify([bill.amount,ids])),hash=reportHash(sourceHash+':cal-cycle:'+report.dueDate);return plan.reportInbox?.receipts?.some(r=>r.hash===hash&&r.kind==='card'&&r.target===item.target&&r.reference===report.dueDate&&r.proof===proof)===true}catch{return false}
}
