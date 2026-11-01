import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,validatePlan,setLoan,loanPaymentEvidence,loanBankMatch,forecast} from '../src/budget.js'
import {bankIdentity,bankPreview,applyBankImport,linkLoanPayment,unlinkLoanPayment,stopLoanPaymentRule,undoBankImport} from '../src/bank-import-model.js'
import {base,rows,options,fixture} from './helpers/loan-payment-fixture.mjs'
test('Linking an existing debit moves its expense once, preserves bank cash and original evidence, and deducts only identified payments from the planned total',async()=>{
 const {r,p}=await fixture(),before=JSON.stringify(p),next=linkLoanPayment(p,'loan',r[0].key,true)
 assert.ok(validatePlan(next));assert.equal(next.months['2026-01'].values.variable,0);assert.equal(next.months['2026-01'].values.loanRepayment,1000)
 assert.equal(forecast(next)[0].net,forecast(p)[0].net);assert.equal(forecast(next)[0].spending,forecast(p)[0].spending);assert.deepEqual(next.months['2026-01'].cashReport,p.months['2026-01'].cashReport)
 assert.deepEqual(next.bankImport.entries[0].source,p.bankImport.entries[0].source);assert.deepEqual(next.bankImport.batches,p.bankImport.batches);assert.deepEqual(next.bankImport.accounts,p.bankImport.accounts)
 const evidence=loanPaymentEvidence(next,'loan');assert.equal(evidence.paidCents,100000);assert.equal(evidence.remainingCents,200000);assert.equal(evidence.totalCents,300000);assert.equal(next.loans[0].months,3);assert.equal(JSON.stringify(p),before)
})
test('The shared original bank preview/import recognizes an exact future debit once, replacing its monthly estimate and preserving manual override',async()=>{
 const {r,p}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),feb=await rows('2026-02'),opt=options('2026-02','feb',{1:{field:'variable',reviewed:false}})
 const preview=bankPreview(linked,feb,opt);assert.equal(preview.rows[0].field,'loanRepayment');assert.equal(preview.rows[0].reviewed,true)
 const next=applyBankImport(linked,feb,opt);assert.equal(next.months['2026-02'].values.loanRepayment,1000);assert.equal(forecast(next).find(r=>r.month==='2026-02').spending,1000);assert.equal(loanPaymentEvidence(next,'loan').paidCents,200000)
 assert.throws(()=>applyBankImport(next,feb,{...opt,id:'replay'}));assert.equal(loanPaymentEvidence(next,'loan').paidCents,200000)
 const manual=applyBankImport(linked,feb,options('2026-02'));assert.equal(manual.bankImport.entries.at(-1).field,'variable');assert.equal(loanPaymentEvidence(manual,'loan').paidCents,100000)
 for(const [account,row]of [['foreign',feb[0]],['a',{...feb[0],amountCents:-99999}],['a',{...feb[0],description:'הוראת קבע 124'}],['a',{...feb[0],date:'2026-04-15'}],['a',{...feb[0],amountCents:100000}],['a',{...feb[0],reversal:true}]])assert.equal(loanBankMatch(linked,account,row).loanId,null)
})
test('Conflicting loan matches require review and a debit cannot be assigned to two loans',async()=>{
 const {r,p}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),other=setLoan(linked,{id:'other',name:'אחרת',monthly:1000,from:'2026-01',months:3,cashAccountId:'a',repayments:{version:1,keys:[],rule:clone(linked.loans[0].repayments.rule)}}),feb=await rows('2026-02')
 assert.throws(()=>linkLoanPayment(other,'other',r[0].key,false),/כבר משויכת/);assert.deepEqual(loanBankMatch(other,'a',feb[0]),{loanId:null,ambiguous:true});const preview=bankPreview(other,feb,options('2026-02','feb',{1:{field:'loanRepayment',reviewed:true}}));assert.equal(preview.rows[0].reviewed,false)
 const invalid=clone(other);invalid.loans[1].repayments.keys=clone(invalid.loans[0].repayments.keys);assert.equal(validatePlan(invalid),false)
})
test('Explicit refund evidence reverses paid progress; source undo/reimport and ignored matches do not replay a payment',async()=>{
 const {r,p}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),feb=await rows('2026-02'),refund=(await rows('2026-02',10000,'refund'))[0];refund.line=2
 const opt=options('2026-02','feb',{1:{field:'variable',reviewed:false},2:{field:'loanRepayment',reviewed:true,manual:true,refund:true}}),next=applyBankImport(linked,[...feb,refund],opt)
 assert.equal(loanPaymentEvidence(next,'loan').paidCents,200000);const corrected=linkLoanPayment(next,'loan',refund.key,false);assert.equal(loanPaymentEvidence(corrected,'loan').paidCents,190000)
 const undone=undoBankImport(corrected,'feb');assert.equal(loanPaymentEvidence(undone,'loan').paidCents,100000);const restored=applyBankImport(undone,[...feb,refund],opt);assert.equal(loanPaymentEvidence(restored,'loan').paidCents,190000)
 const removed=unlinkLoanPayment(restored,'loan',feb[0].key);assert.equal(loanPaymentEvidence(removed,'loan').paidCents,90000);assert.equal(loanBankMatch(removed,'a',feb[0]).loanId,null);assert.equal(removed.bankImport.entries.find(e=>e.key===feb[0].key).field,'loanRepayment')
 const stopped=stopLoanPaymentRule(restored,'loan');assert.equal(loanPaymentEvidence(stopped,'loan').paidCents,190000);assert.equal(loanBankMatch(stopped,'a',(await rows('2026-03'))[0]).loanId,null)
 assert.throws(()=>undoBankImport(undone,'2026-01'),/הנתונים השתנו/)
})
test('Past classification refuses unsourced scheduled/manual repayment totals, partial reports, wrong payers and protected source categories without mutation',async()=>{
 const {r,p}=await fixture(),before=JSON.stringify(p)
 for(const change of [q=>{q.months['2026-01'].actual=false},q=>{q.months['2026-01'].values.loanRepayment=1000},q=>{q.bankImport.entries[0].field='personalSaving'},q=>{q.loans[0].from='2026-02'},q=>{q.loans[0].cashAccountId='foreign'}]){const q=clone(p);change(q);assert.throws(()=>linkLoanPayment(q,'loan',r[0].key,true))}
 assert.equal(JSON.stringify(p),before)
})

