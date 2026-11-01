import {savingsArtParts,savingsArtFill,savingsArtLabels} from '../../../src/savings-art.js'
import {savingsIllustrations} from '../../../src/budget.js'
import '../../../src/savings-art.css'
import './savings-art.css'

function Painting({icon}:{icon:string}){
 const parts=savingsArtParts[icon as keyof typeof savingsArtParts]??savingsArtParts.trophy
 return <span className="c-art" aria-hidden="true">{parts.map((part:string)=><span key={part} className={'art-'+part}/>)}</span>
}
export function SavingsPainting({icon,current,target,name,confirmed=true}:{icon:string;current:number;target:number;name:string;confirmed?:boolean}){
 const pct=confirmed&&target>0?Math.max(0,Math.min(100,current/target*100)):0
 return <div className="goal-art-scope"><div className="goal-painting" role={confirmed?'progressbar':'img'} aria-label={confirmed?'סכום משויך למטרה '+name:'איור המטרה '+name+' · היתרה טרם אושרה להיום'} aria-valuemin={confirmed?0:undefined} aria-valuemax={confirmed?target:undefined} aria-valuenow={confirmed?Math.max(0,Math.min(current,target)):undefined} aria-valuetext={confirmed?Math.round(pct)+'% מהיעד':undefined}><div data-gray-icon><Painting icon={icon}/></div><div className="goal-painting-fill" style={{clipPath:`inset(${savingsArtFill(icon,pct)}% 0 0 0)`}}><Painting icon={icon}/></div></div>{confirmed&&<p className="text-center text-sm font-medium tabular-nums"><bdi>{Math.round(pct)}%</bdi> מהיעד</p>}</div>
}
export function SavingsPaintingLibrary({value,onChange}:{value:string;onChange:(icon:string)=>void}){
 return <fieldset className="goal-art-scope min-w-0"><legend className="text-sm font-semibold">ספריית איורים · בחירת איור למטרה</legend><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{savingsIllustrations.map((icon:string)=><button key={icon} type="button" aria-pressed={value===icon} onClick={()=>onChange(icon)} className="goal-art-choice flex min-h-11 min-w-0 flex-col items-center rounded-xl border bg-card p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="goal-library-painting"><Painting icon={icon}/></span><span>{savingsArtLabels[icon as keyof typeof savingsArtLabels]}</span></button>)}</div></fieldset>
}
