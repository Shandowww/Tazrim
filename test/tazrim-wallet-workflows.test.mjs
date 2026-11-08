import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {accountWorkflows} from '../frontend/src/app/account-workflows.js'
import {openingViewSearch,withViewQuery} from '../frontend/src/app/navigation-query.js'
import {savedCardProvider,savedBankProvider,savedCardNetwork,budgetNavigation} from '../frontend/src/app/budget-adapter.js'
const main=readFileSync('frontend/src/main.tsx','utf8')
const routes=[...main.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1])
function matched(href){const path=href.split('?')[0];return routes.some(route=>new RegExp('^'+route.replace(/:[^/]+/g,'[^/]+')+'$').test(path))}
test('Every wallet action resolves to an existing native screen and preserves its exact identity and view',()=>{
 for(const kind of ['banks','cards'])for(const id of ['','account-with-dashes','card1'])for(const action of accountWorkflows(kind,id)){
  assert.ok(matched(action.href),action.href)
  const url=new URL(withViewQuery(action.href,'budget=shared-space&year=2026&month=9'),'https://budget.test/next/');assert.equal(url.searchParams.get('budget'),'shared-space');assert.equal(url.searchParams.get('year'),'2026');assert.equal(url.searchParams.get('month'),'9')
  if(url.searchParams.has('account'))assert.equal(url.searchParams.get('account'),id)
  if(url.searchParams.has('card'))assert.equal(url.searchParams.get('card'),id)
  assert.doesNotMatch(action.href,/legacy|interface=/)
 }
 assert.ok(accountWorkflows('cards','card1').some(a=>a.href==='/cards/card1/stop'))
 assert.ok(accountWorkflows('cards','a/b').every(a=>!a.href.includes('/a/b')))
})
test('Viewer wallet areas expose reports and detail reads without edit entry points',()=>{
 assert.deepEqual(accountWorkflows('cards','card1',true).map(a=>a.href),['/categories?card=card1'])
 assert.deepEqual(accountWorkflows('banks','a',true).map(a=>a.href),['/categories?account=a'])
 for(const kind of ['cards','banks'])assert.deepEqual(accountWorkflows(kind,'',true).map(a=>a.href),['/upload','/upload/history'])
})
test('Fresh native launch selects current month while explicit annual, historical and scope links retain intent',()=>{
 const query=new URLSearchParams(openingViewSearch('budget=space&account=a','2026-11'));assert.equal(query.get('month'),'11');assert.equal(query.get('year'),'2026');assert.equal(query.get('budget'),'space');assert.equal(query.get('account'),'a')
 for(const input of ['year=2025','year=2026&month=8','month=2'])assert.equal(openingViewSearch(input,'2026-11'),input)
})
test('Card display uses original issuer evidence and refuses conflicting brands without mutating records',()=>{
 const plan={details:[{method:'card1',statement:{issuer:'isracard'}}]},before=JSON.stringify(plan)
 assert.equal(savedCardProvider(plan,{id:'card1',name:'אישי'}),'isracard');assert.equal(savedCardProvider(plan,{id:'card1',name:'כאל'}),'');assert.equal(savedCardProvider(plan,{id:'other',name:'כרטיס וואן זירו'}),'one-zero');assert.equal(savedCardProvider(plan,{id:'other',name:'אישי'}),'');assert.equal(JSON.stringify(plan),before)
})

test('Legacy bank labels resolve decorative logos without changing accounts or accepting conflicting bank names',()=>{
 for(const [label,expected]of [['בנק הפועלים - פרטי','hapoalim'],['הפועלים – משותף','hapoalim'],['Bank Hapoalim personal','hapoalim'],['וואן זירו','one-zero'],['בנק לאומי','leumi'],['מזרחי / הפועלים',''],['פרטי','']]){
  const account={id:'bank',label,bankName:''},before=JSON.stringify(account)
  assert.equal(savedBankProvider(account),expected,label);assert.equal(JSON.stringify(account),before)
 }
 assert.equal(savedBankProvider({label:'הפועלים',bankName:'one-zero'}),'one-zero')
})
test('ONE ZERO card brand and Mastercard use display metadata and explicit payer links without overwriting saved issuer or network',()=>{
 const plan={creditCards:[{id:'card1',name:'אישי',alias:'1234'}],cashPlanning:{accounts:[{id:'one',label:'וואן זירו',bankName:''},{id:'poalim',label:'בנק הפועלים - פרטי',bankName:''}],cardAccounts:{card1:'one'}}},before=JSON.stringify(plan),card=plan.creditCards[0]
 assert.equal(savedCardProvider(plan,card),'one-zero');assert.equal(savedCardNetwork(plan,card),'mastercard')
 assert.equal(budgetNavigation(plan).find(a=>a.id==='poalim').provider,'hapoalim')
 assert.equal(budgetNavigation(plan).find(a=>a.id==='card1').cardNetwork,'mastercard')
 assert.equal(savedCardNetwork(plan,{...card,network:'visa'}),'visa')
 assert.equal(savedCardProvider(plan,{...card,provider:'cal'}),'cal');assert.equal(savedCardNetwork(plan,{...card,provider:'cal'}),null)
 assert.equal(savedCardNetwork(plan,{...card,provider:'וואן זירו'}),'mastercard')
 assert.equal(savedCardProvider(plan,{id:'other',name:'אישי'}),'');assert.equal(savedCardNetwork(plan,{id:'other',name:'אישי'}),null)
 assert.equal(JSON.stringify(plan),before)
})

test('ONE ZERO program remains visible alongside original processing-issuer evidence without false brand conflicts',()=>{
 const plan={details:[{method:'card1',statement:{issuer:'isracard'}}]},card={id:'card1',name:'כרטיס וואן זירו'},before=JSON.stringify(plan)
 assert.equal(savedCardProvider(plan,card),'one-zero');assert.equal(savedCardNetwork(plan,card),'mastercard')
 assert.equal(savedCardNetwork(plan,{id:'other',name:'כאל Mastercard'}),'mastercard')
 assert.equal(savedCardNetwork(plan,{id:'other',name:'מאסטרכארד'}),'mastercard')
 assert.equal(JSON.stringify(plan),before)
})
