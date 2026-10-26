import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const files=new Map([['/','index.html'],['/style.css','style.css'],['/app.mjs','app.mjs'],['/parser.mjs','parser.mjs'],['/classifier.mjs','classifier.mjs'],['/dedupe.mjs','dedupe.mjs'],['/sample.csv','sample.csv'],['/xlsx-reader.mjs','xlsx-reader.mjs'],['/xlsx-worker.js','xlsx-worker.js'],['/vendor/xlsx-mini.js','vendor/xlsx-mini.cjs'],['/vendor/xlsx-full.js','vendor/xlsx-full.cjs']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',js:'text/javascript; charset=utf-8',cjs:'text/javascript; charset=utf-8',csv:'text/csv; charset=utf-8'};
export function createLabServer(){return http.createServer(async(req,res)=>{
 const file=files.get(req.url?.split('?')[0]);
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Read-only inspection server');return;}
 if(!file){res.writeHead(404);res.end('Not found');return;}
 try{const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()]});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(500);res.end('Cannot load inspection page');}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const server=createLabServer();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 5175 is in use; the existing service was not changed.':error.message);process.exitCode=1;});
 server.listen(5175,'127.0.0.1',()=>console.log('CSV inspection only: http://127.0.0.1:5175/'));
}
