let spaceOverview=null;
function clearSpaceOverview(){
 if(spaceOverview){spaceOverview.controller?.abort();for(const e of spaceOverview.entries.values())if(e.matching){Object.assign(e.matching,{key:null,keys:null,legs:[],status:'locked'});e.matching=null;}spaceOverview.entries.clear();spaceOverview.privateMatches=null;spaceOverview.transferOut='';spaceOverview.transferIn='';}spaceOverview=null;
 const dialog=document.getElementById('space-overview-dialog');dialog?.close();dialog?.remove();
}
function spaceOverviewButton(){return budgets.length>1?`<button class="btn" type="button" data-action="space-overview">הכול · תמונה כוללת</button>${typeof tab!=='undefined'&&tab==='goals'?'<button class="btn" type="button" data-action="space-goals">כל המטרות שלי</button>':''}`:'';}
function spaceOverviewGoalsView(state){
 const selection=overviewGoalSelection(state.entries,state.goalSpace??'all',state.goalFunding??'');
 const {spaces,selected,accounts,rows}=selection;
 return `<section class="space-goal-browser" aria-labelledby="space-goal-heading"><h3 id="space-goal-heading">המטרות שלי</h3><div class="space-goal-scopes" role="group" aria-label="סינון מטרות לפי מרחב">${[{id:'all',name:'כל המטרות'},...spaces.map(e=>({id:e.meta.id,name:e.meta.id==='personal'?'האישיות שלי':e.meta.name}))].map(m=>`<button class="btn" type="button" data-overview="goal-space" data-id="${esc(m.id)}" data-overview-focus="space:${esc(m.id)}" aria-pressed="${(state.goalSpace??'all')===m.id}">${esc(m.name)}</button>`).join('')}</div><label class="field">חשבון מימון<select data-overview-funding data-overview-focus="funding"><option value="" ${!state.goalFunding?'selected':''}>כל החשבונות</option><option value="unassigned" ${state.goalFunding==='unassigned'?'selected':''}>ללא שיוך חשבון</option>${accounts.map(a=>`<option value="${esc(a.key)}" ${state.goalFunding===a.key?'selected':''}>${esc(a.spaceName)} · ${esc(a.name)}</option>`).join('')}</select></label><p class="help">מוצגות רק מטרות מהמרחבים המורשים שלך. קישור לכמה חשבונות אינו משכפל את המטרה או משנה את הכסף שהוקצה לה.</p><p role="status" aria-live="polite">${rows.length} מטרות בתצוגה${state.busy?' · הנתונים מתעדכנים':''}</p>${selected.filter(e=>e.status!=='ready'||!e.summary?.savings).map(e=>`<p class="${['stale','error'].includes(e.status)?'warning-note':'help'}"><bdi>${esc(e.meta.name)}</bdi> · ${e.status==='locked'?'נעול · יש לפתוח במרחב המקורי':e.status==='loading'?'טוען נתונים…':e.status==='stale'?'הרענון נכשל · הנתונים מהטעינה הקודמת':e.status==='error'?'הטעינה נכשלה · נסו לרענן':'אין מטרות עם נתוני חסכון לתקופה הנוכחית'}</p>`).join('')}${!rows.length?'<p class="help">אין מטרות להצגה לפי הסינון הנוכחי.</p>':''}<div class="space-overview-grid">${rows.map(({goal:g,meta,status,snapshotMonth,throughMonth})=>`<article class="panel space-overview-card space-goal-card"><p class="help"><bdi>${esc(meta.name)}</bdi> · ${meta.id==='personal'?'פרטי · רק שלך':meta.role==='viewer'?'צפייה בלבד':'מרחב נוסף'}${status==='stale'?' · נתונים מהטעינה הקודמת':status==='loading'?' · מתעדכן':''}</p><h4><bdi>${esc(g.name)}</bdi></h4><p>${money(g.currentCents/100)} מתוך ${money(g.targetCents/100)}</p><progress max="${g.targetCents}" value="${Math.min(g.currentCents,g.targetCents)}" aria-label="${esc(g.name)}"></progress><p class="help">יתרת בסיס מ־${monthLabel(snapshotMonth)} והפקדות שנרשמו עד ${monthLabel(throughMonth)}. זו אינה יתרת בנק עדכנית.</p><p class="help">${g.fundingAccounts?.length?'מימון מתוכנן: '+g.fundingAccounts.map(a=>'<bdi>'+esc(a.name)+'</bdi>').join(' · '):'ללא שיוך חשבון למימון'}</p><button class="btn" type="button" data-overview="goal" data-id="${esc(meta.id)}" data-goal="${esc(g.id)}" data-overview-focus="goal:${esc(g.key)}">פתיחת המטרה</button></article>`).join('')}</div></section>`;
}
function spaceOverviewRender(){
 const state=spaceOverview,dialog=document.getElementById('space-overview-dialog');if(!state||!dialog)return;
 const focus=document.activeElement?.dataset?.overviewFocus,scroll=dialog.scrollTop;
 if(state.goalSpace&&state.goalSpace!=='all'&&!state.entries.has(state.goalSpace))state.goalSpace='all';
 const accounts=overviewGoalSelection(state.entries,state.goalSpace??'all').accounts;
 if(state.goalFunding&&state.goalFunding!=='unassigned'&&!accounts.some(a=>a.key===state.goalFunding))state.goalFunding='';
 const text={loading:'טוען נתונים…',locked:'נעול · יש לפתוח במרחב המקורי',empty:'אין עדיין נתונים שמורים',error:'הטעינה נכשלה · אפשר לנסות שוב',stale:'הרענון נכשל · מוצגים הנתונים מהטעינה הקודמת',ready:'נתונים שמורים'};
 dialog.innerHTML=`<header class="section-heading"><h2 id="space-overview-title">הכול · תמונה כוללת</h2><button class="btn" type="button" data-overview="close" data-overview-focus="close" aria-label="סגירת התמונה הכוללת">×</button></header><p class="help">האישי שלך והמרחבים שיש לך גישה אליהם. חשבונות אישיים של משתתפים אחרים נשארים פרטיים.</p><p class="help">היתרות מוצגות לפי מרחב ותאריך הדיווח שלהן, ללא חיבור לסכום כולל.</p><div class="actions"><button class="btn" type="button" data-overview="refresh" data-overview-focus="refresh" ${state.busy||state.privateMatchSaving?'disabled':''}>${state.busy?'מרענן…':'רענון הנתונים'}</button><span role="status" aria-live="polite">${state.busy?'טעינת המרחבים המורשים…':''}</span><button class="btn" type="button" data-overview="migration" ${state.busy||state.privateMatchSaving||state.matchUnlocking?'disabled':''}>סקירת מעבר חשבון</button></div>${state.error?`<p class="error-box" role="alert">${esc(state.error)}</p>`:''}<div class="space-overview-modes" role="group" aria-label="תצוגת המרחבים"><button class="btn" data-overview="mode" data-view="accounts" data-overview-focus="accounts" aria-pressed="${state.view==='accounts'}">חשבונות</button><button class="btn" data-overview="mode" data-view="goals" data-overview-focus="goals" aria-pressed="${state.view==='goals'}">מטרות</button><button class="btn" data-overview="mode" data-view="transfers" data-overview-focus="transfers" aria-pressed="${state.view==='transfers'}">התאמות העברה</button></div>${state.view==='transfers'?spaceTransfersView(state):state.view==='goals'?spaceOverviewGoalsView(state):`<div class="space-overview-grid">${[...state.entries.values()].map(entry=>{
  const {meta,summary,status}=entry;
  return `<section class="panel space-overview-card"><div class="section-heading"><h3>${esc(meta.name)}</h3><span class="help">${meta.id==='personal'?'פרטי · רק שלך':meta.role==='viewer'?'צפייה בלבד':meta.role==='owner'?'בניהולך':'משותף'}</span></div><p class="${status==='error'||status==='stale'?'warning-note':'help'}">${status==='loading'&&summary?'מרענן · מוצגים הנתונים מהטעינה הקודמת':text[status]}</p>${summary?`<ul class="space-overview-accounts">${summary.accounts.map(a=>`<li><span>${esc(a.name)}</span><strong>${a.balanceCents===null?'טרם דווחה יתרה':money(a.balanceCents/100)}</strong>${a.date?`<small>${a.opening?'יתרת פתיחה':'יתרה שדווחה'} · <bdi dir="ltr">${esc(a.date)}</bdi>${a.fromBank?' · מדוח בנק':''}</small>`:''}</li>`).join('')}</ul>${summary.savings?`<div class="space-overview-savings"><h4>חסכון ומטרות</h4><strong>${money(summary.savings.balanceCents/100)}</strong><p class="help">יתרת בסיס מ־${monthLabel(summary.savings.snapshotMonth)} והפקדות שנרשמו עד ${monthLabel(summary.savings.throughMonth)}. זו אינה יתרת בנק עדכנית.</p><ul class="space-overview-goals">${summary.savings.goals.map(g=>`<li><span>${esc(g.name)}</span><span>${money(g.currentCents/100)} מתוך ${money(g.targetCents/100)}</span>${g.fundingAccounts?.length?`<small>מימון מתוכנן: ${g.fundingAccounts.map(a=>esc(a.name)).join(' · ')}</small>`:''}<progress max="${g.targetCents}" value="${Math.min(g.currentCents,g.targetCents)}" aria-label="${esc(g.name)}"></progress></li>`).join('')}</ul></div>`:'<p class="help">לא דווחה יתרת חסכון לתקופה הנוכחית.</p>'}`:''}<div class="actions"><button class="btn" type="button" data-overview="open" data-id="${esc(meta.id)}">${status==='locked'?'פתיחת המרחב הנעול':'פתיחת המרחב'}</button><button class="btn" type="button" data-overview="calculator" data-id="${esc(meta.id)}">מחשבון במרחב</button>${summary?.savings?`<button class="btn" type="button" data-overview="goals" data-id="${esc(meta.id)}">למטרות במרחב</button>`:''}</div></section>`;
 }).join('')}</div>`}`;
 if(focus)[...dialog.querySelectorAll('[data-overview-focus]')].find(el=>el.dataset.overviewFocus===focus)?.focus({preventScroll:true});
 if(dialog.contains(document.activeElement)===false||document.activeElement===dialog)dialog.querySelector('[data-overview-focus="close"]')?.focus({preventScroll:true});
 dialog.scrollTop=scroll;
}
async function spaceOverviewJSON(url,signal,options={}){
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
 if(signal.aborted)controller.abort();const timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url,{...options,cache:'no-store',signal:controller.signal});if(!response.ok)throw Object.assign(Error('Overview request failed'),{status:response.status});return await response.json();}
 finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
