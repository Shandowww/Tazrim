import assert from 'node:assert/strict';
import http from 'node:http';
import {guidedFixture,hash} from './guided-report-fixture.mjs';
import {buildReportInbox,inboxBankGroupKey} from '../../src/report-inbox-controller.js';
import {sealReport} from '../../server/report-crypto.mjs';
import * as classifier from '../../tools/bank-csv/classifier.mjs';

const bytes=Buffer.from('תאריך,תיאור,סכום,יתרה\n'+Array.from({length:13},(_,i)=>`${String(i+1).padStart(2,'0')}/02/2026,${i===12?'תשלום נוסף לדוגמה':i?'תשלום לדוגמה':'משכורת'},${i?-10:1000},${1000-i*10}`).join('\n'));
const fortyBytes=Buffer.from('תאריך,תיאור,סכום,יתרה\n'+Array.from({length:40},(_,i)=>{const date=new Date(Date.UTC(2026,1,1+i)).toISOString().slice(0,10).split('-').reverse().join('/');return `${date},${i?'תשלום בדיקה '+i:'משכורת'},${i?-10:1000},${2000-i*10}`}).join('\n'));
const cases={conflicts:await guidedFixture({sourceBytes:bytes,sourceName:'file.csv'}),fresh:await guidedFixture({sourceBytes:bytes,sourceName:'new.csv'}),card:await guidedFixture(),unverified:await guidedFixture({sourceBytes:fortyBytes,sourceName:'forty.csv'}),manual:await guidedFixture()};
for(const name of ['conflicts','unverified']){
 const c=cases[name],seed=await c.load();await buildReportInbox(seed.base.plan,seed.group.ui,{month:'2026-11',today:'2026-11-09',classifier,activityAPI:null});
 for(const row of seed.group.ui.items[0].preview.rows)seed.group.ui.bankChoices.set(inboxBankGroupKey(seed.group.ui.items[0],row),{field:row.amountCents>0?'salary':'variable',refund:false});
 await buildReportInbox(seed.base.plan,seed.group.ui,{month:'2026-11',today:'2026-11-09',classifier,activityAPI:null});assert.ok(seed.group.ui.build);seed.group.ui.build.reportInbox.receipts=[];
 if(name==='unverified'){for(const entry of seed.group.ui.build.bankImport.entries)entry.key=hash('legacy-'+entry.key);for(const batch of seed.group.ui.build.bankImport.batches)batch.file='legacy-bank.pdf';}
 assert.equal((await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:seed.group.ui.build,revision:seed.base.revision})})).status,200);
}
const manual=await cases.manual.load(),report=manual.group.ui.items[0].report,entry=report.entries[0];
manual.base.plan.details=[{id:'manual-qa',name:entry.merchant,amount:entry.amountCents/100,category:'מזון',method:'card1',month:report.dueDate.slice(0,7),date:entry.date,number:'',status:'cleared',accounting:'included'}];
assert.equal((await cases.manual.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:manual.base.plan,revision:manual.base.revision})})).status,200);
for(const c of Object.values(cases)){
 const source=c.sourceRow(),response=await c.req('alice','/api/reports?budget=personal&id='+c.id);assert.equal(response.status,200);const {draft}=await response.json();assert.ok(draft);
 const current=await(await c.req('alice','/api/plan')).json();draft.guided={version:1,step:'categories',done:['account','figures'],categories:'unset',budgetRevision:current.revision};
 c.db.prepare('UPDATE report_sources SET draft=? WHERE id=?').run(sealReport(c.key,Buffer.from(JSON.stringify(draft)),source.scope+'|'+c.id+'|draft'),c.id);
 c.initialFinancial=c.financial();
}
const shared=await(await cases.fresh.post('/api/budgets',{name:'Shared synthetic'})).json();
const current=await(await cases.fresh.req('alice','/api/plan')).json();await cases.fresh.req('alice','/api/plan?budget='+shared.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:current.plan,revision:0})});
cases.fresh.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(shared.id,'bob','bob@example.test');cases.fresh.db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run(shared.id,'bob','viewer');cases.fresh.initialFinancial=cases.fresh.financial();
let financialWrites=0;
const server=http.createServer(async(request,response)=>{try{
 if(request.url==='/__audit'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cases:Object.fromEntries(Object.entries(cases).map(([name,c])=>[name,{id:c.id,sourceRevision:c.sourceRow().revision,unchanged:c.financial()===c.initialFinancial}])),shared:shared.id,financialWrites}));return;}
 const cookies=String(request.headers.cookie??''),name=/qa-case=(fresh|card|unverified|manual)/.exec(cookies)?.[1]??'conflicts',c=cases[name],user=cookies.includes('qa-user=bob')?'bob':'alice';
 const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks),headers=new Headers(request.headers);headers.set('origin',c.origin);headers.set('host',new URL(c.origin).host);headers.set('cookie','__Host-mf_session='+user);
 if(request.method==='PUT'&&request.url.startsWith('/api/plan')||request.method==='POST'&&body.toString().includes('"action":"commit"'))financialWrites++;
 const result=await c.app(new Request(c.origin+request.url,{method:request.method,headers,...(body.length?{body}:{})}));response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){response.writeHead(500);response.end('Synthetic fixture failure');console.error(error.message)}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port})));
const close=()=>server.close(()=>{for(const c of Object.values(cases))c.db.close();process.exit(0)});process.on('SIGINT',close);process.on('SIGTERM',close);
