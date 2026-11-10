export function RefreshIndicator({progress,pending,hint}:{progress:number|null;pending:boolean;hint:string}){
 if(progress===null&&!pending)return null
 return <div className="budgit-refresh-indicator" role="status" aria-live="polite" data-refreshing={pending}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" style={{transform:pending?undefined:`rotate(${(progress??0)*270}deg)`}}><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${pending?74:Math.max(8,(progress??0)*82)} 100`}/></svg><span className="sr-only">{pending?'מרעננים את האפליקציה והנתונים…':hint}</span></div>
}
