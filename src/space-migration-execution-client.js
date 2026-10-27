function migrationCardsView(manifest){const cards=manifest.cards??[];if(!cards.length)return '';return `<section class="migration-card-review" aria-labelledby="migration-cards-title"><h4 id="migration-cards-title">כרטיסים ושיוכי תשלום שיעברו</h4><ul>${cards.map(c=>`<li><bdi>${esc(c.name)}</bdi> · כינוי <bdi>${esc(c.alias||'לא צוין')}</bdi>${c.billingDay?` · יום חיוב <bdi dir="ltr">${c.billingDay}</bdi>`:''}${c.removedFrom?` · הופסק החל מ־<bdi dir="ltr">${esc(c.removedFrom)}</bdi>`:''}<details class="group"><summary>זהות הכרטיס במקור וביעד</summary><p><bdi>${esc(c.sourceRef)}</bdi></p><p><bdi>${esc(c.targetRef)}</bdi></p></details></li>`).join('')}</ul><p class="help">מזהי הכרטיסים, ימי החיוב, הכינויים וההתחייבויות נשמרים עם אותו חשבון משלם. חיוב שכבר כלול בדיווח החודשי לא מתווסף שוב. זו העברת רישום בלבד; דוחות מקור, חיובים מפורטים, חיבורים והודעות אינם מועתקים. כרטיס שהועבר מסומן במקור כדי שגיבוי ישן לא יחזיר אותו אוטומטית.</p></section>`;}
function migrationChequesView(manifest){
 const cheques=manifest.cheques??[];
 if(!cheques.length)return '<p>אין צ׳קים ידניים להעברה.</p>';
 return `<section aria-labelledby="migration-cheques-title"><h4 id="migration-cheques-title">צ׳קים ידניים שיהיו גלויים ביעד</h4><ul>${cheques.map(e=>`<li><bdi>${esc(e.name)}</bdi> · <bdi>${esc(e.category)}</bdi> · ${money(e.amountCents/100)} · מספר <bdi dir="ltr">${esc(e.number||'לא צוין')}</bdi> · תאריך <bdi class="migration-term-date" dir="ltr">${esc(e.date)}</bdi> · חודש <bdi class="migration-term-date" dir="ltr">${esc(e.month)}</bdi> · ${{pending:'ממתין',cleared:'נפרע',cancelled:'בוטל'}[e.status]} · ${e.accounting==='included'?'כלול בסכום החודשי':'נוסף לסכום החודשי'}</li>`).join('')}</ul><p class="help">המצב והשיוך המקוריים נשמרים. צ׳ק שבוטל אינו נוסף לתזרים; צ׳ק שכבר כלול אינו מחויב שוב. המעבר אינו מאשר פירעון בבנק.</p></section>`;
}
function migrationCommitmentsView(manifest){
 const commitments=manifest.commitments??[],loans=manifest.loans??[];
 return `<section aria-labelledby="migration-commitments-title"><h4 id="migration-commitments-title">התחייבויות והלוואות שיעברו עם החשבון</h4><p class="help">רק פריטים ששויכו במפורש לחשבון הנבחר עוברים איתו. שאר הפריטים נשארים במקור באותם מזהים וחשבונות. נתוני אמת נשארים כפי שדווחו; העברה זו אינה מאשרת שבוצע תשלום בבנק.</p>${commitments.length?`<ul>${commitments.map(e=>`<li><bdi>${esc(e.name)}</bdi> · ${e.kind==='income'?'הכנסה מתוכננת':e.sourceType==='card'?'הוצאה מתוכננת בכרטיס':'הוצאה מתוכננת'} · מחיר כולל ${money(e.totalCents/100)}, ${e.payments===1?'תשלום אחד':e.payments+' תשלומים'} החל מ־<bdi class="migration-term-date" dir="ltr">${esc(e.firstMonth)}</bdi></li>`).join('')}</ul>`:'<p>אין התחייבויות ישירות להעברה.</p>'}${loans.length?`<ul>${loans.map(e=>`<li><bdi>${esc(e.name)}</bdi> · החזר חודשי ${money(e.monthlyCents/100)}, ${e.months} חודשים החל מ־<bdi class="migration-term-date" dir="ltr">${esc(e.firstMonth)}</bdi></li>`).join('')}</ul>`:'<p>אין הלוואות להעברה.</p>'}<p class="help">תאריכים, סכומים, מספר תשלומים והשיוך נשמרים. סימון חיובים שכבר נכללו בדיווח מונע הוספה כפולה; התחזית המפורטת כוללת גם התחייבויות מעבר לאופק התצוגה הרגיל.</p></section>`;
}
function migrationExecutionDenied(error){if(![401,403].includes(error.status))return false;clearSpaceMigrationReview();spaceRequireReload();render();return true;}
function migrationExecutionView(state){
 const prepared=state.execution,op=state.pendingOperation;
 let html=`<section class="panel" data-migration-execution-panel><h3>מעבר ידני מוגן</h3><p class="help">המסלול המוגן מעביר חשבון ופריטים ששויכו אליו במפורש מול יעד שמור וריק. חשבון מיובא דורש דיווחים מלאים, זהויות מקור וקבלות תקינות, יתרה כללית דורשת יתרות מפורשות ותואמות לכל החשבונות באותו תאריך. חסכון מחייב גם בחירות בעלות ויעדים מפורשות והיסטוריה מכוסה. כרטיס ידני דורש תצורה ושיוך משלם מפורשים. דוחות כרטיס, ראיות וחיבורים דורשים מסלול נוסף. מקורות מורכבים נשארים בסקירה בלבד.</p>`;
 if(op)html+=`<p class="warning-note">נשלחה פעולה שטרם אושרה במכשיר. יש לבדוק את מצבה לפני ניסיון נוסף. סגירה אינה מבטלת פעולה שכבר התקבלה.</p><button class="btn" type="button" data-migration="check-operation" ${state.executing?'disabled':''}>בדיקת מצב הפעולה</button>`;
 else if(prepared?.eligible){
  const m=prepared.manifest;
  html+=`<h4>התוצאה המדויקת המוצעת</h4><p><bdi>${esc(m.account.name)}</bdi> יוסר מהמקור ויתווסף ליעד באותו מזהה. ${prepared.targetAudienceCount===1?'היעד זמין לבעליו.':`ליעד יש ${prepared.targetAudienceCount} בעלי גישה כרגע.`} שם החשבון ודיווחיו יהיו גלויים להם. מסמכי מקור, היסטוריה, חיבורים והגדרות אישיות אינם מועתקים.</p><p>יתרת פתיחה שמועברת: ${money(m.openingCents/100)}. נתוני החודשים והערכות החשבון נשמרים; לא מתבצעת העברה בבנק.</p>${migrationCardsView(m)}${migrationCommitmentsView(m)}${migrationChequesView(m)}${typeof migrationSavingsExecutionView==='function'?migrationSavingsExecutionView(m.savings):''}${m.imported?`<section class="warning-note" aria-labelledby="migration-import-baseline-title"><h4 id="migration-import-baseline-title">מעבר מקורות מיובאים וקו בסיס חדש</h4><p>${m.imported.movementCount} תנועות ו־${m.imported.receiptCount===1?'קבלת קליטה אחת':m.imported.receiptCount+' קבלות קליטה'} יעברו עם החשבון. פרטי המקור המדויקים מפורטים בסקירת הייבוא לעיל; התיאורים, המוטבים, האסמכתאות והסכומים יהיו גלויים לבעלי הגישה ביעד.</p><p>צילומי התקציב המקוריים, שמות הקבצים, הכללים והשיוכים האישיים נשארים בהיסטוריה שמורה במקור. ביעד נוצר רישום מצומצם עם מזהי הדוחות המקוריים, ללא צילום של חשבונות אחרים. סימוני זהות בשני המרחבים חוסמים קליטה חוזרת גם לחשבון חדש.</p><ul>${m.imported.batches.map(b=>`<li><bdi>${esc(b.id)}</bdi> · <bdi dir="ltr">${esc(b.from)}</bdi> עד <bdi dir="ltr">${esc(b.to)}</bdi> · שם קובץ מצומצם <bdi>${esc(b.file)}</bdi></li>`).join('')}</ul><p>דוחות ישנים הם קו בסיס שאינו ניתן לביטול בנפרד. רק ביטול מעבר מוגן יכול לשחזר את שני הצדדים, ורק כל עוד לא נערכו. קליטה חדשה שלא חופפת למקורות שסומנו נשארת זמינה.</p></section>`:''}<div class="table-wrap" tabindex="0" role="region" aria-label="יתרות ותזרים לפני ואחרי מעבר"><table><caption>תחזית לפי אותו מודל לפני ואחרי · ₪</caption><thead><tr><th>חודש</th><th>יתרת מקור לפני</th><th>יתרת מקור אחרי</th><th>יתרת יעד אחרי</th><th>תזרים מקור לפני</th><th>תזרים מקור אחרי</th><th>תזרים יעד אחרי</th></tr></thead><tbody>${m.comparisons.map(r=>`<tr><th><bdi dir="ltr">${esc(r.month)}</bdi></th>${['sourceBeforeBalanceCents','sourceAfterBalanceCents','targetAfterBalanceCents','sourceBeforeNetCents','sourceAfterNetCents','targetAfterNetCents'].map(k=>`<td>${money(r[k]/100)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><details class="group"><summary>מה משתנה בהכנסות, הוצאות, העברות והערכות הבסיס?</summary><p>הערכות הבסיס של החשבון עוברות ליעד; המידע של שאר החשבונות נשאר במקור. הדיווחים בפועל וההערכות מובחנים בכל חודש.</p>${m.comparisons.map(r=>`<details class="group"><summary><bdi dir="ltr">${esc(r.month)}</bdi> · ${r.sourceBeforeActual?'מקור לפני: בפועל':'מקור לפני: הערכה'} · ${r.sourceAfterActual?'מקור אחרי: בפועל':'מקור אחרי: הערכה'} · ${r.targetAfterActual?'יעד אחרי: בפועל':'יעד אחרי: הערכה'}</summary><div class="table-wrap" tabindex="0" role="region" aria-label="שינוי רכיבי החודש"><table><thead><tr><th>רכיב</th><th>מקור לפני</th><th>מקור אחרי</th><th>יעד לפני</th><th>יעד אחרי</th></tr></thead><tbody>${r.flows.map(f=>`<tr><th>${esc(({income:'הכנסה',incomingTransfers:'העברות נכנסות',outgoingTransfers:'העברות יוצאות פנימיות',spending:'הוצאות',saving:'הפקדות חסכון והשקעה',planned:'התחייבויות והכנסות מתוכננות, נטו'})[f.field])}</th>${['beforeCents','sourceAfterCents','targetBeforeCents','targetAfterCents'].map(k=>`<td>${money(f[k]/100)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`).join('')}<h4>הערכות בסיס שמועברות</h4><ul>${Object.entries(m.defaultsCents).filter(([,n])=>n).map(([key,n])=>`<li><bdi>${esc((fields.find(f=>f[0]===key)??[key,key])[1])}</bdi> · ${money(n/100)}</li>`).join('')||'<li>אין סכומי בסיס שאינם אפס.</li>'}</ul></details><label class="check"><input type="checkbox" data-migration-consent="privacy" ${state.consentPrivacy?'checked':''}><span>בדקתי את פרטי החשבון ואת מי שיוכל לראותם ביעד.</span></label><label class="check"><input type="checkbox" data-migration-consent="move" ${state.consentMove?'checked':''}><span>${m.savings?'אני מאשר את מעבר רישום העו״ש ואת חלוקת נכסי החסכון, המטרות וההיסטוריה לפי התוכנית הזו.':'אני מאשר להסיר את החשבון ודיווחיו מהמקור ולהוסיף ליעד יחד.'} ביטול יתאפשר רק ללא שינויים מאוחרים.</span></label><button class="btn primary" type="button" data-migration="apply" ${state.executing||!state.consentPrivacy||!state.consentMove?'disabled':''}>העברת החשבון ושמירת שני המרחבים</button>`;
 }else if(prepared)html+=`<ul>${prepared.reasons.map(r=>`<li>${esc(r.message)}</li>`).join('')}</ul>`;
 else html+=`<button class="btn" type="button" data-migration="prepare" ${state.busy||state.executing||!state.data?.review?'disabled':''}>בדיקת זכאות והכנת תוכנית מדויקת</button>`;
 html+='</section>';
 html+=`<section class="panel"><h3>פעולות המעבר הפרטיות שלך</h3><p class="help">היומן הזה גלוי רק לחשבון המחובר. בדיקת מצב אינה שולחת מעבר חדש.</p>${state.operationsError?`<p class="error-box" role="alert">${esc(state.operationsError)}</p>`:''}<button class="btn" type="button" data-migration="operations" ${state.executing?'disabled':''}>רענון מצב המעברים</button>${(state.operations??[]).map(r=>`<div class="group"><p><bdi>${esc(r.accountName??'פעולה שאינה זמינה')}</bdi> · ${r.status==='applied'?'המעבר נשמר':r.status==='undone'?'המעבר בוטל':'ההרשאה אינה זמינה'}</p>${r.canUndo?`<label class="check"><input type="checkbox" data-migration-undo-consent="${esc(r.id)}" ${state.undoConsent===r.id?'checked':''}><span>להחזיר את שני המרחבים יחד למצב שלפני המעבר, רק אם לא השתנו.</span></label><button class="btn" type="button" data-migration="undo" data-id="${esc(r.id)}" ${state.executing||state.undoConsent!==r.id?'disabled':''}>ביטול המעבר ושמירת שני המרחבים</button>`:r.status==='applied'?'<p class="help">אין ביטול זמין אחרי שינוי בנתונים או בהרשאות.</p>':''}</div>`).join('')}</section>`;
 return html;
}
async function migrationOperations(state){
 try{const body=await spaceOverviewJSON('/api/space-migrations?history=1',state.controller.signal);if(spaceMigrationReview!==state)return;
 if(body.accountId!==state.user||accountId!==state.user){clearSpaceMigrationReview();spaceRequireReload();render();return;}
 if(!Array.isArray(body.items))throw Error('Invalid operations');state.operations=body.items;state.operationsError='';
 }catch(error){if(spaceMigrationReview===state&&migrationExecutionDenied(error))return;if(spaceMigrationReview===state){state.operations=[];state.operationsError='לא ניתן לבדוק את מצב המעברים. רעננו לפני פעולה נוספת.';}}
 if(spaceMigrationReview===state)renderSpaceMigrationReview();
}
async function prepareMigrationExecution(){
 const state=spaceMigrationReview;if(!state||state.busy||state.executing||!state.data?.review||state.pendingOperation)return;
 if(state.data.review.savings?.from.present){prepareMigrationSavingsExecution();return;}
 state.executing=true;state.execution=null;state.consentPrivacy=false;state.consentMove=false;state.error='';renderSpaceMigrationReview();
 try{
  const query=new URLSearchParams({accountId:state.user,source:state.source,target:state.target,bankAccount:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision});
  const body=await spaceOverviewJSON('/api/space-migrations?'+query,state.controller.signal);if(spaceMigrationReview!==state)return;
  if(body.accountId!==state.user||accountId!==state.user){clearSpaceMigrationReview();spaceRequireReload();render();return;}
  if(typeof body.eligible!=='boolean'||!Array.isArray(body.reasons))throw Error('Invalid preparation');state.execution=body;
 }catch(error){if(spaceMigrationReview===state&&migrationExecutionDenied(error))return;if(spaceMigrationReview===state){state.execution=null;state.data=null;state.error='לא ניתן להכין מעבר מהסקירה הזו. רעננו ובחרו מחדש; שום נתון לא שונה.';}}
 finally{if(spaceMigrationReview===state){state.executing=false;renderSpaceMigrationReview();}}
}
async function sendMigrationExecution(action,id){
 const state=spaceMigrationReview;if(!state||state.executing||state.busy||state.pendingOperation||!canSwitchBudget())return;
 let body;
 if(action==='apply'){
  if(!state.execution?.eligible||!state.consentPrivacy||!state.consentMove||!state.data?.review)return;
  body={action,operation:crypto.randomUUID(),accountId:state.user,source:state.source,target:state.target,bankAccount:state.account,sourceRevision:state.data.sourceRevision,targetRevision:state.data.targetRevision,reviewToken:state.execution.reviewToken,confirmedMove:true,confirmedPrivacy:true,...(state.savingsProposal?{savingsProposal:state.savingsProposal}:{})};
 }else{
  const op=state.operations?.find(r=>r.id===id&&r.canUndo);if(!op||state.undoConsent!==id)return;
  body={action:'undo',operation:id,accountId:state.user,sourceRevision:op.sourceRevision,targetRevision:op.targetRevision,confirmedUndo:true};
 }
 state.pendingOperation=body.operation;state.executing=true;state.error='';renderSpaceMigrationReview();
 try{
  const result=await spaceOverviewJSON('/api/space-migrations',state.controller.signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(spaceMigrationReview!==state)return;
  if(result.accountId!==state.user||accountId!==state.user){clearSpaceMigrationReview();spaceRequireReload();render();return;}
  if(!['applied','undone'].includes(result.status))throw Error('Unconfirmed operation');
  await migrationExecutionFinished(state,result.status);
 }catch(error){if(spaceMigrationReview===state&&migrationExecutionDenied(error))return;if(spaceMigrationReview===state){state.execution=null;state.data=null;state.error='לא ניתן לאשר את תוצאת הפעולה במכשיר. בדקו את מצב הפעולה; אל תשלחו מעבר חדש.';}}
 finally{if(spaceMigrationReview===state){state.executing=false;renderSpaceMigrationReview();}}
}
async function migrationExecutionFinished(state,status){
 if(spaceMigrationReview!==state)return;clearSpaceMigrationReview();
 // Reload saved active data so a stale in-memory budget cannot later overwrite a move.
 const loadedCurrent=await load(false,true);if(!loadedCurrent){notify('הפעולה נשמרה בשרת, אך לא ניתן לטעון את הנתונים העדכניים. רעננו לפני עריכה נוספת.');return;}
 openSpaceMigrationReview(status==='undone'?'המעבר בוטל ושני המרחבים נשמרו.':'המעבר נשמר בשני המרחבים.');
}
async function checkMigrationExecution(){
 const state=spaceMigrationReview;if(!state||state.executing||!state.pendingOperation)return;state.executing=true;renderSpaceMigrationReview();
 try{const result=await spaceOverviewJSON('/api/space-migrations?operation='+encodeURIComponent(state.pendingOperation),state.controller.signal);if(spaceMigrationReview!==state)return;
 if(result.accountId!==state.user||accountId!==state.user){clearSpaceMigrationReview();spaceRequireReload();render();return;}
 if(['applied','undone'].includes(result.status))await migrationExecutionFinished(state,result.status);else throw Error('Unavailable');
 }catch(error){if(spaceMigrationReview===state&&migrationExecutionDenied(error))return;if(spaceMigrationReview===state)state.error='מצב הפעולה עדיין אינו מאומת. רעננו את האפליקציה ובדקו את יומן המעברים לפני ניסיון נוסף.';}
 finally{if(spaceMigrationReview===state){state.executing=false;renderSpaceMigrationReview();}}
}
