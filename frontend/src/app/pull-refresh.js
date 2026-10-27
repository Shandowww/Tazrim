/** Existing Budgit gesture contract, installed with removable React lifecycle listeners. */
export function installPullRefresh({document,window,refresh,isBusy,onHint}){
 let start=null,x=null,distance=0
 const reset=()=>{start=null;x=null;distance=0;onHint('')}
 const begin=event=>{reset();if(event.touches.length!==1||isBusy()||(document.scrollingElement?.scrollTop??0)>2||document.querySelector('dialog[open],[role="dialog"][data-state="open"]'))return
  if(event.target.closest?.('input,select,textarea,button,a,summary,[role=button],[role=slider],[contenteditable]'))return
  const touch=event.touches[0];if(touch.clientY<0||touch.clientY>window.innerHeight/3)return
  for(let node=event.target;node;node=node.parentElement)if(node!==document.scrollingElement&&node!==document.body&&node!==document.documentElement&&node.scrollHeight>node.clientHeight+2)return
  start=touch.clientY;x=touch.clientX
 }
 const move=event=>{if(event.touches.length!==1){reset();return}if(start===null)return;const touch=event.touches[0];distance=touch.clientY-start;const horizontal=Math.abs(touch.clientX-x)
  if(distance<-12||horizontal>12&&horizontal>distance||(document.scrollingElement?.scrollTop??0)>2||document.querySelector('dialog[open],[role="dialog"][data-state="open"]')){reset();return}
  if(distance<=12)return;if(!event.cancelable){reset();return}event.preventDefault();onHint(distance>=80?'אפשר לשחרר כדי לרענן':'משיכה מטה לרענון')
 }
 const end=()=>{const ready=start!==null&&distance>=80&&!isBusy()&&!document.querySelector('dialog[open],[role="dialog"][data-state="open"]');reset();if(ready)refresh()}
 document.addEventListener('touchstart',begin,{passive:true});document.addEventListener('touchmove',move,{passive:false});document.addEventListener('touchend',end);document.addEventListener('touchcancel',reset)
 return()=>{document.removeEventListener('touchstart',begin);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',reset)}
}
