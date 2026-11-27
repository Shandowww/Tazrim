async function prepareSpaceTransferVault(state,meta,body,previous,activePlan){return prepareTransferMatchVault(state,meta,body,previous,activePlan,{budgetId:activeBudget,key:vaultKey,rawKey:typeof vaultRaw==='undefined'?null:vaultRaw});}
function spaceTransferKeys(state){return transferMatchKeys(state);}
async function hydrateSpaceSealedMatches(state){const snapshot=state.privateMatches,next=await hydrateTransferMatchSnapshot(state);if(spaceOverview===state&&state.privateMatches===snapshot&&next)state.privateMatches=next;}
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
  result=await openTransferMatchSource(state.user,id,matching,latest,secret,recovery,unlockVault);const keys=result.keys;
  if(spaceOverview!==state||state.entries.get(id)!==entry||accountId!==state.user)return;
  const legs=transferLegs(result.plan,state.user,id,matching.revision,state.asOf);
  Object.assign(matching,{key:result.key,keys,status:'ready',legs:legs.slice(0,500),truncated:legs.length>500});
  await hydrateSpaceSealedMatches(state);
 }catch(error){if(spaceOverview===state&&[401,403,404].includes(error.status)){clearSpaceOverview();spaceRequireReload();render();return;}if(spaceOverview===state)state.transferError=error.status===409?'המרחב השתנה. רעננו את הנתונים ופתחו מחדש לפני התאמה.':'לא ניתן לפתוח או לאמת את המרחב. בדקו את הסיסמה או מפתח השחזור ונסו שוב.';}
 finally{result?.rawKey?.fill(0);if(spaceOverview===state){state.matchUnlocking='';spaceOverviewRender();}}
}
