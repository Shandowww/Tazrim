import test from 'node:test';import assert from 'node:assert/strict';
import {actionIssues,actionIssueVisible,validActionTarget} from '../src/action-center-model.js';
import {createDemoPlan,clone} from '../src/budget.js';
import {openDatabase} from '../server/database.mjs';import {createActions} from '../server/actions.mjs';
test('action facts group a report, never equate snoozing/reading with resolution or treat future/missing-by-default as overdue',()=>{
 const p=createDemoPlan('2026-10'),before=clone(p),opts={scope:'u/p',asOf:'2026-10',day:'2026-10-18'};
 assert.deepEqual(actionIssues(p,opts),[]);
 const issues=actionIssues(p,{...opts,reports:[{id:'r',revision:1,name:'דוח',state:'needs_review',rows:20}]});assert.equal(issues.length,1);assert.equal(actionIssues(p,{...opts,reports:[{id:'r',revision:2,state:'ready'}]})[0].key,issues[0].key);
 const prefs={[issues[0].key]:{evidence:issues[0].evidence,until:100}};assert.equal(actionIssueVisible(issues[0],prefs,1),false);assert.equal(actionIssueVisible(issues[0],prefs,101),true);assert.equal(actionIssueVisible({...issues[0],evidence:'new'},prefs,1),true);
 assert.deepEqual(p,before);assert.ok(!validActionTarget({screen:'backup',url:'https://evil.test'}));assert.ok(!validActionTarget({screen:'report',reportId:'[selector]'}));assert.ok(validActionTarget({screen:'report',reportId:'abc-123'}));
});
test('expected source uses explicit deadline, grace, exceptions and real source evidence; locked data is never reported clean',()=>{
 const p=createDemoPlan('2026-10');p.startMonth='2026-09';p.cardBilling={version:1,reports:[]};p.details=[];const rule={kind:'card',target:'card1',enabled:true,startMonth:'2026-09',dueDay:10,graceDays:3,exceptions:[]};
 const opt={scope:'u/p',asOf:'2026-10',day:'2026-10-13',expectations:[rule]};assert.equal(actionIssues(p,opt).length,0);opt.day='2026-10-14';assert.equal(actionIssues(p,opt)[0].code,'report.overdue');
 assert.equal(actionIssues(p,{...opt,expectations:[{...rule,exceptions:['2026-09']}]}).length,0);
 assert.equal(actionIssues(p,{...opt,reports:[{id:'r',state:'needs_review',kind:'card',target:'card1',month:'2026-09'}]}).length,1);
 p.cardBilling.reports=[{cardId:'card1',source:'file',dueDate:'2026-09-15',amount:0}];assert.equal(actionIssues(p,opt).length,0);
 const locked=actionIssues(null,{...opt,locked:true,reports:[{id:'private',name:'secret name',state:'ready'}],notices:[{id:'n',state:'review',subject:'secret mail'}]});assert.equal(locked.length,1);assert.equal(locked[0].code,'import.unlock');assert.ok(!JSON.stringify(locked).includes('secret'));
 assert.equal(actionIssues(null,{...opt,admin:false,backup:{error:'private admin error'}}).length,0);
});
test('action preferences isolate users/scopes; expectation edits use revision and current editor membership',async()=>{
 const {db}=openDatabase(':memory:'),a={id:'alice',email:'a@test'},b={id:'bob',email:'b@test'},handle=createActions(db,{isAllowed:()=>true,now:()=>10});
 const req=(user,body,budget='personal')=>handle(new Request('https://app.test/api/actions?budget='+budget,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),user);
 try{assert.equal((await req(a,{key:'k',evidence:'e',until:100})).status,200);assert.deepEqual((await (await req(b)).json()).preferences,{});assert.equal((await (await req(a)).json()).preferences.k.until,100);
 const rules=[{kind:'card',target:'card1',enabled:true,startMonth:'2026-09',dueDay:31,graceDays:2,exceptions:[]}];assert.equal((await req(a,{action:'expectations',revision:0,rules})).status,200);assert.equal((await req(a,{action:'expectations',revision:0,rules})).status,409);
 db.prepare('INSERT INTO budgets(id,owner_id,name,data,revision,updated_at) VALUES(?,?,?,?,?,?)').run('shared','alice','shared',null,0,'now');db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run('shared','bob','b@test');db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run('shared','bob','viewer');
 assert.equal((await req(b,{action:'expectations',revision:0,rules},'shared')).status,403);db.prepare('DELETE FROM budget_members WHERE budget_id=?').run('shared');assert.equal((await req(b,null,'shared')).status,404);
 }finally{db.close();}
});
test('optional Gmail stays quiet when disconnected or paused; active failures remain actionable without a blocking announcement',()=>{
 const opts={asOf:'2026-10',day:'2026-10-19'},gmail={connected:true,enabled:true,error:'Reconnect required',lastChecked:1};
 for(const state of [{...gmail,connected:false},{...gmail,enabled:false},null])assert.deepEqual(actionIssues(null,{...opts,gmail:state}),[]);
 const issue=actionIssues(null,{...opts,gmail})[0];assert.equal(issue.code,'gmail.failed');assert.equal(issue.severity,'incomplete');assert.equal(issue.target.screen,'gmail');
});
