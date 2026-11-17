import {useId,useRef,useState,type PointerEvent,type ReactNode} from 'react'
import {Ellipsis} from 'lucide-react'

const revealWidth=144
const swipeThreshold=38

export function PlannedRowActions({label,expanded,onExpandedChange,children,actions}:{
 label:string;expanded:boolean;onExpandedChange:(open:boolean)=>void;children:ReactNode;actions:ReactNode
}){
 const actionsId=useId(),toggle=useRef<HTMLButtonElement>(null),[offset,setOffset]=useState<number|null>(null)
 const gesture=useRef<{id:number;x:number;y:number;horizontal:boolean}|null>(null),suppressClick=useRef(false)
 function start(event:PointerEvent<HTMLDivElement>){
  suppressClick.current=false
  if(event.isPrimary&&event.pointerType!=='mouse')gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false}
 }
 function move(event:PointerEvent<HTMLDivElement>){
  const active=gesture.current
  if(!active||active.id!==event.pointerId)return
  const dx=event.clientX-active.x,dy=event.clientY-active.y
  if(!active.horizontal){
   if(Math.max(Math.abs(dx),Math.abs(dy))<10)return
   if(Math.abs(dx)<=Math.abs(dy)){gesture.current=null;return}
   active.horizontal=true
   event.currentTarget.setPointerCapture(event.pointerId)
  }
  setOffset(Math.min(revealWidth,Math.max(0,(expanded?revealWidth:0)+dx)))
 }
 function finish(event:PointerEvent<HTMLDivElement>){
  const active=gesture.current
  if(!active||active.id!==event.pointerId)return
  gesture.current=null
  setOffset(null)
  if(!active.horizontal||event.type==='pointercancel'||event.type==='lostpointercapture')return
  suppressClick.current=true
  const dx=event.clientX-active.x
  if(Math.abs(dx)>=swipeThreshold)onExpandedChange(dx>0)
 }
 return <li className="planned-swipe-row" onKeyDown={event=>{
  if(event.key!=='Escape'||!expanded)return
  event.stopPropagation();onExpandedChange(false);toggle.current?.focus()
 }}>
  <div className="planned-swipe-front" data-open={expanded} data-dragging={offset!==null}
   style={offset===null?undefined:{transform:`translateX(${offset}px)`}} onPointerDown={start} onPointerMove={move}
   onPointerUp={finish} onPointerCancel={finish}
   onLostPointerCapture={event=>{if(event.target===event.currentTarget)finish(event)}}
   onClickCapture={event=>{if(event.detail&&suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation()}}}>
   {children}
   <button ref={toggle} type="button" aria-label={'פעולות · '+label} aria-expanded={expanded} aria-controls={actionsId}
    className="planned-swipe-toggle" onClick={()=>onExpandedChange(!expanded)}>
    <Ellipsis size={20} aria-hidden/>
   </button>
  </div>
  <div id={actionsId} className="planned-swipe-actions" inert={!expanded} aria-hidden={!expanded}>{actions}</div>
 </li>
}
