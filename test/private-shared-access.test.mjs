import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {createDemoPlan} from '../src/budget.js';
const origin='https://spaces.test';
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Two spouses retain separate personal data, reports and history while sharing one household',async()=>{
 const {db,DB}=openDatabase(':memory:');
 try{
  const users=['tal','linoi','third'];
  for(const id of users){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+60000);}
  const handle=createApp({db,DB,origin,allowedEmails:users.map(id=>id+'@example.test'),reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}});
  const req=(user,path,method='GET',body)=>handle(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
  for(const [i,user] of users.entries()){const plan=createDemoPlan('2026-10');plan.demo=false;plan.opening=1000*(i+1);assert.equal((await req(user,'/api/plan','PUT',{plan,revision:0})).status,200);}
  const household=await (await req('tal','/api/budgets','POST',{name:'בית בדיקה'})).json();
  const invitation=await (await req('tal','/api/budgets/'+household.id+'/invites','POST',{email:'linoi@example.test',role:'viewer'})).json();
  assert.equal((await req('linoi','/api/budgets/accept','POST',{token:invitation.token})).status,200);
  for(const user of ['tal','linoi']){
   const list=await(await req(user,'/api/budgets')).json();assert.equal(list.accountId,user);
   assert.equal(list.budgets[0].scope,'personal:'+user);assert.equal(list.budgets[0].hasData,true);
   assert.equal(list.budgets[1].scope,'budget:'+household.id);assert.equal(list.budgets.length,2);
   assert.equal((await(await req(user,'/api/plan?budget=personal')).json()).plan.opening,user==='tal'?1000:2000);
   for(const path of ['/api/plan','/api/reports','/api/plan-history','/api/data/transactions']){
    const other=user==='tal'?'linoi':'tal';assert.equal((await req(user,path+'?budget='+encodeURIComponent('personal:'+other))).status,404,path);
   }
  }
  const report=await handle(new Request(origin+'/api/reports?budget=personal',{method:'PUT',headers:{origin,cookie:'__Host-mf_session=tal','x-report-name':'private.csv'},body:'synthetic private report'}));
  assert.equal(report.status,201);const receipt=await report.json();
  assert.equal((await req('linoi','/api/reports?budget=personal&id='+receipt.receiptId)).status,404);
  assert.equal((await req('linoi','/api/reports?budget='+household.id+'&id='+receipt.receiptId)).status,404);
  const history=await(await req('tal','/api/plan-history?budget=personal')).json();
  assert.equal((await req('linoi','/api/plan-history?budget=personal&id='+history.entries[0].id)).status,404);
  const plan=createDemoPlan('2026-10');plan.demo=false;
  assert.equal((await req('linoi','/api/plan?budget='+household.id,'PUT',{plan,revision:0})).status,403);
  assert.equal((await req('linoi','/api/plan?budget=personal','PUT',{plan,revision:1})).status,200);
  assert.equal((await req('tal','/api/plan?budget='+household.id,'PUT',{plan,revision:0})).status,200);
  assert.equal((await req('third','/api/plan?budget='+household.id)).status,404);
  await req('tal','/api/budgets/'+household.id+'/members/linoi','DELETE');
  for(const path of ['/api/plan','/api/reports','/api/plan-history','/api/data/transactions'])assert.equal((await req('linoi',path+'?budget='+household.id)).status,404,path);
  assert.equal((await req('linoi','/api/plan?budget=personal')).status,200);
 }finally{db.close();}
});
