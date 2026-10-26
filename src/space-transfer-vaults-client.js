async function prepareSpaceTransferVault(state,meta,body,previous,activePlan){
 const envelope=body.plan,matching={envelope,revision:body.revision,status:'locked',key:null,keys:null,legs:[]};
 try{
  let source;
  if(activePlan&&meta.id===activeBudget&&typeof vaultRaw!=='undefined'&&vaultRaw){matching.key=vaultKey;matching.keys=await deriveTransferMatchKeys(vaultRaw,envelope);source=await decryptVault(envelope,matching.key);}
  else if(previous?.key&&previous.envelope.keyId===envelope.keyId&&previous.envelope.context===envelope.context){matching.key=previous.key;matching.keys=previous.keys;source=await decryptVault(envelope,matching.key);}
  if(source){if(!validatePlan(source))throw Error('Invalid unlocked source');const legs=transferLegs(source,state.user,meta.id,body.revision,state.asOf);matching.legs=legs.slice(0,500);matching.truncated=legs.length>500;matching.status='ready';}
 }catch{matching.status='error';matching.key=null;matching.keys=null;matching.legs=[];}
 return matching;
}
function spaceTransferKeys(state){return new Map([...state.entries].filter(([,e])=>['ready','locked'].includes(e.status)&&e.matching?.status==='ready').map(([id,e])=>[id,e.matching.keys]));}
async function hydrateSpaceSealedMatches(state){
 const snapshot=state.privateMatches;if(!snapshot)return;
 const keys=spaceTransferKeys(state),legs=transferBrowserSelection(state.entries,[]).legs;
 const items=await Promise.all(snapshot.items.map(async m=>{
  if(!m.sealed||!['sealed','locked','current'].includes(m.status))return m;
  const sources=m.sealed.sources;
  if(!sources.every(s=>{const e=state.entries.get(s.budget);return ['ready','locked'].includes(e?.status)&&(s.keyId?e.matching?.revision===s.revision&&e.matching.envelope.keyId===s.keyId&&e.matching.envelope.context===s.context:e.summary?.revision===s.revision);}))return{id:m.id,status:'unavailable'};
  if(sources.some(s=>s.keyId&&!keys.has(s.budget)))return{id:m.id,sealed:m.sealed,status:'locked'};
  try{
   const value=await openTransferMatch(state.user,m.sealed,keys),out=legs.find(l=>transferRefsEqual(l.ref,value.out)),incoming=legs.find(l=>transferRefsEqual(l.ref,value.in));
   if(!transferPairValid(out,incoming))throw Error('Source mismatch');
   for(const s of sources){const ref=[out.ref,incoming.ref].find(r=>r.budget===s.budget&&r.revision===s.revision);if(!ref||await transferMatchToken(state.user,ref,keys.get(s.budget))!==s.token)throw Error('Source token mismatch');}
   return {...m,status:'current',out:out.ref,in:incoming.ref};
  }catch{return{id:m.id,status:'unavailable'};}
 }));
 if(spaceOverview===state&&state.privateMatches===snapshot)state.privateMatches={...snapshot,items};
}
function spaceTransferUnlockView(state){
 return [...state.entries.values()].filter(e=>e.matching&&['ready','locked'].includes(e.status)).map(e=>{
  const m=e.matching;
  return m.status==='ready'?`<p class="help"><bdi>${esc(e.meta.name)}</bdi> · נפתח להתאמות במכשיר בלבד${m.truncated?' · מוצגות עד 500 תנועות אחרונות':''}</p>`:`<form class="space-transfer-unlock-form panel" data-match-unlock="${esc(e.meta.id)}"><h4><bdi>${esc(e.meta.name)}</bdi> · פתיחה להתאמות בלבד</h4><p class="help">הסיסמה נשארת במכשיר. הפתיחה זמנית ואינה מחליפה את המרחב הפעיל או שומרת נתוני תקציב. סגירת התמונה הכוללת נועלת שוב את הפתיחה הזו.</p>${m.status==='error'?'<p class="warning-note">לא ניתן לאמת את הנתונים. נסו לפתוח שוב או לרענן.</p>':''}<label class="field">סיסמה או מפתח שחזור<input type="password" name="secret" required autocomplete="off" maxlength="200" dir="ltr"></label><label class="check"><input type="checkbox" name="recovery">שימוש במפתח שחזור</label><button class="btn" type="submit" ${state.busy||state.privateMatchSaving||state.matchUnlocking?'disabled':''}>${state.matchUnlocking===e.meta.id?'פותח…':'פתיחה זמנית במכשיר'}</button></form>`;
 }).join('');
}
async function unlockSpaceTransferVault(form){
 const state=spaceOverview,id=form.dataset.matchUnlock,entry=state?.entries.get(id);
 if(!state||state.busy||state.privateMatchSaving||state.matchUnlocking||!['ready','locked'].includes(entry?.status)||!entry.matching)return;
 const matching=entry.matching,secret=form.elements.secret.value,recovery=form.elements.recovery.checked;form.elements.secret.value='';
 state.matchUnlocking=id;state.transferError='';spaceOverviewRender();let result;
 try{
  const latest=await spaceOverviewJSON('/api/plan?budget='+encodeURIComponent(id),state.controller.signal);
  if(spaceOverview!==state||state.entries.get(id)!==entry)return;
  if(latest.accountId!==state.user||accountId!==state.user){clearSpaceOverview();spaceRequireReload();render();return;}
  if(latest.revision!==matching.revision||!isVault(latest.plan)||latest.plan.keyId!==matching.envelope.keyId||latest.plan.context!==matching.envelope.context||JSON.stringify(latest.plan.encrypted)!==JSON.stringify(matching.envelope.encrypted))throw Object.assign(Error('Source changed'),{status:409});
  result=await unlockVault(matching.envelope,secret,recovery);if(!validatePlan(result.plan))throw Error('Invalid source');
  const keys=await deriveTransferMatchKeys(result.rawKey,matching.envelope);
  if(spaceOverview!==state||state.entries.get(id)!==entry||accountId!==state.user)return;
  const legs=transferLegs(result.plan,state.user,id,matching.revision,state.asOf);
  Object.assign(matching,{key:result.key,keys,status:'ready',legs:legs.slice(0,500),truncated:legs.length>500});
  await hydrateSpaceSealedMatches(state);
 }catch(error){if(spaceOverview===state&&[401,403,404].includes(error.status)){clearSpaceOverview();spaceRequireReload();render();return;}if(spaceOverview===state)state.transferError=error.status===409?'המרחב השתנה. רעננו את הנתונים ופתחו מחדש לפני התאמה.':'לא ניתן לפתוח או לאמת את המרחב. בדקו את הסיסמה או מפתח השחזור ונסו שוב.';}
 finally{result?.rawKey?.fill(0);if(spaceOverview===state){state.matchUnlocking='';spaceOverviewRender();}}
}
