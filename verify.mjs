import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {demoPlan,clone,forecast,lowest,paymentFor,monthAt,zero,validatePlan,progressFor,yearProgress,achievements} from './src/budget.js';
import worker from './dist/server/index.js';
let passed=0;function check(label,fn){fn();passed++;console.log('PASS '+label);}
check('Baseline cash flow and planned one-off expense',()=>{const rows=forecast(demoPlan);assert.equal(rows[0].net,700);assert.equal(rows[2].balance,7100);assert.equal(rows.length,24);});
check('Installments preserve cents and total fees across years',()=>{const e={id:'x',name:'x',amount:100,fees:2,firstMonth:'2026-12',payments:7,source:'direct',kind:'expense'};const amounts=Array.from({length:7},(_,i)=>paymentFor(e,monthAt(e.firstMonth,i)));assert.equal(Math.round(amounts.reduce((a,b)=>a+b,0)*100),10200);assert.equal(paymentFor(e,'2026-11'),0);assert.equal(paymentFor(e,'2027-07'),0);});
check('Monthly override replaces estimates',()=>{const p=clone(demoPlan);p.months['2026-10']={values:{...zero(),salary:1000},actual:true,includesPlannedCard:false};const row=forecast(p)[0];assert.equal(row.balance,11000);assert.equal(row.actual,true);});
check('Card totals never double-count included installments',()=>{const p=clone(demoPlan);p.expenses=[{id:'card',name:'Item',amount:600,fees:0,firstMonth:'2026-10',payments:3,source:'card',kind:'expense'}];p.months['2026-10']={values:clone(p.defaults),actual:true,includesPlannedCard:true};assert.equal(forecast(p)[0].planned,0);assert.equal(forecast(p)[1].planned,200);});
check('New trial purchase is always additional to existing totals',()=>{const p=clone(demoPlan);p.months['2026-10']={values:clone(p.defaults),actual:true,includesPlannedCard:true};assert.equal(forecast(p,{id:'trial',name:'x',amount:100,fees:0,firstMonth:'2026-10',payments:1,source:'card',kind:'expense'})[0].planned,100);});
check('Forecast extends through final payment and handles additional income',()=>{const p=clone(demoPlan);p.expenses=[{id:'gift',name:'Gift',amount:1000,fees:0,firstMonth:'2028-10',payments:12,source:'direct',kind:'income'}];const rows=forecast(p);assert.equal(rows.length,36);assert.equal(rows[24].planned,-83.33);});
check('Twelve payments is the shortest buffer-safe demo option',()=>{const counts=[1,3,6,12,24];const safe=counts.find(n=>lowest(forecast(demoPlan,{id:'x',name:'x',amount:6000,fees:0,firstMonth:'2026-10',payments:n,source:'direct',kind:'expense'})).balance>=demoPlan.buffer);assert.equal(safe,12);});
check('Rejects malformed and out-of-range plans',()=>{assert.equal(validatePlan(demoPlan),true);assert.equal(validatePlan({...demoPlan,buffer:-1}),false);assert.equal(validatePlan({...demoPlan,months:{bad:{}}}),false);const p=clone(demoPlan);p.expenses[0].firstMonth='2026-99';assert.equal(validatePlan(p),false);});
check('Goals remain compatible with existing backups and reject invalid targets',()=>{assert.equal(validatePlan(demoPlan),true);assert.equal(validatePlan({...demoPlan,goals:{saving:100,invest:200,spending:300,income:400},profileName:'Tal'}),true);assert.equal(validatePlan({...demoPlan,goals:{saving:-1,invest:0,spending:0,income:0}}),false);assert.equal(validatePlan({...demoPlan,profileName:42}),false);});
check('Progress counts actual contributions and ignores future or estimated months',()=>{const p=clone(demoPlan);p.demo=false;p.goals={saving:100,invest:100,spending:1000,income:1000};const v={...zero(),salary:1200,personalSaving:80,sharedSaving:30,personalInvest:100,card1:100};p.expenses=[];p.months={'2026-10':{values:v,actual:false,includesPlannedCard:false},'2026-11':{values:v,actual:true,includesPlannedCard:false}};assert.deepEqual(achievements(p,'2026-10','2026-10'),[]);assert.deepEqual(achievements(p,'2026-11','2026-10'),[]);p.months['2026-10'].actual=true;assert.equal(progressFor(p,'2026-10').totals.saving,110);assert.equal(achievements(p,'2026-10','2026-10').length,4);assert.deepEqual(yearProgress(p,'2026','2026-10').months,['2026-10']);assert.equal(yearProgress(p,'2026','2026-10').totals.saving,110);});
check('Progress includes gifts and planned expenses without double counting cards',()=>{const p=clone(demoPlan);p.months['2026-10']={values:{...zero(),card1:100},actual:true,includesPlannedCard:true};p.expenses=[{id:'c',name:'Card',kind:'expense',source:'card',amount:60,fees:0,firstMonth:'2026-10',payments:1},{id:'d',name:'Extra',kind:'expense',source:'direct',amount:20,fees:0,firstMonth:'2026-10',payments:1},{id:'g',name:'Gift',kind:'income',source:'direct',amount:50,fees:0,firstMonth:'2026-10',payments:1}];assert.equal(progressFor(p,'2026-10').totals.spending,120);assert.equal(progressFor(p,'2026-10').totals.income,50);});
const db=new DatabaseSync(':memory:');for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+name,'utf8'));
const DB = {
 prepare(sql) {
  return {
   bind(...args) {
    return {
     async all() {return {results:db.prepare(sql).all(...args)};},
     async first() { return db.prepare(sql).get(...args) ?? null; },
     async run() { const r=db.prepare(sql).run(...args); return {meta:{changes:Number(r.changes)}}; }
    };
   }
  };
 }
};
function request(method,body,user='a',origin='https://budget.test'){const headers={'Content-Type':'application/json',origin};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@test.local';}return new Request('https://budget.test/api/plan',{method,headers,body:body?JSON.stringify(body):undefined});}
assert.equal((await worker.fetch(request('GET',null,null),{DB})).status,401);
assert.equal((await worker.fetch(request('PUT',{plan:demoPlan,revision:0}),{DB})).status,200);
let r=await worker.fetch(request('GET'),{DB});assert.equal((await r.json()).revision,1);
assert.equal((await worker.fetch(request('PUT',{plan:demoPlan,revision:0}),{DB})).status,409);
assert.equal((await worker.fetch(request('PUT',{plan:demoPlan,revision:1}),{DB})).status,200);
r=await worker.fetch(request('GET',null,'b'),{DB});assert.equal((await r.json()).plan,null);
assert.equal((await worker.fetch(request('PUT',{plan:{},revision:2}),{DB})).status,400);
assert.equal((await worker.fetch(request('PUT',{plan:demoPlan,revision:2},'a','https://evil.test'),{DB})).status,403);
const personal={...clone(demoPlan),profileName:'Tal',goals:{saving:4000,invest:2500,spending:10000,income:16000}};
assert.equal((await worker.fetch(request('PUT',{plan:personal,revision:2}),{DB})).status,200);
const saved=await (await worker.fetch(request('GET'),{DB})).json();assert.equal(saved.plan.goals.saving,4000);assert.equal(saved.plan.profileName,'Tal');assert.equal(saved.accountEmail,'a@test.local');
const other={...personal,profileName:'Other',goals:{...personal.goals,saving:800}};assert.equal((await worker.fetch(request('PUT',{plan:other,revision:0},'b'),{DB})).status,200);const still=await (await worker.fetch(request('GET'),{DB})).json();assert.equal(still.plan.goals.saving,4000);
console.log('PASS Save/load, user isolation, conflict protection, validation and origin checks');passed++;
const detailed={...clone(personal),showDetails:true,categoryGoals:{'חינוך':7000},details:[{id:'cheque',name:'Test cheque',category:'חינוך',method:'checks',amount:100.01,month:'2026-10',date:'2026-10-20',number:'123',status:'pending',accounting:'additional'}]};
assert.equal((await worker.fetch(request('PUT',{plan:detailed,revision:3}),{DB})).status,200);
const detailsSaved=await (await worker.fetch(request('GET'),{DB})).json();assert.deepEqual(detailsSaved.plan.details,detailed.details);assert.equal(detailsSaved.plan.categoryGoals['חינוך'],7000);assert.equal(detailsSaved.plan.showDetails,true);
const bSaved=await (await worker.fetch(request('GET',null,'b'),{DB})).json();assert.equal(bSaved.plan.details,undefined);
assert.equal((await worker.fetch(request('PUT',{plan:detailed,revision:3}),{DB})).status,409);
assert.equal((await worker.fetch(request('PUT',{plan:{...detailed,details:[{...detailed.details[0],date:'2026-02-30'}]},revision:4}),{DB})).status,400);
console.log('PASS Cheques, categories and display settings persist with account isolation and conflicts');passed++;
const script=readFileSync('dist/index.html','utf8').match(/<script type="module">([\s\S]*)<\/script>/)[1];new Function(script);
console.log('PASS Browser script syntax');passed++;
const {createVault,unlockVault,saveVault}=await import('./src/vault.js');
const encrypted=await createVault(detailsSaved.plan,'test-only verification password','personal:a');
assert.equal((await worker.fetch(request('PUT',{plan:encrypted.envelope,revision:4}),{DB})).status,200);
let encryptedSaved=await(await worker.fetch(request('GET'),{DB})).json();assert.equal(encryptedSaved.plan.format,'monthly-flow-encrypted-v1');assert.deepEqual((await unlockVault(encryptedSaved.plan,'test-only verification password')).plan,detailsSaved.plan);
assert.equal((await worker.fetch(request('PUT',{plan:demoPlan,revision:5}),{DB})).status,400);
assert.equal((await worker.fetch(request('PUT',{plan:encrypted.envelope,revision:1},'b'),{DB})).status,400);
assert.equal((await worker.fetch(request('PUT',{plan:await saveVault(encrypted.envelope,encrypted.key,{...detailsSaved.plan,opening:55}),revision:5}),{DB})).status,200);
assert.equal(db.prepare('SELECT data FROM plans WHERE user_id=?').get('a').data.includes('salary'),false);
console.log('PASS Encrypted private storage, context binding, recovery, saving and downgrade protection');passed++;console.log(`${passed} checks passed.`);
