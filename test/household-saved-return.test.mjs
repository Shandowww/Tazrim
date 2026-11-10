import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
import {householdSaveDestination,householdReplaceState} from '../frontend/src/app/household-model.js'
import {DraftRegistry} from '../frontend/src/app/draft-registry.ts'

const require=createRequire(new URL('../frontend/package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const compiled=await build({entryPoints:['frontend/src/app/use-saved-return.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','react-router-dom'],plugins:[{name:'guard-boundary',setup(builder){builder.onResolve({filter:/^\.\/draft-guard$/},()=>({path:'guard',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const useDraftGuard=()=>globalThis.savedReturnGuard',loader:'js'}))}}]})
function load(router,react=React){
 const module={exports:{}}
 new Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='react-router-dom'?router:name==='react'?react:require(name),module,module.exports)
 return module.exports
}
function harness(){
 const registry=new DraftRegistry(),guard={registry,navigationPending:false},navigations=[],values=[],effects=[]
 let cursor=0,location={pathname:'/card-setup/new',search:'?budget=family&year=2026&month=10',state:{householdTrail:['/accounts?budget=family&year=2026&month=10&walletCard=old']}},scope='alice/family',acknowledge
 const hooks=load({useLocation:()=>location,useNavigate:()=>((href,options)=>navigations.push({href,options}))},{...React,useState:initial=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],next=>{values[index]=next}]},useSyncExternalStore:(_subscribe,snapshot)=>snapshot(),useEffect:callback=>effects.push(callback)})
 function render(){cursor=0;globalThis.savedReturnGuard=guard;acknowledge=hooks.useSavedReturn(scope);while(effects.length)effects.shift()();delete globalThis.savedReturnGuard}
 render()
 return {registry,guard,navigations,render,save:message=>acknowledge(message),setScope:next=>{scope=next},setLocation:next=>{location=next},get location(){return location}}
}
test('Save returns to the actual origin, retaining wallet selection, filters, scope and original display period',()=>{
 const location={pathname:'/card-setup/new',search:'?budget=family&year=2026&month=12',state:{householdTrail:['/more?budget=family','/accounts?budget=family&year=2025&month=10&walletCard=visa&query=test&page=2&token=secret']}}
 assert.equal(householdSaveDestination(location),'/accounts?budget=family&year=2025&month=10&walletCard=visa&query=test&page=2')
 assert.deepEqual(householdReplaceState(location,householdSaveDestination(location),{}).householdTrail,['/more?budget=family'])
})
test('Direct creation/edit links have safe parents and never return to the saved creation form',()=>{
 for(const [pathname,parent]of [['/accounts/new','/accounts'],['/accounts/abc/edit','/accounts'],['/card-setup/new','/accounts'],['/card-setup/abc','/accounts'],['/details/new','/checks'],['/details/abc/edit','/checks'],['/loans/new','/loans'],['/plans/new','/plans'],['/savings/new','/savings']]){
  assert.equal(householdSaveDestination({pathname,search:'?budget=family&year=2026&month=11',state:null}),parent+'?year=2026&month=11&budget=family')
 }
 assert.equal(householdSaveDestination({pathname:'/details/new',search:'?budget=family',state:null},'/details/manage'),'/details/manage?budget=family')
})
test('Invalid, foreign-space and external return hints cannot navigate outside the current budget',()=>{
 for(const destination of ['https://bad.invalid','//bad.invalid','/\\bad.invalid','/accounts?budget=other&walletCard=private','/next/settings']){
  const href=householdSaveDestination({pathname:'/accounts/new',search:'?budget=family',state:{householdTrail:[destination]}})
  assert.equal(href,'/?budget=family')
 }
})
test('No acknowledged save means no return; empty callbacks and loaded success notices are not acknowledgments',()=>{
 const ui=harness();ui.render();ui.save('');ui.render();assert.equal(ui.navigations.length,0)
 ui.setLocation({...ui.location,state:{savedReturnMessage:'Old success',savedReturnScope:'alice/family',setupSavedMessage:'Old success'}});ui.render();assert.equal(ui.navigations.length,0)
})
test('Acknowledged success waits for dirty and busy drafts, then replaces the form and carries a scoped receipt exactly once',()=>{
 const ui=harness(),entry={kind:'card',dirty:true,busy:true,discard(){}}
 ui.registry.set('card',entry);ui.save('הכרטיס נשמר.');ui.render();assert.equal(ui.navigations.length,0)
 ui.registry.set('card',{...entry,dirty:false});ui.render();assert.equal(ui.navigations.length,0)
 ui.registry.remove('card');ui.render();ui.render();assert.equal(ui.navigations.length,1)
 assert.equal(ui.navigations[0].href,'/accounts?budget=family&year=2026&month=10&walletCard=old')
 assert.deepEqual(ui.navigations[0].options,{replace:true,state:{savedReturnMessage:'הכרטיס נשמר.',savedReturnScope:'alice/family',householdTrail:[]}})
})
test('Save and Continue keeps its explicitly chosen destination instead of triggering the automatic return',()=>{
 const ui=harness();ui.guard.navigationPending=true;ui.save('נשמר');ui.render();assert.equal(ui.navigations.length,0)
 ui.setLocation({pathname:'/settings',search:'?budget=family',state:null});ui.guard.navigationPending=false;ui.render();assert.equal(ui.navigations.length,0)
})
test('Late success cannot navigate after actor, budget or route changes',()=>{
 for(const scope of ['bob/family','alice/personal','']){const ui=harness();ui.save('נשמר');ui.setScope(scope);ui.render();assert.equal(ui.navigations.length,0)}
 const ui=harness();ui.save('נשמר');ui.setLocation({...ui.location,pathname:'/more'});ui.render();assert.equal(ui.navigations.length,0)
})
test('The return receipt is visible only to its saved actor and budget',()=>{
 const {SavedReturnNotice}=load({useLocation:()=>({state:{savedReturnMessage:'פרטי הכרטיס נשמרו.',savedReturnScope:'alice/family'}})})
 assert.match(renderToStaticMarkup(React.createElement(SavedReturnNotice,{scope:'alice/family'})),/role="status"/)
 for(const scope of ['bob/family','alice/personal',''])assert.equal(renderToStaticMarkup(React.createElement(SavedReturnNotice,{scope})), '')
})
test('Every ordinary record editor acknowledges successful saves through the shared return hook, not an edit-route redirect',()=>{
 for(const page of ['account-page','card-page','detail-management-page','loans-page','planned-items-page','savings-goals-page']){
  const source=readFileSync('frontend/src/app/'+page+'.tsx','utf8')
  assert.match(source,/useSavedReturn\(budget\.status==='ready'\?budget\.value\.accountId\+'\/'\+budget\.budgetId:''/,page)
  assert.match(source,/onSaved=\{[^}]*returnAfterSave\(/,page)
  assert.doesNotMatch(source,/useCreatedEditorRoute/,page)
 }
})
