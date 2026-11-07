import {clone,validatePlan,isUnconfiguredBudget,monthlyValues} from './budget.js';
import {buildReportInbox,reportInboxDraftForWrite,reportInboxPayer} from './report-inbox-controller.js';

/** Preparation calls the original manual controller against a copy. It has no
 * persistence or commit dependency. A proposed plan is evidence, never a save. */
export async function prepareAutomaticReport(plan,parsed,source,{target,parserVersion,budgetRevision,asOf,classifier,activityAPI}){
 if(!validatePlan(plan)||plan.format||isUnconfiguredBudget(plan)||!['bank','card'].includes(parsed.kind)||parsed.skip||!target||!source?.id||source.sourceHash!==parsed.hash||!Number.isSafeInteger(budgetRevision))throw Error('המקור או התקציב דורשים בדיקה ידנית לפני הכנה אוטומטית.');
 if(parsed.kind==='bank'&&(!Array.isArray(parsed.records)||parsed.records.some(r=>!r.valid||r.currency!=='ILS')))throw Error('דוח הבנק אינו שלם או כולל מטבע לא נתמך.');
 const item={...clone(parsed),id:source.id,name:source.name,size:source.size,storedId:source.id,storedRevision:source.revision,target,payer:reportInboxPayer(plan,target),decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},skip:false};
 const ui={blank:false,startMonth:plan.startMonth,groupId:crypto.randomUUID(),items:[item],newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map(),duplicates:0,error:'',merchantRules:[]};
 await buildReportInbox(plan,ui,{month:asOf.slice(0,7),today:asOf,classifier,activityAPI});
 const months=[...new Set(parsed.kind==='card'?[parsed.report?.dueDate?.slice(0,7)].filter(Boolean):parsed.records.map(r=>r.date.slice(0,7)))].sort();
 const ready=!!ui.build&&!ui.issues,rows=item.preview?.rows??[],counts={new:rows.filter(r=>r.state==='new'||r.entry&&!r.existing).length,duplicates:rows.filter(r=>r.state==='duplicate'||r.existing).length,conflicts:rows.filter(r=>r.state==='conflict').length,questions:item.questions.length+(ui.bankGroups?.length??0)};
 const partialBank=parsed.kind==='bank'&&item.preview?.months?.some(m=>!m.complete||m.mode!=='full');
 const warnings=[ui.error,item.warning,item.activityError,partialBank?'דוח הבנק אינו מכסה חודש מלא. ההצעה חלקית ואינה מחליפה דיווח חודשי מלא.':'',...item.questions.map(q=>q.type==='statement-conflict'?'יש להשוות לדוח שכבר נשמר ולבחור איזה דוח להשאיר.':q.type==='card-match'?'יש לבדוק התאמה לפירוט ידני קיים.':'נדרשת החלטה בבדיקת פרטי הדוח לפני קליטה.')].filter(Boolean);
 return{version:1,parserVersion,budgetRevision,sourceHash:source.sourceHash,target,kind:parsed.kind,status:ready?'review':'attention',draft:reportInboxDraftForWrite(ui,[item],parserVersion),proposedPlan:ready?ui.build:null,summary:{months,counts,warnings,before:months.map(month=>({month,values:monthlyValues(plan,month)})),after:ready?months.map(month=>({month,values:monthlyValues(ui.build,month)})):null,cardTotal:parsed.report?.amount??null,issuerNoticesSeparate:true},shadow:{eligible:ready&&!parsed.activity&&!warnings.length&&counts.conflicts===0,reason:ready?'הצעה מוכנה; אישור המשתמש עדיין נדרש.':'נדרשות החלטות לפני הכנת הצעה מלאה.'}};
}
