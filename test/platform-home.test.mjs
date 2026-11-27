import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
import {clone,demoPlan,zero} from '../src/budget.js'
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const output=await build({entryPoints:['frontend/src/app/household-home.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','react-router-dom'],define:{'import.meta.env.DEV':'false'},logLevel:'silent',plugins:[{name:'home-link',setup(builder){builder.onResolve({filter:/^\.\/link$/},()=>({path:'link',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default function Link({href,children,state,...props}){return <a href={href} {...props}>{children}</a>}',loader:'jsx'}))}}]})
function render(plan,search='?year=2026&month=10&budget=family',personal=false){
 const module={exports:{}}
 new Function('require','module','exports',output.outputFiles[0].text)(name=>name==='react-router-dom'?{useLocation:()=>({pathname:'/',search,state:null}),useNavigate:()=>()=>{}}:require(name),module,module.exports)
 return renderToStaticMarkup(React.createElement(module.exports.HouseholdHome,{plan,asOf:'2026-11',personal}))
}
function plan(){const p=clone(demoPlan);p.startMonth='2026-01';p.expenses=[];p.months={'2026-10':{actual:true,includesPlannedCard:true,values:{...zero(),salary:0,card1:-12.34}}};return p}
test('Overview renders reported zero and signed refunds, identifies card evidence and never mutates the budget',()=>{
 const p=plan(),before=JSON.stringify(p),markup=render(p)
 assert.ok(markup.includes('-12.34'));assert.match(markup,/לפי דיווחי הכרטיסים וחיובי הבנק/);assert.match(markup,/<span>כניסות<\/span>/);assert.match(markup,/<span>חיובי כרטיסים<\/span>/);assert.equal((markup.match(/data-missing="true"/g)??[]).length,0);assert.equal(JSON.stringify(p),before)
 const personalMarkup=render(p,'?year=2026&month=10',true)
 assert.match(personalMarkup,/<span>הכנסות<\/span>/)
 assert.match(personalMarkup,/<span>הוצאות בכרטיס<\/span>/)
 assert.match(personalMarkup,/לפי דיווחי הכרטיסים וחיובי הבנק/)
 assert.equal(JSON.stringify(p),before)
})
test('A missing historical month is explicitly missing rather than displayed as zero',()=>{
 const markup=render(plan(),'?year=2026&month=9&budget=family')
 assert.equal((markup.match(/data-missing="true"/g)??[]).length,3)
 assert.match(markup,/עדיין אין דיווח לחודש הזה/)
})
test('Overview destinations retain selected period and budget while excluding unrelated action parameters',()=>{
 const markup=render(plan(),'?year=2026&month=10&budget=family&token=hidden&confirm=yes')
 for(const [,href]of markup.matchAll(/href="([^"]+)"/g)){
  const url=new URL(href.replaceAll('&amp;','&'),'https://preview.test')
  assert.equal(url.searchParams.get('budget'),'family');assert.equal(url.searchParams.get('year'),'2026');assert.equal(url.searchParams.has('token'),false);assert.equal(url.searchParams.has('confirm'),false)
 }
})
