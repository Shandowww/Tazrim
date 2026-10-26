import http from 'node:http';
import {createApplePay} from './server/apple-pay.mjs';
import {createRateService} from './server/interest-rates.mjs';
import {readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});
const db=new DatabaseSync('.sites-runtime/preview.sqlite');
const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
if(table)db.prepare('INSERT OR IGNORE INTO local_migrations (name) VALUES (?)').run('0000_bitter_magdalene.sql');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){if(!db.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)){db.exec(readFileSync('drizzle/'+name,'utf8'));db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);}}
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
db.exec('CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT,created_at INTEGER)');db.prepare('INSERT OR IGNORE INTO auth_users VALUES(?,?,?,?)').run('local-preview','local-preview','preview@localhost',Date.now());
const wallet=createApplePay(db,{origin:'http://127.0.0.1:5173',isAllowed:()=>true});
const rates=createRateService(db);rates.refresh();
const server=http.createServer(async(req,res)=>{try{const url='http://127.0.0.1:5173'+req.url;if(req.url.startsWith('/api/apple-pay')||req.url==='/api/imports/apple-pay'){const bytes=[];for await(const chunk of req)bytes.push(chunk);const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(bytes)});const result=await wallet(request,req.url.startsWith('/api/apple-pay')?{id:'local-preview',email:'preview@localhost'}:undefined);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}if(req.url==='/api/reference/interest'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(rates.snapshot()));return;}if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync('dist/index.html','utf8').replace('<head>','<head><script>window.monthlyFlowStandalone=true;</script>'));return;}const bytes=[];for await(const chunk of req)bytes.push(chunk);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview');headers.set('oai-authenticated-user-email','preview@localhost');const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(bytes)});const response=await worker.fetch(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}});
server.listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173/'));
