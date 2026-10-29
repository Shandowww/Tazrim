import {actionIssues,actionIssueVisible,actionPreferencePayload,validActionTarget} from '../../../src/action-center-model.js'
import {validatePlan} from '../../../src/budget.js'
import {legacyActionCenterHref} from '../../../src/interface-destination.js'
import {loadExpectations,type ExpectationsSnapshot,type ActionIntegrations} from './report-expectations-api.ts'
import {AccessError,loadBudgetSnapshot} from './budget-api.ts'
import {SaveConflict,SaveUncertain} from './plan-save.ts'
import {withViewQuery} from './navigation-query.js'
export interface ActionClock{asOf:string;day:string;now:number}
export type ActionIssue=ReturnType<typeof actionIssues>[number]
export interface PreferenceAttempt{issue:ActionIssue;action:'read'|'snooze';until:number}
export function actionClock():ActionClock{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),day=p.find(r=>r.type==='year')!.value+'-'+p.find(r=>r.type==='month')!.value+'-'+p.find(r=>r.type==='day')!.value;return{day,asOf:day.slice(0,7),now:Date.now()}}
export function reportActionFacts(snapshot:ExpectationsSnapshot,clock:ActionClock){
 const plan=snapshot.budget.value.plan,locked=plan?.format==='monthly-flow-encrypted-v1'
 if(!Array.isArray(snapshot.actions.reports)||!snapshot.actions.preferences||typeof snapshot.actions.preferences!=='object'||Array.isArray(snapshot.actions.preferences))throw Error('רשימת הפעולות לא התקבלה בצורה תקינה.')
 const facts=actionIssues(validatePlan(plan)?plan:null,{scope:snapshot.budget.value.accountId+'/'+snapshot.actions.budgetId,asOf:clock.asOf,day:clock.day,locked,reports:snapshot.actions.reports,expectations:snapshot.actions.expectations,...(snapshot.integrations?{gmail:snapshot.integrations.gmail,notices:snapshot.integrations.notices,backup:snapshot.integrations.backup,admin:snapshot.integrations.admin}:{})} as any).sort((a,b)=>(a.severity==='required'?0:1)-(b.severity==='required'?0:1))
 return{facts,active:facts.filter(i=>actionIssueVisible(i,snapshot.actions.preferences,clock.now)),deferred:facts.filter(i=>!actionIssueVisible(i,snapshot.actions.preferences,clock.now))}
}
export function reportActionDestination(search:string,issue:ActionIssue){
 if(!validActionTarget(issue.target))throw Error('יעד הפעולה אינו זמין.')
 if(issue.target.screen==='gmail')return{href:withViewQuery('/settings/gmail',search),native:true}
 if(issue.target.screen==='notice'&&issue.target.noticeId)return{href:withViewQuery('/settings/gmail/notices/'+encodeURIComponent(issue.target.noticeId),search),native:true}
 if(issue.target.screen==='backup')return{href:withViewQuery('/settings/drive',search),native:true}
 if(issue.target.screen==='report'&&/^[a-f0-9-]{36}$/.test(issue.target.reportId??''))return{href:withViewQuery('/upload/'+encodeURIComponent(issue.target.reportId!)+'/group',search),native:true}
 return{href:legacyActionCenterHref(search,issue.key),native:false}
}
const preference=(snapshot:ExpectationsSnapshot,key:string)=>Object.hasOwn(snapshot.actions.preferences,key)?snapshot.actions.preferences[key]:null
const equal=(a:any,b:any)=>a===null||b===null?a===b:a.evidence===b.evidence&&a.until===b.until
export async function saveActionPreference(input:{budgetId:string;base:ExpectationsSnapshot;attempt:PreferenceAttempt;clock:ActionClock},fetcher:typeof fetch=fetch){
 const {budgetId,base,attempt,clock}=input,signal=new AbortController().signal,fresh=await (base.integrations?loadActionSnapshot:loadExpectations)(budgetId,base.budget.value,signal,fetcher)
 if(fresh.actions.actionPreferenceCAS!==true)throw Error('השרת עדיין לא תומך בעדכון מוגן של תזכורות. אפשר להשתמש בממשק הקיים.')
 const issue=reportActionFacts(fresh,clock).facts.find(i=>i.key===attempt.issue.key&&i.evidence===attempt.issue.evidence)
 if(!issue||!['read','snooze'].includes(attempt.action)||!Number.isSafeInteger(attempt.until)||attempt.action==='read'&&attempt.until!==0)throw new SaveConflict('הפעולה השתנתה או כבר טופלה. יש לרענן את הרשימה.')
 const intended={evidence:issue.evidence,until:attempt.until},current=preference(fresh,issue.key)
 if(equal(current,intended))return{...fresh,recovered:true}
 if(!equal(current,preference(base,issue.key)))throw new SaveConflict('התזכורת השתנתה במכשיר אחר. השינוי הקיים נשמר; יש לרענן לפני ניסיון נוסף.')
 if(attempt.action==='snooze'&&(attempt.until<clock.now||attempt.until>clock.now+7*86400000))throw Error('מועד התזכורת כבר אינו מתאים. יש לרענן ולבחור שוב.')
 let response:Response,result:any
 try{response=await fetcher('/api/actions?budget='+encodeURIComponent(budgetId),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(actionPreferencePayload(issue,fresh.actions.preferences,attempt.until,attempt.action,base.budget.value.accountId,true))})}catch{throw new SaveUncertain('לא ניתן לאשר אם התזכורת עודכנה. ניסיון חוזר יבדוק את אותה פעולה.')}
 try{result=await response.json()}catch{throw new SaveUncertain('תוצאת עדכון התזכורת לא התקבלה. יש לבדוק שוב.')}
 if(!response.ok){if(response.status===409)throw new SaveConflict(result.error||'התזכורת השתנתה.');if(response.status===401||response.status===403||response.status===404){await loadBudgetSnapshot(budgetId,signal,fetcher);throw new AccessError('החשבון או ההרשאה השתנו בזמן עדכון התזכורת.')}if(response.status>=500)throw new SaveUncertain('לא ניתן לאשר את עדכון התזכורת. יש לבדוק שוב את אותה פעולה.');throw Error(result.error||'התזכורת לא עודכנה.')}
 if(result.ok!==true)throw new SaveUncertain('לא התקבל אישור תקין לתזכורת. יש לבדוק שוב.')
 return{...fresh,actions:{...fresh.actions,preferences:{...fresh.actions.preferences,[issue.key]:intended}},recovered:false}
}

