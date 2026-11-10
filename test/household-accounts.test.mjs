import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,demoPlan,zero,withRegisteredCategory,renameRegisteredCategory,moveRegisteredCategory,mergeRegisteredCategories,categoryRegistryEntry} from '../src/budget.js'
import {budgetAccountOverview} from '../frontend/src/app/budget-adapter.js'
import {householdAccounts,selectedWalletCard,nextWalletCard,walletNeighbors,walletCardCharge,walletSwipe,cardDetailCoverage} from '../frontend/src/app/household-accounts-model.js'
import {householdCategory} from '../frontend/src/app/household-categories.js'
const period={year:'2026',month:'10',asOf:'2026-10'}
function plan(){const p=clone(demoPlan);p.startMonth='2026-01';p.expenses=[];p.defaults=zero();p.months={'2026-10':{actual:true,includesPlannedCard:true,values:{...zero(),salary:1000,card1:100,card2:50}}};p.cashPlanning={accounts:[{id:'a',label:'המשלם א',bankName:'hapoalim',buffer:0},{id:'b',label:'המשלם ב',bankName:'one-zero',buffer:0}],months:{'2026-10':{a:{actual:true,values:{...zero(),salary:1000,card1:100},balance:-25.01,date:'2026-10-31'},b:{actual:false,values:zero(),balance:9999,date:'2026-10-31'}}},cardAccounts:{card1:'a',card2:'b'},transfers:[]};p.details=[['food',80,'מזון'],['shop',40,'קניות'],['refund',-20,'קניות']].map(([id,amount,category])=>({id,name:id,amount,category,method:'card1',status:'cleared',accounting:'included',month:'2026-10',date:'2026-10-10',number:''}));return p}
test('Combined accounts use original totals/payers and preserve signed refunds and unknown bank readings without writes',()=>{
 const p=plan(),before=JSON.stringify(p),view=householdAccounts(p,period),original=budgetAccountOverview(p,period)
 assert.deepEqual(householdAccounts(p,{...period,account:'foreign',card:'foreign',category:'unrelated',query:'unrelated'}),view);
 assert.deepEqual(view.banks,original.banks);assert.equal(view.banks[0].balance.value,-25.01);assert.equal(view.banks[1].balance,null)
 assert.deepEqual(view.cards.map(c=>[c.id,c.total]),original.cards.map(c=>[c.id,c.total]));assert.equal(view.cards[0].payer.provider,'hapoalim');assert.equal(view.cards[1].payer.provider,'one-zero')
 assert.deepEqual(cardDetailCoverage(view.cards[0]),{detailed:100,remainder:0});assert.equal(view.cards[0].details.refundsCents,2000)
 assert.equal(JSON.stringify(p),before)
 delete p.cashPlanning.cardAccounts.card1;assert.equal(householdAccounts(p,period).cards[0].payer,null)
})
test('Card detail remainder remains unknown without evidence; an overrun is disclosed, never corrected into totals',()=>{
 assert.deepEqual(cardDetailCoverage({total:null,details:{valueCents:10001}}),{detailed:100.01,remainder:null})
 assert.deepEqual(cardDetailCoverage({total:100,details:{valueCents:null}}),{detailed:null,remainder:null})
 assert.deepEqual(cardDetailCoverage({total:50,details:{valueCents:6001}}),{detailed:60.01,remainder:-10.01})
})
test('Card selection validates ids in the current scope, wraps 1/2/many cards and ignores vertical or short swipes',()=>{
 const cards=[{id:'a'},{id:'b'},{id:'c'}]
 assert.equal(selectedWalletCard(cards,'foreign','b').id,'b');assert.equal(selectedWalletCard([],null,null),null)
 assert.equal(nextWalletCard(cards,'a',-1),'c');assert.equal(nextWalletCard(cards,'c',1),'a');assert.equal(nextWalletCard([{id:'a'}],'a',1),'a');assert.equal(nextWalletCard(cards.slice(0,2),'a',-1),'b');assert.equal(nextWalletCard([],null,1),null)
 assert.equal(walletSwipe({x:0,y:0},{x:51,y:5}),1);assert.equal(walletSwipe({x:0,y:0},{x:-80,y:4}),-1);assert.equal(walletSwipe({x:0,y:0},{x:60,y:100}),0);assert.equal(walletSwipe({x:0,y:0},{x:30,y:0}),0)
})
test('Category tones are semantic, stable across rename/move/merge and respect saved custom colours without modifying source',()=>{
 let p=plan();const before=JSON.stringify(p)
 assert.match(householdCategory('מזון',p).color,/green/);assert.match(householdCategory('בריאות',p).color,/purple/);assert.match(householdCategory('תחבורה',p).color,/orange/);assert.match(householdCategory('קניות',p).color,/blue/);assert.notEqual(householdCategory('בריאות / פארם',p).color,householdCategory('בריאות',p).color);assert.equal(JSON.stringify(p),before)
 p=clone(demoPlan);p.expenses=[];p=withRegisteredCategory(p,'מזון');const original=householdCategory('מזון',p);p=renameRegisteredCategory(p,'מזון','אוכל');assert.deepEqual(householdCategory('אוכל',p),original)
 p=withRegisteredCategory(p,'קניות / כללי');const custom=householdCategory('קניות / כללי',p);p=moveRegisteredCategory(p,'קניות / כללי','אוכל');assert.deepEqual(householdCategory('אוכל / כללי',p),custom)
 p=mergeRegisteredCategories(p,'אוכל / כללי','אוכל');assert.deepEqual(householdCategory('קניות / כללי',p),householdCategory('אוכל',p))
 categoryRegistryEntry(p,'אוכל').color='#123456';assert.equal(householdCategory('אוכל',p).color,'#123456')
})
test('Two-card neighbors occupy both physical sides and repeated steps cycle indefinitely in either direction',()=>{
 const cards=[{id:'a'},{id:'b'}]
 assert.deepEqual(walletNeighbors(cards,'a'),[{id:'b',side:'right',delta:-1},{id:'b',side:'left',delta:1}])
 for(const direction of [-1,1]){let selected='a';for(let turn=0;turn<101;turn++){selected=nextWalletCard(cards,selected,direction);assert.equal(selected,turn%2?'a':'b');assert.ok(walletNeighbors(cards,selected).every(row=>row.id!==selected))}}
 assert.deepEqual(walletNeighbors([],null),[]);assert.deepEqual(walletNeighbors(cards.slice(0,1),'a'),[])
 assert.deepEqual(walletNeighbors([...cards,{id:'c'}],'a').map(row=>row.id),['c','b'])
})
test('Charge text distinguishes a reported zero, signed refunds and missing month/year evidence without changing totals',()=>{
 const source=plan(),before=JSON.stringify(source),card=householdAccounts(source,period).cards[0]
 assert.equal(walletCardCharge(card,period),new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:2}).format(card.total))
 assert.match(walletCardCharge({total:0},period),/0/)
 assert.match(walletCardCharge({total:-12.34},period),/-12\.34/)
 assert.equal(walletCardCharge({total:null},period),'טרם נקלט חיוב לחודש זה')
 assert.equal(walletCardCharge({total:null},{...period,month:''}),'טרם נקלט חיוב לשנה זו')
 assert.equal(JSON.stringify(source),before)
})
