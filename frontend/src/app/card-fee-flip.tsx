import {useState,useRef,useLayoutEffect,type ReactNode} from 'react'

/** Local presentation state, reset by the owning actor/budget/card key. */
export function CardFeeFlip({card,children,canFlip}:{card:{displayName:string;discountEndsOn?:string|null;feeAfterDiscount?:number|null;issuerPhone?:string|null};children:ReactNode;canFlip:()=>boolean}){
 const [flipped,setFlipped]=useState(false),front=useRef<HTMLButtonElement>(null),back=useRef<HTMLButtonElement>(null),last=useRef(false)
 useLayoutEffect(()=>{if(flipped)back.current?.focus({preventScroll:true});else if(last.current)front.current?.focus({preventScroll:true});last.current=flipped},[flipped])
 const toggle=()=>{if(canFlip())setFlipped(value=>!value)}
 return <div className="household-card-flipper" data-flipped={flipped}>
  <button ref={front} type="button" data-card-flip className="household-card-front" aria-label={'הצגת גב הכרטיס '+card.displayName} aria-expanded={flipped} inert={flipped} onClick={toggle}>{children}<span className="household-card-flip-hint">פרטי ההנחה בגב הכרטיס ↶</span></button>
  <div className="household-card-back" inert={!flipped} aria-hidden={!flipped} onClick={e=>{if(!(e.target as Element).closest('a,button'))toggle()}}>
   <div className="household-card-back-heading"><span>הנחה ודמי כרטיס</span><button ref={back} type="button" data-card-flip onClick={toggle} aria-label="חזרה לחזית הכרטיס">↶</button></div>
   <dl>
    {card.discountEndsOn&&<div><dt>בחינם/הנחה עד</dt><dd><bdi dir="ltr">{card.discountEndsOn.split('-').reverse().join('.')}</bdi></dd></div>}
    {card.feeAfterDiscount!=null&&<div><dt>עלות לאחר תום הנחה</dt><dd><bdi dir="ltr">{new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(card.feeAfterDiscount)}</bdi></dd></div>}
    {card.issuerPhone&&<div><dt>טלפון לחידוש הנחה</dt><dd><a href={'tel:'+card.issuerPhone.replace(/[^\d+*]/g,'')}><bdi dir="ltr">{card.issuerPhone}</bdi></a></dd></div>}
   </dl>
   {!card.discountEndsOn&&card.feeAfterDiscount==null&&!card.issuerPhone&&<p>עדיין לא הוזנו פרטי הנחה לכרטיס.</p>}
  </div>
 </div>
}
