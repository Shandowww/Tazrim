import test from 'node:test';import assert from 'node:assert/strict';import {openDatabase} from '../server/database.mjs';import {createCardPush,israelDate} from '../server/card-push.mjs';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const origin='https://budgit.duckdns.org';
test('Retired card push sends nothing for existing subscriptions/schedules, rejects re-enabling and retains owned cleanup',async()=>{
 const {db}=openDatabase(':memory:');let sends=0;const service=createCardPush(db,{send:async()=>sends++});
 db.prepare('INSERT INTO push_devices VALUES (?,?,?,?,?)').run('old','a','hash','{}',0);db.prepare('INSERT INTO push_schedules VALUES (?,?,?,?)').run('a','personal',1,JSON.stringify([{id:'card1',day:15,updated:[]}]));
 db.prepare('INSERT INTO push_deliveries VALUES (?,?,?,?,?,?)').run('old','personal','card1','2026-10-15','failed',0);
 const request=(path,method,body,user='a')=>service.handle(new Request(origin+path,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{id:user});
 await service.tick();await service.tick();assert.equal(sends,0);assert.equal(db.prepare('SELECT count(*) AS n FROM push_schedules').get().n,1);
 assert.deepEqual(await (await request('/api/card-push','GET')).json(),{enabled:false,devices:[]});
 for(const [path,method]of [['/api/card-push','POST'],['/api/card-push/schedule','PUT'],['/api/card-push/test','POST']])assert.equal((await request(path,method,{id:'old'})).status,410);
 await request('/api/card-push','DELETE',{id:'old'},'b');assert.equal(db.prepare('SELECT count(*) AS n FROM push_devices').get().n,1);await request('/api/card-push','DELETE',{id:'old'});assert.equal(db.prepare('SELECT count(*) AS n FROM push_devices').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM push_deliveries').get().n,0);assert.equal(sends,0);
 assert.equal(israelDate(Date.parse('2026-10-04T22:30:00Z')),'2026-10-05');db.close();
});
test('Client retires only its own notification worker without requesting permissions or making financial requests',async()=>{
 const app={addEventListener(){}},calls=[];const registration={active:{scriptURL:origin+'/sw.js'},pushManager:{getSubscription:async()=>({unsubscribe:async()=>calls.push('unsubscribe')})},getNotifications:async()=>[{close:()=>calls.push('close')}],unregister:async()=>calls.push('unregister')};
 const context=vm.createContext({app,window:{addEventListener(){}},URL,demoPreview:false,navigator:{serviceWorker:{getRegistration:async()=>registration}},Intl});vm.runInContext(readFileSync('src/card-billing-client.js','utf8'),context);await context.syncCardPush();await context.syncCardPush();assert.deepEqual(calls,['unsubscribe','close','unregister']);
 const other=vm.createContext({app,window:{addEventListener(){}},URL,demoPreview:false,navigator:{serviceWorker:{getRegistration:async()=>({...registration,active:{scriptURL:origin+'/other-worker.js'}})}},Intl});vm.runInContext(readFileSync('src/card-billing-client.js','utf8'),other);await other.syncCardPush();assert.equal(calls.length,3);
 const handlers=new Map(),worker=vm.createContext({self:{addEventListener:(name,handler)=>handlers.set(name,handler)}});vm.runInContext(readFileSync('public/sw.js','utf8'),worker);handlers.get('push')({waitUntil(){throw Error('retired worker attempted notification');}});
});
