import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,demoPlan,zero} from '../src/budget.js'
import {householdHistory,returnDestination,householdTrail,householdLinkState,householdReplaceState,householdFallback,householdSpaceHref} from '../frontend/src/app/household-model.js'
test('Reported six-month window crosses years, preserves gaps and signed cents, excludes forecasts',()=>{
 const p=clone(demoPlan);p.startMonth='2025-10';p.expenses=[]
 p.months={'2025-10':{actual:true,values:{...zero(),salary:100,card1:10}},'2025-12':{actual:true,values:{...zero(),salary:200.01,incomingTransfers:30.02,variable:-5.01,card1:20}},'2026-01':{actual:true,values:zero()},'2026-02':{actual:false,values:{...zero(),salary:99999}},'2026-03':{actual:true,values:{...zero(),salary:88888}}}
 const before=JSON.stringify(p),h=householdHistory(p,'2026-02')
 assert.equal(h.latest,'2026-01');assert.deepEqual(h.rows.map(r=>r.month),['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01'])
 assert.equal(h.rows[3].income,null);assert.equal(h.rows[5].income,0);assert.equal(h.rows[4].income,200.01);assert.equal(h.rows[4].incomingTransfers,30.02);assert.equal(h.rows[4].spending,14.99);assert.equal(h.rows[4].cardTotal,20)
 assert.equal(JSON.stringify(p),before)
})
test('No actuals remains six missing months; counts use scoped pending cheques and active loan terms',()=>{
 const p=clone(demoPlan);p.months={};p.details=[{method:'checks',status:'pending'},{method:'checks',status:'cancelled'},{method:'card1',status:'pending'}];p.details=p.details.map((r,i)=>({id:'detail-'+i,name:'דוגמה',category:'אחר',amount:1,date:'2026-02-10',month:'2026-02',accounting:'included',...r}));p.loans=[{from:'2026-01',months:2},{from:'2026-03',months:12},{from:'2025-12',months:2}]
 const h=householdHistory(p,'2026-02');assert.equal(h.latest,null);assert.ok(h.rows.every(r=>r.income===null));assert.equal(h.checks,1);assert.equal(h.loans,1)
})
test('Return navigation keeps a scoped internal destination and refuses external or another space',()=>{
 assert.equal(returnDestination('/accounts?budget=family&year=2025&month=12','?budget=family'),'/accounts?budget=family&year=2025&month=12')
 assert.equal(returnDestination('/accounts?year=2026&confirm=yes&token=hidden'),'/accounts?year=2026')
 for(const path of ['https://bad.invalid','//bad.invalid','/\\bad.invalid','/accounts?budget=other','/next/settings'])assert.equal(returnDestination(path,'?budget=family'),'/')
})
test('Partial bank coverage stays explicit and separate plan calls never retain another scope',()=>{
 const p=clone(demoPlan);p.months={};p.expenses=[]
 p.cashPlanning={accounts:[{id:'a',label:'א',buffer:0},{id:'b',label:'ב',buffer:0}],months:{'2025-12':{a:{actual:true,values:{...zero(),salary:123.45}},b:{actual:false,values:{...zero(),salary:9999}}}},cardAccounts:{},transfers:[]}
 const first=householdHistory(p,'2026-01');assert.equal(first.latest,'2025-12');assert.equal(first.rows.at(-1).partial,true);assert.equal(first.rows.at(-1).income,123.45)
 const other=clone(p);other.cashPlanning.months['2025-12'].a.values.salary=456.78
 assert.equal(householdHistory(other,'2026-01').rows.at(-1).income,456.78)
 assert.equal(householdHistory(p,'2026-01').rows.at(-1).income,123.45)
})

