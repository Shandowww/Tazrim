import http from 'node:http';
import {duplicateCompletionFixture,installReportReaderWorker} from './duplicate-completion-fixture.mjs';

const restore=installReportReaderWorker(),{c,base,ids}=await duplicateCompletionFixture({bank:true,committed:true});restore();
const legacy=structuredClone(base.plan);legacy.reportInbox.receipts=[];
const saved=await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:legacy,revision:base.revision})});if(!saved.ok)throw Error('Legacy fixture setup failed');
const initial=c.financial(),inbox=await(await c.req('alice','/api/report-intake')).json(),incoming=inbox.reports.find(report=>report.route?.reportId===ids[0]);
let financialWrites=0;
const server=http.createServer(async(request,response)=>{try{
 if(request.url==='/__audit'){const lifecycle=await(await c.req('alice','/api/report-lifecycle?budget=personal&id='+ids[0])).json();response.setHeader('Content-Type','application/json');response.end(JSON.stringify({privateId:incoming.id,reportId:ids[0],financialUnchanged:c.financial()===initial,financialWrites,lifecycle}));return}
 const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks),headers=new Headers(request.headers);headers.set('origin',c.origin);headers.set('host',new URL(c.origin).host);headers.set('cookie','__Host-mf_session=alice');
 if(request.method==='PUT'&&request.url.startsWith('/api/plan'))financialWrites++;
 const result=await c.app(new Request(c.origin+request.url,{method:request.method,headers,...(body.length?{body}:{})}));response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){response.writeHead(500);response.end('Synthetic fixture failure');console.error(error.message)}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port})));
const close=()=>server.close(()=>{c.db.close();process.exit(0)});process.on('SIGINT',close);process.on('SIGTERM',close);
