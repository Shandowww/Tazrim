import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,setLoan,validatePlan,loanPaymentEvidence,loanBankMatch,forecast} from '../src/budget.js'
import {linkLoanPayment,applyBankImport,bankPreview} from '../src/bank-import-model.js'
import {prepareLoanPaymentLink} from '../frontend/src/app/loan-payment-reassignment.ts'
import {fixture,rows,options} from './helpers/loan-payment-fixture.mjs'
async function linked(){const {p,r}=await fixture();const next=setLoan(linkLoanPayment(p,'loan',r[0].key,true),{id:'second',name:'הלוואה שנייה',monthly:1000,from:'2026-01',months:3,cashAccountId:'a'});return{p:next,key:r[0].key}}
test('An explicitly reviewed transfer counts a payment once and preserves all financial/source records',async()=>{
 const {p,key}=await linked(),before=clone(p),next=prepareLoanPaymentLink(p,'second',key,'loan')
 assert.ok(validatePlan(next));assert.equal(loanPaymentEvidence(next,'loan').paidCents,0);assert.equal(loanPaymentEvidence(next,'second').paidCents,100000)
 for(const k of ['months','defaults','cashPlanning','bankImport'])assert.deepEqual(next[k],p[k]);assert.deepEqual(forecast(next),forecast(p));assert.deepEqual(p,before)
 assert.deepEqual(next.loans[0].repayments.rule,p.loans[0].repayments.rule);assert.equal(next.loans[0].repayments.ignored[0].key,key)
 assert.throws(()=>prepareLoanPaymentLink(next,'second',key,'loan'),/השיוך הקודם השתנה/)
 assert.deepEqual(prepareLoanPaymentLink(next,'second',key,'second'),next)
})
test('Future name/amount identification is opt-in, scoped, exact and compatible with legacy strict rules',async()=>{
 const {p,key}=await linked(),before=clone(p),next=prepareLoanPaymentLink(p,'second',key,'loan',true),feb=(await rows('2026-02'))[0]
 assert.ok(validatePlan(next));assert.equal(next.loans.find(l=>l.id==='loan').repayments.rule,undefined);assert.equal(next.loans.find(l=>l.id==='second').repayments.rule.match,'name-amount')
 const differentBeneficiary={...feb,beneficiary:'מוטב שונה'}
 assert.equal(loanBankMatch(p,'a',differentBeneficiary).loanId,null);assert.equal(loanBankMatch(next,'a',differentBeneficiary).loanId,'second')
 for(const [account,row]of [['foreign',feb],['a',{...feb,amountCents:-99999}],['a',{...feb,description:'שם אחר'}],['a',{...feb,date:'2026-04-15'}],['a',{...feb,amountCents:100000}],['a',{...feb,reversal:true}]])assert.equal(loanBankMatch(next,account,row).loanId,null)
 const preview=bankPreview(next,[differentBeneficiary],options('2026-02','new',{1:{field:'variable',reviewed:false}}));assert.equal(preview.rows[0].field,'loanRepayment');assert.equal(preview.rows[0].reviewed,true)
 const imported=applyBankImport(next,[differentBeneficiary],options('2026-02','new',{1:{field:'variable',reviewed:false}}));assert.equal(loanPaymentEvidence(imported,'second').paidCents,200000);assert.equal(loanPaymentEvidence(imported,'loan').paidCents,0);assert.equal(imported.months['2026-02'].values.loanRepayment,1000);assert.equal(forecast(imported).find(r=>r.month==='2026-02').spending,1000)
 assert.deepEqual(p,before)
})
test('Reselecting the same linked payment updates future recognition without duplicating its evidence',async()=>{
 const {p,key}=await linked(),next=prepareLoanPaymentLink(p,'loan',key,'loan',true)
 assert.equal(next.loans[0].repayments.keys.length,1);assert.equal(loanPaymentEvidence(next,'loan').paidCents,100000);assert.deepEqual(next.months,p.months);assert.deepEqual(next.bankImport,p.bankImport)
 const invalid=clone(next);invalid.loans[0].repayments.rule.match='fuzzy';assert.equal(validatePlan(invalid),false)
})
test('Invalid target/account/term and a competing third rule reject the entire proposed reassignment',async()=>{
 const {p,key}=await linked()
 for(const change of [x=>x.loans[1].from='2026-02',x=>delete x.loans[1].cashAccountId]){
  const q=clone(p);change(q);if(!q.loans[1].cashAccountId){q.cashPlanning.accounts.push({id:'b',label:'Other',buffer:0})}
  const before=clone(q);assert.throws(()=>prepareLoanPaymentLink(q,'second',key,'loan',true));assert.deepEqual(q,before)
 }
 const q=setLoan(p,{id:'third',name:'שלישית',monthly:1000,from:'2026-01',months:3,cashAccountId:'a',repayments:{version:1,keys:[],rule:clone(p.loans[0].repayments.rule)}}),before=clone(q)
 assert.throws(()=>prepareLoanPaymentLink(q,'second',key,'loan',true),/הלוואה נוספת/);assert.deepEqual(q,before)
 const manual=prepareLoanPaymentLink(q,'second',key,'loan',false);assert.ok(validatePlan(manual));assert.equal(manual.loans.filter(l=>l.repayments?.keys.some(r=>r.key===key)).length,1)
 assert.throws(()=>prepareLoanPaymentLink(p,'missing',key,'loan'));assert.throws(()=>prepareLoanPaymentLink(p,'second',key,''))
})
test('Broad name/amount rules detect legacy overlap and ambiguous imported rules stay unresolved',async()=>{
 const {p,key}=await linked(),next=prepareLoanPaymentLink(p,'second',key,'loan',true),feb=(await rows('2026-02'))[0]
 const duplicate=clone(next);duplicate.loans[0].repayments.rule={...clone(next.loans[1].repayments.rule),beneficiary:'פרטי מוטב שונים'};delete duplicate.loans[0].repayments.rule.match
 assert.ok(validatePlan(duplicate));assert.deepEqual(loanBankMatch(duplicate,'a',{...feb,beneficiary:'פרטי מוטב שונים'}),{loanId:null,ambiguous:true})
 const before=clone(duplicate);assert.throws(()=>prepareLoanPaymentLink(duplicate,'second',key,'second',true),/הלוואה נוספת/);assert.deepEqual(duplicate,before)
})