test('Nested screen back links consume the trail without bouncing back into an editor',()=>{
 const search='?budget=family&year=2026&month=10'
 const home={pathname:'/',search,state:null}
 const list={pathname:'/details/manage',search,state:householdLinkState(home,'/details/manage'+search)}
 const edit={pathname:'/details/abc/edit',search,state:householdLinkState(list,'/details/abc/edit'+search,{setupSavedMessage:'kept'})}
 assert.deepEqual(householdTrail(edit.state,search),['/'+search,'/details/manage'+search])
 assert.equal(edit.state.setupSavedMessage,'kept')
 const backState=householdLinkState(edit,'/details/manage'+search,{householdTrail:householdTrail(edit.state,search).slice(0,-1)})
 assert.deepEqual(householdTrail(backState,search),['/'+search])
 const backAgain=householdLinkState({...list,state:backState},'/'+search,{householdTrail:[]})
 assert.deepEqual(householdTrail(backAgain,search),[])
})
test('Period changes keep the origin, main navigation resets it, foreign space and action parameters are discarded',()=>{
 const location={pathname:'/loans',search:'?budget=family&year=2026&month=10',state:{householdTrail:['/more?budget=family']}}
 assert.deepEqual(householdLinkState(location,'/loans?budget=family&month=9').householdTrail,['/more?budget=family'])
 assert.deepEqual(householdLinkState(location,'/accounts?budget=family').householdTrail,[])
 assert.deepEqual(householdTrail({householdTrail:['/loans?budget=other&token=private']},location.search),['/'])
 assert.deepEqual(householdTrail({householdFrom:'/accounts?budget=family&confirm=yes'},location.search),['/accounts?budget=family'])
})

test('Acknowledged creation preserves return context and trims a list ancestor when returning to it',()=>{
 const location={pathname:'/details/new',search:'?budget=family',state:{householdTrail:['/?budget=family','/details/manage?budget=family']}}
 const explicit={setupSavedMessage:'נשמר',setupSavedScope:'actor/family'}
 const edit=householdReplaceState(location,'/details/created/edit?budget=family',explicit)
 assert.deepEqual(edit,{...explicit,householdTrail:location.state.householdTrail})
 const list=householdReplaceState(location,'/details/manage?budget=family',explicit)
 assert.deepEqual(list,{...explicit,householdTrail:['/?budget=family']})
})

test('Direct editor and report links have useful parents without an existing navigation trail',()=>{
 for(const [path,parent]of [['/loans/a/edit','/loans'],['/details/a/clear','/checks'],['/cards/a','/accounts'],['/cards/a/billing','/cards/a'],['/accounts/new','/accounts'],['/accounts/a/monthly/correction','/banks/a'],['/accounts/a/assign-remainder','/accounts/transfers'],['/accounts/transfers/new','/accounts/transfers'],['/card-setup/new','/accounts'],['/upload/a/review','/upload'],['/settings/security','/settings'],['/settings/device-draft','/settings/security'],['/settings/report-expectations','/upload'],['/overview/migration','/overview'],['/analysis','/categories'],['/plans/scenario','/more'],['/savings/a/deposit','/savings'],['/investment','/savings']])assert.equal(householdFallback(path),parent)
})

test('Returning to a new income form or expected-report intake preserves only validated presentation hints',()=>{
 assert.equal(returnDestination('/plans/new?kind=income&confirm=yes'),'/plans/new?kind=income')
 assert.equal(returnDestination('/upload?budget=family&kind=card&target=card-123&token=private','?budget=family'),'/upload?budget=family&kind=card&target=card-123')
 assert.equal(returnDestination('/upload?kind=admin&target=card-123'),'/upload')
 assert.equal(returnDestination('/upload?kind=card&target=../private'),'/upload')
 assert.equal(householdFallback('/details/a','?from=search'),'/search')
})

test('Switching spaces drops record identifiers, filters and actions while keeping a safe parent and period',()=>{
 const query='?budget=old&year=2026&month=10&account=private-bank&card=private-card&walletCard=private-card&category=private-category&query=private-text&target=private-source&kind=bank&token=private&confirm=yes'
 for(const [path,parent]of [['/cards/private-card/billing/2026-10-02','/accounts'],['/accounts/private-bank/monthly','/accounts'],['/loans/private-loan/edit','/loans'],['/upload/private-source/review','/upload'],['/details/private-row/edit','/checks'],['/plans/private-item/edit','/plans'],['/savings/private-goal/deposit','/savings'],['/plans/scenario','/plans/scenario'],['/settings/security','/settings/security']]){
  assert.equal(householdSpaceHref(path,query,'family'),parent+'?year=2026&month=10&budget=family')
 }
 assert.equal(householdSpaceHref('/accounts',query,'personal'),'/accounts?year=2026&month=10')
 assert.equal(householdSpaceHref('/accounts','?demo=1&account=private','family'),'/accounts?demo=1&budget=family')
})

test('Account replacement also removes old personal source ids and search text',()=>{
 assert.equal(householdSpaceHref('/upload/alice-source/group','?year=2026&month=11&reports=alice-source&query=private','personal'),'/upload?year=2026&month=11')
 assert.equal(householdSpaceHref('/search','?year=2026&month=11&query=private&card=alice-card','personal'),'/search?year=2026&month=11')
})
