let bankUI=null,bankApi=null;
function bankRowCompatible(r,k){return bankApi[1].compatible(r,k)||r.amountCents>0&&!['salary','otherIncome','incomingTransfers','outgoingTransfers'].includes(k);}
function bankIsRefund(r,k){return r.amountCents>0&&!['salary','otherIncome','incomingTransfers','outgoingTransfers','exclude',''].includes(k);}
function bankTargetLabel(r,k,label){if(bankIsRefund(r,k))return label+(k.startsWith('card')?' · זיכוי בכרטיס':/Saving|Invest/.test(k)?' · החזר שמפחית מהפקדות החודש':k==='loanRepayment'?' · ביטול או החזר של תשלום הלוואה':' · החזר שמפחית מההוצאות');if(r.amountCents>0&&k==='outgoingTransfers')return label+' · מתאים לחיוב בלבד';if(r.amountCents<0&&['salary','otherIncome','incomingTransfers'].includes(k))return label+' · מתאים לזיכוי בלבד';return label;}
function bankRefundHelp(rows){return rows.some(r=>r.amountCents>0)?'<p class="help">כסף שהועבר מחשבון פרטי למשותף אפשר לסווג כ״העברה נכנסת״: הוא מגדיל את יתרת החשבון בלי להיחשב להכנסה או לחיסכון. הסכום לא מועתק אוטומטית לחודשים הבאים. זיכוי בכרטיס או החזר תשלום אפשר לשייך לאותו שדה של החיוב המקורי — הוא יופחת מהחיובים, ולא יתווסף כהכנסה. כספי הלוואה חדשה או משיכת חיסכון אינם החזר תשלום; בחר ״ללא השפעה״ ובדוק את היתרות בנפרד.</p>':'';}
const bankDialog=()=>document.getElementById('bank-import-dialog');
function bankImportHasDraft(){return !!bankUI&&!bankUI.committing||(typeof reportInboxHasDraft==='function'&&reportInboxHasDraft());}
function bankSettingsView(){const last=plan.bankImport?.batches.at(-1);return `<section class="panel"><h2>דוחות בנק ואשראי</h2><p class="help">CSV, XLSX, XLS או PDF מהבנק. הקובץ נקרא במכשיר; לאחר סקירה נשמרים סכומים חודשיים, כללי סיווג ורישום מצומצם למניעת כפילויות בתקציב שלך.</p><button class="btn primary" data-action="bank-import-open">פתיחת מרכז הדוחות</button><button class="btn" data-action="bank-import-restart">התחלה מחדש מדוח בנק</button>${last?`<p>ייבוא אחרון: <bdi>${esc(last.file)}</bdi> · <bdi>${esc(last.from)}–${esc(last.to)}</bdi></p><button class="btn" data-action="bank-import-undo" data-id="${esc(last.id)}">ביטול הייבוא האחרון</button><p class="help">אפשר לבטל אם החודשים והחיסכון לא נערכו מאז. ניתן לייצא גיבוי בהגדרות לפני קליטה.</p>`:''}</section>`;}
function bankUIError(error){if(!bankUI)return;bankUI.error=error.message;bankRender();bankDialog()?.querySelector?.('[data-bank-save-error]')?.scrollIntoView?.({block:'nearest',behavior:'instant'});}
function bankSavingImportNote(){
 const summary=bankImportedSavingSummary(plan);if(!summary.count)return '';
 return `<aside class="bank-savings-note"><strong>${summary.count} העברות לחיסכון נקלטו מהבנק · ${money(summary.totalCents/100)}</strong><p>ההפקדות כבר שמורות בדיווחים החודשיים; אין צורך להזין אותן שוב. חסרה רק יתרת החיסכון הכוללת, כולל כסף שהיה שם קודם. דוח העו״ש אינו מציג בהכרח את היתרה בחשבונות החיסכון.</p><p class="help">הזן את היתרה הנוכחית כולל ההפקדות האלה. הן לא יתווספו אליה שוב.</p></aside>`;
}
function bankScopeValid(){return bankUI?.scope===accountId+'/'+activeBudget;}
function bankOpen({restart=false}={}){
 if(!loaded||loading||saving)return;
 if(dirty&&!isUnconfiguredBudget(plan)||monthlyPending||hasMonthlyInputDraft()||hasSavingsDraft()||hasDetailDraft()||hasSecurityDraft()||hasScenarioDraft()||itemDraft.id||itemDraft.name.trim()||itemDraft.amount>0){notify('יש לשמור את השינויים ולסיים עריכות לפני ייבוא דוח.');return;}
 const importId=typeof cashUI!=='undefined'?cashUI.selected:null,a=restart?null:cashAccountList(plan).find(a=>a.id===importId)??plan.bankImport?.accounts[0];bankUI={scope:accountId+'/'+activeBudget,revision,snapshot:JSON.stringify(plan),id:crypto.randomUUID(),accountId:a?.id??crypto.randomUUID(),label:a?.label??'העו״ש האישי שלי',bankName:a?.bankName??'hapoalim',rules:clone(a?.rules??[]),choices:{},modes:{},directIncluded:{},reportScope:'complete',records:[],inspection:null,from:'',to:'',busy:false,committing:false,error:'',personal:a?.personal===true,page:0,groupPage:0,reviewView:'groups',reviewFilter:'pending',remember:true,openGroups:{},restart,base:restart?{startMonth:todayMonth(),opening:0,buffer:5000,horizon:24,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true}:null};
 const dialog=document.createElement('dialog');dialog.id='bank-import-dialog';dialog.className='bank-import-dialog';dialog.setAttribute('aria-labelledby','bank-title');document.body.append(dialog);
 dialog.addEventListener('toggle',bankGroupToggle,true);dialog.addEventListener('change',bankChange);dialog.addEventListener('click',bankClick);dialog.addEventListener('cancel',event=>{event.preventDefault();bankClose();});bankRender();dialog.showModal();
}
function bankClose(){if(bankUI?.busy)return;if(bankUI?.committed&&dirty){notify('הייבוא טרם נשמר. יש לנסות לשמור שוב לפני סגירה.');return;}bankUI?.worker?.terminate();bankUI=null;bankDialog()?.remove();if(typeof saveDockUpdate==='function')saveDockUpdate();}
async function bankWorkerRequest(message){const ui=bankUI,worker=ui.worker??=new Worker('/bank-import/xlsx-worker.js');return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{cleanup();worker.terminate();ui.worker=null;reject(Error('קריאת הדוח ארכה מדי. נסה דוח קטן יותר.'));},20000),cleanup=()=>{clearTimeout(timeout);worker.removeEventListener('message',received);worker.removeEventListener('error',failed);},received=e=>{if(e.data.id!==id)return;cleanup();e.data.error?reject(Error(e.data.error)):resolve(e.data);},failed=()=>{cleanup();reject(Error('לא ניתן לקרוא את דוח הבנק.'));};worker.addEventListener('message',received);worker.addEventListener('error',failed);worker.postMessage({...message,id});});}
async function bankLoadFile(file){
 if(!file||!bankScopeValid()||bankUI.busy)return;const ui=bankUI;ui.busy=true;ui.error='';ui.records=[];ui.inspection=null;ui.choices={};ui.modes={};ui.pdfMeta=null;bankRender();
 try{
  if(file.size>5*1024*1024||!/\.(csv|xlsx|xls|pdf)$/i.test(file.name))throw Error('בחר דוח CSV, XLSX, XLS או PDF עד 5MB.');
  bankApi??=await Promise.all([import('/bank-import/parser.mjs'),import('/bank-import/classifier.mjs')]);
  const bytes=new Uint8Array(await file.arrayBuffer());if(bankUI!==ui)return;ui.fileName=file.name;
  if(/\.pdf$/i.test(file.name)){ui.worker?.terminate();ui.worker=null;const data=await bankWorkerRequest({action:'bank-pdf',bytes:bytes.buffer});ui.sheets=[];ui.sheet=null;ui.inspection=data.inspection;ui.pdfMeta=data.inspection.pdfReconciliation;bankSelectPDFAccount(ui);ui.bankName='one-zero';}
  else if(/\.xlsx?$/i.test(file.name)){ui.worker?.terminate();ui.worker=null;const data=await bankWorkerRequest({action:'load',bytes:bytes.buffer,format:/\.xls$/i.test(file.name)?'xls':'xlsx'});ui.sheets=data.sheets;ui.sheet=data.selected;if(!data.inspection)throw Error(data.notice);ui.inspection=data.inspection;}
  else{ui.worker?.terminate();ui.worker=null;ui.sheets=[];ui.inspection=bankApi[0].inspectCSV(bankApi[0].decodeCSV(bytes).text);}
  const parsed=bankApi[0].normalizeRows(ui.inspection,{defaultCurrency:'ILS'}),dates=parsed.records.map(r=>r.date).filter(Boolean).sort();if(!dates.length)throw Error('לא זוהו תאריכים תקינים.');ui.from=ui.pdfMeta?.from??dates[0];ui.to=ui.pdfMeta?.to??dates.at(-1);ui.coverageConfirmed=false;ui.monthsConfirmed=false;if(ui.base){ui.base.startMonth=ui.from.slice(0,7);if(ui.pdfMeta&&ui.from.endsWith('-01'))ui.base.opening=ui.pdfMeta.openingCents/100;}
  await bankPrepare();
 }catch(error){if(bankUI===ui)ui.error=error.message;}finally{if(bankUI===ui){ui.busy=false;bankRender();}}
}
function bankSelectPDFAccount(ui){
 const accounts=cashAccountList(plan),current=accounts.find(a=>a.id===ui.accountId);
 if(current?.bankName==='one-zero')return;
 const matches=accounts.filter(a=>a.bankName==='one-zero');
 if(matches.length>1)throw Error('זוהה דוח וואן זירו. בחר את חשבון וואן זירו המתאים וטען שוב את הדוח.');
 const a=matches[0];if(!a&&!current)return;
 ui.accountId=a?.id??crypto.randomUUID();ui.label=a?.label??'וואן זירו';ui.rules=clone(a?.rules??[]);ui.personal=a?.personal===true;ui.accountNotice='זוהה דוח וואן זירו · '+(a?'נבחר החשבון '+a.label:'נבחר חשבון וואן זירו חדש');
}
async function bankPrepare(){
 const ui=bankUI,parsed=bankApi[0].normalizeRows(ui.inspection,{defaultCurrency:'ILS',period:{from:ui.from,to:ui.to}});
 ui.records=await Promise.all(parsed.records.map(r=>bankIdentity(r,ui.accountId)));ui.choices={};ui.modes={};ui.page=0;ui.groupPage=0;ui.openGroups={};ui.groupRowPages={};ui.summary=parsed.summary;
 bankSuggest();bankSelectDefaultMonths();
}
function bankSelectDefaultMonths(){bankUI.modes=bankDefaultMonthModes(bankWorkingPlan(),bankCurrentPreview(),todayMonth(),bankUI.reportScope);}
function bankSuggest(){
 const ui=bankUI;
 for(const r of ui.records){if(ui.choices[r.line]?.manual)continue;if(r.reversal){ui.choices[r.line]={field:'',reviewed:false,reason:'ביטול חיוב: בחר את אותו שדה של החיוב המקורי כדי להפחית ממנו'};continue;}const c=bankApi[1].suggest(r,ui.rules),personalRule=/מוטב שהגדרת|כלל אישי שהגדרת/.test(c.reason);
  ui.choices[r.line]={field:c.destination,reviewed:(c.strength==='clear'||c.strength==='explicit')&&(!personalRule||ui.personal),reason:c.reason,refund:c.refund===true};
 }
}
function bankWorkingPlan(){return bankUI?.base??plan;}
function bankCurrentPreview(){return bankPreview(bankWorkingPlan(),bankUI.records,{...bankUI,choices:bankUI.choices});}
function bankRender(){
 const ui=bankUI,dialog=bankDialog();if(!ui||!dialog)return;
 const working=bankWorkingPlan();
 const preview=ui.records.length?bankCurrentPreview():null,fieldsForRows=[...budgetFields(working).map(([id,label])=>[id,label]),['exclude','ללא השפעה על ההכנסות או ההוצאות']],selectedAccount=cashAccountList(plan).find(a=>a.id===ui.accountId);
 dialog.innerHTML=`<div class="section-heading"><h2 id="bank-title">קליטת דוח מהבנק</h2><button class="btn" data-bank="close" aria-label="סגירת הייבוא" ${ui.busy?'disabled':''}>×</button></div><p class="help">תקציב: ${esc(typeof activeBudgetName==='function'?activeBudgetName():plan.profileName||'התקציב הפעיל')}. הקובץ נשאר בזיכרון המכשיר. השמירה משתמשת באותה הגנת גרסאות ובהצפנת התקציב, אם הופעלה.</p>${demoPreview?'<p class="banner">דוגמה בלבד · הייבוא לא נשמר בחשבון שלך.</p>':''}${ui.committed?`<p role="status">${dirty?'הקליטה מוכנה אך השמירה נכשלה. אפשר לנסות שוב ללא קליטה כפולה.':'הקליטה מוכנה לסיום השמירה.'}</p>${ui.error?`<p class="error-box" role="alert" id="bank-save-error" data-bank-save-error>${esc(ui.error)}</p>`:''}<button class="btn primary" data-bank="retry">ניסיון שמירה נוסף</button>`:`<fieldset ${ui.busy?'disabled':''}><legend>1. בחירת החשבון והדוח</legend><p class="help">${esc(ui.label)}</p>${cashAccountList(plan).length?`<label class="field">חשבון הבנק<select data-bank-account>${cashAccountList(plan).map(a=>`<option value="${esc(a.id)}" ${a.id===ui.accountId?'selected':''}>${esc(a.label)} · ${a.bankName==='one-zero'?'וואן זירו':'הפועלים'}</option>`).join('')}<option value="new" ${!selectedAccount?'selected':''}>חשבון נוסף</option></select></label>`:''}<details class="group"><summary>פרטי החשבון וכללי סיווג (רשות)</summary><label class="field">בנק<select data-bank-provider ${selectedAccount?.bankName?'disabled':''}><option value="hapoalim" ${ui.bankName==='hapoalim'?'selected':''}>הפועלים</option><option value="one-zero" ${ui.bankName==='one-zero'?'selected':''}>וואן זירו</option></select></label><label class="field">שם לזיהוי החשבון<input data-bank-label value="${esc(ui.label)}" maxlength="80"></label><label class="check"><input type="checkbox" data-bank-personal ${ui.personal?'checked':''}><span>זהו העו״ש האישי שלי; להפעיל את הכללים שהגדרתי לחיסכון ולהשקעות</span></label></details>${ui.accountNotice?`<p class="banner">${esc(ui.accountNotice)}</p>`:''}<label class="field">דוח CSV, XLSX, XLS או PDF מהבנק<input type="file" data-bank-file accept=".csv,.xlsx,.xls,.pdf"></label>${ui.sheets?.length?`<label class="field">גיליון<select data-bank-sheet>${ui.sheets.map(s=>`<option value="${esc(s.name)}" ${s.name===ui.sheet?'selected':''}>${esc(s.name)}${s.empty?' · ריק':''}</option>`).join('')}</select></label>`:''}${ui.busy?'<p role="status">קורא ומפענח את הדוח…</p>':''}${ui.error&&!preview?`<p class="error-box" role="alert" id="bank-save-error" data-bank-save-error>${esc(ui.error)}</p>`:''}
 ${ui.restart?`<section class="group"><h3>התחלה מחדש מדוח בנק</h3><p>השמירה תחליף את הנתונים הידניים, ההלוואות, המטרות וההיסטוריה בתקציב נקי המבוסס על הדוח. עד לשמירה, התקציב הקיים נשאר כפי שהוא.</p><button class="btn" data-bank="backup">הורדת גיבוי לפני איפוס</button><div class="form-grid"><label class="field">החודש הראשון בתקציב<input type="month" data-bank-start value="${working.startMonth}"></label><label class="field">יתרת עו״ש בתחילת החודש הראשון · ₪<input type="number" step="0.01" data-bank-opening value="${working.opening}"></label><label class="field">יתרת ביטחון · ₪<input type="number" min="0" data-bank-buffer value="${working.buffer}"></label></div><p class="help">יתרת הפתיחה אינה מחושבת משורה מקרית. יתרות מהדוח ישמשו כנקודות עיגון מתוארכות. חיסכון קיים ומטרות ניתן להגדיר אחרי הקליטה בלי לספור שוב הפקדות היסטוריות.</p></section>`:''}
 ${preview?`${bankPDFSummary()}<p><strong>מקור: <bdi>${esc(ui.fileName)}</bdi></strong> · ${ui.records.length} שורות</p><div class="form-grid"><label class="field">תחילת התקופה בדוח<input type="date" data-bank-from ${ui.pdfMeta?'readonly':''} value="${ui.from}"></label><label class="field">סוף התקופה בדוח<input type="date" data-bank-to ${ui.pdfMeta?'readonly':''} value="${ui.to}"></label></div><p class="help">בדוק שהטווח מכסה את כל התנועות, כולל ימים ללא פעילות. חודש נחשב מלא רק כשהדוח מכסה את כולו.</p><details class="group"><summary>מה כולל הדוח? · ${ui.reportScope==='partial'?'רק חלק מהתנועות':'כל התנועות בטווח המוצג'}</summary><fieldset class="bank-choice"><legend>היקף הדוח</legend><label><input type="radio" name="bank-report-scope" data-bank-scope value="complete" ${ui.reportScope!=='partial'?'checked':''}><span><strong>כל תנועות הבנק בטווח המוצג</strong><small>האפשרות הרגילה לדוח בנק. חודש שמכוסה כולו ייקלט כדיווח מלא.</small></span></label><label><input type="radio" name="bank-report-scope" data-bank-scope value="partial" ${ui.reportScope==='partial'?'checked':''}><span><strong>רק חלק מהתנועות</strong><small>למשל דוח שסונן למשכורות בלבד. החודשים ייקלטו כחלקיים ולא יחליפו דיווח מלא קיים.</small></span></label></fieldset></details>
 ${preview.rows.some(r=>r.missingReference)?'<p class="warning-note">בדוח יש תנועות ללא אסמכתא. הזיהוי מבוסס על החשבון, התאריך, הסכום ופרטי הפעולה. התאמה זהה בתוך הדוח או לדוח קודם תעצור את קליטת החודש כדי שלא למחוק תנועה אמיתית או לספור אותה פעמיים; אפשר לדלג על החודש עד לבירור.</p>':''}<h3>2. בדיקת הסיווג</h3><p class="help">משכורת, החזר הלוואה וכללים ברורים זוהו. העברות וכרטיסים דורשים זיהוי. הסכום ייכנס לשדה אחד בלבד; פירוטי רכישות לא יתווספו שוב לחיוב הכרטיס.</p><p>${preview.rows.filter(r=>r.state==='duplicate').length} כבר נקלטו · ${preview.rows.filter(r=>r.state==='conflict').length} סתירות · ${preview.rows.filter(r=>!r.reviewed&&r.state==='new').length} לבדיקה</p>${bankReviewView(preview,fieldsForRows)}
 <h3>3. החודשים והשינויים</h3><p class="help">החודשים המתאימים כבר נבחרו לקליטה. הסכומים שאישרת מהבנק יחליפו את הסכומים הקיימים באותם שדות. שדות אחרים יישארו כפי שהם. אפשר לפתוח חודש להשוואה או לדלג עליו.</p><details class="group"><summary>סיכום הקליטה · ${preview.months.filter(m=>m.mode!=='skip').length} חודשים ייקלטו · פירוט והשוואה</summary>${preview.months.map(m=>bankMonthView(m)).join('')}</details>${preview.months.filter(m=>m.mode!=='skip'&&bankPlannedDirect(working,m.month,ui.accountId).length&&typeof ui.directIncluded[m.month]!=='boolean').map(m=>bankDirectChoiceView(m)).join('')}${preview.months.some(m=>m.mode!=='skip'&&m.accountCount>1&&!m.balance)?'<p class="banner">ההכנסות וההוצאות יחוברו בין החשבונות. אין יתרות עו״ש מכל החשבונות לאותו תאריך, והסיכום בבית יתבסס על תחזית נפרדת לכל חשבון. העברה בין החשבונות שלך יש לסווג ״ללא השפעה על ההכנסות או ההוצאות״ בשני הדוחות.</p>':''}
 ${(working.savingTransfers??[]).filter(t=>t.status==='pending').map(t=>`<label class="check"><input type="checkbox" data-bank-transfer="${esc(t.id)}" ${(ui.transferIds??[]).includes(t.id)?'checked':''}><span>הדוח כולל את בקשת ההעברה לחיסכון מחודש ${esc(t.month)}: ${money(t.personal+t.shared)}. לסמן אותה כבוצעה בלי להוסיף שוב.</span></label>`).join('')}
 ${ui.restart&&!isUnconfiguredBudget(plan)?`<label class="check"><input type="checkbox" data-bank-reset ${ui.resetConfirmed?'checked':''}><span>שמרתי גיבוי או איני זקוק לנתונים הידניים; אני מאשר להחליפם לאחר סקירת הדוח</span></label>`:''}<p class="help">בלחיצה הבאה, התנועות שאושרו ייקלטו בחודשים שנבחרו והתקציב יישמר. תנועות שלא אושרו או שיש בהן סתירה יעצרו את הקליטה.</p>${ui.error?`<p class="error-box" role="alert" id="bank-save-error" data-bank-save-error>${esc(ui.error)}</p>`:''}<button class="btn primary" data-bank="apply" ${ui.error?'aria-describedby="bank-save-error"':''}>קליטת נתוני הבנק ושמירה בתקציב</button><p class="help">היסטוריית הייבוא מאפשרת לבטל את הייבוא האחרון אם לא נערכו הנתונים מאז.</p>`:''}</fieldset>`}`;
}
function bankGroupToggle(event){const e=event.target;if(bankUI&&e.matches?.('[data-bank-group-details]'))(bankUI.openGroups??={})[e.dataset.bankGroupDetails]=e.open;}
function bankReviewView(preview,fieldsForRows){
 const ui=bankUI,groups=bankReviewGroups(preview.rows),byRows=ui.reviewView==='rows';
 return `<p class="help">קבוצות לפי פעולה ומוטב · מציגים רק מה שדורש החלטה. ${ui.remember!==false?'שיוכים שתאשר ייזכרו לחשבון הזה בדוחות הבאים.':'השיוכים לא ייזכרו לדוחות הבאים.'}</p><div class="actions"><button class="btn" data-bank="review-all">${ui.reviewFilter==='pending'?'הצגת כל השיוכים ועריכתם':'חזרה רק לקבוצות שדורשות החלטה'}</button></div><details class="group"><summary>אפשרויות סקירה וזכירת שיוכים</summary><label class="check"><input type="checkbox" data-bank-remember ${ui.remember!==false?'checked':''}><span>לזכור לפי אותה פעולה ואותו מוטב, בחשבון הזה בלבד</span></label><button class="btn" data-bank="review-mode">${byRows?'חזרה לקבוצות לפי פעולה ומוטב':'צפייה בכל תנועה בנפרד'}</button></details>${byRows?bankRowsView(preview,fieldsForRows):bankGroupsView(groups,preview,fieldsForRows)}`;
}
function bankGroupsView(groups,preview,fieldsForRows){
 const ui=bankUI;groups=ui.reviewFilter==='pending'?groups.filter(g=>g.pending.length):groups;const pages=Math.max(1,Math.ceil(groups.length/20));ui.groupPage=Math.max(0,Math.min(ui.groupPage??0,pages-1));
 const other=preview.rows.filter(r=>r.state!=='new');
 return `<p class="help">הסכום יכול להשתנות: הקיבוץ לפי הפעולה והמוטב, בנפרד לחיובים ולזיכויים. בחירת יעד מאשרת את כל התנועות שממתינות בקבוצה. לשיוך המוצע אפשר ללחוץ על אישור. תנועות שכבר אושרו נשארות ביעד שלהן; אפשר לפתוח פירוט ולשנות תנועה בודדת. כל תנועה נשמרת בנפרד.</p><p role="status">${groups.length} קבוצות · ${groups.reduce((n,g)=>n+g.pending.length,0)} תנועות ממתינות לאישור</p>
 ${groups.slice(ui.groupPage*20,ui.groupPage*20+20).map(g=>{
  const eligible=fieldsForRows.filter(([k])=>g.pending.every(r=>bankRowCompatible(r,k))),canApprove=g.pending.length>0&&!!g.field&&eligible.some(([k])=>k===g.field);
  return `<section class="group bank-review-group"><h4>${esc(g.action)}</h4><p class="bank-group-context">${g.beneficiary?`מוטב: ${esc(g.beneficiary)}`:'ללא מוטב בדוח'} · ${{out:'חיובים',in:'זיכויים',zero:'סכום אפס'}[g.direction]}</p><p>${g.rows.length} תנועות · ${g.pending.length} ממתינות · סך: ${money(g.totalCents/100)}</p><p class="help">סכומים: ${money(g.minCents/100)} עד ${money(g.maxCents/100)} · <bdi dir="ltr">${g.from}–${g.to}</bdi></p>
  ${g.pending.length?`<div class="bank-group-actions"><label class="field">בחירת יעד מאשרת את הקבוצה<select data-bank-group-field="${g.id}" aria-label="יעד לקבוצה ${esc(g.action)} ${esc(g.beneficiary)}"><option value="">${g.mixed?'יעדים שונים — בחר יעד משותף':'בחר יעד'}</option>${fieldsForRows.map(([k,v])=>`<option value="${esc(k)}" ${g.field===k?'selected':''} ${eligible.some(([id])=>id===k)?'':'disabled'}>${esc(bankTargetLabel(g.pending[0],k,v))}</option>`).join('')}</select></label>${bankRefundHelp(g.pending)}<button class="btn primary" data-bank="group-approve" data-group="${g.id}" ${canApprove?'':'disabled'}>אישור ${g.pending.length} תנועות בקבוצה</button></div>`:`<p class="bank-group-complete">כל התנועות בקבוצה אושרו · יעד: ${g.mixed?'יעדים שונים — ראה פירוט':esc(fieldsForRows.find(([k])=>k===g.field)?.[1]??'ללא יעד')}</p>`}
  ${g.rows.some(r=>r.reviewed)?`<button class="btn" data-bank="group-unreview" data-group="${g.id}">עריכת הסיווג ואישורי הקבוצה</button>`:''}
  <details data-bank-group-details="${g.id}" ${ui.openGroups?.[g.id]?'open':''}><summary>פירוט ${g.rows.length} התנועות ועריכה בנפרד</summary>${bankGroupRowsView(g,fieldsForRows)}</details></section>`;
 }).join('')}${ui.reviewFilter==='pending'&&!groups.length?'<p class="banner" role="status">כל הקבוצות סווגו. אפשר לעבור לשמירה; סתירות או שורות לא תקינות, אם יש, עדיין דורשות בירור.</p>':''}
 ${pages>1?`<div class="actions"><button class="btn" data-bank="group-previous" ${ui.groupPage===0?'disabled':''}>קבוצות קודמות</button><span>${ui.groupPage+1} / ${pages}</span><button class="btn" data-bank="group-next" ${ui.groupPage>=pages-1?'disabled':''}>קבוצות הבאות</button></div>`:''}
 ${other.length?`<details class="group" data-bank-group-details="other" ${ui.openGroups?.other?'open':''}><summary>כפילויות, סתירות ותנועות שלא ניתן לקלוט · ${other.length}</summary>${bankRowsView({...preview,rows:other},fieldsForRows)}</details>`:''}`;
}
function bankGroupRowsView(g,fieldsForRows){
 const ui=bankUI,pages=Math.max(1,Math.ceil(g.rows.length/50)),stored=ui.groupRowPages??={};stored[g.id]=Math.max(0,Math.min(stored[g.id]??0,pages-1));const page=stored[g.id];
 return bankRowsTable(g.rows.slice(page*50,page*50+50),fieldsForRows)+(pages>1?`<div class="actions"><button class="btn" data-bank="group-row-previous" data-group="${g.id}" ${page===0?'disabled':''}>תנועות קודמות</button><span>${page+1} / ${pages}</span><button class="btn" data-bank="group-row-next" data-group="${g.id}" ${page>=pages-1?'disabled':''}>תנועות הבאות</button></div>`:'');
}
function bankGroupUpdate(id,{field,reviewed}={}){
 const ui=bankUI;if(!ui||ui.busy||ui.committed)return false;
 const g=bankReviewGroups(bankCurrentPreview().rows).find(g=>g.id===id);if(!g)return false;
 const rows=reviewed===false?g.rows:g.pending,target=field??g.field;
 if(!rows.length)return false;
 if(reviewed!==false&&field!==''&&(![...budgetFields(bankWorkingPlan()).map(([k])=>k),'exclude'].includes(target)||rows.some(r=>!bankRowCompatible(r,target))))return false;
 for(const r of rows)ui.choices[r.line]={...ui.choices[r.line],...(field!==undefined?{field:target}:{}),refund:bankIsRefund(r,target),reviewed:reviewed===true,manual:true,reason:'בחירה לפי פעולה ומוטב'};
 ui.monthsConfirmed=false;bankRender();return true;
}
function bankRowsView(preview,fieldsForRows){
 const ui=bankUI;if(ui.reviewFilter==='pending')preview={...preview,rows:preview.rows.filter(r=>!r.reviewed||['conflict','invalid'].includes(r.state))};const pages=Math.max(1,Math.ceil(preview.rows.length/50));ui.page=Math.min(ui.page,pages-1);
 return bankRowsTable(preview.rows.slice(ui.page*50,ui.page*50+50),fieldsForRows)+`<div class="actions"><button class="btn" data-bank="previous" ${ui.page===0?'disabled':''}>הקודם</button><span>${ui.page+1} / ${pages}</span><button class="btn" data-bank="next" ${ui.page>=pages-1?'disabled':''}>הבא</button></div>`;
}
function bankRowsTable(rows,fieldsForRows){
 const ui=bankUI;
 return `<div class="table-wrap bank-review-table" tabindex="0"><table><thead><tr><th>תאריך / שורה</th><th>פעולה ומוטב</th><th>סכום</th><th>יעד</th><th>בדיקה</th></tr></thead><tbody>${rows.map(r=>`<tr><td><bdi>${esc(r.date??'—')}</bdi><small>שורה ${r.line}</small></td><td>${esc(r.description)}<small>${esc([r.details,r.beneficiary,r.purpose].filter(Boolean).join(' · '))}</small></td><td>${r.amountCents===null?'—':money(r.amountCents/100)}${r.reversal?'<small>ביטול חיוב · מפחית מהשדה שנבחר</small>':''}</td><td>${r.state==='new'?`<select aria-label="יעד שורה ${r.line}" data-bank-line="${r.line}"><option value="">בחר יעד</option>${fieldsForRows.map(([k,v])=>`<option value="${esc(k)}" ${r.field===k?'selected':''} ${bankRowCompatible(r,k)?'':'disabled'}>${esc(bankTargetLabel(r,k,v))}</option>`).join('')}</select>${bankRefundHelp([r])}<label class="check"><input type="checkbox" data-bank-learn="${r.line}" ${ui.choices[r.line]?.learn?'checked':''}><span>לזכור לפי פעולה ומוטב</span></label>`:esc({duplicate:'כבר נקלט · לא מתווסף','duplicate-file':'כפול בתוך הקובץ · לא נספר',conflict:r.missingReference?'אין אסמכתא וקיימת תנועה תואמת; נדרש בירור לפני קליטה':'סתירה באסמכתא · חסום',invalid:'לא תקין או מחוץ לטווח'}[r.state])}</td><td>${r.state==='new'?`<label class="check"><input type="checkbox" data-bank-reviewed="${r.line}" ${r.reviewed?'checked':''} ${r.field?'':'disabled'}><span>אושר</span></label><small>${esc(ui.choices[r.line]?.reason??'בחירה ידנית')}${r.missingReference?' · אין אסמכתא; הזיהוי לפי פרטי התנועה':''}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function bankDirectChoiceView(m){
 const ui=bankUI,items=bankPlannedDirect(bankWorkingPlan(),m.month,ui.accountId);if(!items.length||m.mode==='skip')return '';
 const example=items[0],verb=example.kind==='income'?'ההכנסה':'ההוצאה';
 return `<fieldset class="bank-choice"><legend>מה לעשות עם התכנון שכבר קיים לחודש <bdi>${m.month}</bdi>?</legend><p>כבר תכננת באפליקציה: ${items.map(e=>`${esc(e.name)} · ${money(e.amount)} (${e.kind==='income'?'הכנסה':'הוצאה'})`).join(' · ')}.</p><label><input type="radio" name="bank-direct-${m.month}" data-bank-direct="${m.month}" value="included" ${ui.directIncluded[m.month]===true?'checked':''}><span><strong>התכנון כבר כלול בדוח הבנק</strong><small>נשתמש בסכומים מהדוח בלבד, בלי להוסיף שוב את התכנון. למשל: ${verb} ״${esc(example.name)}״ בסך ${money(example.amount)} כבר מופיעה בדוח — היא תיספר פעם אחת.</small></span></label><label><input type="radio" name="bank-direct-${m.month}" data-bank-direct="${m.month}" value="additional" ${ui.directIncluded[m.month]===false?'checked':''}><span><strong>התכנון עדיין נוסף לדוח הבנק</strong><small>נשמור גם את התכנון בנוסף לסכומים מהדוח. למשל: ${verb} ״${esc(example.name)}״ בסך ${money(example.amount)} עדיין לא בוצעה — היא תישאר בתחזית.</small></span></label></fieldset>`;
}
function bankMonthView(m){
 const ui=bankUI,working=bankWorkingPlan(),defaultMode=bankDefaultMonthModes(working,{months:[m]},todayMonth(),ui.reportScope)[m.month],protectedMonth=defaultMode==='skip',intake=m.mode!=='skip';
 const reason=m.month<working.startMonth||m.month>todayMonth()?'החודש מחוץ לתקופת התקציב שניתן לקלוט.':!m.newCount?'אין תנועות חדשות לקליטה בחודש הזה.':'דוח חלקי אינו מחליף דיווח מלא קיים; החודש נשאר ללא שינוי.';
 return `<section class="group">${typeof ui.directIncluded[m.month]==='boolean'?bankDirectChoiceView(m):''}<details data-bank-group-details="month-${m.month}" ${ui.openGroups?.['month-'+m.month]?'open':''}><summary><bdi>${m.month}</bdi> · ${intake?'ייקלט מהבנק':'ללא שינוי'} · ${m.complete&&ui.reportScope!=='partial'?'דוח מלא':'דוח חלקי'} · ${m.pending} תנועות לבדיקה</summary><p class="help">${intake?(m.mode==='full'?'החודש ייקלט כדיווח מלא.':'החודש ייקלט כדיווח חלקי, בלי לסמן שהחודש הושלם.'):protectedMonth?reason:'בחרת לדלג על החודש הזה.'}</p>
 <div class="table-wrap"><table><thead><tr><th>שדה</th><th>קיים / הערכה</th><th>מהדוח</th></tr></thead><tbody>${Object.entries(m.values).map(([k,v])=>`<tr><td>${esc(budgetFields(working).find(f=>f[0]===k)?.[1]??k)}</td><td>${money(m.old[k]??0)}</td><td>${money(v/100)}</td></tr>`).join('')}</tbody></table></div>
 ${m.accountCount>1?`<p class="help">הסכומים כוללים ${m.accountCount} חשבונות. ${m.balance?'יתרת העו״ש היא סכום היתרות מאותו תאריך.':'אין יתרות מכל החשבונות באותו תאריך. יתרה ישנה של חשבון יחיד לא תוצג כיתרה הכוללת; היתרות נשמרות בנפרד לכל חשבון והסיכום בבית יציג את תחזיות החשבונות.'}</p>`:''}${m.balance?`<p>יתרת בנק בתאריך <bdi>${m.balance.date}</bdi>: ${money(m.balance.cents/100)}</p>`:''}
 ${!protectedMonth?`<fieldset class="bank-choice"><legend>קליטת החודש</legend><label><input type="radio" name="bank-month-${m.month}" data-bank-month="${m.month}" value="intake" ${intake?'checked':''}><span><strong>לקלוט את הנתונים שאישרתי מהבנק</strong><small>הסכומים ייכנסו לשדות שאליהם סיווגת את התנועות.</small></span></label><label><input type="radio" name="bank-month-${m.month}" data-bank-month="${m.month}" value="skip" ${!intake?'checked':''}><span><strong>להשאיר את החודש כפי שהוא</strong><small>תנועות החודש הזה לא ייקלטו. הנתונים הקיימים באפליקציה יישארו ללא שינוי.</small></span></label></fieldset>`:''}
 ${intake&&chequesFor(working,m.month)>0?`<p class="help">יש לחודש הזה גם צ׳קים שסימנת כתוספת בסך ${money(chequesFor(working,m.month)/100)}. אם הם כבר מופיעים בדוח, שנה את הסימון שלהם בפירוט ההוצאות כדי שלא יתווספו שוב.</p>`:''}
 </details></section>`;
}
async function bankChange(event){
 const e=event.target,ui=bankUI;if(!ui||ui.busy||ui.committed)return;
 if(e.matches('[data-bank-file]')){await bankLoadFile(e.files[0]);return;}
 if(e.matches('[data-bank-scope]')){ui.reportScope=e.value;ui.modes={};bankSelectDefaultMonths();ui.monthsConfirmed=false;bankRender();return;}
 if(e.matches('[data-bank-remember]')){ui.remember=e.checked;bankRender();return;}
 if(e.matches('[data-bank-filter]')){ui.reviewFilter=e.value;ui.page=0;ui.groupPage=0;bankRender();return;}
 if(e.matches('[data-bank-view]')){ui.reviewView=e.value;ui.page=0;ui.groupPage=0;bankRender();return;}
 if(e.dataset.bankGroupField!==undefined){bankGroupUpdate(e.dataset.bankGroupField,{field:e.value,reviewed:!!e.value});return;}
 if(e.matches('[data-bank-reset]')){ui.resetConfirmed=e.checked;return;}
 if(e.matches('[data-bank-start]')){ui.base.startMonth=e.value;ui.modes={};bankSelectDefaultMonths();ui.monthsConfirmed=false;bankRender();return;}
 if(e.matches('[data-bank-opening],[data-bank-buffer]')){ui.base[e.matches('[data-bank-opening]')?'opening':'buffer']=Number(e.value);return;}
 if(e.matches('[data-bank-provider]')){ui.bankName=e.value;return;}
 if(e.matches('[data-bank-label]')){ui.label=e.value.trim();return;}
 if(e.matches('[data-bank-account]')){const a=cashAccountList(plan).find(a=>a.id===e.value);ui.accountId=a?.id??crypto.randomUUID();ui.label=a?.label??'חשבון נוסף';ui.bankName=a?.bankName??'one-zero';ui.rules=clone(a?.rules??[]);ui.personal=a?.personal===true;if(ui.inspection)await bankPrepare();bankRender();return;}
 if(e.matches('[data-bank-personal]')){ui.personal=e.checked;bankSuggest();bankRender();return;}
 if(e.matches('[data-bank-sheet]')){ui.busy=true;bankRender();try{const data=await bankWorkerRequest({action:'sheet',name:e.value});ui.sheet=e.value;ui.inspection=data.inspection;await bankPrepare();}catch(error){ui.records=[];ui.error=error.message;}finally{ui.busy=false;bankRender();}return;}
 if(e.matches('[data-bank-from],[data-bank-to]')){if(ui.pdfMeta){bankRender();notify('טווח PDF נקבע מתוך הדוח והתנועות שאומתו. לטעינת תקופה נוספת יש לבחור דוח נוסף.');return;}ui[e.matches('[data-bank-from]')?'from':'to']=e.value;ui.coverageConfirmed=false;ui.monthsConfirmed=false;try{await bankPrepare();}catch(error){ui.error=error.message;}bankRender();return;}
 if(e.dataset.bankLine){const r=ui.records.find(r=>String(r.line)===e.dataset.bankLine);ui.choices[e.dataset.bankLine]={field:e.value,refund:!!r&&bankIsRefund(r,e.value),reviewed:false,manual:true,reason:'בחירה ידנית'};ui.monthsConfirmed=false;bankRender();return;}
 if(e.dataset.bankReviewed){const r=ui.records.find(r=>String(r.line)===e.dataset.bankReviewed);if(r)ui.choices[e.dataset.bankReviewed].refund=bankIsRefund(r,ui.choices[e.dataset.bankReviewed].field);ui.choices[e.dataset.bankReviewed].reviewed=e.checked;ui.choices[e.dataset.bankReviewed].manual=true;ui.monthsConfirmed=false;bankRender();return;}
 if(e.dataset.bankLearn){ui.choices[e.dataset.bankLearn].learn=e.checked;return;}
 if(e.dataset.bankMonth){ui.modes[e.dataset.bankMonth]=e.value==='intake'?bankDefaultMonthModes(bankWorkingPlan(),bankCurrentPreview(),todayMonth(),ui.reportScope)[e.dataset.bankMonth]:e.value;ui.monthsConfirmed=false;bankRender();return;}
 if(e.dataset.bankDirect){ui.directIncluded[e.dataset.bankDirect]=e.value==='included';ui.monthsConfirmed=false;return;}
 if(e.matches('[data-bank-coverage]'))ui.coverageConfirmed=e.checked;
 if(e.matches('[data-bank-months-confirm]'))ui.monthsConfirmed=e.checked;
 if(e.dataset.bankTransfer){ui.transferIds=[...(ui.transferIds??[]).filter(id=>id!==e.dataset.bankTransfer),...(e.checked?[e.dataset.bankTransfer]:[])];}
}
function bankFinishImport(ui){
 if(bankUI!==ui)return;
 const dialog=bankDialog();ui.worker?.terminate();bankUI=null;dialog?.close?.();dialog?.remove();
 if(typeof onboarding!=='undefined')onboarding=null;
 if(typeof homeReset==='function')homeReset();
 tab='progress';render();scrollToSection('.page-heading');if(document.scrollingElement)document.scrollingElement.scrollTop=0;
 notify(demoPreview?'הדוח נקלט בדוגמה בלבד.':'הדוח נקלט והתקציב נשמר.');
}
async function bankPersist(){
 const ui=bankUI;if(!ui||ui.busy)return;const beforeRevision=revision;
 ui.committing=true;ui.busy=true;bankRender();
 try{if(demoPreview){dirty=false;markDraftBaseline();}else await save();}catch(error){ui.error=error.message||'השמירה לא הושלמה.';}
 finally{ui.busy=false;ui.committing=false;}
 if(bankUI!==ui)return;
 if(!dirty&&(demoPreview||revision>beforeRevision))bankFinishImport(ui);
 else bankUIError(Error(ui.error||'השמירה לא הושלמה. הנתונים מוכנים, אך טרם נשמרו. נסה שוב; הדוח לא ייקלט פעמיים.'));
}
async function bankClick(event){
 const action=event.target.closest('[data-bank]')?.dataset.bank;if(!action||!bankUI||bankUI.busy)return;
 if(action==='review-all'){bankUI.reviewFilter=bankUI.reviewFilter==='pending'?'all':'pending';bankUI.groupPage=0;bankUI.page=0;bankRender();return;}
 if(action==='review-mode'){bankUI.reviewView=bankUI.reviewView==='rows'?'groups':'rows';bankUI.groupPage=0;bankUI.page=0;bankRender();return;}
 if(action==='group-approve'||action==='group-unreview'){bankGroupUpdate(event.target.closest('[data-bank]').dataset.group,{reviewed:action==='group-approve'});return;}
 if(action==='group-row-next'||action==='group-row-previous'){const id=event.target.closest('[data-bank]').dataset.group;(bankUI.groupRowPages??={})[id]=(bankUI.groupRowPages?.[id]??0)+(action==='group-row-next'?1:-1);(bankUI.openGroups??={})[id]=true;bankRender();return;}
 if(action==='group-next'||action==='group-previous'){bankUI.groupPage+=action==='group-next'?1:-1;bankRender();return;}
 if(action==='backup'){backup();return;}
 if(action==='close'){bankClose();return;}if(action==='previous'||action==='next'){bankUI.page+=action==='next'?1:-1;bankRender();return;}if(action==='retry'){await bankPersist();return;}
 if(action==='apply'){
  try{
   if(!bankScopeValid()||revision!==bankUI.revision||JSON.stringify(plan)!==bankUI.snapshot)throw Error('התקציב השתנה מאז פתיחת הייבוא. סגור ופתח מחדש כדי להשוות לנתונים המעודכנים.');
   const rules=bankRememberedRules(bankUI.rules,bankUI.records,bankUI.choices,bankUI.remember!==false);for(const r of bankUI.records){const c=bankUI.choices[r.line];if(c?.learn&&c.reviewed&&bankUI.remember===false){const text=r.beneficiary||r.description;if(text.length<3||text.length>160)throw Error('הטקסט לכלל ארוך מדי או אינו מזהה תנועה.');rules.push({text,direction:r.amountCents<0?'out':'in',destination:c.field});}}
   if(bankUI.restart&&!isUnconfiguredBudget(plan)&&!bankUI.resetConfirmed)throw Error('יש לאשר את החלפת התקציב הידני לאחר גיבוי.');
   const next=applyBankImport(bankWorkingPlan(),bankUI.records,{...bankUI,rules,coverageConfirmed:true,monthsConfirmed:true,asOf:todayMonth()});bankUI.committing=true;if(!mutate(next))throw Error('הייבוא אינו תקין.');bankUI.committed=true;await bankPersist();
  }catch(error){if(bankUI){bankUI.committing=false;bankUIError(error);}}
 }
}
app.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(b?.dataset.action==='bank-import-open')bankOpen();if(b?.dataset.action==='bank-import-restart'){confirmAction('להתחיל מחדש מדוח הבנק?','תחילה תיפתח סקירת הדוח עם אפשרות להוריד גיבוי. הנתונים הידניים יוחלפו רק לאחר אישור הקליטה והשמירה.',()=>bankOpen({restart:true}));}if(b?.dataset.action==='setup-bank'){onboarding=null;render();bankOpen({restart:isUnconfiguredBudget(plan)});}if(b?.dataset.action==='bank-import-undo'){
 if(dirty||hasSavingsDraft()||hasDetailDraft()||hasSecurityDraft()||monthlyPending){notify('יש לשמור ולסיים עריכות לפני ביטול ייבוא.');return;}
 confirmAction('לבטל את הייבוא האחרון?','החודשים והחיסכון יוחזרו למצב שלפני הקליטה, רק אם לא נערכו מאז. הביטול יישמר בתקציב.',async()=>{try{const next=undoBankImport(plan,b.dataset.id);if(mutate(next)){if(demoPreview){dirty=false;markDraftBaseline();render();}else await save();}}catch(error){notify(error.message);}});
 }});

app.addEventListener('change',async event=>{
 if(!event.target.matches('[data-setup-bank-file]'))return;
 const file=event.target.files?.[0];if(!file)return;
 bankOpen({restart:true});if(bankUI)await bankLoadFile(file);
});

function bankPDFSummary(){const m=bankUI?.pdfMeta;if(!m)return '';return `<section class="group"><h3>סיכומי PDF אומתו מול כל התנועות</h3><p>${m.count} תנועות · יתרת פתיחה ${money(m.openingCents/100)} · יתרת סיום ${money(m.closingCents/100)}</p><p>סיכום עמודת חיובים ${money(m.debitCents/100)} · סיכום עמודת זיכויים ${money(m.creditCents/100)}</p>${m.reversals?'<p class="warning-note">יש ביטול חיוב בדוח. בחר עבורו את אותו שדה של החיוב המקורי; הסכום יופחת ממנו ולא ייחשב הכנסה חדשה.</p>':''}${m.periodMismatch?`<p class="warning-note">כותרת הדוח מסתיימת ב־<bdi>${esc(m.declared.to)}</bdi>, אך קיימות תנועות עד <bdi>${esc(m.to)}</bdi>. טווח הקליטה כולל את כל השורות; בדוק אותו לפני שמירה.</p>`:''}<p class="help">PDF נתמך לדוח התנועות המלא של וואן זירו בלבד, ללא סריקה. חפיפה לדוח Excel/CSV ללא אסמכתאות דורשת בירור לפני קליטה.</p></section>`;}
