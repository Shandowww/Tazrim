import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {emptyMigrationPlan} from './helpers/native-migration-fixture.mjs'
test('Original session logout removes only the calling session while preserving financial records and other users/sessions',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://session.test',app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']})
 try{for(const user of ['alice','bob'])db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());for(const [token,user]of [['alice-one','alice'],['alice-two','alice'],['bob-one','bob']])db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),user,Date.now()+60000)
 const req=(token,path,method='GET',body,requestOrigin=origin)=>app(new Request(origin+path,{method,headers:{origin:requestOrigin,cookie:'__Host-mf_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
 for(const [token]of [['alice-one'],['bob-one']])assert.equal((await req(token,'/api/plan','PUT',{plan:emptyMigrationPlan(),revision:0})).status,200)
 const before=JSON.stringify(db.prepare('SELECT * FROM plans ORDER BY user_id').all());assert.equal((await req('alice-one','/auth/logout','POST',undefined,'https://foreign.test')).status,403);assert.equal((await req('alice-one','/api/plan')).status,200)
 const result=await req('alice-one','/auth/logout','POST');assert.equal(result.status,303);assert.equal(result.headers.get('Location'),'/');assert.match(result.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await req('alice-one','/api/plan')).status,401);assert.equal((await req('alice-two','/api/plan')).status,200);assert.equal((await req('bob-one','/api/plan')).status,200);assert.equal(JSON.stringify(db.prepare('SELECT * FROM plans ORDER BY user_id').all()),before);assert.equal((await req('alice-one','/auth/logout','POST')).status,303)
 }finally{db.close()}
})
