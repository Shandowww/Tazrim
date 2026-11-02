import test from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync} from 'node:fs'
import {zero,clone,setOffCardTotal,setReportedCashBalance,saveMonthReport} from '../src/budget.js'
import {inboxTarget,inboxHintTarget} from '../src/report-inbox-model.js'
import {initialMonthlyDraft,prepareMonthlyReport} from '../frontend/src/app/monthly-report.ts'
import {originalMonthlyFields} from '../frontend/src/app/monthly-recovery.ts'
import {monthlyDraftHref} from '../frontend/src/app/navigation-query.js'
import {driveConnectHref} from '../frontend/src/app/drive-backup-api.ts'
import {reportActionDestination} from '../frontend/src/app/action-center-api.ts'
const month='2026-10',plan=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false})
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(dir+'/'+f.name):[dir+'/'+f.name])
test('Only the Settings layout control may navigate from the native UI to the original interface',()=>{
 const components=files('frontend/src').filter(f=>f.endsWith('.tsx'))
 for(const file of components){const source=readFileSync(file,'utf8');if(file.endsWith('/interface-layout-setting.tsx'))continue;assert.doesNotMatch(source,/legacyBudgetHref|legacyInterfaceHref|legacyActionCenterHref|interfaceLayoutHref|ממשק הקיים|ממשק המקורי|mf-view=|href=["']\/\?|href=\{original\}/,file)}
 const control=readFileSync('frontend/src/app/interface-layout-setting.tsx','utf8');assert.match(control,/guard\.run/);assert.match(control,/interfaceLayoutHref/)
})
test('Every original notification screen has a scoped native destination; upload month wins over the current display period',()=>{
 for(const target of [{screen:'save'},{screen:'unlock'},{screen:'backup'},{screen:'gmail'},{screen:'notice',noticeId:'n1'},{screen:'report',reportId:'12345678-1234-1234-1234-123456789abc'},{screen:'upload',kind:'bank',target:'a',month:'2026-08'}]){
  const result=reportActionDestination('?budget=house&year=2025&month=12&token=secret',{target}),url=new URL(result.href,'https://native.test');assert.equal(result.native,true);assert.equal(url.searchParams.get('budget'),'house');assert.equal(url.searchParams.has('token'),false);assert.notEqual(url.pathname,'/');if(target.screen==='upload'){assert.equal(url.searchParams.get('month'),'8');assert.equal(url.searchParams.get('year'),'2026');assert.equal(url.searchParams.get('target'),'a')}
 }
 assert.throws(()=>reportActionDestination('',{target:{screen:'report',reportId:'not-a-report-id'}}))
})
test('Original inbox navigation hints retain detected identities, refuse contradictory numbers and accept only existing scoped targets',()=>{
 const p=plan();p.creditCards=[{id:'card1',name:'A',alias:'1234'},{id:'card2',name:'B',alias:'5678'}]
 const unknown={kind:'card',target:''};assert.equal(inboxHintTarget(p,unknown,{cardId:'card2'}),'card2');assert.equal(inboxHintTarget(p,unknown,{cardId:'absent'}),'');assert.equal(inboxHintTarget(p,{...unknown,identity:'cal:1234'},{cardId:'card2'}),'');assert.equal(inboxHintTarget(p,{...unknown,target:'card1'},{cardId:'card2'}),'card1');assert.equal(inboxTarget(p,{kind:'card',identity:'cal:1234'}),'card1')
})
test('New monthly income note and signed cash balance use the original financial commands exactly',()=>{
 const p=plan(),before=clone(p),d=initialMonthlyDraft(p,month);d.values.salary='1200.34';d.otherIncomeNote='  מתנה  ';d.balance='-12.34';d.actual=true
 const original=clone(p);original.months[month]={values:{...zero(),salary:1200.34},actual:false,includesPlannedCard:false,includesPlannedDirect:false,otherIncomeNote:'מתנה'}
 const expected=saveMonthReport(setReportedCashBalance(original,month,-12.34),month,true,month,true),result=prepareMonthlyReport(p,month,d,month);assert.deepEqual(result,expected);assert.deepEqual(p,before);const next=initialMonthlyDraft(result,month);next.balance='';assert.throws(()=>prepareMonthlyReport(result,month,next,month));next.balance='-';assert.throws(()=>prepareMonthlyReport(result,month,next,month));next.balance='0';assert.equal(prepareMonthlyReport(result,month,next,month).months[month].cashReport.balance,0);next.otherIncomeNote='x'.repeat(121);assert.throws(()=>prepareMonthlyReport(result,month,next,month))
})
test('Original month-only pending drafts resume off-card text, income notes and balance without losing other edits or saving automatically',()=>{
 const p=plan(),base={plan:p,revision:4,accountId:'alice'},pending=clone(p);pending.months[month]={values:{...zero(),salary:200},actual:false,includesPlannedCard:false};const local={scope:JSON.stringify(['alice','personal']),box:{},value:{plan:pending,revision:4,selectedMonth:month,monthlyPending:month,monthlySalaryChanged:true,raw:{'month-offCard':'12..','month-otherIncomeNote':'מתנה','month-cashBalance':'-2.34'}}},before=clone(local),d=originalMonthlyFields(local,base,'personal',month);assert.equal(d.offCard,'12..');assert.equal(d.otherIncomeNote,'מתנה');assert.equal(d.balance,'-2.34');assert.equal(d.values.salary,'200');assert.throws(()=>prepareMonthlyReport(p,month,d,month));d.offCard='123.45';d.actual=true;const saved=prepareMonthlyReport(p,month,d,month),v={...zero()};setOffCardTotal(v,123.45);assert.equal(saved.months[month].values.variable,v.variable);assert.equal(saved.months[month].values.transfers,v.transfers);assert.equal(saved.months[month].cashReport.balance,-2.34);assert.deepEqual(local,before);pending.buffer=5;assert.throws(()=>originalMonthlyFields(local,base,'personal',month));assert.equal(monthlyDraftHref('?budget=house&year=2025&month=12&token=secret',month),'/monthly?year=2026&month=10&budget=house');assert.equal(monthlyDraftHref('?budget=house',undefined),'/monthly?budget=house')
})

test('Native Drive consent link retains display scope and binds the current actor without private query fields',()=>{assert.equal(driveConnectHref({accountId:'alice'},'?budget=house&year=2026&month=10&token=secret'),'/auth/backup-drive?returnTo=native&accountId=alice&year=2026&month=10&budget=house')})
