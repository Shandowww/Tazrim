import test from 'node:test'
import assert from 'node:assert/strict'
import {interfaceLayoutCookie,interfaceLayoutHref} from '../src/interface-destination.js'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
test('Layout selection carries only the selected space and period between real interfaces',()=>{
 const query='budget=shared&year=2026&month=9&mf-action-key=unsafe&returnTo=https://outside.test/&token=private'
 const next=new URL(interfaceLayoutHref('tazrim',query),'https://budget.test');assert.equal(next.pathname,'/next/settings');assert.deepEqual(Object.fromEntries(next.searchParams),{budget:'shared',year:'2026',month:'9'})
 const old=new URL(interfaceLayoutHref('original',query),'https://budget.test');assert.equal(old.pathname,'/');assert.equal(old.searchParams.get('mf-view'),'appearance');assert.equal(old.searchParams.get('budget'),'shared');assert.equal(old.searchParams.get('month'),'9');assert.equal(old.searchParams.has('token'),false)
 assert.match(interfaceLayoutCookie('original'),/^budgit-interface=original; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/)
 for(const bad of ['','https://outside.test','original; Path=/api']){assert.throws(()=>interfaceLayoutCookie(bad));assert.throws(()=>interfaceLayoutHref(bad,''))}
})
test('Device layout preference selects root launch without weakening authentication or overriding explicit links',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://layout.test',app=createApp({db,DB,origin})
 try{for(const [cookie,expected]of [['','/next'],['budgit-interface=tazrim','/next'],['budgit-interface=original','/?mf-view=home'],['budgit-interface=https://evil.test','/next']])for(const method of ['GET','HEAD']){const r=await app(new Request(origin+'/',{method,headers:{cookie}}));assert.equal(r.status,303);assert.equal(r.headers.get('location'),expected);assert.match(r.headers.get('cache-control'),/no-store/)}
 for(const path of ['/?mf-view=appearance&budget=personal','/next/settings']){const r=await app(new Request(origin+path,{headers:{cookie:'budgit-interface=original'}}));assert.equal(r.status,200);assert.match(await r.text(),/כניסה עם Google/)}
 const denied=await app(new Request(origin+'/api/plan',{headers:{cookie:'budgit-interface=original','oai-authenticated-user-id':'forged'}}));assert.equal(denied.status,401)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_users').get().n,0)
 }finally{db.close()}
})

test('Original layout switch refuses unfinished edits before persisting a preference or leaving',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm'),source=readFileSync('src/client.js','utf8'),handler=source.slice(source.indexOf(" if(name==='interface-layout')"),source.indexOf(" if(name==='appearance-design')"))
 for(const change of [{dirty:true},{saving:true},{securityBusy:true},{hasScenarioDraft:()=>true},{hasMonthlyInputDraft:()=>true},{guardSavingsDraft:()=>false}]){
  let leaves=0,stores=0;const c={name:'interface-layout',target:{value:'tazrim'},guardMonthlyNavigation:()=>true,guardSavingsDraft:()=>true,guardDetailNavigation:()=>true,dirty:false,draftHasChanges:()=>true,loading:false,saving:false,securityBusy:false,hasSecurityDraft:()=>false,hasScenarioDraft:()=>false,hasMonthlyInputDraft:()=>false,itemDraft:{id:'',name:'',amount:0},document:{cookie:''},localStorage:{setItem(){stores++}},location:{protocol:'https:'},window:{location:{assign(){leaves++}}},notify(){},...change}
  runInNewContext('(function(){'+handler+'})()',c);assert.equal(c.target.value,'original');assert.equal(leaves,0);assert.equal(stores,0);assert.equal(c.document.cookie,'')
 }
})
