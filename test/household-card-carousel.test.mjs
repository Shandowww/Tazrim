import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
import {clone,demoPlan,zero} from '../src/budget.js'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const compiled=await build({entryPoints:['frontend/src/app/household-accounts.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','react-dom','react-router-dom'],loader:{'.svg':'dataurl','.png':'dataurl'},define:{'import.meta.env.DEV':'false'},logLevel:'silent',plugins:[{name:'shell-boundaries',setup(builder){builder.onResolve({filter:/^\.\/(link|page-heading)$/},args=>({path:args.path,namespace:'shell'}));builder.onLoad({filter:/.*/,namespace:'shell'},args=>({contents:args.path==='./link'?'export default function Link(props){return <a {...props}/> }':'export function PageHeading({children}){return <h1>{children}</h1>}',loader:'jsx'}))}}]})
function load(router,overrides={}){
 const module={exports:{}}
 new Function('require','module','exports','window','setTimeout','clearTimeout','requestAnimationFrame',compiled.outputFiles[0].text)(name=>name==='react-router-dom'?router:overrides[name]??require(name),module,module.exports,overrides.window,overrides.setTimeout,overrides.clearTimeout,overrides.requestAnimationFrame)
 return module.exports.HouseholdAccountsPage
}
function fixture(){const plan=clone(demoPlan);plan.startMonth='2026-01';plan.expenses=[];plan.defaults=zero();plan.months={'2026-10':{actual:true,includesPlannedCard:true,values:{...zero(),card1:123.45,card2:0}}};plan.details=[{id:'food',name:'אוכל',category:'מזון',amount:23.45,method:'card1',month:'2026-10',date:'2026-10-10',status:'cleared',accounting:'included'}];return plan}
test('Selected card has an immediately visible, scoped edit action, while viewers retain read-only actions',()=>{
 const Page=load({useLocation:()=>({search:'?budget=family&year=2026&month=10&walletCard=card1'}),useNavigate:()=>()=>{}}),plan=fixture()
 const render=role=>renderToStaticMarkup(React.createElement(Page,{fixture:false,budget:{...budget(plan),budgetId:'family',spaces:[{id:'family',role}]}}))
 const editor=render('editor')
 assert.match(editor,/<h2><bdi>[^<]+<\/bdi>(?:[^]*?)<\/h2><a class="household-update" href="\/card-setup\/card1\?year=2026&amp;month=10&amp;budget=family">עריכת פרטי הכרטיס<\/a>/)
 assert.doesNotMatch(render('viewer'),/עריכת פרטי הכרטיס|הוספת כרטיס|ניהול פרטי הכרטיסים/)
 assert.match(render('viewer'),/עסקאות ופירוט שמור/)
})
const budget=plan=>({status:'ready',value:{plan,accountId:'synthetic'},budgetId:'personal',spaces:[]})
function walk(node,predicate){if(!node||typeof node!=='object')return [];return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>walk(child,predicate))]}
function harness({reduced=false,deferred=false}={}){
 const refs=[],timers=new Map(),frames=[],effects=[],navigations=[],flushes=[],scrolls=[]
 let cursor=0,serial=0,tree,pendingLocation=null,location={search:'?year=2026&month=10&walletCard=card1',state:{kept:true}},plan=fixture()
 const style=new Map(),stage={dataset:{},style:{setProperty:(key,value)=>style.set(key,value)},get offsetWidth(){flushes.push({dragging:stage.dataset.dragging,offset:style.get('--wallet-drag-x')});return 400},isConnected:true,clientWidth:400,querySelector:()=>({getBoundingClientRect:()=>({width:100})})}
 const jsx=(type,props,key)=>({type,props,key})
 const Page=load({useLocation:()=>location,useNavigate:()=>((href,options)=>{navigations.push({href,options});const next={...location,search:href.slice(href.indexOf('?'))};if(deferred)pendingLocation=next;else location=next})},{react:{...React,useRef:value=>refs[cursor++]??(refs[cursor-1]={current:value}),useEffect:callback=>effects.push(callback),useLayoutEffect:callback=>effects.push(callback)},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'react-dom':{flushSync:callback=>callback()},window:{matchMedia:()=>({matches:reduced}),scrollY:432,scrollTo:options=>scrolls.push(options)},setTimeout:callback=>{timers.set(++serial,callback);return serial},clearTimeout:id=>timers.delete(id),requestAnimationFrame:callback=>frames.push(callback)})
 function render(){cursor=0;const effectStart=effects.length,page=Page({budget:budget(plan),fixture:false});tree=page.type(page.props);refs[1].current=stage;effects.slice(effectStart+1).forEach(callback=>callback());return tree}
 function advance(){for(const [id,callback]of timers){timers.delete(id);callback()}}
 function paint(){while(frames.length)frames.shift()()}
 render()
 paint()
 return {stage,style,timers,frames,effects,navigations,flushes,scrolls,render,advance,paint,get tree(){return tree},step:delta=>walk(tree,node=>node.type?.name==='WalletDots')[0].props.step(delta),select:id=>walk(tree,node=>node.type?.name==='WalletDots')[0].props.select(id),settle(){advance();render();paint()},commitRoute(){location=pendingLocation;pendingLocation=null;render()},setPlan:value=>{plan=value}}
}
test('Deferred router commits keep the incoming card in place until the new face is rendered, then reset without a reverse transition',()=>{
 const ui=harness({deferred:true})
 for(const direction of [1,-1,1]){
  const before=ui.navigations.length
  ui.step(direction);ui.advance()
  assert.equal(ui.navigations.length,before+1)
  assert.equal(ui.style.get('--wallet-drag-x'),`${direction*106}px`)
  ui.step(-direction);assert.equal(ui.navigations.length,before+1);assert.equal(ui.timers.size,0)
  ui.commitRoute()
  assert.equal(ui.style.get('--wallet-drag-x'),'0px')
  assert.deepEqual(ui.flushes.at(-1),{dragging:'true',offset:'0px'})
  assert.equal(ui.stage.dataset.direction,undefined)
  assert.deepEqual(ui.scrolls.at(-1),{top:432,behavior:'instant'})
  ui.paint();assert.equal(ui.stage.dataset.dragging,'false');assert.equal(ui.style.get('--wallet-drag-x'),'0px')
 }
})
test('Actual card page renders signed/zero charges, two side copies and categories without the duplicate heading amount',()=>{
 const plan=fixture(),before=JSON.stringify(plan)
 const Page=load({useLocation:()=>({search:'?year=2026&month=10&walletCard=card1'}),useNavigate:()=>()=>{}})
 const html=renderToStaticMarkup(React.createElement(Page,{budget:budget(plan),fixture:false}))
 assert.match(html,/household-card-charge[^>]*><bdi dir="ltr">[^<]*123\.45/)
 assert.equal((html.match(/class="household-wallet-peek (?:left|right)"/g)??[]).length,2)
 assert.equal((html.match(/class="household-wallet-peek far-(?:left|right)"[^>]*aria-hidden="true"/g)??[]).length,2)
 assert.match(html,/household-card-charge[^>]*><bdi dir="ltr">[^<]*0/)
 const detail=html.split('class="surface household-card-detail"')[1]
 assert.doesNotMatch(detail.split('household-detail-period')[0],/<strong|123\.45/)
 assert.match(detail,/household-category-row/);assert.match(detail,/23\.45/)
 assert.match(html,/tabindex="0" aria-live="polite"/);assert.equal(JSON.stringify(plan),before)
})
test('Buttons and dots animate the same RTL cycle, preserve vertical position and accept repeated two-card wraps',()=>{
 const ui=harness()
 for(const direction of [1,1,-1,-1,1,-1]){
  const count=ui.navigations.length
  ui.step(direction);assert.equal(ui.navigations.length,count);assert.equal(ui.style.get('--wallet-drag-x'),`${direction*106}px`)
  assert.equal(ui.stage.dataset.direction,direction>0?'right':'left')
  ui.step(direction);assert.equal(ui.timers.size,1)
  ui.settle();assert.equal(ui.navigations.length,count+1);assert.equal(ui.style.get('--wallet-drag-x'),'0px')
  assert.equal(ui.navigations.at(-1).options.preventScrollReset,true);assert.deepEqual(ui.navigations.at(-1).options.state,{kept:true})
 }
 ui.select('card2');assert.equal(ui.timers.size,1);ui.settle();assert.match(ui.navigations.at(-1).href,/walletCard=card2/)
 let prevented=false
 walk(ui.tree,node=>node.props?.className==='household-wallet-stage')[0].props.onKeyDown({key:'ArrowLeft',preventDefault:()=>{prevented=true}})
 assert.equal(prevented,true);assert.equal(ui.style.get('--wallet-drag-x'),'-106px');ui.settle();assert.match(ui.navigations.at(-1).href,/walletCard=card1/)
})
test('Reduced motion selects immediately, invalid/current ids do nothing and cleanup cancels pending navigation',()=>{
 const reduced=harness({reduced:true});reduced.step(-1);assert.equal(reduced.navigations.length,1);assert.equal(reduced.timers.size,0)
 const ui=harness();ui.select('foreign');ui.select('card1');assert.equal(ui.timers.size,0)
 const cleanup=ui.effects[0]();ui.step(1);assert.equal(ui.timers.size,1);cleanup();assert.equal(ui.timers.size,0);assert.equal(ui.navigations.length,0)
})
test('Pointer swipe shares the animated cycle; vertical, cancelled and short gestures never select',()=>{
 const ui=harness(),stage=()=>walk(ui.tree,node=>node.props?.className==='household-wallet-stage')[0].props
 const target={closest:()=>null},currentTarget={...ui.stage,setPointerCapture:()=>{},hasPointerCapture:()=>true,releasePointerCapture:()=>{}}
 const event=(clientX,clientY)=>({isPrimary:true,button:0,pointerId:1,clientX,clientY,target,currentTarget,preventDefault:()=>{}})
 stage().onPointerDown(event(0,0));stage().onPointerMove(event(80,3));assert.equal(ui.style.get('--wallet-drag-x'),'80px');stage().onPointerUp(event(80,3));assert.equal(ui.timers.size,1);ui.settle()
 for(const [horizontal,vertical]of [[5,100],[30,0]]){stage().onPointerDown(event(0,0));stage().onPointerMove(event(horizontal,vertical));stage().onPointerUp(event(horizontal,vertical));assert.equal(ui.timers.size,0)}
 stage().onPointerDown(event(0,0));stage().onPointerMove(event(-80,0));stage().onPointerCancel();assert.equal(ui.timers.size,0);assert.equal(ui.navigations.length,1)
})
test('Card CSS keeps both sides upright, matched spacing, Cal on the left and reduced motion without transitions',()=>{
 const css=readFileSync('frontend/src/app.css','utf8')
 for(const side of ['right','left']){const rule=css.match(new RegExp('\\.household-wallet-peek\\.'+side+'\\{([^}]+)\\}'))[1];assert.doesNotMatch(rule,/rotate|scale/)}
 for(const [side,offset]of [['right',162],['left',-262]])assert.ok(css.includes(`.household-wallet-peek.far-${side}{transform:translateX(calc(${offset}% + var(--wallet-drag-x,0px)))`))
 assert.match(css,/household-card-bottom\{[^}]*direction:ltr/)
 assert.match(css,/household-card-marks[^}]*direction:ltr/)
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.household-wallet-stage[^}]*transition:none/)
})
test('Cal occupies the left mark slot once per face; missing, empty and single-card views retain their actual evidence',()=>{
 const plan=fixture();plan.creditCards=[{id:'card1',name:'כרטיס כאל',provider:'cal',alias:''}]
 const render=search=>{const Page=load({useLocation:()=>({search}),useNavigate:()=>()=>{}});return renderToStaticMarkup(React.createElement(Page,{budget:budget(plan),fixture:false}))}
 const html=render('?year=2026&month=10'),selected=html.split('class="household-wallet-selected"')[1].split('household-wallet-controls')[0]
 assert.match(selected,/household-card-marks"><span class="wallet-provider-logo" data-provider="cal"/)
 assert.doesNotMatch(selected.split('household-payer')[1],/data-provider="cal"/)
 assert.doesNotMatch(html,/household-wallet-peek /)
 assert.match(html,/disabled="" aria-label="הכרטיס הבא"/)
 assert.match(render('?year=2026&month=12'),/טרם נקלט חיוב לחודש זה/)
 plan.months={};assert.match(render('?year=2026'),/טרם נקלט חיוב לשנה זו/)
 plan.creditCards=[];assert.doesNotMatch(render('?year=2026&month=10'),/class="household-wallet-selected"/)
})
