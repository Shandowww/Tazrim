import {savingsOwnershipCents,evaluateSavingsOwnership} from './space-savings-model.js';
export async function checkSavingsOwnership(state,ports){
 const review=state?.data?.review?.savings;
 if(!review||state.busy||state.executing||state.pendingOperation)return;
 const proposal={context:review.context,...Object.fromEntries([['assets',review.from.assets],['goals',review.from.goals]].map(([kind,rows])=>[kind,rows.map(r=>({ref:r.ref,personalCents:savingsOwnershipCents(state.savingsForm?.[r.ref]?.personal),sharedCents:savingsOwnershipCents(state.savingsForm?.[r.ref]?.shared)}))]))};
 ports.invalidate(state);state.busy=true;state.savingsOpen??={};state.savingsOpen.ownership=true;state.savingsChecking=true;state.savingsResult=null;ports.render('savings-check');
 const current=()=>ports.current()===state&&!state.controller?.signal.aborted;
 try{
  const query=new URLSearchParams({source:state.source,target:state.target,account:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision});
  const body=await ports.read('/api/space-migration-review?'+query,state.controller.signal);if(!current())return;
  if(body.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}
  if(body.review?.savings?.context!==review.context||JSON.stringify(body.review.savings)!==JSON.stringify(review))throw Error('review-changed');
  state.data=body;state.execution=null;state.consentPrivacy=false;state.consentMove=false;state.savingsResult=evaluateSavingsOwnership(body.review.savings,proposal);
 }catch(error){if(!current())return;if(error.status===401){ports.deny();return;}state.data=null;state.savingsForm={};state.savingsRoutes={};state.savingsProposal=null;state.savingsResult=null;state.account='';state.error='לא ניתן לאמת את הגישה והגרסאות של סקירת הבעלות. הטיוטה הוסרה; רעננו את הסקירה ובחרו מחדש. לא נשמר שום שינוי.';
 }finally{if(current()){state.busy=false;state.savingsChecking=false;ports.render('savings-check');}}
}
export function migrationSavingsProposal(state){
 const review=state.data?.review?.savings;if(!review)return null;
 return{ownership:{context:review.context,...Object.fromEntries([['assets',review.from.assets,'amountCents'],['goals',review.from.goals,'allocatedCents']].map(([kind,rows])=>[kind,rows.map(row=>({ref:row.ref,personalCents:savingsOwnershipCents(state.savingsForm?.[row.ref]?.personal),sharedCents:savingsOwnershipCents(state.savingsForm?.[row.ref]?.shared)}))]))},routes:Object.fromEntries([['assets',review.from.assets],['goals',review.from.goals],['history',review.from.historyRows??[]]].map(([kind,rows])=>[kind,rows.map(row=>({ref:row.ref,destination:state.savingsRoutes?.[row.ref]??''}))]))};
}

export async function prepareSavingsMigration(state,ports){
 if(!state||state.busy||state.executing||state.pendingOperation)return;
 if(!state.savingsResult?.valid){ports.requireOwnership();return;}
 const proposal=migrationSavingsProposal(state);if(!proposal||Object.values(proposal.routes).some(rows=>rows.some(row=>!['source','target'].includes(row.destination)))){ports.requireRoutes();return;}
 state.executing=true;state.execution=null;state.savingsProposal=null;state.consentPrivacy=false;state.consentMove=false;state.error='';ports.render();
 try{const body=await ports.read('/api/space-migrations',state.controller.signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare-savings',accountId:state.user,source:state.source,target:state.target,bankAccount:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision,savingsProposal:proposal})});if(ports.current()!==state)return;if(body.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}if(typeof body.eligible!=='boolean'||!Array.isArray(body.reasons))throw Error('Invalid savings preparation');state.execution=body;if(body.eligible)state.savingsProposal=proposal;
 }catch(error){if(ports.current()!==state)return;if(ports.denied(error))return;state.execution=null;state.savingsProposal=null;state.savingsResult=null;state.data=null;state.savingsForm={};state.savingsRoutes={};state.error='לא ניתן להכין מעבר חסכון מהגרסאות האלה. רעננו ובחרו מחדש; שום נתון לא שונה.';
 }finally{if(ports.current()===state){state.executing=false;ports.render();}}
}
