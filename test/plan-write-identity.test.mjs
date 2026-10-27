import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {zero} from '../src/budget.js'
const base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true})
async function harness(){
 const {db,DB}=openDatabase(':memory:'),origin='https://identity.test'
 for(const id of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+60000)}
 const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(id,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
 for(const id of ['alice','bob'])assert.equal((await req(id,'/api/plan','PUT',{plan:base(),revision:0})).status,200)
 return {db,req}
}
test('Personal saves advertise account binding and refuse a draft after a session account change, without touching either plan',async()=>{
 const h=await harness();try{const before=h.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),read=await(await h.req('alice','/api/plan')).json();assert.equal(read.writeIdentityBound,true)
 const plan=base();plan.profileName='ALICE-PRIVATE-DRAFT'
 for(const accountId of ['alice',null,0])assert.equal((await h.req('bob','/api/plan','PUT',{plan,revision:1,accountId})).status,403)
 assert.deepEqual(h.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),before)
 assert.equal((await h.req('alice','/api/plan','PUT',{plan,revision:1,accountId:'alice'})).status,200)
 assert.equal((await h.req('alice','/api/plan','PUT',{plan:base(),revision:1,accountId:'alice'})).status,409)
 assert.equal((await(await h.req('bob','/api/plan')).json()).plan.profileName,undefined)
 }finally{h.db.close()}
})
test('Shared editor saves bind the actor even when both accounts can edit; legacy writes and revision checks remain compatible',async()=>{
 const h=await harness();try{const target=(await(await h.req('alice','/api/budgets','POST',{name:'בית'})).json()).id,path='/api/plan?budget='+target
 assert.equal((await h.req('alice',path,'PUT',{plan:base(),revision:0})).status,200)
 const invite=await(await h.req('alice','/api/budgets/'+target+'/invites','POST',{email:'bob@example.test',role:'editor'})).json();assert.equal((await h.req('bob','/api/budgets/accept','POST',{token:invite.token})).status,200)
 const read=await(await h.req('bob',path)).json();assert.equal(read.writeIdentityBound,true);const plan=base();plan.buffer=123.45
 assert.equal((await h.req('bob',path,'PUT',{plan,revision:1,accountId:'alice'})).status,403);assert.equal((await(await h.req('bob',path)).json()).revision,1)
 assert.equal((await h.req('bob',path,'PUT',{plan,revision:1,accountId:'bob'})).status,200)
 assert.equal((await h.req('bob',path,'PUT',{plan:base(),revision:1,accountId:'bob'})).status,409)
 assert.equal((await h.req('alice',path,'PUT',{plan:base(),revision:2})).status,200)
 }finally{h.db.close()}
})
