// Presentation-only destinations for the existing interface. No financial action
// or credential is accepted from a URL; authenticated handlers still own access.
const interfaceViews=new Set(['home','reports','report-history','savings','accounts','security','connections','backups','spaces','details','monthly','plans','overview']);
export function legacyInterfaceHref(search,view='home',reportId=''){
 if(!interfaceViews.has(view)||reportId&&!/^[a-f0-9-]{36}$/.test(reportId)||reportId&&view!=='reports')throw Error('יעד הממשק אינו תקין.');
 const current=new URLSearchParams(search),next=new URLSearchParams({budget:current.get('budget')||'personal'});
 if(view!=='home')next.set('mf-view',view);
 const year=current.get('year'),month=current.get('month');
 if(/^(?:19|20|21|22|23|24|25|26|27|28|29)\d{2}$/.test(year??'')){next.set('year',year);if(/^(?:0?[1-9]|1[0-2])$/.test(month??''))next.set('month',String(Number(month)));}
 if(reportId)next.set('mf-report',reportId);
 return '/?'+next;
}
export function readLegacyInterfaceDestination(search){
 const query=new URLSearchParams(search),view=query.get('mf-view')||'home';
 if(!interfaceViews.has(view)||!query.has('mf-view')&&!query.has('year'))return null;
 const reportId=query.get('mf-report')||'';if(reportId&&(view!=='reports'||!/^[a-f0-9-]{36}$/.test(reportId)))return null;
 const year=query.get('year'),month=query.get('month'),selectedMonth=/^(?:19|2\d)\d{2}$/.test(year??'')&&/^(?:0?[1-9]|1[0-2])$/.test(month??'')?year+'-'+String(Number(month)).padStart(2,'0'):null;
 return{budget:query.get('budget')||'personal',view,reportId,selectedMonth};
}
