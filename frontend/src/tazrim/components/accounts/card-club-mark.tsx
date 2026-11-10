import hitechzone from '../../../../../public/tazrim/club-hitechzone.png'
import hot from '../../../../../public/tazrim/club-hot.png'
import shufersal from '../../../../../public/tazrim/club-shufersal.png'
import w from '../../../../../public/tazrim/club-w.svg'
import lifestyle from '../../../../../public/tazrim/club-lifestyle.png'
const clubs:Record<string,{src:string;label:string}>={hitechzone:{src:hitechzone,label:'הייטקזון'},hot:{src:hot,label:'הוט'},shufersal:{src:shufersal,label:'שופרסל'},w:{src:w,label:'W של ישראכרט'},lifestyle:{src:lifestyle,label:'לייף סטייל'}}
export function CardClubMark({club}:{club:string}){const mark=clubs[club];return mark?<span className="card-club-mark" data-club={club}><img src={mark.src} alt={mark.label} width="96" height="40" decoding="async"/></span>:null}
