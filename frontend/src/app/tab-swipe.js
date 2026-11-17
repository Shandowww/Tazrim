const tabs=['/','/accounts','/savings','/more']
const excluded='a,button,input,textarea,select,summary,[contenteditable],[role=slider],[role=button],[role=tablist],[data-tab-swipe-ignore],.household-wallet,[aria-roledescription],svg,canvas'
/** Phones only. Browser edges, vertical scrolling and nested gestures keep ownership. */
export function installTabSwipe({document,window,pathname,navigate,isBusy}){
 let start=null
 const reset=()=>{start=null}
 const available=()=>window.matchMedia('(max-width: 767px)').matches&&!isBusy()&&!document.querySelector('dialog[open],[role=dialog]')
 const begin=event=>{
  reset()
  if(!tabs.includes(pathname)||event.touches.length!==1||!available()||!event.target.closest?.('main')||event.target.closest(excluded))return
  const touch=event.touches[0]
  if(touch.clientX<28||touch.clientX>window.innerWidth-28)return
  for(let node=event.target;node&&node!==document.body;node=node.parentElement){
   if(node.scrollWidth>node.clientWidth+2&&/auto|scroll/.test(window.getComputedStyle(node).overflowX))return
  }
  if(document.getSelection?.()?.toString())return
  start={x:touch.clientX,y:touch.clientY,id:touch.identifier,time:event.timeStamp,horizontal:false}
 }
 const move=event=>{
  if(!start)return
  if(event.touches.length!==1||!available()){reset();return}
  const touch=event.touches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y
  if(touch.identifier!==start.id||Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*.6){reset();return}
  if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.8){
   if(!event.cancelable){reset();return}
   start.horizontal=true;event.preventDefault()
  }
 }
 const end=event=>{
  const prior=start;reset()
  if(!prior||!prior.horizontal||!available()||event.touches.length||event.changedTouches.length!==1)return
  const touch=event.changedTouches[0],dx=touch.clientX-prior.x,dy=touch.clientY-prior.y
  if(touch.identifier!==prior.id||Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.8||event.timeStamp-prior.time>900)return
  const rtl=window.getComputedStyle(document.documentElement).direction==='rtl'
  const next=tabs[tabs.indexOf(pathname)+((dx>0)===rtl?1:-1)]
  if(next)navigate(next)
 }
 document.addEventListener('touchstart',begin,{passive:true})
 document.addEventListener('touchmove',move,{passive:false})
 document.addEventListener('touchend',end)
 document.addEventListener('touchcancel',reset)
 return()=>{document.removeEventListener('touchstart',begin);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',reset)}
}
