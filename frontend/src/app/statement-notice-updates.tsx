import {useLocation} from 'react-router-dom'
import {withViewQuery} from './navigation-query'
import type {ActionIssue,PreferenceAttempt} from './action-center-api'
import type {ExpectationsSnapshot} from './report-expectations-api'
import Link from './link'
export function StatementNoticeUpdates({issues,snapshot,disabled,save}:{issues:ActionIssue[];snapshot:ExpectationsSnapshot;disabled:boolean;save:(attempt:PreferenceAttempt)=>Promise<unknown>}){
 const {search}=useLocation()
 return <section className="space-y-3"><h2 className="text-lg font-semibold">עדכונים והטבות</h2>{issues.slice(0,12).map(issue=><article className="surface space-y-3 rounded-xl p-4" key={issue.key}><h3 className="font-semibold">{issue.title}</h3><p className="break-words text-sm"><bdi>{issue.effect}</bdi></p><div className="flex flex-wrap gap-2"><Link modeFilter={false} className="inline-flex min-h-11 items-center rounded-xl border px-3 text-sm" href={withViewQuery('/notices/'+issue.target.noticeId,search)}>קריאת ההודעה והמקור</Link>{snapshot.actions.preferences[issue.key]?.evidence===issue.evidence?<span className="self-center text-sm text-muted-foreground">נקרא</span>:<button type="button" className="min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50" disabled={disabled} onClick={()=>void save({issue,action:'read',until:0})}>סימון כנקרא</button>}</div></article>)}<Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={withViewQuery('/notices',search)}>כל עדכוני המנפיקים ובדיקת דוחות</Link></section>
}
