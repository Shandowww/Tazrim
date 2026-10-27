import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {zero,clone,validatePlan,cardsValid,creditCards,forecast,cashAccountForecast,cashAssignedItem} from '../src/budget.js'
import {cardDraftFingerprint,initialCardDraft,prepareCardConfig} from '../frontend/src/app/card-command.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:{...zero(),salary:1000,card1:100},months:{},expenses:[],demo:false,setupCompleted:true})
const id='card_qa-new'
function originalSubmit(plan,cardId,draft){
 const source=readFileSync('src/cards.js','utf8'),a=source.indexOf('form.onsubmit='),b=source.indexOf('\n}',a),snippet=source.slice(a,b),context={form:{},plan:clone(plan),clone,creditCards,cardsValid,FormData:class{get(key){return {id:cardId,name:draft.name,alias:draft.alias,billingDay:draft.billingDay}[key]}},crypto:{randomUUID:()=> 'qa-new'},report:message=>{throw Error(message)},close(){},openCardManager(){},mutate:next=>context.next=next};vm.runInNewContext(snippet,context);context.form.onsubmit({preventDefault(){}});return JSON.parse(JSON.stringify(context.next))
}
test('Card create/edit metadata exactly matches the existing card manager while retaining original state and financial forecasts',()=>{
 const p=base(),draft={name:' כרטיס חדש ',alias:' 1234 ',billingDay:'05',payer:''},before=JSON.stringify(p),next=prepareCardConfig(p,id,draft,true)
 assert.deepEqual(next,originalSubmit(p,'',draft));assert.equal(next.defaults[id],0);assert.equal(next.creditCards.length,3);assert.deepEqual(forecast(next).map(({income,spending,planned,net,balance})=>({income,spending,planned,net,balance})),forecast(p).map(({income,spending,planned,net,balance})=>({income,spending,planned,net,balance})));assert.equal(JSON.stringify(p),before)
 const edit={...initialCardDraft(next,id),name:'שם אחר',billingDay:'28'};assert.deepEqual(prepareCardConfig(next,id,edit),originalSubmit(next,id,edit))
})
test('A new card requires an explicit existing payer when accounts exist and never changes another mapping or account forecast',()=>{
 const p=base();p.cashPlanning={accounts:[{id:'a',label:'א',opening:500,buffer:0},{id:'b',label:'ב',opening:500,buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]};const draft={name:'חדש',alias:'4321',billingDay:'31',payer:''};assert.throws(()=>prepareCardConfig(p,id,draft,true),/משלם/);assert.throws(()=>prepareCardConfig(p,id,{...draft,payer:'other-space'},true),/משלם/)
 const next=prepareCardConfig(p,id,{...draft,payer:'b'},true);assert.deepEqual(next.cashPlanning.cardAccounts,{card1:'a',[id]:'b'});assert.deepEqual(next.cashPlanning.accounts,p.cashPlanning.accounts);assert.deepEqual(next.months,p.months);assert.equal(next.defaults[id],0)
 for(const account of ['a','b'])assert.deepEqual(cashAccountForecast(next,account).map(({balance,net})=>({balance,net})),cashAccountForecast(p,account).map(({balance,net})=>({balance,net})))
})
test('Existing payer changes fail; metadata/closure/history/installments remain intact on edit',()=>{
 const p=base();p.creditCards=[{id:'card1',name:'מקורי',alias:'1111',billingDay:10,removedFrom:'2026-09',color:'blue',provider:'max'}];p.cashPlanning={accounts:[{id:'a',label:'א',buffer:0},{id:'b',label:'ב',buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]};p.expenses=[{id:'purchase',name:'רכישה',amount:100.01,fees:0.02,firstMonth:'2026-10',payments:3,source:'card',kind:'expense',cardId:'card1',cashAccountId:'a'}];const draft=initialCardDraft(p,'card1');assert.throws(()=>prepareCardConfig(p,'card1',{...draft,payer:'b'}),/משלם/)
 const next=prepareCardConfig(p,'card1',{...draft,name:'שם חדש',billingDay:'20'});assert.equal(next.creditCards[0].removedFrom,'2026-09');assert.equal(next.creditCards[0].provider,'max');assert.equal(next.creditCards[0].color,'blue');assert.deepEqual(next.expenses,p.expenses);assert.deepEqual(next.months,p.months);assert.deepEqual(next.defaults,p.defaults);assert.equal(cashAssignedItem(next,next.expenses[0]),'a');assert.ok(validatePlan(next))
})
test('Duplicate IDs/aliases, full card numbers, excessive cards and malformed fields fail without mutation',()=>{
 const p=base();p.creditCards=[{id:'card1',name:'קיים',alias:'1111'}];const d={name:'חדש',alias:'2222',billingDay:'15',payer:''},before=JSON.stringify(p)
 assert.throws(()=>prepareCardConfig(p,'card1',d,true),/קיים/);for(const change of [v=>v.alias='1111',v=>v.alias='1234 5678 9012 3456',v=>v.name=' ',v=>v.billingDay='0',v=>v.billingDay='32',v=>v.billingDay='1.5',v=>v.payer='a',v=>v.extra='injected']){const draft=clone(d);change(draft);assert.throws(()=>prepareCardConfig(p,id,draft,true))}
 assert.throws(()=>prepareCardConfig(p,'foreign',d));const many=base();many.creditCards=Array.from({length:30},(_,i)=>({id:'card_'+i,name:'כרטיס '+i,alias:''}));assert.throws(()=>prepareCardConfig(many,id,d,true));assert.equal(JSON.stringify(p),before)
})
test('Card field normalization does not invent dirty edits; stable IDs distinguish same labels',()=>{
 const p=base(),d=initialCardDraft(p,'card1');assert.equal(cardDraftFingerprint(d),cardDraftFingerprint({...d,name:' '+d.name+' ',billingDay:'015'.slice(1)}));assert.notEqual(cardDraftFingerprint(d),cardDraftFingerprint({...d,payer:'changed'}));const next=prepareCardConfig(p,id,{name:d.name,alias:'',billingDay:'15',payer:''},true);assert.equal(next.creditCards.filter(c=>c.name===d.name).length,2)
})
