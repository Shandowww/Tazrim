import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {openDatabase} from '../server/database.mjs';import {createApp} from '../server/app.mjs';import {createDemoPlan} from '../src/budget.js';
test('Viewer reads and exports shared data but cannot save, invite, manage members or create Wallet imports; changes take effect immediately',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://viewer.test',id='11111111-1111-4111-8111-111111111111';
 try{
  for(const user of ['owner','member']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',0);db.prepare('INSERT INTO auth_access VALUES(?,?)').run(user+'@example.test',0);db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(user).digest('hex'),user,Date.now()+100000);}
  const p=createDemoPlan('2026-10');p.demo=false;await DB.prepare('INSERT INTO budgets VALUES(?,?,?,?,?,?)').bind(id,'owner','test',JSON.stringify(p),1,'2026-10-18').run();db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(id,'member','member@example.test');db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run(id,'member','viewer');
  const handle=createApp({db,DB,origin}),request=(path,user='member',method='GET',body)=>handle(new Request(origin+path,{method,headers:{cookie:'__Host-mf_session='+user,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  const list=await (await request('/api/budgets')).json();assert.equal(list.budgets.find(b=>b.id===id).role,'viewer');
  const read=await request('/api/plan?budget='+id);assert.equal(read.status,200);assert.equal((await read.json()).budget.role,'viewer');assert.equal((await request('/api/data/transactions?budget='+id)).status,200);
  assert.equal((await request('/api/plan?budget='+id,'member','PUT',{plan:p,revision:1})).status,403);
  assert.equal((await request('/api/budgets/'+id+'/invites','member','POST',{email:'other@example.test'})).status,403);
  assert.equal((await request('/api/apple-pay?budget='+id,'member','POST',{action:'connect',cardId:'card1',label:'test'})).status,403);
  assert.equal((await request('/api/budgets/'+id+'/members/member','owner','PATCH',{role:'editor'})).status,200);
  assert.equal((await request('/api/plan?budget='+id,'member','PUT',{plan:p,revision:1})).status,200);
  assert.equal((await request('/api/budgets/'+id+'/members/member','owner','PATCH',{role:'viewer'})).status,200);
  assert.equal((await request('/api/plan?budget='+id,'member','PUT',{plan:p,revision:2})).status,403);
  assert.equal((await request('/api/budgets/'+id+'/members/member','owner','DELETE')).status,200);assert.equal((await request('/api/plan?budget='+id)).status,404);
 }finally{db.close();}
});

test('Viewer invitation retains its role through acceptance and an editor Wallet token stops after downgrade',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://viewer.test',id='22222222-2222-4222-8222-222222222222';
 try{
  for(const user of ['owner','new']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',0);db.prepare('INSERT INTO auth_access VALUES(?,?)').run(user+'@example.test',0);db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(user).digest('hex'),user,Date.now()+100000);}
  const p=createDemoPlan('2026-10');p.demo=false;await DB.prepare('INSERT INTO budgets VALUES(?,?,?,?,?,?)').bind(id,'owner','test',JSON.stringify(p),1,'2026-10-18').run();
  const handle=createApp({db,DB,origin}),req=(path,user,method='GET',body)=>handle(new Request(origin+path,{method,headers:{cookie:'__Host-mf_session='+user,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  const invitation=await req('/api/budgets/'+id+'/invites','owner','POST',{email:'new@example.test',role:'viewer'});assert.equal(invitation.status,201);const {token}=await invitation.json();
  assert.equal((await req('/api/budgets/accept','new','POST',{token})).status,200);assert.equal(db.prepare('SELECT role FROM budget_member_roles').get().role,'viewer');
  assert.equal((await req('/api/plan?budget='+id,'new','PUT',{plan:p,revision:1})).status,403);
  await req('/api/budgets/'+id+'/members/new','owner','PATCH',{role:'editor'});
  const bearer='a'.repeat(43);db.prepare('INSERT INTO wallet_connections(id,hash,user_id,budget_id,scope,card_id,label,created_at) VALUES(?,?,?,?,?,?,?,?)').run('connection',createHash('sha256').update(bearer).digest('hex'),'new',id,'budget:'+id,'card1','synthetic','2026-10-18');
  await req('/api/budgets/'+id+'/members/new','owner','PATCH',{role:'viewer'});
  const imported=await handle(new Request(origin+'/api/imports/apple-pay',{method:'POST',headers:{authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({eventId:'synthetic-event-1234',merchant:'test',amount:10,currency:'ILS'})}));
  assert.equal(imported.status,403);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wallet_events').get().n,0);
 }finally{db.close();}
});
