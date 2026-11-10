import {monthlyDataCoverage,monthAt,creditCards,cashAccountList} from './budget.js';
import {cardDateValid,cardDiscountReminderOn} from './card-metadata.js';

// Facts are derived from their owning subsystem. Notification preferences never resolve them.
export const ACTION_DISMISSED=-1;
export function actionIssueDismissed(issue,preferences){const p=preferences?.[issue.key];return p?.evidence===issue.evidence&&p.until===ACTION_DISMISSED;}
export function actionIssues(p,{scope='personal',asOf,backup=null,admin=false,locked=false,saveError='',reports=[],expectations=[],gmail=null,notices=[],statementNotices=[],incomingReports=null,day=asOf+'-01'}={}){
 const issues=[],add=(code,id,title,effect,action,target,evidence,severity='required')=>issues.push({key:scope+':'+code+':'+id,code,title,effect,action,target,evidence:JSON.stringify(evidence),severity});
 if(saveError)add('save.failed','device','השינויים במכשיר טרם נשמרו',saveError,'חזרה לשמירה',{screen:'save'},saveError);
 if(admin&&backup){
  if(backup.error)add('backup.failed','server','הגיבוי החיצוני לא הושלם',backup.error,'טיפול בגיבוי',{screen:'backup'},[backup.lastAttempt,backup.error]);
  else if(!backup.connected||!backup.ready||!backup.lastSuccess)add('backup.setup','server','נדרשת השלמת הגיבוי החיצוני',!backup.connected?'יש לחבר Google Drive.':!backup.ready?'יש להגדיר מפתח שחזור.':'יש לבצע גיבוי ראשון.','פתיחת הגיבוי',{screen:'backup'},[backup.connected,backup.ready,backup.lastSuccess]);
 }
 if(Number.isSafeInteger(incomingReports?.count)&&incomingReports.count>0)add('import.incoming','private','דוחות חדשים ממתינים לאישור פענוח',incomingReports.count+' קבצים בתיבת הסנכרון הפרטית. חשבון היעד יזוהה אחרי האישור.','פתיחת תיבת הסנכרון',{screen:'incoming'},[incomingReports.count,incomingReports.latest]);
 if(locked){add('import.unlock','vault','התקציב נעול','פתחו אותו כדי לבדוק את הנתונים והפעולות התלויות בתוכנו.','פתיחת התקציב',{screen:'unlock'},'locked');return issues;}
 for(const notice of statementNotices){
  const title={charge:'חיוב או עמלה צפויים',account:'נדרש טיפול בחשבון',promotion:'הטבה או מבצע',terms:'שינוי בתנאים',limit:'עדכון מסגרת אשראי',interest:'עדכון ריבית',points:'צבירת נקודות',club:'הטבות מועדון',update:'עדכון מהמנפיק'}[notice.category];
  if(!title||!/^[a-f0-9]{64}$/.test(notice.id??'')||typeof notice.text!=='string')continue;
  add('statement.notice',notice.id,title,notice.text.slice(0,240),'קריאת ההודעה והמקור',{screen:'statement-notice',noticeId:notice.id},notice.evidence,notice.attention?'incomplete':'info');
 }
 for(const r of reports.filter(r=>!['committed','archived'].includes(r.state))){
  const failed=r.state==='failed',ready=r.state==='ready';
  add(failed?'import.failed':ready?'import.ready':'import.review',r.id,failed?'יש לבדוק דוח שלא פוענח':ready?'דוח מוכן לבדיקה ושמירה':'דוח ממתין לטיפול',r.name||'דוח שמור בתיבת הדוחות',failed?'בדיקת הקובץ':ready?'בדיקה ושמירה':'השלמת הקליטה',{screen:'report',reportId:r.id},[r.revision,r.state]);issues.at(-1).at=r.createdAt;issues.at(-1).key=scope+':import:'+r.id;
 }
 if(gmail?.connected&&gmail.enabled&&gmail.error)add('gmail.failed','mail','בדיקת הדואר לא הושלמה',gmail.error,'טיפול בחיבור Gmail',{screen:'gmail'},[gmail.lastChecked,gmail.error],'incomplete');
 const noticeText=text=>String(text??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 for(const notice of notices.filter(n=>n.state==='review'&&!statementNotices.some(statement=>statement.issuer!=='unknown'&&statement.issuer===n.issuer&&statement.accountReference&&statement.accountReference===n.accountReference&&noticeText(statement.text)===noticeText(n.text))))add('bank.notice',notice.id,'עדכון מהבנק ממתין לבדיקה',notice.subject,'בדיקת ההודעה',{screen:'notice',noticeId:notice.id},notice.revision,'incomplete');
 if(!p||!asOf)return issues;
 if(cardDateValid(day))for(const card of creditCards(p)){
  const reminder=cardDiscountReminderOn(card.discountEndsOn);
  if(!reminder||day<reminder||card.removedFrom&&card.removedFrom<=day.slice(0,7))continue;
  const ended=day>card.discountEndsOn,date=card.discountEndsOn.split('-').reverse().join('.'),fee=card.feeAfterDiscount===undefined?'':' · עלות לאחר ההנחה: '+new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(card.feeAfterDiscount);
  add('card.discount-ending',card.id,ended?'ההנחה בדמי הכרטיס הסתיימה':'ההנחה בדמי הכרטיס מסתיימת בקרוב',card.name+(card.alias?' · '+card.alias:'')+' · '+date+fee,'פרטי הכרטיס וחידוש ההנחה',{screen:'card',target:card.id},[card.discountEndsOn,card.feeAfterDiscount??null,card.issuerPhone??null],'incomplete');
 }
 for(const rule of expectations){
  if(!rule.enabled||!['bank','card'].includes(rule.kind)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(rule.startMonth)||!Number.isInteger(rule.dueDay)||rule.dueDay<1||rule.dueDay>31||!Number.isInteger(rule.graceDays)||rule.graceDays<0||rule.graceDays>31)continue;
  const entity=(rule.kind==='card'?creditCards(p):cashAccountList(p)).find(e=>e.id===rule.target);if(!entity)continue;
  // Only completed source months; delivery belongs to the following month.
  for(let m=rule.startMonth,count=0;m<asOf&&count<120;m=monthAt(m,1),count++){
   if(m<p.startMonth||entity.removedFrom&&m>=entity.removedFrom||(rule.exceptions??[]).includes(m))continue;
   const next=monthAt(m,1),end=new Date(next+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
   const due=new Date(next+'-'+String(Math.min(rule.dueDay,end.getUTCDate())).padStart(2,'0')+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+rule.graceDays);
   if(day<=due.toISOString().slice(0,10))continue;
   const coverage=monthlyDataCoverage(p,m,asOf),entry=(rule.kind==='card'?coverage.cards:coverage.accounts).find(e=>e.id===rule.target);
   if(entry?.status==='file'||entry?.status==='no-transactions')continue;
   // A staged, assigned report replaces the missing-source task with its review task.
   if(reports.some(r=>r.kind===rule.kind&&r.target===rule.target&&r.month===m&&!['archived','committed'].includes(r.state)))continue;
   add('report.overdue',rule.kind+':'+rule.target+':'+m,'דוח צפוי טרם התקבל',(entity.name??entity.label)+' · '+m,'העלאת הדוח',{screen:'upload',month:m,kind:rule.kind,target:rule.target},[m,rule.dueDay,rule.graceDays],'incomplete');
  }
 }
 return issues;
}

export function actionIssueVisible(issue,preferences,now){const p=preferences?.[issue.key];return !p||p.evidence!==issue.evidence||p.until!==ACTION_DISMISSED&&!(p.until>now);}

export function validActionTarget(t){return !!t&&typeof t==='object'&&['save','backup','report','unlock','upload','gmail','notice','statement-notice','incoming','card'].includes(t.screen)&&Object.keys(t).every(k=>['screen','month','kind','target','reportId','noticeId'].includes(k))&&(!t.month||/^20\d{2}-(0[1-9]|1[0-2])$/.test(t.month))&&['target','reportId','noticeId'].every(k=>t[k]===undefined||typeof t[k]==='string'&&/^[\w:-]{1,100}$/.test(t[k]))&&(t.screen!=='card'||/^card(?:[12]|_[a-zA-Z0-9-]{1,70})$/.test(t.target??''));}

export function nextActionAnnouncement(active,preferences,announced){return active.find(i=>i.severity==='required'&&!announced.has(i.key+i.evidence)&&preferences[i.key]?.evidence!==i.evidence);}
export function actionPreferencePayload(issue,preferences,until,action,accountId,compare=false){const prior=Object.hasOwn(preferences,issue.key)?preferences[issue.key]:null;return{...(['read','dismiss'].includes(action)?{action}:{}),key:issue.key,evidence:issue.evidence,until,accountId,...(compare?{previous:prior?{evidence:prior.evidence,until:prior.until}:null}:{})};}
