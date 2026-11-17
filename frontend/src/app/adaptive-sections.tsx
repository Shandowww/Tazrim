import {Children,useEffect,useId,useRef,useState,type ReactNode} from 'react'

/** Keep every field mounted; changing the presentation never saves or resets a draft. */
export function AdaptiveSections({labels,children,disabled=false}:{labels:string[];children:ReactNode;disabled?:boolean}){
 const [selected,setSelected]=useState(0),[narrow,setNarrow]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 767px)').matches)
 const root=useRef<HTMLDivElement>(null),id=useId(),panels=Children.toArray(children)
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)'),update=()=>setNarrow(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
 function select(index:number){
  setSelected(index)
  requestAnimationFrame(()=>{const panel=root.current?.querySelector<HTMLElement>(`[data-panel="${index}"]`);panel?.focus({preventScroll:true});panel?.scrollIntoView({block:'start',behavior:'instant'})})
 }
 return <div ref={root} className="adaptive-sections" data-tab-swipe-ignore onInvalidCapture={event=>{const panel=(event.target as HTMLElement).closest<HTMLElement>('[data-panel]');if(panel&&panel.hidden){event.preventDefault();const field=event.target as HTMLInputElement;setSelected(Number(panel.dataset.panel));requestAnimationFrame(()=>{field.focus();field.reportValidity()})}}}>
  <nav className="adaptive-section-navigation" aria-label="חלקי הטופס">{labels.map((label,index)=><button key={label} type="button" disabled={disabled} aria-pressed={selected===index} aria-controls={`${id}-${index}`} onClick={()=>select(index)}><span aria-hidden>{index+1}</span>{label}</button>)}</nav>
  <div className="adaptive-section-panels">{panels.map((panel,index)=><div key={index} id={`${id}-${index}`} data-panel={index} className="adaptive-section-panel" tabIndex={-1} hidden={narrow&&selected!==index} aria-label={labels[index]}>{panel}</div>)}</div>
  <div className="adaptive-section-controls"><button type="button" disabled={disabled||selected===0} onClick={()=>select(selected-1)}>הקודם</button><span aria-live="polite">{selected+1} מתוך {panels.length}</span><button type="button" disabled={disabled||selected===panels.length-1} onClick={()=>select(selected+1)}>הבא</button></div>
 </div>
}
