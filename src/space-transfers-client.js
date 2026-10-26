function spaceTransferLegView(leg){return `<bdi>${esc(leg.space)}</bdi> · <bdi>${esc(leg.account)}</bdi> · <bdi dir="ltr">${esc(leg.date)}</bdi> · ${money(leg.cents/100,true)}${leg.description?`<br><bdi>${esc(leg.description)}</bdi>`:''}${leg.partial?'<br>תנועה מדוח חלקי; אין אישור לכיסוי החודש המלא':''}`;}
function spaceTransfersView(state){
 const selection=transferBrowserSelection(state.entries,state.privateMatches?.items??[]),out=selection.legs.find(l=>l.key===state.transferOut&&l.direction==='out');
 const incoming=selection.legs.filter(l=>transferPairValid(out,l)),chosen=incoming.find(l=>l.key===state.transferIn);
 const label=leg=>`${leg.space} · ${leg.account} · ⁦${leg.date}⁩ · ⁦${currency(leg.cents/100)}⁩ · ${leg.description}`;
 return `<section class="space-transfer-browser" aria-labelledby="space-transfers-title"><h3 id="space-transfers-title">התאמות העברה פרטיות</h3><p class="help">הקישור גלוי רק לחשבון המחובר שלך, גם במרחב משותף. הוא מחבר שתי תנועות שכבר נקלטו, בלי להעביר כסף או לשנות סכומים. אין כאן אישור לכיסוי משפחתי מלא או סך כספי מאוחד.</p>${spaceTransferUnlockView(state)}<p class="help">בחרו את החיוב ואת הזיכוי ובדקו את המרחבים, החשבונות, התאריכים והסכומים. שם או סכום זהים אינם מוכיחים שזו אותה העברה. עמלה נשארת הוצאה נפרדת.</p>${[...state.entries.values()].filter(e=>!e.matching&&(e.status!=='ready'||e.summary?.transferMatchingTruncated)).map(e=>`<p class="warning-note"><bdi>${esc(e.meta.name)}</bdi> · ${e.status==='locked'||e.summary?.transferMatchingLocked?'התאמה בתקציב מוצפן אינה זמינה עדיין':e.summary?.transferMatchingTruncated?'מוצגות עד 500 תנועות העברה אחרונות; הכיסוי חלקי':'אין נתוני מקור עדכניים להתאמה; נסו לרענן'}</p>`).join('')}${state.transferError?`<p role="alert" class="error-box">${esc(state.transferError)}</p>`:''}${!state.privateMatches?'<p role="status">יש לרענן כדי לטעון את רשימת ההתאמות הפרטית העדכנית.</p>':''}<fieldset ${state.busy||state.privateMatchSaving||state.matchUnlocking||!state.privateMatches||selection.blocked?'disabled':''}><label class="field">העברה יוצאת פנימית<select data-transfer-select="out" data-overview-focus="transfer-out"><option value="">בחירת חיוב ממקור מורשה</option>${selection.legs.filter(l=>l.direction==='out').map(l=>`<option value="${esc(l.key)}" ${out?.key===l.key?'selected':''}>${esc(label(l))}</option>`).join('')}</select></label><label class="field">העברה נכנסת במרחב אחר<select data-transfer-select="in" data-overview-focus="transfer-in"><option value="">בחירת זיכוי בסכום זהה</option>${incoming.map(l=>`<option value="${esc(l.key)}" ${chosen?.key===l.key?'selected':''}>${esc(label(l))}</option>`).join('')}</select></label>${out?`<article class="panel"><h4>יוצא</h4><p>${spaceTransferLegView(out)}</p>${chosen?`<h4>נכנס</h4><p>${spaceTransferLegView(chosen)}</p>${out.date!==chosen.date?'<p class="warning-note">התאריכים שונים. כל תנועה נשארת בתאריך ובחודש המקור שלה.</p>':''}`:''}</article>`:''}<button class="btn" type="button" data-overview="transfer-save" data-overview-focus="transfer-save" ${!chosen?'disabled':''}>${state.privateMatchSaving?'שומר…':'אישור התאמה פרטית'}</button></fieldset>${selection.blocked?'<p class="warning-note">לפני התאמה חדשה, פתחו את המרחבים של ההתאמות הנעולות או הסירו התאמות שאינן תקפות.</p>':''}<h4>ההתאמות שלך</h4>${selection.matches.length?selection.matches.map(m=>`<article class="panel"><p>${m.status==='current'?spaceTransferLegView(m.out)+'<br>↔<br>'+spaceTransferLegView(m.in):m.status==='locked'?'התאמה מוצפנת · יש לפתוח את כל מרחבי המקור במכשיר כדי לאמת אותה.':'המקור השתנה, הוצפן או אינו זמין. ההתאמה אינה תקפה; יש להסיר ולבדוק מחדש.'}</p><button class="btn" type="button" data-overview="transfer-delete" data-id="${esc(m.id)}" data-overview-focus="match:${esc(m.id)}" ${state.busy||state.privateMatchSaving||!state.privateMatches?'disabled':''}>הסרת ההתאמה הפרטית</button></article>`).join(''):'<p class="help">אין עדיין התאמות פרטיות שמורות.</p>'}<p class="help" role="status">${state.transferNotice?esc(state.transferNotice):''}</p></section>`;
}
async function loadSpaceTransferMatches(state,signal){
 const body=await spaceOverviewJSON('/api/transfer-matches',signal);
 if(spaceOverview!==state||signal.aborted)return;
 if(body.accountId!==state.user||accountId!==state.user){clearSpaceOverview();spaceRequireReload();render();return;}
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.items))throw Error('Invalid private matches');
 state.privateMatches=body;await hydrateSpaceSealedMatches(state);state.transferError='';
}
async function saveSpaceTransferMatch(action,id){
 const state=spaceOverview;if(!state||state.busy||state.privateMatchSaving||state.matchUnlocking||!state.privateMatches)return;
 const selection=transferBrowserSelection(state.entries,state.privateMatches.items),out=selection.legs.find(l=>l.key===state.transferOut),incoming=selection.legs.find(l=>l.key===state.transferIn);
 if(action==='transfer-save'&&(selection.blocked||!transferPairValid(out,incoming)))return;
 if(action==='transfer-delete'&&!state.privateMatches.items.some(m=>m.id===id))return;
 let body=action==='transfer-save'?{accountId:state.user,out:out.ref,in:incoming.ref,confirmed:true,revision:state.privateMatches.revision}:{accountId:state.user,id,revision:state.privateMatches.revision};
 state.privateMatchSaving=true;state.transferError='';state.transferNotice='';spaceOverviewRender();
 try{
  if(action==='transfer-save'&&[out,incoming].some(l=>state.entries.get(l.ref.budget)?.matching)){
   const keys=spaceTransferKeys(state),sources=[];
   for(const leg of [out,incoming]){const matching=state.entries.get(leg.ref.budget)?.matching;sources.push({budget:leg.ref.budget,revision:leg.ref.revision,token:await transferMatchToken(state.user,leg.ref,keys.get(leg.ref.budget)),...(matching?{keyId:matching.envelope.keyId,context:matching.envelope.context}:{})});}
   body={accountId:state.user,confirmed:true,revision:state.privateMatches.revision,sealed:await sealTransferMatch(state.user,sources,out.ref,incoming.ref,keys)};
   if(spaceOverview!==state||accountId!==state.user)return;
  }
  const result=await spaceOverviewJSON('/api/transfer-matches',state.controller.signal,{method:action==='transfer-save'?'POST':'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(spaceOverview!==state)return;
  if(result.accountId!==state.user||accountId!==state.user){clearSpaceOverview();spaceRequireReload();render();return;}
  if(!Number.isSafeInteger(result.revision)||!Array.isArray(result.items))throw Error('Invalid private matches');
  state.privateMatches=result;await hydrateSpaceSealedMatches(state);if(spaceOverview!==state)return;state.transferOut='';state.transferIn='';state.transferNotice=action==='transfer-save'?'ההתאמה הפרטית נשמרה. הסכומים בתקציבים לא השתנו.':'ההתאמה הוסרה. תנועות המקור לא השתנו.';
 }catch(error){
  if(spaceOverview!==state)return;
  if([401,403,404].includes(error.status)){clearSpaceOverview();spaceRequireReload();render();return;}
  state.privateMatches=null;state.transferError='לא ניתן לאשר את השמירה. רעננו את הנתונים ובדקו את רשימת ההתאמות לפני ניסיון נוסף.';
 }finally{if(spaceOverview===state){state.privateMatchSaving=false;spaceOverviewRender();}}
}