/** Optional facts retain the existing service privacy boundary and original action model. No intake or provider request is triggered. */
export async function loadActionSnapshot(budgetId:string,actor:Pick<import('./budget-api.ts').BudgetResponse,'accountId'|'accountEmail'>,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<ExpectationsSnapshot>{
 const snapshot=await loadExpectations(budgetId,actor,signal,fetcher);if(signal.aborted)throw signal.reason??Error('aborted');const integrations:ActionIntegrations={gmail:null,notices:[],backup:null,admin:false,errors:[]},viewer=snapshot.budget.spaces.find(s=>s.id===budgetId)?.role==='viewer'
 const read=async(kind:'gmail'|'backup')=>{const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();const timer=setTimeout(abort,15000);try{const path=kind==='gmail'?'/api/gmail?budget='+encodeURIComponent(budgetId)+'&accountId='+encodeURIComponent(actor.accountId):'/api/admin/backup?accountId='+encodeURIComponent(actor.accountId),response=await fetcher(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if([401,403,404].includes(response.status))throw new AccessError('החשבון או הרשאת החיבורים השתנו. יש לרענן.');if(!response.ok)throw Error('unavailable');const data=await response.json();if(data.accountId!==actor.accountId||data.accountEmail!==actor.accountEmail||kind==='gmail'&&data.budgetId!==budgetId)throw new AccessError('החשבון השתנה בזמן בדיקת החיבורים.');if(typeof data.connected!=='boolean'||kind==='gmail'&&(!Array.isArray(data.notices)||data.notices.some((n:any)=>!n||typeof n.id!=='string'||typeof n.subject!=='string'||!['info','review','done'].includes(n.state)||!Number.isSafeInteger(n.revision)))||kind==='backup'&&typeof data.ready!=='boolean')throw Error('invalid');if(kind==='gmail'){integrations.gmail=data;integrations.notices=data.notices}else{integrations.backup=data;integrations.admin=true}}catch(e){if(signal.aborted)throw e;if(e instanceof AccessError)throw e;integrations.errors.push(kind==='gmail'?'מצב Gmail ועדכוני הבנק לא נבדקו. אפשר לרענן או לפתוח את החיבור.':'מצב הגיבוי החיצוני לא נבדק. אפשר לרענן או לפתוח את הגיבוי.')}finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}}
 // Keep authorization-changing responses sequential; a denied Gmail read stops further optional reads.
 if(!viewer)await read('gmail');if(snapshot.actions.backupAdmin===true)await read('backup');return{...snapshot,integrations}
}
