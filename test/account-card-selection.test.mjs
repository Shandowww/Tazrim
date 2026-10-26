import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import * as model from '../src/budget.js';
const month='2026-10';
function fixture(){return {startMonth:month,opening:11000,buffer:0,horizon:12,defaults:model.zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'הפועלים',bankName:'hapoalim',opening:1000,openingMonth:month,buffer:0},{id:'b',label:'וואן זירו',bankName:'one-zero',opening:10000,openingMonth:month,buffer:0}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}};}
const purchase={id:'trial',name:'בדיקה',amount:2000,fees:0,payments:1,firstMonth:month,source:'direct',cashAccountId:'a',cardId:'card1',enabled:true};
test('Renamed cards keep their IDs and use an unambiguous saved source payer when legacy settings have no map',()=>{
 const p=fixture();p.creditCards=model.creditCards(p).map(c=>({...c}));p.creditCards[0].name='כרטיס הייטקזון פרטי';p.cashPlanning.cardAccounts={};p.cardBilling={version:1,reports:[{cardId:'card1',accountId:'a',dueDate:'2026-10-15',updatedOn:'2026-10-14',amount:0,status:'pending',source:'file'},{cardId:'card2',accountId:'b',dueDate:'2026-10-15',updatedOn:'2026-10-14',amount:0,status:'pending',source:'file'}]};
 const before=JSON.stringify(p);assert.equal(model.validatePlan(p),true);assert.equal(model.cashCardAccount(p,'card1'),'a');assert.deepEqual(model.cashCardsForAccount(p,'a').map(c=>c.name),['כרטיס הייטקזון פרטי']);assert.deepEqual(model.cashCardsForAccount(p,'b').map(c=>c.id),['card2']);assert.equal(model.cashPaymentSelection(p,{firstMonth:month},'cardId','card1').cashAccountId,'a');const ui=uiHarness(p);assert.match(ui.cashCardField('trial-card','','a',month),/כרטיס הייטקזון פרטי/);assert.doesNotMatch(ui.cashCardField('trial-card','','a',month),/value="card2"/);assert.equal(model.cashPaymentSelection(p,purchase,'cashAccountId','a').cardId,'card1');assert.equal(model.cashAssignedItem(p,{cardId:'card1'}),'a');assert.equal(JSON.stringify(p),before);
 p.creditCards[0].name='Completely different name';p.cashPlanning.accounts[0].label='Renamed bank';assert.equal(model.cashCardsForAccount(p,'a')[0].id,'card1');
 p.cashPlanning.accounts=p.cashPlanning.accounts.slice(0,1);assert.deepEqual(model.cashCardsForAccount(p,'a').map(c=>c.id),['card1']);assert.equal(model.cashCardAccount(p,'card2'),null);
});
test('Source-based card links reject conflicting or unavailable payers and never infer from a matching name',()=>{
 const p=fixture();p.cashPlanning.cardAccounts={};p.bankImport={entries:[{field:'card1',accountId:'a'}]};assert.equal(model.cashCardAccount(p,'card1'),'a');p.cardBilling={reports:[{cardId:'card1',accountId:'b'}]};assert.equal(model.cashCardAccount(p,'card1'),null);assert.deepEqual(model.cashCardsForAccount(p,'a'),[]);p.cashPlanning.cardAccounts.card1='a';assert.equal(model.cashCardAccount(p,'card1'),'a');delete p.cashPlanning.cardAccounts.card1;p.cardBilling.reports=[];p.bankImport.entries[0].accountId='removed';assert.equal(model.cashCardAccount(p,'card1'),null);
});
test('Account selectors use exact stored account links, never bank names or card labels',()=>{
 const p=fixture();p.cashPlanning.accounts.push({id:'c',label:'הפועלים נוסף',bankName:'hapoalim',opening:0,buffer:0});assert.deepEqual(model.cashCardsForAccount(p,'a').map(c=>c.id),['card1']);assert.deepEqual(model.cashCardsForAccount(p,'b').map(c=>c.id),['card2']);assert.deepEqual(model.cashCardsForAccount(p,'c'),[]);assert.deepEqual(model.cashCardsForAccount(p,'missing'),[]);delete p.cashPlanning.cardAccounts.card1;assert.deepEqual(model.cashCardsForAccount(p,'a'),[]);assert.equal(model.cashCardsForAccount(p).length,2);
});
test('Changing the paying account clears incompatible cards; choosing a mapped card first fills its account without mutating saved data',()=>{
 const p=fixture(),before=JSON.stringify(p),draft={...purchase};const changed=model.cashPaymentSelection(p,draft,'cashAccountId','b');assert.equal(changed.cardId,undefined);assert.equal(changed.cashAccountId,'b');assert.equal(draft.cardId,'card1');assert.equal(model.cashPaymentSelection(p,draft,'cashAccountId','').cardId,undefined);assert.equal(model.cashPaymentSelection(p,{firstMonth:month},'cardId','card2').cashAccountId,'b');assert.throws(()=>model.cashPaymentSelection(p,draft,'cardId','card2'),/אינו משויך/);assert.equal(JSON.stringify(p),before);
});
test('A cross-bank alternative actually reallocates the same purchase and improves all-account safety without changing stored data',()=>{
 const p=fixture(),before=JSON.stringify(p),choices=model.cashPurchaseAlternatives(p,[purchase],month);assert.equal(choices.length,1);assert.equal(choices[0].accountId,'b');assert.equal(choices[0].cardId,'card2');assert.equal(choices[0].beforeMargin,-1000);assert.equal(choices[0].afterMargin,1000);assert.equal(choices[0].lowBalance,8000);assert.equal(JSON.stringify(p),before);
 const switched={...purchase,cashAccountId:choices[0].accountId,cardId:choices[0].cardId},result=model.previewScenario(p,[switched]);assert.equal(result.accounts[0].rows[0].balance,1000);assert.equal(result.accounts[1].rows[0].balance,8000);
});
test('Missing balances, incomplete figures, unmapped cards, multi-purchase scenarios and worse alternatives never produce a recommendation',()=>{
 const missing=fixture();delete missing.cashPlanning.accounts[1].opening;assert.deepEqual(model.cashPurchaseAlternatives(missing,[purchase],month),[]);
 const partial=fixture();partial.defaults.variable=100;assert.deepEqual(model.cashPurchaseAlternatives(partial,[purchase],month),[]);
 const unmapped=fixture();delete unmapped.cashPlanning.cardAccounts.card2;assert.deepEqual(model.cashPurchaseAlternatives(unmapped,[purchase],month),[]);
 const worse=fixture();worse.cashPlanning.accounts[1].opening=500;assert.deepEqual(model.cashPurchaseAlternatives(worse,[purchase],month),[]);
 assert.deepEqual(model.cashPurchaseAlternatives(fixture(),[purchase,{...purchase,id:'second'}],month),[]);assert.deepEqual(model.cashPurchaseAlternatives(fixture(),[{...purchase,originalId:'existing'}],month),[]);
});
test('A healthy original account suppresses noise; a tight but safe scenario requires at least a full installment of improvement',()=>{
 const p=fixture();p.cashPlanning.accounts[0].opening=6000;assert.deepEqual(model.cashPurchaseAlternatives(p,[purchase],month),[]);p.cashPlanning.accounts[0].opening=3000;assert.equal(model.cashPurchaseAlternatives(p,[purchase],month).length,1);p.cashPlanning.accounts[1].opening=4500;assert.deepEqual(model.cashPurchaseAlternatives(p,[purchase],month),[]);
});
function uiHarness(p=fixture()){
 const c=vm.createContext({...model,crypto:globalThis.crypto,plan:p,app:{addEventListener(){},querySelector:()=>null},purchase:{...purchase},selectedPayments:1,purchaseEnabled:true,scenarioItems:[],document:{getElementById:()=>null},todayMonth:()=>month,esc:s=>String(s??'').replaceAll('<','&lt;'),money:n=>n+' ₪',notify(){},select:(label,name,items,value)=>`<select name="${name}">${items.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('')}</select>`});
 vm.runInContext(fs.readFileSync('src/cash-accounts.js','utf8'),c);vm.runInContext(fs.readFileSync('src/planner.js','utf8'),c);return c;
}
test('Calculator, planned fields and month grids show selected-account cards and separate qualifying alternatives',()=>{
 const c=uiHarness();assert.match(c.cashCardField('trial-card','card1','a',month),/value="card1"/);assert.doesNotMatch(c.cashCardField('item-card','','a',month),/value="card2"/);const html=c.paymentCalendar();assert.match(html,/חלופה בחשבון אחר/);assert.match(html,/data-account="b"/);assert.doesNotMatch(html.split('payment-calendar-note')[0],/וואן זירו · סוף החודש/);
 delete c.plan.cashPlanning.accounts[1].opening;assert.doesNotMatch(c.paymentCalendar(),/חלופה בחשבון אחר/);
});
test('Trying a qualifying bank alternative updates only the calculator account/card pair and preserves the plan',()=>{
 const c=uiHarness(),before=JSON.stringify(c.plan),id=vm.runInContext('primaryTrialId',c);assert.equal(c.trialAction('trial-alternative',{dataset:{id,account:'b',card:'card2'}}),true);assert.equal(c.purchase.cashAccountId,'b');assert.equal(c.purchase.cardId,'card2');assert.equal(JSON.stringify(c.plan),before);
});
