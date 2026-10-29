// Original migration orchestration shared by both interfaces; UI/access ports only.
export async function loadMigrationReview(state,ports,{refresh=false}={}){
 if(!state||state.busy||state.executing||state.pendingOperation)return;
 const expected=state.data?{source:state.data.sourceRevision,target:state.data.targetRevision}:null;
 state.busy=true;state.error='';state.importPages={};state.savingsForm={};state.savingsResult=null;state.savingsOpen={};state.savingsPages={};state.savingsRoutes={};state.savingsProposal=null;state.execution=null;state.consentPrivacy=false;state.consentMove=false;state.data=null;if(refresh)state.account='';state.controller?.abort();state.controller=new AbortController();const signal=state.controller.signal;
 const current=()=>ports.current()===state&&!signal.aborted;
 const deny=()=>{ports.deny();};ports.render();
 try{
  const list=await ports.read('/api/budgets',signal);if(!current())return;
  if(list.accountId!==state.user||ports.accountId()!==state.user){deny();return;}
  if(!Array.isArray(list.budgets))throw Error('Invalid spaces');state.metas=list.budgets;
  if(!state.source||!state.target){ports.render();return;}
  for(const id of [state.source,state.target])if(!list.budgets.some(m=>m.id===id&&m.role!=='viewer'))throw Error('הגישה לאחד המרחבים השתנתה. בחרו מקור ויעד עם הרשאת עריכה.');
  const query=new URLSearchParams({source:state.source,target:state.target});
  if(state.account&&expected){query.set('account',state.account);query.set('sourceRevision',expected.source);query.set('targetRevision',expected.target);}
  const data=await ports.read('/api/space-migration-review?'+query,signal);if(!current())return;
  if(data.accountId!==state.user||ports.accountId()!==state.user){deny();return;}
  if(!Number.isSafeInteger(data.sourceRevision)||!Number.isSafeInteger(data.targetRevision)||!Array.isArray(data.accounts)||data.review?.applyAvailable===true)throw Error('Invalid migration review');
  state.data=data;
 }catch(error){if(!current())return;if(error.status===401){deny();return;}state.data=null;state.account='';state.error=[403,404].includes(error.status)?'ההרשאה לאחד המרחבים אינה זמינה. הסקירה הוסרה; בחרו מחדש ורעננו.':error.status===409?'נתוני המקור או היעד השתנו, או שאחד המרחבים מוצפן. רעננו לבחירה מחדש. מעבר מוצפן טרם זמין וההצפנה נשמרת.':error.message==='הגישה לאחד המרחבים השתנתה. בחרו מקור ויעד עם הרשאת עריכה.'?error.message:'לא ניתן להכין סקירה כרגע. שום תקציב לא שונה. רעננו ונסו שוב.';
 }finally{if(current()){state.busy=false;ports.render();}}
}

export async function loadMigrationOperations(state,ports){
 try{const body=await ports.read('/api/space-migrations?history=1',state.controller.signal);if(ports.current()!==state)return;
 if(body.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}
 if(!Array.isArray(body.items))throw Error('Invalid operations');state.operations=body.items;state.operationsError='';
 }catch(error){if(ports.current()===state&&ports.denied(error))return;if(ports.current()===state){state.operations=[];state.operationsError='לא ניתן לבדוק את מצב המעברים. רעננו לפני פעולה נוספת.';}}
 if(ports.current()===state)ports.render();
}

export async function prepareMigration(state,ports){
 if(!state||state.busy||state.executing||!state.data?.review||state.pendingOperation)return;
 if(state.data.review.savings?.from.present){ports.prepareSavings();return;}
 state.executing=true;state.execution=null;state.consentPrivacy=false;state.consentMove=false;state.error='';ports.render();
 try{
  const query=new URLSearchParams({accountId:state.user,source:state.source,target:state.target,bankAccount:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision});
  const body=await ports.read('/api/space-migrations?'+query,state.controller.signal);if(ports.current()!==state)return;
  if(body.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}
  if(typeof body.eligible!=='boolean'||!Array.isArray(body.reasons))throw Error('Invalid preparation');state.execution=body;
 }catch(error){if(ports.current()===state&&ports.denied(error))return;if(ports.current()===state){state.execution=null;state.data=null;state.error='לא ניתן להכין מעבר מהסקירה הזו. רעננו ובחרו מחדש; שום נתון לא שונה.';}}
 finally{if(ports.current()===state){state.executing=false;ports.render();}}
}

export async function sendMigration(state,ports,action,id){
 if(!state||state.executing||state.busy||state.pendingOperation||!ports.canSwitch())return;
 let body;
 if(action==='apply'){
  if(!state.execution?.eligible||!state.consentPrivacy||!state.consentMove||!state.data?.review)return;
  body={action,operation:crypto.randomUUID(),accountId:state.user,source:state.source,target:state.target,bankAccount:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision,reviewToken:state.execution.reviewToken,confirmedMove:true,confirmedPrivacy:true,...(state.savingsProposal?{savingsProposal:state.savingsProposal}:{})};
 }else{
  const op=state.operations?.find(r=>r.id===id&&r.canUndo);if(!op||state.undoConsent!==id)return;
  body={action:'undo',operation:id,accountId:state.user,sourceRevision:op.sourceRevision,targetRevision:op.targetRevision,confirmedUndo:true};
 }
 state.pendingOperation=body.operation;state.executing=true;state.error='';ports.render();
 try{
  const result=await ports.read('/api/space-migrations',state.controller.signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(ports.current()!==state)return;
  if(result.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}
  if(!['applied','undone'].includes(result.status))throw Error('Unconfirmed operation');
  await ports.finished(state,result.status);
 }catch(error){if(ports.current()===state&&ports.denied(error))return;if(ports.current()===state){state.execution=null;state.data=null;state.error='לא ניתן לאשר את תוצאת הפעולה במכשיר. בדקו את מצב הפעולה; אל תשלחו מעבר חדש.';}}
 finally{if(ports.current()===state){state.executing=false;ports.render();}}
}

export async function checkMigration(state,ports){
 if(!state||state.executing||!state.pendingOperation)return;state.executing=true;ports.render();
 try{const result=await ports.read('/api/space-migrations?operation='+encodeURIComponent(state.pendingOperation),state.controller.signal);if(ports.current()!==state)return;
 if(result.accountId!==state.user||ports.accountId()!==state.user){ports.deny();return;}
 if(['applied','undone'].includes(result.status))await ports.finished(state,result.status);else throw Error('Unavailable');
 }catch(error){if(ports.current()===state&&ports.denied(error))return;if(ports.current()===state)state.error='מצב הפעולה עדיין אינו מאומת. רעננו את האפליקציה ובדקו את יומן המעברים לפני ניסיון נוסף.';}
 finally{if(ports.current()===state){state.executing=false;ports.render();}}
}