async function refreshSpaceOverview(){
 const state=spaceOverview;if(!state||state.busy||state.privateMatchSaving||state.matchUnlocking)return;
 state.busy=true;state.error='';state.privateMatches=null;state.transferNotice='';if(typeof billingToday==='function')state.asOf=billingToday();state.controller=new AbortController();const signal=state.controller.signal;
 const current=()=>spaceOverview===state&&!signal.aborted&&!spacesSessionChanged;
 const denied=()=>{clearSpaceOverview();spaceRequireReload();render();};
 spaceOverviewRender();
 try{
  const list=await spaceOverviewJSON('/api/budgets',signal);if(!current())return;
  if(list.accountId!==state.user||accountId!==state.user){denied();return;}
  if(!Array.isArray(list.budgets))throw Error('Invalid spaces');
  if(!list.budgets.some(meta=>meta.id===activeBudget)){denied();return;}
  // The new authorized list removes revoked summaries before individual reads.
  const metas=[...new Map(visibleBudgetSpaces(list.budgets,spacePreference).map(m=>[m.id,m])).values()];
  const previous=state.entries;
  state.entries=new Map(metas.map(meta=>[meta.id,{meta,status:'loading',summary:previous.get(meta.id)?.summary??null}]));
  budgets=list.budgets;spaceOverviewRender();
  let index=0;
  const worker=async()=>{while(current()&&index<metas.length){
   const meta=metas[index++];let entry;
   try{
    const body=await spaceOverviewJSON('/api/plan?budget='+encodeURIComponent(meta.id),signal);if(!current())return;
    if(body.accountId!==state.user){denied();return;}
    if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Invalid revision');
    let source=body.plan;const matchingLocked=isVault(source);
    if(isVault(source)){
     // Reuse only the currently unlocked, unchanged active budget in memory.
     const same=meta.id===activeBudget&&loaded&&vaultKey&&!dirty&&revision===body.revision&&vaultEnvelope?.keyId===source.keyId&&vaultEnvelope?.context===source.context;
     if(!same){entry={meta,status:'locked',summary:null};source=null;}
     else source=plan;
    }
    if(!entry){
     if(source!==null&&!validatePlan(source))throw Error('Invalid plan');
     entry={meta,status:source===null?'empty':'ready',summary:source===null?null:summarizeBudgetSpace(source,state.user,meta.id,body.revision,state.asOf)};
     if(entry.summary&&matchingLocked){entry.summary.transfers=[];entry.summary.transferMatchingLocked=true;}
    }
    if(matchingLocked){entry.matching=await prepareSpaceTransferVault(state,meta,body,previous.get(meta.id)?.matching,source);if(!current())return;}
   }catch(error){
    if(!current())return;
    if(error.status===401){denied();return;}
    if([403,404].includes(error.status)){
     state.entries.delete(meta.id);state.error='הגישה לאחד המרחבים השתנתה; הנתונים שלו הוסרו מהתמונה הכוללת.';
     if(meta.id===activeBudget){denied();return;}
     spaceOverviewRender();continue;
    }
    entry=overviewLoadFailure(previous.get(meta.id),error.status)??{meta,status:'error',summary:null};entry.meta=meta;
   }
   if(current()){state.entries.set(meta.id,entry);spaceOverviewRender();}
  }};
  await Promise.all([worker(),worker()]);
  if(current()&&state.view==='transfers')await loadSpaceTransferMatches(state,signal);
 }catch(error){
  if(!current())return;
  if([401,403].includes(error.status)){denied();return;}
  state.error='לא ניתן לרענן כרגע. הנתונים הקודמים נשארו מוצגים; נסו שוב.';
  for(const [id,entry]of state.entries)state.entries.set(id,overviewLoadFailure(entry,error.status)??{meta:entry.meta,status:'error',summary:null});
 }finally{if(current()){state.busy=false;spaceOverviewRender();}}
}
function openSpaceOverview(view='accounts'){
 if(demoPreview||!canSwitchBudget()||!accountId)return;
 clearSpaceOverview();document.getElementById('app-menu-dialog')?.close();
 const dialog=document.createElement('dialog');dialog.id='space-overview-dialog';dialog.className='space-overview-dialog';dialog.setAttribute('aria-labelledby','space-overview-title');app.append(dialog);
 spaceOverview={user:accountId,asOf:typeof billingToday==='function'?billingToday():todayMonth()+'-01',entries:new Map(),view,goalSpace:'all',goalFunding:'',busy:false,error:'',controller:null};
 dialog.addEventListener('submit',event=>{if(event.target.matches('[data-match-unlock]')){event.preventDefault();event.stopPropagation();unlockSpaceTransferVault(event.target);}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();clearSpaceOverview();});
 dialog.addEventListener('change',event=>{if(event.target.dataset.transferSelect&&spaceOverview){if(event.target.dataset.transferSelect==='out'){spaceOverview.transferOut=event.target.value;spaceOverview.transferIn='';}else spaceOverview.transferIn=event.target.value;spaceOverviewRender();return;}if(event.target.matches('[data-overview-funding]')&&spaceOverview){spaceOverview.goalFunding=event.target.value;spaceOverviewRender();}});
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('[data-overview]');if(!button)return;
  const action=button.dataset.overview;
  if(action==='close'){clearSpaceOverview();return;}
  if(action==='refresh'){refreshSpaceOverview();return;}
  if(action==='transfer-save'||action==='transfer-delete'){saveSpaceTransferMatch(action,button.dataset.id);return;}
  if(action==='migration'){clearSpaceOverview();openSpaceMigrationReview();return;}
  if(action==='mode'){if(!spaceOverview||spaceOverview.privateMatchSaving||spaceOverview.matchUnlocking)return;spaceOverview.view=['goals','transfers'].includes(button.dataset.view)?button.dataset.view:'accounts';spaceOverviewRender();if(spaceOverview.view==='transfers'&&!spaceOverview.busy)refreshSpaceOverview();return;}
  if(action==='goal-space'){if(!spaceOverview)return;spaceOverview.goalSpace=button.dataset.id;spaceOverview.goalFunding='';spaceOverviewRender();return;}
  if(action==='open'||action==='goals'||action==='calculator'||action==='goal'){
   const id=button.dataset.id;if(!spaceOverview?.entries.has(id))return;
   const goalId=action==='goal'?button.dataset.goal:null;
   if(!canSwitchBudget())return;
   if(goalId&&!spaceOverview.entries.get(id).summary?.savings?.goals.some(g=>g.id===goalId))return;
   clearSpaceOverview();if(await switchBudget(id)){tab=action==='goals'||action==='goal'?'goals':action==='calculator'?'purchase':'progress';if(goalId&&loaded){savingsReset();if(plan.savingsGoals?.items.some(g=>g.id===goalId))savingsUI.id=goalId;else notify('המטרה השתנתה או הוסרה. מוצגות המטרות העדכניות במרחב.');}render();}
  }
 });
 spaceOverviewRender();dialog.showModal();refreshSpaceOverview();
}
window.addEventListener('pagehide',clearSpaceOverview);