test('Native saved-report preparation uses the same loan match and original atomic orchestration',async()=>{
 const {prepareNativeBankReport,nativeBankStoredDraft,restoreNativeBankSelection}=await import('../frontend/src/app/bank-report-command.ts'),{applyReportInbox}=await import('../src/report-inbox-model.js'),{r,p}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),feb=await rows('2026-02'),parsed={kind:'bank',from:'2026-02-01',to:'2026-02-28',hash:'a'.repeat(64),identityKey:'b'.repeat(64),records:feb},source={id:'12345678-1234-1234-1234-123456789abc',name:'bank.csv',revision:1,state:'received',sourceHash:parsed.hash,draft:null},selection={accountId:'a',scope:'complete',choices:{},duplicates:{},skipMonths:[],directIncluded:{}}
 const prepared=await prepareNativeBankReport(linked,parsed,source,selection,'2026-03');assert.equal(loanPaymentEvidence(prepared.plan,'loan').paidCents,200000)
 const original=await applyReportInbox(linked,[{records:prepared.records,options:prepared.options}],[],[prepared.receipt],[prepared.binding],'2026-03');assert.deepEqual(prepared.plan,original)
 const draft=await nativeBankStoredDraft(linked,parsed,source,selection,source.id,'2026-03'),resumed=await restoreNativeBankSelection(linked,parsed,{...source,revision:2,draft},'2026-03');assert.deepEqual(resumed,selection)
})

