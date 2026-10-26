// The home screen owns the report → saving decision → goal allocation flow.
let homeTransferDismissed=new Set();
let homeUI={scope:'',reportMonth:null,savingMonth:null,savingDraft:null,investmentMonth:null,error:''};
function homeReset(){homeUI={scope:accountId+'/'+activeBudget,reportMonth:null,savingMonth:null,savingDraft:null,investmentMonth:null,error:''};}
function homeSync(){if(homeUI.scope!==accountId+'/'+activeBudget)homeReset();}
function hasHomeSavingDraft(){return !!homeUI.savingDraft&&!homeUI.savingDraft.applied;}
function homeMonth(){return todayMonth()<plan.startMonth?plan.startMonth:todayMonth();}
function homeForecast(month){return forecast(plan,undefined,Math.max(plan.horizon,indexMonth(month)-indexMonth(plan.startMonth)+1));}
function homeBankBalanceField(){
 const report=plan.months[selectedMonth]?.cashReport,disabled=selectedMonth>todayMonth();
 return `<section class="home-bank-field"><label class="field">יתרת עו״ש בפועל מהבנק · ₪<input name="month-cashBalance" type="number" min="-100000000" max="100000000" step="0.01" value="" data-current="${report?.balance??''}" placeholder="${report?.balance??'יתרה כפי שמופיעה בבנק'}" aria-label="יתרת עו״ש בפועל מהבנק בשקלים" ${disabled?'disabled':''}></label><p class="help">היתרה שכבר כוללת את הפעולות שדיווחת עליהן. היא תהיה הבסיס לחודשים הבאים; ההכנסות והחיובים של החודש לא ייספרו שוב.</p></section>`;
}
function homeValidateBankReport(){
 if(homeUI.reportMonth!==selectedMonth||plan.months[selectedMonth]?.cashReport)return true;
 notify('יש להזין את יתרת העו״ש בפועל מהבנק לפני שמירת נתוני אמת.');
 const field=document.querySelector('[name="month-cashBalance"]');field?.focus();return false;
}
function homeSavingsGoalsView(pool){
 if(!pool.items.length)return '';
 const asOf=typeof billingToday==='function'?billingToday():savingsTodayDate();
 return `<div class="home-savings-goals">${pool.items.map(goal=>{
  const reached=cents(goal.current)>=cents(goal.target),pct=Math.max(0,Math.min(100,goal.current/goal.target*100)),projection=savingsProjection(goal.current,goal.target,0,goal.monthly,todayMonth()),deadline=savingsDeadlineStatus(goal,goal.monthly,asOf),tone=reached?'reached':deadline?.late?'attention':'neutral',status=reached?'הסכום ליעד קיים':deadline?.expired?'מועד היעד עבר':!goal.monthly?'טרם הוגדר קצב':deadline?.late?'כדאי להגביר קצב':deadline?'בקצב המתאים':'ללא תאריך יעד';
  return `<article class="home-savings-goal"><button class="home-goal-heading" type="button" data-action="home-goal-open" data-id="${esc(goal.id)}" aria-label="פתיחת המטרה ${esc(goal.name)} · ${status}"><strong><bdi dir="auto">${esc(goal.name)}</bdi><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></strong><span class="home-goal-status ${tone}">${status}</span></button><span class="home-goal-progress" role="progressbar" aria-label="התקדמות ${esc(goal.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(1)}" aria-valuetext="${esc(currency(goal.current))} מתוך ${esc(currency(goal.target))}"><span style="width:${pct}%"></span></span><span class="home-goal-amounts">${money(goal.current)} <span>מתוך</span> ${money(goal.target)}</span><span class="home-goal-meta">${!reached&&projection?`<span>עוד ${new Intl.NumberFormat('he-IL').format(projection.count)} הפקדות · ${money(goal.monthly)} לחודש</span>`:''}${goal.deadline?`<span>יעד: <bdi dir="ltr">${esc(goal.deadline.split('-').reverse().join('.'))}</bdi></span>`:''}</span></article>`;
 }).join('')}<p class="home-goals-basis">הקצב לפי ההפקדה החודשית שהוגדרה למטרה, ללא תשואה.</p></div>`;
}
function homeSavingsTile(){
 const pool=savingsBalances(plan,todayMonth());
 return `<section class="panel home-savings-tile" aria-labelledby="home-savings-title"><div class="section-heading"><div class="heading-with-help"><span class="home-savings-icon" aria-hidden="true">${icon('goals')}</span><h2 id="home-savings-title">החיסכון שלי</h2></div><button class="btn" data-action="tab" data-tab="goals">למטרות שלי</button></div><strong class="home-savings-amount">${plan.savingsGoals?money(pool.balance):'טרם דווחה יתרה'}</strong>${homeSavingsGoalsView(pool)}${plan.savingsGoals?`<details class="home-savings-allocation"><summary>חלוקת החיסכון</summary><div class="status-detail-line"><span>מוקצה למטרות</span><strong>${money((cents(pool.balance)-cents(pool.free))/100)}</strong></div><div class="status-detail-line"><span>ללא הקצאה</span><strong>${money(pool.free)}</strong></div></details>`:typeof bankSavingImportNote==='function'?bankSavingImportNote():'<p class="help">אפשר לעדכן את היתרה במסך המטרות.</p>'}</section>`;
}
function homeInvestmentSummary(){
 const asOf=todayMonth(),accountSources=cashAccountList(plan).map(account=>cashSourceRecords(plan,account.id)),months=[...new Set([...Object.keys(plan.months),...accountSources.flatMap(records=>Object.keys(records))])].filter(month=>month<=asOf).sort(),rows=new Map();
 let total=0;
 for(const month of months){
  // A confirmed combined month already includes its accounts; never add both.
  const combined=plan.months[month],records=combined?.actual?[combined]:accountSources.map(records=>records[month]).filter(record=>record?.actual);
  if(!records.length)continue;
  const amount=records.reduce((sum,record)=>sum+cents(record.values.personalInvest??0)+cents(record.values.sharedInvest??0),0);
  total+=amount;rows.set(month,{month,amount:amount/100,reported:true,partial:!combined?.actual&&records.length<accountSources.length});
 }
 const series=Array.from({length:12},(_,i)=>{const month=monthAt(asOf,i-11);return rows.get(month)??{month,amount:null,reported:false,partial:false};});
 return {total:total/100,hasRecords:rows.size>0,series};
}
function homeInvestmentTile(){
 const summary=homeInvestmentSummary(),selected=summary.series.find(row=>row.month===homeUI.investmentMonth)??summary.series.at(-1),max=Math.max(1,...summary.series.map(row=>row.amount??0));
 const chart=page=>`<ol class="expense-pulse-chart home-investment-chart" style="--pulse-count:${page.length}" aria-label="הפקדות חודשיות להשקעות בשקלים">${page.map(row=>{
  const label=monthLabel(row.month)+': '+(row.reported?currency(row.amount):'טרם דווח')+(row.partial?' · דיווח חלקי':'');
  return `<li><button class="expense-pulse-month home-investment-month ${row.month===selected.month?'is-selected':''}" type="button" data-action="home-investment-month" data-month="${row.month}" aria-pressed="${row.month===selected.month}" aria-label="${esc(label)}" title="${esc(label)}"><span class="expense-pulse-track" aria-hidden="true">${row.reported?`<span class="expense-pulse-bar ${row.partial?'is-partial':''}" style="height:${Math.max(row.amount===0?2:4,(row.amount??0)/max*100)}%"></span>`:'<span class="expense-pulse-gap">—</span>'}</span><span class="expense-pulse-label">${new Intl.DateTimeFormat('he-IL',{month:'short',timeZone:'UTC'}).format(new Date(row.month+'-01T12:00:00Z'))}</span></button></li>`;
 }).join('')}</ol>`;
 return `<section class="panel home-investment-tile" aria-labelledby="home-investment-title"><div class="section-heading"><div class="heading-with-help"><span class="home-investment-icon" aria-hidden="true">${icon('forecast')}</span><h2 id="home-investment-title">הפקדות להשקעות</h2></div><button class="btn" type="button" data-action="home-investment-open" data-month="${selected.month}" ${selected.month<plan.startMonth?'disabled title="החודש קודם לתחילת התקציב"':''}>עדכון הפקדות</button></div><div class="home-investment-totals" aria-live="polite"><div><span>${monthLabel(selected.month)}${selected.partial?' · דיווח חלקי':''}</span><strong>${selected.reported?money(selected.amount):'טרם דווח'}</strong></div><div><span>סך ההפקדות שדווחו</span><strong>${summary.hasRecords?money(summary.total):'טרם דווח'}</strong></div></div><p class="home-investment-period">12 החודשים האחרונים · ₪</p>${chartSlidesView('investments',summary.series,selected.month,chart)}<p class="help">הפקדות מדיווחי אמת בלבד; קו מציין חודש שטרם דווח. זה אינו שווי התיק כיום; תשואה ומשיכות אינן נכללות.</p></section>`;
}
function homeReportRemindersView(asOf){
 let saved=plan;if(dirty&&typeof draftSavedSnapshot==='string'&&draftSavedSnapshot)try{saved=JSON.parse(draftSavedSnapshot);}catch{}
 const rows=cardReportReminderRows(saved,asOf);if(!rows.length)return '';
 return `<section class="panel home-report-reminders" aria-labelledby="home-report-reminders-title"><h2 id="home-report-reminders-title">תזכורת להעלאת דוח</h2>${rows.map(row=>`<article class="home-report-reminder"><div><h3><bdi dir="auto">${esc(row.name)}</bdi></h3><p>${monthLabel(row.month)} · מועד חיוב <bdi dir="ltr">${row.dueDate.split('-').reverse().join('.')}</bdi></p></div><button class="btn" type="button" data-action="report-inbox" data-card="${esc(row.id)}">העלאת הדוח</button></article>`).join('')}</section>`;
}
function homeView(){
 homeSync();const month=homeMonth(),asOf=typeof billingToday==='function'?billingToday():todayMonth()+'-01',accounts=statusAccountSummaries(plan,month,asOf);
 return `<div class="home-page wallet-home">${homeReportRemindersView(asOf)}${typeof walletBankAccountsView==='function'?walletBankAccountsView(accounts,month):accounts.map(statusBalanceDetails).join('')}${expensePulseView(latestExpenseDataMonth(plan,todayMonth()))}${homeSavingsTile()}${homeInvestmentTile()}</div>`;
}
function statusAccountLabel(a){const bank=a.bankName==='hapoalim'?'הפועלים':a.bankName==='one-zero'?'וואן זירו':'';return bank&&!a.label.includes(bank)?bank+' · '+a.label:a.label;}
function statusBalanceDetails(a){return `<article class="status-account-detail"><h3>${esc(statusAccountLabel(a.account))}</h3><div class="status-detail-line"><span>${a.reading?.opening?'יתרת פתיחה':'היתרה האחרונה שדווחה'}</span><strong>${a.reading?money(a.reading.balance):'טרם דווחה'}</strong></div>${a.reading?`<p class="help">תאריך היתרה: <bdi>${a.reading.date}</bdi>${a.reading.fromBank?' · מדוח הבנק':''}</p>`:''}<div class="status-detail-line"><span>צפי לסוף החודש לאחר התכנון</span><strong class="${a.row?.balance!==null&&a.row?.balance<0?'bad':''}">${a.row?.balance===null||!a.row?'לא ניתן לחשב':money(a.row.balance)}</strong></div><div class="status-detail-line"><span>מעל רף הביטחון (${money(a.account.buffer??0)})</span><strong>${a.margin===null?'חסר מידע לחישוב':money(a.margin)}</strong></div>${a.risk?`<p class="error-box">${a.issues.length?'לפי התחזית החלקית, ':' '}צפוי מינוס של ${money(-a.risk.balance)} בחודש ${monthLabel(a.risk.month)}.</p>`:''}${a.issues.length?`<p class="warning-note">${a.issues.map(esc).join(' · ')}.</p>`:''}<p class="help">זהו צפי לסוף חודש, לא סכום מובטח להעברה לחיסכון. הוא אינו בודק את סדר החיובים וההכנסות בתוך החודש.</p></article>`;}
function goalsView(){homeSync();return `<div class="home-page">${homePendingTransfersView()}${homeUI.savingMonth?homeSavingView():''}${savingsHomeView()}</div>`;}
function homeSavingView(){
 const month=homeUI.savingMonth,row=homeForecast(month).find(r=>r.month===month),free=Math.max(0,(cents(row?.balance??0)-cents(plan.buffer))/100);
 const draft=homeUI.savingDraft;
 return `<section class="panel home-saving-choice" id="home-saving-choice"><h2>כמה תרצה להפקיד לחיסכון מתוך היתרה הפנויה?</h2><p class="help">${money(free)} מעבר ליתרת הביטחון. הפקדות שכבר דיווחת עליהן נכללות בחיסכון.</p>${!plan.savingsGoals?'<p class="help">הגדר תחילה את החיסכון הקיים ואת המטרות בהמשך העמוד.</p>':free>0||draft?.applied?`<form id="home-saving-form"><div class="form-grid"><label class="field">תוספת לחיסכון האישי שלי · ₪<input name="home-personal" type="number" min="0" max="${draft?.applied?100000000:free}" step="0.01" value="${esc(draft?.personal??'')}" placeholder="0" ${draft?.applied?'disabled':''}></label><label class="field">תוספת שלי לחיסכון המשותף עם לינוי · ₪<input name="home-shared" type="number" min="0" max="${draft?.applied?100000000:free}" step="0.01" value="${esc(draft?.shared??'')}" placeholder="0" ${draft?.applied?'disabled':''}></label></div><p class="help">בחירה זו מתכננת העברה בלבד. לאחר הביצוע בבנק יש לאשר זאת במסך הבית.</p><button ${demoPreview?'':'hidden'} type="submit" class="btn primary">${draft?.applied?'ניסיון שמירה נוסף':'תכנון ההעברה'}</button></form>`:'<p class="help">כרגע אין יתרה פנויה מעבר ליתרת הביטחון להפקדה נוספת.</p>'}<p class="home-saving-error error-box" role="alert" ${homeUI.error?'':'hidden'}>${esc(homeUI.error)}</p><button type="button" class="btn" data-action="home-saving-later">${draft?'ביטול הבחירה':'בהמשך'}</button></section>`;
}
function homeAction(action,button){
 if(action==='home-investment-month'){
  if(!loaded||loading||saving||!guardMonthlyNavigation()||!guardSavingsDraft()||!guardDetailNavigation()||hasSecurityDraft())return true;
  if(!homeInvestmentSummary().series.some(row=>row.month===button.dataset.month))return true;
  homeUI.investmentMonth=button.dataset.month;render();document.querySelector('[data-action="home-investment-month"][data-month="'+button.dataset.month+'"]')?.focus({preventScroll:true});return true;
 }
 if(action==='home-investment-open'){
  if(!loaded||loading||saving||!guardMonthlyNavigation()||!guardSavingsDraft()||!guardDetailNavigation()||hasSecurityDraft())return true;
  const month=button.dataset.month??homeMonth();if(month<plan.startMonth||month>todayMonth())return true;selectedMonth=month;tab='monthly';render();scrollToSection(cashAccountList(plan).length?'[data-investment-deposits]':'.monthly-future');return true;
 }
 if(action==='home-goal-open'){
  if(!loaded||loading||saving||!guardMonthlyNavigation()||!guardSavingsDraft()||!guardDetailNavigation()||hasSecurityDraft())return true;
  if(!plan.savingsGoals?.items.some(goal=>goal.id===button.dataset.id))return true;
  savingsUI.id=button.dataset.id;tab='goals';render();scrollToSection('#savings-home');return true;
 }
 if(action==='home-month-open'){
  homeSync();if(!loaded||loading||saving||!guardMonthlyNavigation()||!guardSavingsDraft()||!guardDetailNavigation()||hasSecurityDraft())return true;
  homeUI.reportMonth=homeMonth();homeUI.savingMonth=null;selectedMonth=homeUI.reportMonth;tab='monthly';render();return true;
 }
 if(action==='home-saving-later'){if(homeUI.savingDraft?.applied){notify('ההפקדה טרם נשמרה. יש לנסות לשמור שוב לפני סגירת השלב.');return true;}homeUI.savingMonth=null;homeUI.savingDraft=null;homeUI.error='';render();return true;}
 return false;
}
function homeMonthlySaved(actual,month){
 homeSync();if(homeUI.reportMonth!==month)return;
 homeUI.reportMonth=null;homeUI.savingMonth=actual&&month===homeMonth()&&plan.months[month]?.cashReport?month:null;tab=homeUI.savingMonth?'goals':'progress';render();
 if(homeUI.savingMonth)scrollToSection('#home-saving-choice');
}
function homeSavingCapture(form){
 if(homeUI.savingDraft?.applied)return;
 homeUI.savingDraft={personal:ungroupAmount(form.elements.namedItem('home-personal').value),shared:ungroupAmount(form.elements.namedItem('home-shared').value),applied:false};
}
function homeSavingError(error){homeUI.error=error.message;render();scrollToSection('#home-saving-choice');}
async function homeSavingPersist(){
 try{
  if(!homeUI.savingDraft?.applied){
   const draft=homeUI.savingDraft,next=planSavingTransfer(plan,crypto.randomUUID(),homeUI.savingMonth,readNumber(draft.personal||0),readNumber(draft.shared||0),todayMonth());
   draft.applied=true;
   if(!mutate(next)){draft.applied=false;throw Error('לא ניתן לעדכן את ההפקדה.');}
  }
  if(demoPreview){dirty=false;markDraftBaseline();}else await save();
  if(dirty){homeUI.error='ההפקדה לא נשמרה. אפשר לנסות שוב; הסכום לא יתווסף פעמיים.';render();return;}
  homeUI.savingMonth=null;homeUI.savingDraft=null;homeUI.error='';render();scrollToSection('.home-goals-heading');
 }catch(error){homeSavingError(error);}
}
function homeSavingSubmit(form){
 if(!form?.reportValidity())return;
 if(saving||loading||!loaded||hasSecurityDraft()||hasDetailDraft())return;
 if(homeUI.savingDraft?.applied){homeSavingPersist();return;}
 homeSavingCapture(form);
 try{const d=homeUI.savingDraft;reportAdditionalSavings(plan,homeUI.savingMonth,readNumber(d.personal||0),readNumber(d.shared||0),todayMonth());}
 catch(error){homeSavingError(error);return;}
 confirmAction('לתכנן העברה לחיסכון?',`תכנון העברה של ${currency(readNumber(homeUI.savingDraft.personal||0)+readNumber(homeUI.savingDraft.shared||0))}. הפעולה בבנק נעשית על ידך; החיסכון בפועל יתעדכן רק לאחר דיווח שההעברה בוצעה.`,homeSavingPersist);
}
document.addEventListener('input',event=>{const form=event.target.closest('#home-saving-form');if(form)homeSavingCapture(form);});

