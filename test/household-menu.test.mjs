import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const compiled=await build({entryPoints:['frontend/src/app/household-navigation.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','react-router-dom'],define:{'import.meta.env.DEV':'false'},logLevel:'silent',plugins:[{name:'shell-boundaries',setup(builder){builder.onResolve({filter:/^\.\/(link|back-link|interface-mode|page-heading)$/},args=>({path:args.path,namespace:'shell'}));builder.onLoad({filter:/.*/,namespace:'shell'},args=>({contents:args.path==='./page-heading'?'export const PageHeading=({children})=><h1>{children}</h1>':args.path==='./interface-mode'?'export const useInterfaceMode=()=>({mode:globalThis.menuTestMode});export const InterfaceModeSelector=()=>null':'export default function Link({href,children,...props}){return <a href={href}>{children}</a>}',loader:'jsx'}))}}]})
function render(mode,component){
 const module={exports:{}}
 new Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='react-router-dom'?{useLocation:()=>({pathname:'/more',search:'?budget=family&year=2026&month=10',state:null})}:require(name),module,module.exports)
 globalThis.menuTestMode=mode
 try{return renderToStaticMarkup(React.createElement(module.exports[component]))}finally{delete globalThis.menuTestMode}
}
test('More no longer repeats main-navigation destinations, while the primary Accounts button remains',()=>{
 for(const mode of ['basic','advanced','expert']){
  const markup=render(mode,'HouseholdMore')
  assert.doesNotMatch(markup,/href="\/(?:accounts|savings|more)?\?/,mode)
  assert.match(render(mode,'HouseholdNavigation'),/href="\/accounts\?year=2026&amp;month=10&amp;budget=family"/,mode)
 }
})
test('Retained menu entries lead to existing distinct tools and keep selected space and period',()=>{
 const markup=render('expert','HouseholdMore'),routes=[...readFileSync('frontend/src/main.tsx','utf8').matchAll(/<Route path="([^"]+)"/g)].map(match=>match[1])
 for(const [,href]of markup.matchAll(/href="([^"]+)"/g)){
  const url=new URL(href.replaceAll('&amp;','&'),'https://menu.test')
  assert.ok(routes.includes(url.pathname),url.pathname)
  assert.equal(url.searchParams.get('budget'),'family');assert.equal(url.searchParams.get('year'),'2026');assert.equal(url.searchParams.get('month'),'10')
 }
 for(const route of ['/checks','/loans','/incoming','/upload','/upload/history','/analysis','/overview','/settings','/about'])assert.ok(markup.includes('href="'+route+'?'),route)
})
