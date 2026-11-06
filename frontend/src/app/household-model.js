import {cashAccountList,cashSourceRecords,monthAt} from '../../../src/budget.js'
import {tazrimDisplaySnapshot} from '../../../src/tazrim-display-model.js'
export const mainPages=['/','/accounts','/savings','/more']
/** Space changes keep the period, never another space's record/filter/action. */
export function householdSpaceHref(path,search,id){
 const query=new URLSearchParams(search),next=new URLSearchParams()
 for(const key of ['year','month','demo'])if(query.has(key))next.set(key,query.get(key))
 if(id!=='personal')next.set('budget',id)
 const lists=['/','/accounts','/savings','/more','/income','/monthly','/loans','/plans','/plans/scenario','/recurring','/categories','/categories/manage','/categories/limits','/search','/analysis','/details/manage','/checks','/accounts/transfers','/accounts/assignments','/card-setup','/incoming','/upload','/upload/history','/actions','/investment','/goals','/overview','/overview/transfers','/overview/migration','/start','/about','/settings','/settings/spaces','/settings/forecast','/settings/profile','/settings/security','/settings/history','/settings/device-draft','/settings/access','/settings/gmail','/settings/drive','/settings/wallet','/settings/report-expectations','/savings/accounts','/savings/returns','/savings/allocation','/savings/transfer','/savings/transfers','/savings/schedule']
 const parent=/^\/(accounts|banks|cards)\//.test(path)?'/accounts':householdFallback(path)
 const destination=lists.includes(path)?path:parent
 return destination+(next.size?'?'+next:'')
}
/** Only internal, scoped return destinations may be carried between screens. */
export function returnDestination(value,search=''){
 if(!value||!value.startsWith('/')||value.startsWith('//'))return '/'
 const url=new URL(value,'https://budgit.invalid')
 if(url.origin!=='https://budgit.invalid'||url.pathname.startsWith('/next'))return '/'
 const current=new URLSearchParams(search),target=url.searchParams
 if((target.get('budget')||'personal')!==(current.get('budget')||'personal'))return '/'
 const hint=target.get('kind'),reportHint=url.pathname.startsWith('/upload')&&['bank','card'].includes(hint)&&/^[\w:-]{1,100}$/.test(target.get('target')??'')
 const incomeHint=url.pathname==='/plans/new'&&hint==='income'
 for(const key of [...target.keys()])if(!['year','month','budget','account','card','walletCard','category','query','page','demo'].includes(key)&&!(key==='kind'&&(reportHint||incomeHint))&&!(key==='target'&&reportHint))target.delete(key)
 return url.pathname+url.search
}
/** Reuse authoritative actual-only snapshots; retain calendar gaps across years. */
export function householdHistory(plan,asOf){
 const sources=cashAccountList(plan).map(a=>cashSourceRecords(plan,a.id))
 const keys=[...Object.keys(plan.months??{}),...sources.flatMap(s=>Object.keys(s)),...(plan.cardBilling?.reports??[]).map(r=>r.dueDate?.slice(0,7))].filter(k=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(k??'')&&k<=asOf)
 const years=[...new Set([asOf.slice(0,4),...keys.map(k=>k.slice(0,4))])]
 const rows=years.flatMap(year=>tazrimDisplaySnapshot(plan,{year,asOf}).series).filter(r=>r.month<=asOf)
 const latest=rows.filter(r=>r.reported||r.cardTotal!==null).map(r=>r.month).sort().at(-1)??null
 const byMonth=new Map(rows.map(r=>[r.month,r]))
 return {latest,rows:Array.from({length:6},(_,i)=>{const month=monthAt(latest??asOf,i-5);return byMonth.get(month)??{month,reported:false,partial:false,income:null,spending:null,incomingTransfers:null,cardTotal:null}}),
  checks:(plan.details??[]).filter(r=>r.method==='checks'&&r.status==='pending').length,
  loans:(plan.loans??[]).filter(l=>l.from<=asOf&&monthAt(l.from,l.months-1)>=asOf).length}
}

/** A short presentation-only breadcrumb chain, bound to the current space. */
export function householdTrail(state,search=''){
 const values=Array.isArray(state?.householdTrail)?state.householdTrail:state?.householdFrom?[state.householdFrom]:[]
 return values.filter(value=>typeof value==='string').slice(-12).map(value=>returnDestination(value,search))
}
/** Preserve an explicit back trail; ordinary links append only real screen changes. */
export function householdLinkState(location,href,explicit){
 const supplied=explicit&&typeof explicit==='object'?explicit:{}
 if(Object.hasOwn(supplied,'householdTrail'))return {...supplied,householdTrail:householdTrail(supplied,location.search)}
 const path=href.split('?')[0],current=returnDestination(location.pathname+location.search,location.search)
 const previous=householdTrail(location.state,location.search)
 const trail=mainPages.includes(path)?[]:path===location.pathname?previous:mainPages.includes(location.pathname)?[current]:[...previous,current].slice(-12)
 return {...supplied,householdTrail:trail}
}
/** An acknowledged replace must not put the creation form on the way back. */
export function householdReplaceState(location,href,explicit){
 const trail=householdTrail(location.state,location.search),path=href.split('?')[0]
 const ancestor=trail.findIndex(value=>value.split('?')[0]===path)
 return {...explicit,householdTrail:ancestor<0?trail:trail.slice(0,ancestor)}
}

/** Useful parent for a deep link opened without an in-app trail. */
export function householdFallback(path,search=''){
 const cardAction=path.match(/^\/cards\/([^/]+)\/(?:payer|stop|no-activity|billing(?:\/[^/]+)?)$/)
 if(cardAction)return '/cards/'+cardAction[1]
 const accountMonthly=path.match(/^\/accounts\/([^/]+)\/monthly(?:\/correction)?$/)
 if(accountMonthly)return '/banks/'+accountMonthly[1]
 if(/^\/accounts\/[^/]+\/assign-remainder$/.test(path))return '/accounts/transfers'
 if(path.startsWith('/accounts/transfers/'))return '/accounts/transfers'
 if(path==='/settings/device-draft')return '/settings/security'
 if(path==='/settings/report-expectations')return '/upload'
 if(path==='/overview/transfers'||path==='/overview/migration')return '/overview'
 if(path==='/analysis')return '/categories'
 if(path==='/goals'||path==='/start')return '/settings'
 if(path.startsWith('/accounts/')||path.startsWith('/card-setup'))return '/accounts'
 if(/^\/(banks|cards)(\/|$)/.test(path))return '/accounts'
 if(path.startsWith('/savings/'))return '/savings'
 if(path==='/investment')return '/savings'
 if(path.startsWith('/loans/'))return '/loans'
 if(path==='/loans'||path==='/income'||path==='/incoming'||path==='/upload'||path==='/plans/scenario')return '/more'
 if(path.startsWith('/upload/'))return '/upload'
 if(path.startsWith('/plans/'))return '/plans'
 if(path.startsWith('/categories/'))return '/categories'
 if(/^\/details\/(new|[^/]+\/(edit|delete|clear))$/.test(path))return '/checks'
 if(path.startsWith('/details/'))return new URLSearchParams(search).get('from')==='search'?'/search':'/categories'
 if(path.startsWith('/settings/'))return '/settings'
 if(path==='/settings')return '/more'
 return '/'
}
