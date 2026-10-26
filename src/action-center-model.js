import {monthlyDataCoverage,monthAt,creditCards,cashAccountList} from './budget.js';

// Facts are derived from their owning subsystem. Reading/snoozing never resolves them.
export function actionIssues(p,{scope='personal',asOf,backup=null,admin=false,locked=false,saveError='',reports=[],expectations=[],gmail=null,notices=[],day=asOf+'-01'}={}){
 const issues=[],add=(code,id,title,effect,action,target,evidence,severity='required')=>issues.push({key:scope+':'+code+':'+id,code,title,effect,action,target,evidence:JSON.stringify(evidence),severity});
 if(saveError)add('save.failed','device','השינויים במכשיר טרם נשמרו',saveError,'חזרה לשמירה',{screen:'save'},saveError);
 if(admin&&backup){
  if(backup.error)add('backup.failed','server','הגיבוי החיצוני לא הושלם',backup.error,'טיפול בגיבוי',{screen:'backup'},[backup.lastAttempt,backup.error]);
  else if(!backup.connected||!backup.ready||!backup.lastSuccess)add('backup.setup','server','נדרשת השלמת הגיבוי החיצוני',!backup.connected?'יש לחבר Google Drive.':!backup.ready?'יש להגדיר מפתח שחזור.':'יש לבצע גיבוי ראשון.','פתיחת הגיבוי',{screen:'backup'},[backup.connected,backup.ready,backup.lastSuccess]);
 }
 if(locked){add('import.unlock','vault','התקציב נעול','פתחו אותו כדי לבדוק את הנתונים והפעולות התלויות בתוכנו.','פתיחת התקציב',{screen:'unlock'},'locked');return issues;}
 for(const r of reports.filter(r=>!['committed','archived'].includes(r.state))){
  const failed=r.state==='failed',ready=r.state==='ready';
  add(failed?'import.failed':ready?'import.ready':'import.review',r.id,failed?'יש לבדוק דוח שלא פוענח':ready?'דוח מוכן לבדיקה ושמירה':'דוח ממתין לטיפול',r.name||'דוח שמור בתיבת הדוחות',failed?'בדיקת הקובץ':ready?'בדיקה ושמירה':'השלמת הקליטה',{screen:'report',reportId:r.id},[r.revision,r.state]);issues.at(-1).at=r.createdAt;issues.at(-1).key=scope+':import:'+r.id;
 }
 if(gmail?.connected&&gmail.enabled&&gmail.error)add('gmail.failed','mail','בדיקת הדואר לא הושלמה',gmail.error,'טיפול בחיבור Gmail',{screen:'gmail'},[gmail.lastChecked,gmail.error],'incomplete');
 for(const notice of notices.filter(n=>n.state==='review'))add('bank.notice',notice.id,'עדכון מהבנק ממתין לבדיקה',notice.subject,'בדיקת ההודעה',{screen:'notice',noticeId:notice.id},notice.revision,'incomplete');
 if(!p||!asOf)return issues;
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

export function actionIssueVisible(issue,preferences,now){const p=preferences?.[issue.key];return !p||p.evidence!==issue.evidence||!(p.until>now);}

export function validActionTarget(t){return !!t&&typeof t==='object'&&['save','backup','report','unlock','upload','gmail','notice'].includes(t.screen)&&Object.keys(t).every(k=>['screen','month','kind','target','reportId','noticeId'].includes(k))&&(!t.month||/^20\d{2}-(0[1-9]|1[0-2])$/.test(t.month))&&['target','reportId','noticeId'].every(k=>t[k]===undefined||typeof t[k]==='string'&&/^[\w:-]{1,100}$/.test(t[k]));}
