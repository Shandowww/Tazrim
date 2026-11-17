import test from 'node:test'
import assert from 'node:assert/strict'
import {installTabSwipe} from '../frontend/src/app/tab-swipe.js'

function harness({path='/',wide=false,rtl=true,excluded=false,edge=150,scrollable=false}={}){
 const handlers=new Map(),navigations=[],body={},target={parentElement:body,scrollWidth:scrollable?600:300,clientWidth:300,closest:selector=>selector==='main'?{}:excluded?{}:null}
 let busy=false,dialog=false,selected='',prevented=0
 const document={body,documentElement:{},querySelector:()=>dialog?{}:null,getSelection:()=>({toString:()=>selected}),addEventListener:(name,callback)=>handlers.set(name,callback),removeEventListener:name=>handlers.delete(name)}
 const window={innerWidth:390,matchMedia:()=>({matches:!wide}),getComputedStyle:()=>({direction:rtl?'rtl':'ltr',overflowX:scrollable?'auto':'visible'})}
 const cleanup=installTabSwipe({document,window,pathname:path,navigate:path=>navigations.push(path),isBusy:()=>busy})
 function emit(name,x,y=200,options={}){const touch={clientX:x,clientY:y,identifier:1};handlers.get(name)?.({target,timeStamp:name==='touchstart'?0:200,touches:name==='touchend'?[]:[touch],changedTouches:[touch],cancelable:true,preventDefault:()=>prevented++,...options})}
 return {navigations,handlers,cleanup,emit,start:()=>emit('touchstart',edge),swipe:(dx=100)=>{emit('touchstart',edge);emit('touchmove',edge+dx);emit('touchend',edge+dx)},busy:()=>{busy=true},dialog:()=>{dialog=true},selection:()=>{selected='text'},prevented:()=>prevented}
}
test('RTL root-tab gestures select one adjacent tab, with no wrap; LTR mirrors physical direction',()=>{
 const ui=harness();ui.swipe();assert.deepEqual(ui.navigations,['/accounts']);assert.equal(ui.prevented(),1)
 const reverse=harness({path:'/accounts'});reverse.swipe(-90);assert.deepEqual(reverse.navigations,['/'])
 const end=harness({path:'/more'});end.swipe();assert.deepEqual(end.navigations,[])
 const ltr=harness({rtl:false});ltr.swipe(-90);assert.deepEqual(ltr.navigations,['/accounts'])
})
test('Desktop, detail screens, controls, carousels, horizontal scrollers and browser edges never start tab swipes',()=>{
 for(const options of [{wide:true},{path:'/loans/new'},{excluded:true},{scrollable:true},{edge:12},{edge:380}]){const ui=harness(options);ui.swipe();assert.deepEqual(ui.navigations,[],JSON.stringify(options));assert.equal(ui.prevented(),0)}
})
test('Vertical intent stays cancelled even if a gesture turns horizontal; short, slow and cancelled gestures do not navigate',()=>{
 const ui=harness();ui.start();ui.emit('touchmove',155,230);ui.emit('touchmove',250,230);ui.emit('touchend',250,230);assert.deepEqual(ui.navigations,[])
 const short=harness();short.swipe(40);assert.deepEqual(short.navigations,[])
 const slow=harness();slow.start();slow.emit('touchmove',250);slow.emit('touchend',250,200,{timeStamp:1000});assert.deepEqual(slow.navigations,[])
 const cancelled=harness();cancelled.start();cancelled.emit('touchmove',250);cancelled.emit('touchcancel',250);cancelled.emit('touchend',250);assert.deepEqual(cancelled.navigations,[])
})
test('Late busy state/dialog, multitouch, noncancelable scrolling and selected text preserve the current screen',()=>{
 for(const interrupt of [ui=>ui.busy(),ui=>ui.dialog(),ui=>ui.emit('touchmove',250,200,{touches:[{},{}]}),ui=>ui.emit('touchmove',250,200,{cancelable:false})]){const ui=harness();ui.start();ui.emit('touchmove',240);interrupt(ui);ui.emit('touchend',250);assert.deepEqual(ui.navigations,[])}
 const selected=harness();selected.selection();selected.swipe();assert.deepEqual(selected.navigations,[])
})
test('Route/scope cleanup removes every listener and abandons an unfinished gesture',()=>{
 const ui=harness();ui.start();ui.emit('touchmove',250);ui.cleanup();assert.equal(ui.handlers.size,0);ui.emit('touchend',250);assert.deepEqual(ui.navigations,[])
})