test('Real guarded saves recover a lost loan-link response once and refuse a shared viewer without altering other accounts',async()=>{
 const {createHash}=await import('node:crypto'),{openDatabase}=await import('../server/database.mjs'),{createApp}=await import('../server/app.mjs'),{loadBudgetSnapshot}=await import('../frontend/src/app/budget-api.ts'),{savePreparedPlan,SaveUncertain}=await import('../frontend/src/app/plan-save.ts'),{db,DB}=openDatabase(':memory:'),origin='https://loan-links.test'
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(u).digest('hex'),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})),{p,r}=await fixture()
  for(const u of ['alice','bob'])assert.equal((await req(u,'/api/plan','PUT',{plan:p,revision:0})).status,200)
  let puts=0,lost=true;const fetcher=async(url,init={})=>{const path=new URL(url,origin).pathname+new URL(url,origin).search,method=init.method??'GET';const response=await req('alice',path,method,init.body?JSON.parse(init.body):undefined);if(method==='PUT'){puts++;if(lost){lost=false;return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}})}}return response}
  const snapshot=await loadBudgetSnapshot('personal',undefined,fetcher),next=linkLoanPayment(snapshot.value.plan,'loan',r[0].key,true)
  await assert.rejects(savePreparedPlan({budgetId:'personal',base:snapshot.value,plan:next},fetcher),SaveUncertain)
  const recovered=await savePreparedPlan({budgetId:'personal',base:snapshot.value,plan:next},fetcher);assert.equal(recovered.recovered,true);assert.equal(puts,1);assert.equal(loanPaymentEvidence(recovered.value.plan,'loan').paidCents,100000)
  assert.equal(db.prepare('SELECT revision FROM plans WHERE user_id=?').get('alice').revision,2);assert.equal(db.prepare('SELECT revision FROM plans WHERE user_id=?').get('bob').revision,1)
  const house=(await(await req('alice','/api/budgets','POST',{name:'בית בדיקה'})).json()).id;assert.equal((await req('alice','/api/plan?budget='+house,'PUT',{plan:p,revision:0})).status,200)
  const invite=await(await req('alice','/api/budgets/'+house+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await req('bob','/api/budgets/accept','POST',{token:invite.token})
  assert.equal((await req('bob','/api/plan?budget='+house,'PUT',{plan:next,revision:1,accountId:'bob',budgetId:house})).status,403);assert.equal(db.prepare('SELECT revision FROM budgets WHERE id=?').get(house).revision,1)
 }finally{db.close()}
})

