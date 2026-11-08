import {cashAccountList,monthAt,monthlyDataCoverage} from '../../../src/budget.js'
import {cardStatementCoverage} from '../../../src/card-billing-model.js'
import {actionIssues} from '../../../src/action-center-model.js'
import type {IncomingReport} from './report-intake-api.ts'
import type {AutomationJob} from './report-automation-api.ts'
import type {ExpectationRule} from './report-expectations-api.ts'

export type SyncView='attention'|'missing'|'reports'|'settings'|'add'|'report'|'connections'|'setup'|'policy'
export function syncView(value:string|null):SyncView{return ['missing','reports','settings','add','report','connections','setup','policy'].includes(value??'')?value as SyncView:'attention'}
export function syncHref(search:string,view:SyncView,changes:Record<string,string|null>={}){
 const query=new URLSearchParams(search)
 query.set('sync',view)
 query.delete('report');query.delete('panel')
 if(view!=='report'&&view!=='add')query.delete('syncFrom')
 for(const [key,value] of Object.entries(changes))value===null?query.delete(key):query.set(key,value)
 return '/incoming?'+query
}
export function syncReturnHref(search:string){
 const value=new URLSearchParams(search).get('syncReturn')
 if(!value||value.length>2400||!/^\/incoming(?:\?|$)/.test(value)||/[\r\n\\#]/.test(value))return null
 return value
}
export function syncWaiting(report:IncomingReport,job?:AutomationJob){return (report.lifecycle??'new')==='new'&&!report.applied&&!!job&&['queued','working'].includes(job.status)}
export function syncReportPage(reports:IncomingReport[],options:{view:'attention'|'reports'|'waiting';query:string;status:string;scope:string;budgetId:string;page:number;jobs?:AutomationJob[]}){
 const query=options.query.trim().normalize('NFKC').toLocaleLowerCase('he-IL'),jobs=new Map((options.jobs??[]).map(job=>[job.id,job]))
 const filtered=reports.filter(report=>{
  const lifecycle=report.lifecycle??'new',waiting=syncWaiting(report,jobs.get(report.id))
  return (options.view==='reports'||lifecycle!=='digested'&&(options.view==='waiting'?waiting:!waiting))&&(options.view!=='reports'||options.status==='all'||lifecycle===options.status)&&(!query||report.name.normalize('NFKC').toLocaleLowerCase('he-IL').includes(query))&&(options.scope==='all'||(options.scope==='unassigned'?!report.route:report.route?.budget===options.budgetId))
 }).sort((first,second)=>Date.parse(second.createdAt)-Date.parse(first.createdAt)||first.id.localeCompare(second.id))
 const pages=Math.max(1,Math.ceil(filtered.length/6)),page=Math.min(pages,Math.max(1,Math.floor(options.page)||1))
 return {reports:filtered.slice((page-1)*6,page*6),total:filtered.length,page,pages}
}

export type CoverageState='file'|'no-transactions'|'pending'|'missing'|'partial'|'open'|'not-required'
export interface CoverageCell {month:string;state:CoverageState;evidence:string;overdue:boolean;reportId?:string;failed?:boolean}
export interface CoverageRow {id:string;kind:'bank'|'card';label:string;alias:string;months:CoverageCell[]}
export interface CoverageReport {id:string;kind:string|null;target:string|null;month:string|null;state:string}
export function syncCoverage(plan:any,endMonth:string,day:string,reports:CoverageReport[]=[],rules:ExpectationRule[]=[]):CoverageRow[]{
 const asOf=day.slice(0,7)
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(endMonth)||!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(day))throw Error('יש לבחור חודש תקין.')
 const end=endMonth>asOf?asOf:endMonth,months=Array.from({length:6},(_,index)=>monthAt(end,index-5)).filter(month=>month>=plan.startMonth)
 const bankCoverage=new Map(months.map(month=>[month,monthlyDataCoverage(plan,month,asOf)]))
 const cardCoverage=[...new Set(months.map(month=>Number(month.slice(0,4))))].flatMap(year=>cardStatementCoverage(plan,year,asOf))
 const overdue=actionIssues(plan,{asOf,day,reports,expectations:rules} as any).filter(issue=>issue.code==='report.overdue')
 const cell=(kind:'bank'|'card',id:string,month:string,evidence:string):CoverageCell=>{
  const base={month,evidence,overdue:overdue.some(issue=>issue.target.kind===kind&&issue.target.target===id&&issue.target.month===month)}
  if(evidence==='file'||evidence==='no-transactions')return {...base,state:evidence}
  const staged=reports.filter(report=>report.kind===kind&&report.target===id&&report.month===month&&!['committed','archived'].includes(report.state)).sort((first,second)=>Number(first.state==='failed')-Number(second.state==='failed'))[0]
  if(staged)return {...base,state:'pending',reportId:staged.id,failed:staged.state==='failed'}
  const rule=rules.find(rule=>rule.kind===kind&&rule.target===id)
  if(rule?.exceptions.includes(month))return {...base,state:'not-required'}
  return {...base,state:month>=asOf?'open':evidence==='partial'?'partial':'missing'}
 }
 const banks:CoverageRow[]=cashAccountList(plan).map((account:any)=>({id:account.id,kind:'bank',label:account.label,alias:'',months:months.map(month=>cell('bank',account.id,month,bankCoverage.get(month)!.accounts.find((row:any)=>row.id===account.id)!.status))}))
 const cards:CoverageRow[]=[]
 for(const row of cardCoverage){
  let card=cards.find(card=>card.id===row.card.id)
  if(!card){card={id:row.card.id,kind:'card',label:row.card.name,alias:row.card.alias??'',months:[]};cards.push(card)}
  card.months.push(...row.months.filter((entry:{month:string;state:string})=>months.includes(entry.month)).map((entry:{month:string;state:string})=>cell('card',row.card.id,entry.month,entry.state)))
 }
 return [...banks,...cards].filter(row=>row.months.length)
}
