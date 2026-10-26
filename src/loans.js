let loanEditor=null,loanFormDirty=false,loanScope='';
function loansView(){
 const scope=accountId+'/'+activeBudget;if(scope!==loanScope){loanScope=scope;loanEditor=null;loanFormDirty=false;}
 return `<section class="panel" id="manual-loans"><div class="section-heading"><h2>החזר הלוואות</h2><button class="btn" data-action="loan-add">＋ הלוואה</button></div><p class="help">מגדירים החזר חודשי ומספר החודשים שנותרו. ההערכה נעצרת אוטומטית בסוף התקופה; בדיווח בפועל אפשר לעדכן את סך ההחזר מהבנק. אין להזין את אותו החזר גם כהוצאה אחרת או כפריט מתוכנן.</p>${(plan.loans??[]).map(l=>{const elapsed=Math.max(0,indexMonth(todayMonth())-indexMonth(l.from)),remaining=Math.max(0,l.months-elapsed);return `<article class="planned-card"><strong>${esc(l.name)}</strong><p>${money(l.monthly)} בחודש · <bdi>${remaining}</bdi> חודשים מתוכננים כולל החודש הנוכחי</p><small>מהחודש ${monthLabel(l.from)} עד ${monthLabel(monthAt(l.from,l.months-1))}. זו תקופת תכנון, לא אישור שההחזרים בוצעו.</small><div class="actions"><button class="btn" data-action="loan-edit" data-id="${esc(l.id)}">עריכה</button><button class="btn" data-action="loan-remove" data-id="${esc(l.id)}">הסרה מהתכנון</button></div></article>`;}).join('')}${loanEditor?loanFormView():''}</section>`;
}
function loanFormView(){const l=loanEditor;return `<form id="loan-form"><div class="form-grid">${tfield('שם ההלוואה','loan-name',l.name,'למשל: הלוואה אישית')}${nfield('החזר חודשי · ₪','loan-monthly',l.monthly,0.01)}${nfield('מספר החודשים שנותרו כולל חודש ההתחלה','loan-months',l.months,1,120)}${mfield('חודש ההחזר הבא','loan-from',l.from,plan.startMonth,monthAt(plan.startMonth,119))}${typeof cashPayingField==='function'?cashPayingField('loan-cash-account',l.cashAccountId,'החשבון שממנו נגבית ההלוואה'):''}</div><p class="help">יתרת התשלומים המתוכננת היא החזר חודשי כפול מספר החודשים; אין כאן חישוב ריבית או יתרת קרן בבנק.</p><p data-loan-error class="error-box" role="alert" hidden></p><div class="actions"><button class="btn primary" type="submit">אישור התכנון</button><button class="btn" type="button" data-action="loan-cancel">ביטול העריכה</button></div></form>`;}
app.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]'),action=button?.dataset.action;if(!action?.startsWith('loan-')||!loaded||loading||saving)return;
 if(action==='loan-cancel'){loanEditor=null;loanFormDirty=false;render();return;}
 if(loanFormDirty){notify('יש לאשר או לבטל את עריכת ההלוואה תחילה.');return;}
 if(action==='loan-add'||action==='loan-edit'){
  if(!guardMonthlyNavigation()||!guardSavingsDraft()||hasDetailDraft()||hasSecurityDraft())return;
  if(action==='loan-edit')tab='plans';loanEditor=action==='loan-edit'?clone(plan.loans.find(l=>l.id===button.dataset.id)):{id:crypto.randomUUID(),name:'',monthly:0,months:12,from:todayMonth()<plan.startMonth?plan.startMonth:todayMonth()};render();return;
 }
 if(action==='loan-remove')confirmAction('להסיר את ההלוואה מהתכנון?','תחזיות ההחזר יעודכנו. דיווחים בפועל מהחודשים הקודמים נשארים.',()=>mutate(removeLoan(plan,button.dataset.id)));
});
app.addEventListener('input',event=>{if(event.target.closest('#loan-form'))loanFormDirty=true;});
app.addEventListener('submit',event=>{
 const form=event.target.closest('#loan-form');if(!form)return;event.preventDefault();if(saving||loading||!loaded||!form.reportValidity())return;
 try{const v=Object.fromEntries(budgetFormData(form)),number=name=>readNumber(v[name]===''?form.elements.namedItem(name).dataset.current:v[name]),name=v['loan-name'].trim()||loanEditor.name;
  const next=setLoan(plan,{id:loanEditor.id,name,monthly:number('loan-monthly'),months:number('loan-months'),from:v['loan-from'],...(v['loan-cash-account']?{cashAccountId:v['loan-cash-account']}:{})});loanFormDirty=false;loanEditor=null;saveDockAccepted();mutate(next,'החזר ההלוואה נוסף לתכנון. יש לשמור את השינויים.');
 }catch(error){const node=form.querySelector('[data-loan-error]');node.hidden=false;node.textContent=error.message;}
});
