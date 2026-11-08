import http from 'node:http';
import {guidedFixture} from './guided-report-fixture.mjs';

const fixture=await guidedFixture({reportAutomationEnabled:true});
const shared=await(await fixture.post('/api/budgets',{name:'מרחב משותף לדוגמה'})).json();
const base=await(await fixture.req('alice','/api/plan')).json();
await fixture.req('alice','/api/plan?budget='+shared.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:base.plan,revision:0})});
const invitation=await(await fixture.post('/api/budgets/'+shared.id+'/invites',{email:'bob@example.test',role:'viewer'})).json();
await fixture.post('/api/budgets/accept',{token:invitation.token},'bob');
const ids=[];
for(let index=0;index<29;index++){
 const bytes=Buffer.from('תאריך,תיאור,סכום\n01/10/2026,דוגמה '+index+',10\n'),received=await(await fixture.receive(bytes,'דוח-לדוגמה-'+index+'.csv')).json();
 if(!received.receiptId)throw Error('Synthetic upload failed');ids.push(received.receiptId);
}
await fixture.post('/api/actions',{action:'expectations',accountId:'alice',revision:0,rules:[{kind:'card',target:'card1',enabled:true,startMonth:'2026-01',dueDay:15,graceDays:3,exceptions:['2026-07']}]});
const initial=fixture.financial(),counts={writes:0,financialWrites:0},server=http.createServer(async(request,response)=>{
 try{
  if(request.url==='/__audit'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({unchanged:fixture.financial()===initial,counts,privateId:fixture.privateId,reportId:fixture.id,ids,shared:shared.id}));return}
  const user=String(request.headers.cookie??'').includes('qa-user=bob')?'bob':'alice',chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks);
  if(!['GET','HEAD'].includes(request.method)){counts.writes++;if(request.url.startsWith('/api/plan')&&request.method==='PUT')counts.financialWrites++}
  const headers=new Headers(request.headers);headers.set('origin',fixture.origin);headers.set('host',new URL(fixture.origin).host);headers.set('cookie','__Host-mf_session='+user);
  const result=await fixture.app(new Request(fixture.origin+request.url,{method:request.method,headers,...(body.length?{body}:{})}));response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){response.writeHead(500);response.end('Synthetic fixture error');console.error(error.message)}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,privateId:fixture.privateId,reportId:fixture.id,shared:shared.id,ids})));
const close=()=>server.close(()=>{fixture.db.close();process.exit(0)});process.on('SIGTERM',close);process.on('SIGINT',close);
