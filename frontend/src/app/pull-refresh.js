/** Existing Budgit gesture contract, installed with removable React lifecycle listeners. */
export function installPullRefresh({document,window,refresh,isBusy,onHint,onProgress=progress=>{}}){
 let start=null,x=null,distance=0
 const reset=()=>{start=null;x=null;distance=0;onHint('');onProgress(null)}
 const begin=event=>{reset();if(event.touches.length!==1||isBusy()||(document.scrollingElement?.scrollTop??0)>2||document.querySelector('dialog[open],[role="dialog"][data-state="open"]'))return
  if(event.target.closest?.('input,select,textarea,button,a,summary,[role=button],[role=slider],[contenteditable]'))return
  // Only a pull begun near the top of the viewport may refresh. Starting on
  // the page body must leave ordinary scrolling under the browser's control.
  const touch=event.touches[0];if(touch.clientY<0||touch.clientY>Math.min(180,window.innerHeight/4))return
  for(let node=event.target;node;node=node.parentElement){if(node===document.scrollingElement||node===document.body||node===document.documentElement)continue;if(/^(auto|scroll|overlay)$/.test(window.getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+2)return}
  start=touch.clientY;x=touch.clientX
 }
 const move=event=>{if(event.touches.length!==1){reset();return}if(start===null)return;const touch=event.touches[0];distance=touch.clientY-start;const horizontal=Math.abs(touch.clientX-x)
  if(distance<-12||horizontal>12&&horizontal>distance||(document.scrollingElement?.scrollTop??0)>2||document.querySelector('dialog[open],[role="dialog"][data-state="open"]')){reset();return}
  if(distance<=8)return;if(!event.cancelable){reset();return}event.preventDefault();onProgress(Math.min(1,distance/64));onHint(distance>=64?'אפשר לשחרר כדי לרענן':'משיכה מטה לרענון')
 }
 const end=()=>{const ready=start!==null&&distance>=64&&!isBusy()&&!document.querySelector('dialog[open],[role="dialog"][data-state="open"]');reset();if(ready)refresh()}
 document.addEventListener('touchstart',begin,{passive:true});document.addEventListener('touchmove',move,{passive:false});document.addEventListener('touchend',end);document.addEventListener('touchcancel',reset)
 return()=>{document.removeEventListener('touchstart',begin);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',reset)}
}
