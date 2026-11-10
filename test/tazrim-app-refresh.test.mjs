import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createAppRefresh} from '../frontend/src/app/refresh-app.js'
const html='<html><div id="root"></div><script type="module" src="/ui-assets/assets/new-build.js"></script></html>'
function fixture({fetch=async()=>new Response(html,{headers:{'content-type':'text/html'}}),guard=action=>action(),timeoutMs}={}){
 const requests=[],states=[];let reloads=0
 const location={href:'https://budgit.duckdns.org/next/accounts?budget=shared-test&month=2026-09&walletCard=card-test#card',reload:()=>reloads++}
 const refresh=createAppRefresh({location,fetch:(...args)=>{requests.push(args);return fetch(...args)},guard,onState:s=>states.push(s),timeoutMs})
 return{refresh,location,requests,states,reloads:()=>reloads}
}
test('Refresh fetches current UI without caching then reloads code and data in the same scoped route',async()=>{
 const f=fixture();await f.refresh();assert.equal(f.reloads(),1);assert.equal(f.requests[0][0],f.location.href)
 assert.equal(f.requests[0][1].cache,'no-store');assert.equal(f.requests[0][1].credentials,'same-origin');assert.equal(f.requests[0][1].redirect,'error');assert.equal(f.requests[0][1].method,undefined)
 assert.equal(f.states.at(-1).pending,true);await f.refresh();assert.equal(f.requests.length,1)
})
test('Concurrent refresh requests check the connection and navigate only once',async()=>{
 let release;const f=fixture({fetch:()=>new Promise(r=>release=r)});const pending=f.refresh();await f.refresh();assert.equal(f.requests.length,1);release(new Response(html,{headers:{'content-type':'text/html'}}));await pending;assert.equal(f.reloads(),1)
})
test('Offline, HTTP errors, login pages and incomplete responses preserve the running page and allow retry',async()=>{
 for(const fetch of [async()=>{throw Error('offline')},async()=>new Response('',{status:503}),async()=>new Response('{}',{headers:{'content-type':'application/json'}}),async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}}),async()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}})]){
  const f=fixture({fetch});await f.refresh();assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).pending,false);assert.match(f.states.at(-1).error,/החיבור/);await f.refresh();assert.equal(f.requests.length,2)
 }
})
test('A connection timeout preserves the page and releases the refresh action',async()=>{
 const f=fixture({timeoutMs:5,fetch:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});await f.refresh();assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).pending,false);assert.ok(f.states.at(-1).error)
})
test('Drafts started during the connection check use the guard again, allowing cancel or save/discard before reload',async()=>{
 let proceed;const f=fixture({guard:action=>{proceed=action}});await f.refresh();assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).pending,false)
 // Staying with the draft never calls proceed; an explicit save/discard does.
 proceed();assert.equal(f.reloads(),1)
})
test('A route/scope change during the connection check or draft prompt cancels the old refresh',async()=>{
 let release;const f=fixture({fetch:()=>new Promise(r=>release=r)});const pending=f.refresh();f.location.href+='-other';release(new Response(html,{headers:{'content-type':'text/html'}}));await pending;assert.equal(f.reloads(),0);assert.equal(f.states.at(-1).pending,false)
 let proceed;const g=fixture({guard:action=>{proceed=action}});await g.refresh();g.location.href+='-other';proceed();assert.equal(g.reloads(),0)
})
test('The header and top-pull share guarded app refresh while editor data-only refresh remains available',()=>{
 const source=fs.readFileSync(new URL('../frontend/src/main.tsx',import.meta.url),'utf8')
 assert.match(source,/onClick=\{refreshApp\}/);assert.match(source,/installPullRefresh\(\{document,window,refresh:refreshApp/);assert.match(source,/guard\.run\(\(\)=>\{void reloadApp\(\)\}\)/)
 assert.match(source,/guard\.run\(budget\.refresh\)/)
})
