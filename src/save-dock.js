// One visible entry point for persistence and unfinished editor approval.
let saveDockScope='',saveDockSubmitting=null,saveDockBusy=false;
const saveDockEditors=new Map();
const saveDockSelector='form[data-cash-form],form[data-sg-form],#saving-schedule-form,#detail-form,#category-goal-form,#item-form,#loan-form,#periodic-form,#insight-scenario-form';
function saveDockKey(form){if(form.dataset.cashForm)return 'cash:'+form.dataset.cashForm+':'+form.dataset.cashAccount+':'+form.dataset.cashMonth;return form.id||'saving:'+form.dataset.sgForm+':'+(form.elements.namedItem('id')?.value??'');}
function saveDockDrop(form){saveDockEditors.delete(saveDockKey(form));delete form.dataset.saveDockEdited;}
function saveDockPrune(){for(const f of saveDockEditors.values())if(f.id==='loan-form'&&typeof loanEditor!=='undefined'&&!loanEditor)saveDockDrop(f);for(const form of saveDockEditors.values()){if(form.id==='detail-form'&&detailDraft===null||form.id==='category-goal-form'&&!categoryGoalDirty||form.id==='saving-schedule-form'&&savingScheduleDraft===null||form.id==='periodic-form'&&!(typeof hasPeriodicDraft==='function'&&hasPeriodicDraft())||form.id==='insight-scenario-form'&&!(typeof hasInsightDraft==='function'&&hasInsightDraft())||form.dataset.sgForm==='new-goal'&&savingsNewGoal===null||form.dataset.sgForm==='free-allocation'&&savingsAllocation===null)saveDockDrop(form);}}
function saveDockBeforeRender(){
 saveDockPrune();const scope=accountId+'/'+activeBudget;if(scope!==saveDockScope){saveDockScope=scope;saveDockEditors.clear();saveDockSubmitting=null;return;}
 for(const form of document.querySelectorAll(saveDockSelector))if(form.dataset.saveDockEdited)saveDockEditors.set(saveDockKey(form),form);
}
function saveDockAfterRender(){
 const forms=[...document.querySelectorAll(saveDockSelector)];for(const [key,old]of saveDockEditors){const fresh=forms.find(f=>saveDockKey(f)===key);if(fresh&&fresh!==old)fresh.replaceWith(old);}
 if([...saveDockEditors.values()].some(f=>f.isConnected&&f.dataset.sgForm)&&typeof savingsUI!=='undefined')savingsUI.formDirty=true;
 if(typeof cashUI!=='undefined')cashUI.dirty=[...saveDockEditors.values()].some(f=>f.isConnected&&f.dataset.cashForm);
 saveDockUpdate();
}
function saveDockAccepted(){if(!saveDockSubmitting)return;saveDockEditors.delete(saveDockKey(saveDockSubmitting));delete saveDockSubmitting.dataset.saveDockEdited;saveDockSubmitting=null;}
function saveDockState(){
 if(demoPreview||!loaded||loading)return null;
 if(document.querySelector('#confirm-dialog[open]'))return{context:'יש לאשר את הבחירה בחלון הפתוח',busy:true,label:'שמור שינויים'};
 if(saving||saveDockBusy)return{label:'שומר…',context:'ממתינים לאישור השמירה',busy:true};
 if(typeof onboarding!=='undefined'&&onboarding)return{context:'ההגדרה הראשונית טרם הושלמה'};
 if(typeof walletFormDirty!=='undefined'&&walletFormDirty&&document.querySelector('#wallet-dialog[open]'))return{context:'טופס ייבוא שטרם אושר'};
 if(hasSecurityDraft())return{context:'הגדרת פרטיות שממתינה לאישור'};
 if(hasSavingsDraft())return{context:'עריכה בחסכונות או במטרות'};
 if(typeof hasGmailDraft==='function'&&hasGmailDraft())return{context:'סינון Gmail בעריכה'};
 if(hasDetailDraft())return{context:typeof hasInsightDraft==='function'&&hasInsightDraft()?'הנחת תרחיש בעריכה':typeof hasPeriodicDraft==='function'&&hasPeriodicDraft()?'עריכת הוצאה תקופתית':'עריכת צ׳ק, פירוט או תקרה'};
 if(itemDraft.id||itemDraft.name.trim()||itemDraft.amount>0)return{context:'פריט מתוכנן שטרם אושר'};
 if(hasScenarioDraft())return{context:'תרחיש רכישות שטרם הוחל'};
 if(monthlyPending||hasMonthlyInputDraft()||(tab==='monthly'&&(monthlyNeedsConfirmation()||(typeof homeUI!=='undefined'&&homeUI.reportMonth===selectedMonth))))return{context:'הדיווח החודשי ממתין לשמירה'};
 if(dirty||document.querySelector('input[data-amount-edited],input[data-month-text-edited]'))return{context:'שינויים שלא נשמרו'};
 return null;
}
function saveDockUpdate(){
 if(typeof document.createElement!=='function')return;if(document.querySelector('dialog[open][data-explicit-flow],#report-inbox-dialog[open]')){document.getElementById('save-changes-dock')?.remove();document.body.classList.remove('has-save-dock');return;}let dock=document.getElementById('save-changes-dock');const state=saveDockState(),footer=[...document.querySelectorAll('dialog[open] [data-save-footer],#savings-home form [data-save-footer],[data-cash-form] [data-save-footer]')].find(el=>!el.getClientRects||el.getClientRects().length>0);
 if(footer){dock?.remove();document.body.classList.remove('has-save-dock');if(state?.busy){if(!footer.dataset.saveFooterBusy){footer.dataset.saveFooterDisabled=String(footer.disabled);footer.dataset.saveFooterBusy='true';}footer.disabled=true;footer.textContent='שומר…';}else{if(footer.dataset.saveFooterBusy){footer.disabled=footer.dataset.saveFooterDisabled==='true';delete footer.dataset.saveFooterBusy;delete footer.dataset.saveFooterDisabled;}footer.textContent=footer.dataset.saveLabel||'שמירת שינויים';}return;}
 if(!state){dock?.remove();document.body.classList.remove('has-save-dock');return;}const parent=[...document.querySelectorAll('dialog[open]')].at(-1)??document.body;
 if(!dock){dock=document.createElement('aside');dock.id='save-changes-dock';dock.className='save-changes-dock';dock.setAttribute('aria-label','שמירת שינויים');}
 if(dock.parentElement!==parent)parent.append(dock);
 const html=`<button type="button" class="btn primary" data-action="save-changes" ${state.busy?'disabled aria-busy="true"':''}>${state.label??'שמור שינויים'}</button>`;
 if(dock.innerHTML!==html)dock.innerHTML=html;
 document.body.classList.add('has-save-dock');
}
function saveDockReveal(form,message){if(!form)return false;for(let n=form;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;form.scrollIntoView({block:'center',behavior:'instant'});const invalid=form.querySelector(':invalid');if(invalid){invalid.focus();invalid.reportValidity();}else form.querySelector('input:not([type=hidden]),select,button')?.focus({preventScroll:true});if(message)notify(message);return true;}
function saveDockSubmit(form){
 if(!form)return false;saveDockReveal(form);if(!form.reportValidity())return false;
 saveDockSubmitting=form;try{form.requestSubmit();}finally{saveDockSubmitting=null;}
 return !saveDockEditors.has(saveDockKey(form));
}
async function saveAllChanges(){
 if(saveDockBusy||saving||loading||!loaded||demoPreview)return;
 // Preserve the pressed button until raw amount fields are committed.
 document.activeElement?.blur();
 if(typeof bankUI!=='undefined'&&bankUI?.committed){await bankPersist();return;}
 if(typeof homeUI!=='undefined'&&homeUI.savingDraft){if(homeUI.savingDraft.applied)await homeSavingPersist();else homeSavingSubmit(document.getElementById('home-saving-form'));return;}
 if(typeof onboarding!=='undefined'&&onboarding){saveDockReveal(document.getElementById('setup-form'),'יש להשלים את שלבי ההגדרה ולאשר את הסיכום לפני שמירה.');return;}
 const wallet=document.querySelector('#wallet-dialog[open]');if(wallet&&walletFormDirty){const form=wallet.querySelector('form[data-wallet-edited]');saveDockReveal(form);if(form?.reportValidity())form.requestSubmit();return;}
 if(typeof hasGmailDraft==='function'&&hasGmailDraft()){saveDockReveal(document.getElementById('gmail-filter-form'),'יש לבדוק ולאשר את סינון Gmail או לבטל את שינוייו לפני שמירת התקציב.');return;}
 if(hasSecurityDraft()){saveDockReveal(document.querySelector('#security-confirm,#encrypted-import,#security-enable'),'הפרטיות דורשת אישור מפורש כאן לפני שמירה.');return;}
 saveDockBusy=true;saveDockUpdate();try{
  for(let i=0;i<24;i++){const form=[...saveDockEditors.values()].find(f=>f.isConnected);if(!form)break;if(!saveDockSubmit(form))return;if(saving)return;}
  if(savingScheduleDraft!==null){if(!saveDockSubmit(document.getElementById('saving-schedule-form')))return;}
  if(savingsNewGoal!==null){if(!saveDockSubmit(document.querySelector('#sg-new-dialog form')))return;}
  if(savingsAllocation!==null){if(!saveDockSubmit(document.querySelector('#sg-free-dialog form')))return;}
  if(savingsTransfer?.position){savingsTransferAction('sg-transfer-save',{dataset:{}});return;}
  const sims=Object.entries(savingsUI.sim).filter(([,s])=>s.changed);if(sims.length){const next=clone(plan);for(const [id,s]of sims){const g=next.savingsGoals?.items.find(g=>g.id===id);if(g)g.monthly=s.future;}savingsCommit(next);}
  if(typeof hasInsightDraft==='function'&&hasInsightDraft()){if(!saveDockSubmit(document.getElementById('insight-scenario-form')))return;}
  if(typeof hasPeriodicDraft==='function'&&hasPeriodicDraft()){if(!saveDockSubmit(document.getElementById('periodic-form')))return;}
  if(hasDetailDraft()){if(!saveDockSubmit(document.getElementById(categoryGoalDirty?'category-goal-form':'detail-form')))return;}
  if(itemDraft.id||itemDraft.name.trim()||itemDraft.amount>0){if(!saveDockSubmit(document.getElementById('item-form')))return;}
  if(hasSavingsDraft()){saveDockReveal(document.querySelector('#savings-home form'),'העריכה עדיין אינה תקינה. יש לבדוק את השדות המסומנים.');return;}
  if(hasScenarioDraft()){tab='purchase';render();confirmAction('להוסיף את התרחיש לתכנון ולשמור?','הרכישות שבמחשבון יהפכו לפריטים מתוכננים. זו אינה הוצאה שבוצעה.',()=>{trialAction('trial-apply',{dataset:{}});if(!document.querySelector('#confirm-dialog[open]')&&!hasScenarioDraft())saveAllChanges();});return;}
  if(monthlyPending||hasMonthlyInputDraft()||(tab==='monthly'&&(monthlyNeedsConfirmation()||(typeof homeUI!=='undefined'&&homeUI.reportMonth===selectedMonth)))){if(tab!=='monthly'){tab='monthly';render();}saveMonthly();return;}
  await save();
 }finally{saveDockBusy=false;saveDockUpdate();}
}
document.addEventListener('input',event=>{const form=event.target.closest(saveDockSelector);if(form){form.dataset.saveDockEdited='true';saveDockEditors.set(saveDockKey(form),form);}queueMicrotask(saveDockUpdate);});
document.addEventListener('change',()=>queueMicrotask(saveDockUpdate));
document.addEventListener('toggle',()=>queueMicrotask(saveDockUpdate),true);
document.addEventListener('submit',event=>{if(event.target.matches(saveDockSelector)){saveDockSubmitting=event.target;queueMicrotask(()=>{saveDockSubmitting=null;saveDockUpdate();});}},true);
document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-action="save-changes"]'))event.preventDefault();});
document.addEventListener('click',event=>{const button=event.target.closest('[data-action="save-changes"]');if(button){event.preventDefault();if(button.dataset?.saveFooter!==undefined){const form=button.closest('form');if(form?.matches(saveDockSelector)){form.dataset.saveDockEdited='true';saveDockEditors.set(saveDockKey(form),form);}}saveAllChanges();}else queueMicrotask(saveDockUpdate);});

document.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;for(const form of [...saveDockEditors.values()])if(action==='sg-cancel'&&(form.dataset.sgForm||form.id==='saving-schedule-form')||action==='detail-cancel'&&form.id==='detail-form'||action==='category-goal-cancel'&&form.id==='category-goal-form'||action==='cancel-item'&&form.id==='item-form')saveDockDrop(form);},true);
