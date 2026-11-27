import {cashAccountList,cashSourceRecords,indexMonth,monthAt,monthlyDataCoverage} from '../../../src/budget.js'
import {tazrimDisplaySnapshot} from '../../../src/tazrim-display-model.js'
import {withViewQuery} from './navigation-query.js'
export const mainPages=['/','/accounts','/savings','/more']
/** Space changes keep the period, never another space's record/filter/action. */
export function householdSpaceHref(path,search,id){
 const query=new URLSearchParams(search),next=new URLSearchParams()
 for(const key of ['year','month','demo'])if(query.has(key))next.set(key,query.get(key))
 if(id!=='personal')next.set('budget',id)
 const lists=['/','/outlook','/accounts','/savings','/more','/income','/monthly','/loans','/plans','/plans/scenario','/recurring','/categories','/categories/manage','/categories/limits','/search','/analysis','/details/manage','/checks','/accounts/transfers','/accounts/assignments','/card-setup','/incoming','/upload','/upload/history','/actions','/investment','/goals','/overview','/overview/transfers','/overview/migration','/start','/about','/settings','/settings/spaces','/settings/forecast','/settings/profile','/settings/security','/settings/history','/settings/device-draft','/settings/access','/settings/gmail','/settings/drive','/settings/wallet','/settings/report-expectations','/savings/accounts','/savings/returns','/savings/allocation','/savings/transfer','/savings/transfers','/savings/schedule']
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
export function householdHistory(plan,asOf,requested){
 const accounts=cashAccountList(plan)
 const sources=accounts.map(account=>cashSourceRecords(plan,account.id))
 const validMonth=month=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(month??'')&&month<=asOf
 const evidenceMonths=new Set()
 const addEvidence=month=>{if(validMonth(month))evidenceMonths.add(month)}
 for(const [month,row] of Object.entries(plan.months??{}))if(row.bankCoverage)addEvidence(month)
 for(const source of sources)for(const [month,row] of Object.entries(source))if(row.fromBank)addEvidence(month)
 for(const entry of plan.bankImport?.entries??[])if(entry.field!=='exclude')addEvidence(entry.month)
 for(const detail of plan.details??[])if(detail.status==='cleared')addEvidence(detail.month)
 const keys=[...Object.keys(plan.months??{}),...sources.flatMap(Object.keys),...(plan.cardBilling?.reports??[]).map(report=>report.dueDate?.slice(0,7))]
 const years=[...new Set([asOf.slice(0,4),...keys.filter(validMonth).map(month=>month.slice(0,4))])]
 const rows=years.flatMap(year=>tazrimDisplaySnapshot(plan,{year,asOf}).series).filter(row=>row.month<=asOf)
 const reportedMonths=rows.filter(row=>row.reported||row.cardTotal!==null).map(row=>row.month)
 const savedMonths=[...new Set([...reportedMonths,...evidenceMonths])].sort()
 const latest=reportedMonths.sort().at(-1)??savedMonths.at(-1)??null
 const last=savedMonths.at(-1)??asOf
 const recentStart=monthAt(last,-5)
 const earliest=savedMonths[0]??recentStart
 const first=earliest<recentStart?earliest:recentStart
 const selected=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(requested??'')&&requested>=first&&requested<=last?requested:latest??last
 const chartEnd=selected<recentStart?monthAt(selected,5):last
 const byMonth=new Map(rows.map(r=>[r.month,r]))
 const rowFor=month=>byMonth.get(month)??{month,reported:false,partial:false,income:null,spending:null,incomingTransfers:null,cardTotal:null,cards:[]}
 const selectedRow=rowFor(selected)
 const bankReportEnds=selectedRow.partial?monthlyDataCoverage(plan,selected,asOf).accounts.filter(account=>account.reportThrough):[]
 return {latest,selected:{...selectedRow,hasSavedData:evidenceMonths.has(selected),bankReportEnds,multipleBankAccounts:accounts.length>1},months:Array.from({length:indexMonth(last)-indexMonth(first)+1},(_,i)=>monthAt(first,i)),
  rows:Array.from({length:6},(_,i)=>rowFor(monthAt(chartEnd,i-5))),
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

export function householdSaveDestination(location,fallback=householdFallback(location.pathname,location.search)){
 const trail=householdTrail(location.state,location.search)
 const previous=trail.filter(value=>value.split('?')[0]!==location.pathname).at(-1)
 return withViewQuery(returnDestination(previous??withViewQuery(fallback,location.search),location.search),location.search)
}

/** Useful parent for a deep link opened without an in-app trail. */
export function householdFallback(path,search=''){
 if(path==='/outlook')return '/'
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
