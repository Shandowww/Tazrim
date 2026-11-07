// User lifecycle is separate from parser/source/queue states. No financial commands.
export const REPORT_RETENTION_MS=30*24*60*60*1000;
export const reportReviewSteps=['account','figures','categories','exceptions','summary'];
export function validReportReview(value){
 return !!value&&value.version===1&&reportReviewSteps.includes(value.step)&&Array.isArray(value.done)&&value.done.every(s=>reportReviewSteps.includes(s))&&new Set(value.done).size===value.done.length&&['unset','resolved','later'].includes(value.categories)&&Number.isSafeInteger(value.budgetRevision)&&value.budgetRevision>=0;
}
export function reportLifecycleState({reviewed=false,complete=false,deferred=false,completedAt=null,removedAt=null,reason=null}={}){
 const digested=complete&&!deferred&&Number.isSafeInteger(completedAt)&&completedAt>=0;
 return{lifecycle:digested?'digested':reviewed||completedAt!==null?'partial':'new',completedAt:digested?completedAt:null,removalAt:digested?completedAt+REPORT_RETENTION_MS:null,originalRemoved:removedAt!==null,removedAt,retentionReason:reason};
}
/** @param {any} review @param {{hasExceptions?: boolean, budgetRevision?: number}} options */
export function reportResumeStep(review,{hasExceptions=true,budgetRevision=undefined}={}){
 const steps=reportReviewSteps.filter(s=>hasExceptions||s!=='exceptions');
 if(!validReportReview(review)||budgetRevision!==undefined&&review.budgetRevision!==budgetRevision)return{steps,step:'account',invalidated:!!review};
 return{steps,step:steps.find(s=>!review.done.includes(s))??'summary',invalidated:false};
}