test('Actual CSV intake and the original atomic report service credit a future loan payment once after a lost commit response',async()=>{
 const {createHash,generateKeyPairSync,randomBytes}=await import('node:crypto'),{openDatabase}=await import('../server/database.mjs'),{createApp}=await import('../server/app.mjs'),{loadBudgetSnapshot}=await import('../frontend/src/app/budget-api.ts'),{inspectReportSource}=await import('../frontend/src/app/report-reader.ts'),{storeReportSource}=await import('../frontend/src/app/report-library-api.ts'),{loadStoredReport,commitStoredReport}=await import('../frontend/src/app/report-review-api.ts'),{prepareNativeBankReport,nativeBankStoredDraft}=await import('../frontend/src/app/bank-report-command.ts'),{db,DB}=openDatabase(':memory:'),origin='https://loan-report.test',pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(u).digest('hex'),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test'],reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}}),{p,r}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true)
  const direct=async(user,url,init={})=>{const headers=new Headers(init.headers);headers.set('origin',origin);headers.set('cookie','__Host-mf_session='+user);return app(new Request(new URL(url,origin),{...init,headers}))}
  for(const u of ['alice','bob'])assert.equal((await direct(u,'/api/plan',{method:'PUT',body:JSON.stringify({plan:linked,revision:0})})).status,200)
  let commits=0,lost=true;const fetcher=async(url,init={})=>{const response=await direct('alice',url,init);if(init.method==='POST'&&typeof init.body==='string'&&JSON.parse(init.body).action==='commit'){commits++;if(lost){lost=false;assert.equal(response.status,200,await response.clone().text());throw Error('lost successful response')}}return response}
  const base=(await loadBudgetSnapshot('personal',undefined,fetcher)).value,bytes=new TextEncoder().encode('תאריך,תיאור,סכום,יתרה,לטובת\n15/02/2026,הוראת קבע 123,-1000,8000,מוטב בדיקה'),stored=await storeReportSource('personal',base,'loan.csv',bytes,fetcher),source=await loadStoredReport('personal',base,stored.receiptId,new AbortController().signal,fetcher),parsed=await inspectReportSource(base.plan,'loan.csv',bytes,new AbortController().signal),selection={accountId:'a',scope:'complete',choices:{},duplicates:{},skipMonths:[],directIncluded:{}}
  const review=await prepareNativeBankReport(base.plan,parsed,source,selection,'2026-03'),draft=await nativeBankStoredDraft(base.plan,parsed,source,selection,source.id,'2026-03'),action='loan-atomic-commit-2026'
  assert.equal(loanPaymentEvidence(review.plan,'loan').paidCents,200000)
  await assert.rejects(commitStoredReport('personal',base,source,draft,review.plan,action,fetcher),/לא ניתן לאשר/)
  const recovered=await commitStoredReport('personal',base,source,draft,review.plan,action,fetcher);assert.equal(recovered.recovered,true);assert.equal(commits,1);assert.equal(loanPaymentEvidence(recovered.value.plan,'loan').remainingCents,100000)
  assert.equal(db.prepare('SELECT revision FROM plans WHERE user_id=?').get('alice').revision,2);assert.equal(db.prepare('SELECT revision FROM plans WHERE user_id=?').get('bob').revision,1);assert.equal(db.prepare('SELECT state FROM report_sources').get().state,'committed')
 }finally{db.close()}
})

test('Payment bindings survive encrypted vault storage without exposing bank descriptions or becoming forecast evidence',async()=>{
 const {createVault,unlockVault}=await import('../src/vault.js'),{p,r}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),vault=await createVault(linked,'synthetic-loan-password','personal:synthetic')
 try{assert.ok(!JSON.stringify(vault.envelope).includes('הוראת קבע'));const unlocked=await unlockVault(vault.envelope,'synthetic-loan-password');try{assert.deepEqual(unlocked.plan,linked);assert.equal(loanPaymentEvidence(unlocked.plan,'loan').paidCents,100000)}finally{unlocked.rawKey.fill(0)}}finally{vault.rawKey.fill(0)}
 const stale=clone(linked);stale.loans[0].repayments.keys[0].fingerprint='f'.repeat(64);assert.equal(loanPaymentEvidence(stale,'loan').paidCents,0)
 for(const corrupt of [q=>{q.loans[0].repayments.rule.amountCents=0},q=>{q.loans[0].repayments.keys.push(clone(q.loans[0].repayments.keys[0]))},q=>{q.loans[0].repayments.ignored=clone(q.loans[0].repayments.keys)}]){const q=clone(linked);corrupt(q);assert.equal(validatePlan(q),false)}
})

test('Original loan edits retain payment evidence and changing the future payer does not erase historical repayments',async()=>{
 const {p,r}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),edited=setLoan(linked,{id:'loan',name:'שם חדש',from:'2026-01',months:3,monthly:1000,cashAccountId:'a'})
 assert.deepEqual(edited.loans[0].repayments,linked.loans[0].repayments)
 const changed=clone(edited);changed.cashPlanning.accounts.push({id:'b',label:'חשבון אחר',buffer:0});changed.loans[0].cashAccountId='b';assert.ok(validatePlan(changed));assert.equal(loanPaymentEvidence(changed,'loan').paidCents,100000)
 assert.equal(loanBankMatch(changed,'a',(await rows('2026-02'))[0]).loanId,null);assert.equal(loanBankMatch(changed,'b',r[0]).loanId,null)
})