function homePendingTransfersView(){
 const requests=(plan.savingTransfers??[]).filter(t=>t.status==='pending'&&!homeTransferDismissed.has(accountId+'/'+activeBudget+'/'+t.id));
 return requests.map(t=>`<section class="panel home-bank-action" role="status"><h2>נדרשת פעולה בבנק</h2><p>בחרת להעביר ${money(t.personal+t.shared)} לחיסכון בתכנון. האם הפעולה בוצעה בפועל בבנק?</p><p class="help">${t.personal?'לחיסכון האישי: '+currency(t.personal)+'. ':''}${t.shared?'החלק שלי לחיסכון המשותף: '+currency(t.shared)+'. ':''}ההעברה אינה מתבצעת דרך האפליקציה. החיסכון המוצג עדיין אינו כולל אותה.</p><label class="check"><input type="checkbox" data-transfer-reported="${esc(t.id)}"><span>כבר כללתי את ההפקדה בדיווח החודשי · לא להוסיף שוב</span></label><div class="actions"><button class="btn primary" data-action="home-transfer-done" data-id="${esc(t.id)}">ביצעתי את הפעולה</button><button class="btn" data-action="home-transfer-later" data-id="${esc(t.id)}">תזכיר לי מאוחר יותר</button><button class="btn" data-action="home-transfer-cancel" data-id="${esc(t.id)}">ביטול התכנון</button></div></section>`).join('');
}
app.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]'),action=button?.dataset.action;if(!action?.startsWith('home-transfer-')||saving||loading||!loaded)return;
 const id=button.dataset.id,request=plan.savingTransfers?.find(t=>t.id===id&&t.status==='pending');if(!request)return;
 if(action==='home-transfer-later'){homeTransferDismissed.add(accountId+'/'+activeBudget+'/'+id);render();return;}
 if(!guardMonthlyNavigation()||!guardSavingsDraft()||hasDetailDraft()||hasSecurityDraft())return;
 try{
  let next;if(action==='home-transfer-cancel'){next=clone(plan);next.savingTransfers.find(t=>t.id===id).status='cancelled';}
  else if(action==='home-transfer-done'){next=completeSavingTransfer(plan,id,todayMonth(),!!document.querySelector(`[data-transfer-reported="${CSS.escape(id)}"]`)?.checked);savingsReportPending={scope:activeBudget};}else return;
  if(!mutate(next))return;if(demoPreview){dirty=false;markDraftBaseline();render();}else await save();
  if(dirty)notify('העדכון לא נשמר. יש לנסות לשמור שוב; ההעברה לא תתווסף פעמיים.');
 }catch(error){notify(error.message);}
});
let homeWasBackgrounded=false;
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='hidden'){homeWasBackgrounded=true;return;}
 if(document.visibilityState==='visible'&&homeWasBackgrounded){homeWasBackgrounded=false;homeTransferDismissed.clear();if(tab==='progress'&&loaded&&!loading&&!saving&&!hasSavingsDraft())render();}
});
