import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {demoPlan,clone} from '../src/budget.js';
function context(search=''){const app={innerHTML:'',addEventListener(){}},notice={textContent:'',classList:{add(){},remove(){}}},store=new Map(),boot=[];const document={getElementById:id=>id==='app'?app:notice,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},activeElement:{blur(){}},scrollingElement:{scrollTop:0}};const window={monthlyFlowTheme:{choice:'system'},addEventListener(){},location:{reload(){}},innerHeight:900};const c=vm.createContext({document,window,location:{hash:'',pathname:'/',search,origin:'https://budget.test',hostname:'budget.test'},history:{replaceState(){}},sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto,btoa,atob,TextEncoder,TextDecoder,URLSearchParams,URL,Blob,FormData:class extends Map{constructor(form){super(Object.entries(form.values));}},setTimeout:()=>1,clearTimeout(){},queueMicrotask:fn=>boot.push(fn),Intl,console,async fetch(){throw Error('unexpected request');}});for(const file of ['space-model.js','reconciliation-model.js','card-billing-model.js','budget.js','investment-model.js','vault.js','amount-inputs.js','client.js','investment.js','planner.js','details.js','spaces.js','security.js'])vm.runInContext(fs.readFileSync('src/'+file,'utf8').replaceAll(/^import .*;\n/gm,'').replaceAll(/^export /gm,''),c);return{c,app,notice};}
test('A new identity loads an empty budget without leaking the previous example',async()=>{const{c,app}=context();c.fetch=async url=>({ok:true,json:async()=>url==='/api/budgets'?{budgets:[{id:'personal',name:'Private',role:'owner'}],accountEmail:'new@example.com',accountId:'new'}:{plan:null,revision:0,accountEmail:'new@example.com',accountId:'new'}});assert.equal(await vm.runInContext('load()',c),true);assert.equal(vm.runInContext('plan.demo',c),false);assert.equal(vm.runInContext('plan.opening',c),0);assert.equal(vm.runInContext('Object.values(plan.defaults).every(v=>v===0)',c),true);assert.equal(app.innerHTML.includes('תקציב לדוגמה'),false);});
test('Loading encrypted data renders only an unlock screen; save and financial tools remain unavailable',async()=>{const{c,app}=context(),v=await vm.runInContext("createVault(demoPlan,'test password long enough','personal:u')",c);c.fetch=async url=>({ok:true,json:async()=>url==='/api/budgets'?{budgets:[{id:'personal',name:'Private',role:'owner'}],accountEmail:'u@example.com',accountId:'u'}:{plan:v.envelope,revision:4,accountEmail:'u@example.com',accountId:'u'}});assert.equal(await vm.runInContext('load()',c),true);assert.equal(vm.runInContext('loaded',c),false);assert.equal(vm.runInContext('vaultKey',c),null);assert.equal(app.innerHTML.includes('התקציב מוצפן'),true);assert.equal(app.innerHTML.includes('10,000'),false);assert.equal(app.innerHTML.includes('settings-form'),false);});
test('Encryption setup cannot save an outdated snapshot after a later budget edit',async()=>{const{c}=context();await vm.runInContext("(async()=>{loaded=true;loading=false;budgets=[{id:'personal',role:'owner'}];plan.demo=false;securitySetup=await createVault(plan,'test password long enough','personal:u');securitySetup.snapshot=JSON.stringify(plan);plan.opening+=1;})()",c);let calls=0;c.fetch=async()=>{calls++;throw Error('must not save');};c.form={id:'security-confirm',values:{confirmed:'on'}};vm.runInContext('securitySubmit(form)',c);assert.equal(calls,0);assert.equal(vm.runInContext('!!securitySetup',c),true);});
test('Unsaved work blocks both locking and switching; successful lock removes decrypted budget and key',async()=>{const{c,app}=context();await vm.runInContext("(async()=>{loaded=true;loading=false;plan=clone(demoPlan);plan.demo=false;const testVault=await createVault(plan,'test password long enough','personal:u');vaultEnvelope=testVault.envelope;vaultKey=testVault.key;vaultRaw=testVault.rawKey;dirty=true;})()",c);vm.runInContext("securityAction('vault-lock')",c);assert.equal(vm.runInContext('loaded',c),true);assert.equal(vm.runInContext('canSwitchBudget()',c),false);vm.runInContext("dirty=false;securityAction('vault-lock')",c);assert.equal(vm.runInContext('loaded',c),false);assert.equal(vm.runInContext('vaultKey',c),null);assert.equal(vm.runInContext('plan.opening',c),0);assert.equal(app.innerHTML.includes('התקציב מוצפן'),true);});

test('Demo preview populates progress and scenarios without reading or saving any real budget',async()=>{
 const {c,app,notice}=context('?demo=1');let requests=0;c.fetch=async()=>{requests++;throw Error('Demo must not access budget APIs');};
 assert.equal(await vm.runInContext('load()',c),true);assert.equal(requests,0);
 assert.equal(vm.runInContext('plan.demo',c),true);assert.ok(vm.runInContext('Object.keys(plan.months).length',c)>=7);
 assert.equal(app.innerHTML.includes('ממתין לעדכון'),false);assert.ok(app.innerHTML.includes('להמחשה בלבד · ללא הישגים או חגיגות'));
 assert.ok(app.innerHTML.includes('חזרה לתקציב שלי'));assert.ok(app.innerHTML.includes('מצב דוגמה · ללא שמירה'));
 vm.runInContext("plan.opening=123;dirty=true",c);await vm.runInContext('save()',c);assert.equal(requests,0);assert.match(notice.textContent,/אינה נשמרת/);
 vm.runInContext("tab='purchase';render()",c);assert.ok(app.innerHTML.includes('מדיח כלים'));assert.ok(app.innerHTML.includes('אופניים'));
 vm.runInContext("tab='forecast';render()",c);assert.ok(app.innerHTML.includes('סיכום התקופה'));
});
test('Demo keeps future sample progress visible without granting achievements',async()=>{
 const {c,app}=context('?demo=1');await vm.runInContext('load()',c);
 vm.runInContext("selectedMonth=monthAt(plan.startMonth,12);render()",c);
 assert.equal(app.innerHTML.includes('ממתין לעדכון'),false);assert.equal(vm.runInContext('achievements(plan,selectedMonth,todayMonth()).length',c),0);
});

test('Starting capital inherits actual contributions, excludes estimates, and goal offer never silently changes target',()=>{const {c}=context();vm.runInContext("plan=clone(demoPlan);plan.months={'2026-01':{values:{...plan.defaults,personalInvest:1000,sharedInvest:2000},actual:true},'2026-02':{values:{...plan.defaults,personalInvest:9000,sharedInvest:9000},actual:false}};investmentUI.initial=null;investmentUI.monthly=3500;investmentMonthlyTouched=true;",c);assert.equal(vm.runInContext('investmentDeposits()',c),3000);assert.match(vm.runInContext("investmentField('initial','initial')",c),/value=""[^>]*placeholder="3000"/);const goal=vm.runInContext('plan.goals?.invest',c);assert.match(vm.runInContext('investmentGoalOffer()',c),/עדכון היעד/);assert.equal(vm.runInContext('plan.goals?.invest',c),goal);vm.runInContext('investmentDismissed=3500',c);assert.equal(vm.runInContext('investmentGoalOffer()',c),'');});

test('Graphs own the annual report while monthly remains an input page and cash-flow forecasting remains reachable',()=>{const {c}=context('?demo=1');vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);vm.runInContext("plan=createDemoPlan(todayMonth());loaded=true;loading=false;selectedMonth=todayMonth();tab='monthly'",c);assert.doesNotMatch(vm.runInContext('monthlyView()',c),/סיכום חודשי ויעדים שנתיים|goal-ring|annual-grid/);vm.runInContext("tab='forecast'",c);const reports=vm.runInContext('forecastView()',c);assert.match(reports,/תמונת הנתונים/);assert.doesNotMatch(reports,/timeline-chart|תחזית היתרה|<h2>פירוט לפי חודש/);vm.runInContext("reportView='comparison'",c);assert.match(vm.runInContext('forecastView()',c),/הכסף לאורך זמן/);vm.runInContext("chartMode='flow'",c);const flow=vm.runInContext('forecastView()',c);assert.match(flow,/תחזית היתרה/);assert.doesNotMatch(flow,/timeline-chart/);});

test('Demo monthly save starts disabled, activates after edits and returns disabled after confirming updates',async()=>{const {c,app}=context('?demo=1');c.guardSavingsDraft=()=>true;await vm.runInContext('load()',c);vm.runInContext("tab='monthly';render()",c);const saveButton=()=>app.innerHTML.match(/<button[^>]*class="btn primary monthly-save"[^>]*>/)[0];assert.match(saveButton(),/disabled/);vm.runInContext("const edited=clone(plan);edited.months[selectedMonth].values.otherIncome+=100;monthlyPending=selectedMonth;mutate(edited)",c);assert.doesNotMatch(saveButton(),/disabled/);await vm.runInContext('commitMonthly(true)',c);assert.equal(vm.runInContext('dirty',c),false);assert.match(saveButton(),/disabled/);});

test('Unlocking a historical budget opens current month without changing saved budget dates or values',()=>{
 const {c}=context();vm.runInContext("todayMonth=()=> '2026-10';const saved=clone(demoPlan);saved.startMonth='2026-01';const beforeUnlock=JSON.stringify(saved);acceptDecrypted(saved,null,null);",c);
 assert.equal(vm.runInContext('selectedMonth',c),'2026-10');assert.equal(vm.runInContext('JSON.stringify(plan)===beforeUnlock',c),true);
});

test('Expense explorer renders from local detail and reads visible filters before saving a view',()=>{
 const {c}=context('?demo=1');
 vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("plan=createDemoPlan(todayMonth());loaded=true;loading=false;graphState();reportView='explore'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/חקירת הוצאות/);
 assert.match(html,/נטו בפירוט/);
 assert.match(html,/data-explore-save disabled/);
 c.form={reportValidity:()=>true,values:{'explore-count':'12','explore-end':'2026-09','explore-category':'ילדים ותינוקות','explore-method':'card1','explore-query':'גן'}};
 const filters=vm.runInContext('readExploreFilters(form)',c);
 assert.equal(filters.count,12);
 assert.equal(filters.end,'2026-09');
 assert.equal(filters.category,'ילדים ותינוקות');
 assert.equal(filters.method,'card1');
 assert.equal(filters.query,'גן');
});

test('Category history shows a three-closed-month trend with an adjustable money threshold',()=>{
 const {c}=context('?demo=1');
 vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');loaded=true;loading=false;graphState();reportView='categories';categoryUI.end='2026-10'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/מגמה בשלושה חודשים סגורים/);
 assert.match(html,/name="trend-threshold"/);
 assert.match(html,/עד ספטמבר|עד ספט׳|עד חודש/);
 assert.match(html,/נתוני דוגמה/);
});

test('Data opens with three closed-month insights and distinguishes partial category detail',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.demo=false;plan.months={'2026-08':{values:{...zero(),card1:1500},actual:true,includesPlannedCard:false},'2026-09':{values:{...zero(),card1:2000},actual:true,includesPlannedCard:false}};plan.expenses=[];plan.cheques=[];plan.details=[{id:'one',name:'קנייה',month:'2026-09',date:'2026-09-10',amount:200,category:'מזון',method:'card1',status:'cleared',accounting:'included',number:''}];loaded=true;loading=false;graphState()",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/name="data-context-month"[^>]*value="2026-09"/);assert.match(html,/בסיס: חודש תקציבי; פירוט לפי חודש חיוב/);assert.match(html,/כל החשבונות והכרטיסים בתקציב/);assert.equal([...html.matchAll(/class="data-overview-card"/g)].length,3);
 assert.match(html,/2,000/);assert.match(html,/\+500/);assert.match(html,/data-overview-category="מזון"/);assert.match(html,/data-overview-open="explore"[^>]*><span>הוצאות בחודש/);assert.match(html,/1,800/);assert.match(html,/פירוט חלקי/);
 vm.runInContext("exploreUI={count:1,end:'2026-09',category:'',method:'',query:''};exploreFromOverview=true;reportView='explore'",c);const detail=vm.runInContext('actualReportsView()',c);assert.match(detail,/data-explore-back/);assert.match(detail,/סך ההוצאות בדיווח החודשי:[\s\S]*?2,000/);assert.match(detail,/1,800[\s\S]*?ללא פירוט/);
 assert.match(html,/<details class="data-more-views"/);assert.doesNotMatch(html,/class="timeline-chart"/);
 vm.runInContext("monthlyPending='2026-09';reportView='overview'",c);const pending=vm.runInContext('actualReportsView()',c);assert.match(pending,/עריכה שלא נשמרה/);assert.doesNotMatch(pending,/class="data-overview-card"/);assert.equal(vm.runInContext('dataFocusMonth',c),'2026-09');
 vm.runInContext("monthlyPending='';setDataContextMonth('2026-08');reportView='comparison'",c);assert.match(vm.runInContext('actualReportsView()',c),/name="graph-end"[^>]*value="2026-08"/);
 vm.runInContext("reportView='changes'",c);assert.match(vm.runInContext('actualReportsView()',c),/value="2026-08" selected/);
 vm.runInContext("reportView='categories'",c);assert.match(vm.runInContext('actualReportsView()',c),/name="data-end"[^>]*value="2026-08"/);
 vm.runInContext("exploreUI.end='2026-07';familyReviewSelectedMonth='2026-07';setDataContextMonth('2026-11');reportView='overview'",c);const future=vm.runInContext('actualReportsView()',c);assert.match(future,/חודש עתידי · ללא דיווח בפועל/);assert.doesNotMatch(future,/class="data-overview-card"/);assert.equal(vm.runInContext('exploreUI.end',c),'2026-07');assert.equal(vm.runInContext('familyReviewSelectedMonth',c),'2026-07');
 vm.runInContext("plan.months={};reportView='overview';graphState()",c);assert.match(vm.runInContext('actualReportsView()',c),/אין עדיין חודש סגור עם דיווח בפועל/);
});

test('Comparison opens on the expense scale and labels a shared scale when income is added',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.months={'2026-09':{values:{...zero(),salary:20000,card1:2000},actual:true,includesPlannedCard:false}};plan.expenses=[];plan.cheques=[];loaded=true;loading=false;graphState()",c);
 let html=vm.runInContext('comparisonReportsView()',c),chart=html.match(/<svg class="timeline-chart"[\s\S]*?<\/svg>/)[0];
 assert.match(chart,/data-graph-metric="reportedSpending"/);assert.doesNotMatch(chart,/data-graph-metric="income"/);assert.match(chart,/2K/);assert.doesNotMatch(chart,/20K/);assert.doesNotMatch(html,/סולם משותף לשני הנתונים/);
 vm.runInContext("graphUI.second='income'",c);html=vm.runInContext('comparisonReportsView()',c);chart=html.match(/<svg class="timeline-chart"[\s\S]*?<\/svg>/)[0];
 assert.match(chart,/data-graph-metric="income"/);assert.match(chart,/20K/);assert.match(html,/סולם משותף לשני הנתונים/);
 vm.runInContext("graphUI.second='';plan.expenses=[{id:'large',name:'תכנון',amount:48000,fees:0,firstMonth:'2026-09',payments:1,source:'direct',kind:'expense'}]",c);html=vm.runInContext('comparisonReportsView()',c);chart=html.match(/<svg class="timeline-chart"[\s\S]*?<\/svg>/)[0];assert.match(chart,/2K/);assert.doesNotMatch(chart,/50K/);
 vm.runInContext("reportView='overview';dataFocusMonth='2026-09'",c);const overview=vm.runInContext('dataOverviewView()',c);assert.match(overview,/הוצאות בחודש<\/span><strong><bdi[^>]*>2,000/);assert.match(overview,/סך ההוצאות כולל תכנון: <bdi[^>]*>50,000/);
 vm.runInContext("graphUI.first='spending'",c);html=vm.runInContext('comparisonReportsView()',c);chart=html.match(/<svg class="timeline-chart"[\s\S]*?<\/svg>/)[0];assert.match(chart,/50K/);assert.match(html,/הוצאות כולל תכנון/);
});
test('The transfer drilldown shows imported bank evidence and an unmatched monthly amount safely',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("plan=createDemoPlan('2026-10');plan.demo=false;plan.months['2026-04'].values={...zero(),card1:5282.96,transfers:57019};plan.bankImport={accounts:[{id:'bank',label:'בנק'}],entries:[{month:'2026-04',field:'transfers',accountId:'bank',cents:-5000000,source:{date:'2026-04-06',description:'העברה <חשבון>',beneficiary:'חשבון אחר'}}]}",c);
 const html=vm.runInContext("graphTransferSources('2026-04',monthlySpendingBreakdown(plan,'2026-04'))",c);
 assert.match(html,/מקור ״העברות יוצאות״/);assert.match(html,/57,019/);assert.match(html,/50,000/);assert.match(html,/7,019/);assert.match(html,/העברה &lt;חשבון&gt;/);assert.doesNotMatch(html,/<חשבון>/);
 assert.doesNotMatch(html,/data-graph-internal-transfers/);
 vm.runInContext("plan.bankImport.entries.push({month:'2026-04',field:'transfers',accountId:'bank',cents:-701900,source:{date:'2026-04-09',description:'העברה שנייה',beneficiary:''}})",c);
 assert.match(vm.runInContext("graphTransferSources('2026-04',monthlySpendingBreakdown(plan,'2026-04'))",c),/data-graph-internal-transfers="2026-04"/);
});

test('Recurring expense view keeps candidates separate from the budget forecast',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.demo=false;plan.months={};plan.details=[];for(const [index,month] of ['2026-07','2026-08','2026-09'].entries()){plan.months[month]={values:{...zero(),card1:100},actual:true,includesPlannedCard:false};plan.details.push({id:'fee-'+month,name:'מנוי',month,date:month+'-10',amount:100,category:'בילויים / מנויים ודיגיטל',method:'card1',status:'cleared',accounting:'included',number:''});}loaded=true;loading=false;graphState();reportView='recurring'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/התחייבויות חוזרות/);assert.match(html,/זהו חיוב חוזר/);assert.match(html,/data-recurring-explore=\"מנוי\"/);
 assert.match(html,/אינו מתווסף לתחזית/);
 assert.doesNotMatch(html,/data-recurring-status="confirmed"[^>]*disabled/);
});

test('Periodic costs view distinguishes preparation, overdue and an open unsaved editor',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.demo=false;plan.periodicCosts=[{id:'insurance',name:'ביטוח רכב',amount:1200,dueMonth:'2026-12',repeat:'yearly',paidMonths:[]}];loaded=true;loading=false;graphState();reportView='periodic'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/הוצאות תקופתיות/);assert.match(html,/ביטוח רכב/);assert.match(html,/היערכות עד למועד/);assert.match(html,/אינם יוצרים חיוב או משנים את התחזית/);
 assert.equal(vm.runInContext('hasDetailDraft()',c),false);
 vm.runInContext("periodicDraft={id:'',name:'',amount:0,dueMonth:'2026-10',repeat:'once',paidMonths:[]}",c);
 assert.equal(vm.runInContext('hasDetailDraft()',c),true);
 assert.match(vm.runInContext('actualReportsView()',c),/id="periodic-form"/);
});

test('Insight scenario view keeps a potential reduction separate from actual spending and guards edits',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);vm.runInContext(fs.readFileSync('src/insight-scenarios-client.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.demo=false;loaded=true;loading=false;graphState();reportView='scenarios'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/מה אם נשנה הוצאה/);assert.match(html,/צמצום אפשרי בתקופה/);assert.match(html,/חיסכון אפשרי אינו הישג/);assert.match(html,/id="insight-scenario-form"/);
 assert.equal(vm.runInContext('hasDetailDraft()',c),false);
 vm.runInContext('insightEdited=true',c);assert.equal(vm.runInContext('hasDetailDraft()',c),true);
 vm.runInContext('insightReset()',c);assert.equal(vm.runInContext('hasDetailDraft()',c),false);
});

test('Family review screen shows closed-month category choices and uncovered spending separately',()=>{
 const {c}=context();vm.runInContext(fs.readFileSync('src/reports.js','utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');plan.demo=false;loaded=true;loading=false;graphState();reportView='family'",c);
 const html=vm.runInContext('actualReportsView()',c);
 assert.match(html,/סקירה משפחתית/);assert.match(html,/היה שווה/);assert.match(html,/לצמצם בפעם הבאה/);
 assert.match(html,/data-family-status="worthwhile"/);assert.match(html,/data-family-explore=/);
 assert.match(html,/ללא פירוט או התאמה|הפירוט גבוה מסך ההוצאות/);
 assert.match(html,/אין לייחס את הפער לאחת הבחירות/);
});

test('Shared analysis preserves metric and filters between six views and refuses unsupported monthly slicing',()=>{
 const {c}=context('?demo=1');for(const file of ['reports.js','consumption-client.js','analysis-filters-client.js','periodic-links-client.js'])vm.runInContext(fs.readFileSync('src/'+file,'utf8'),c);
 vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');loaded=true;loading=false;graphState();sharedAnalysis.enabled=true;sharedAnalysis.metric='detail';sharedAnalysis.method='card1';sharedAnalysis.count=3;setDataContextMonth('2026-09')",c);
 const before=vm.runInContext('JSON.stringify(plan)',c);for(const view of ['overview','comparison','changes','categories','explore','consumption']){vm.runInContext(`reportView='${view}'`,c);const html=vm.runInContext('actualReportsView()',c);assert.match(html,/גרסת מדד 1/);assert.match(html,/shared-method/);assert.equal(vm.runInContext('sharedAnalysis.method',c),'card1');assert.doesNotMatch(html,/NaN/);}
 vm.runInContext("sharedAnalysis.metric='reported'",c);assert.match(vm.runInContext('actualReportsView()',c),/החיתוך אינו נתמך/);assert.equal(vm.runInContext('JSON.stringify(plan)',c),before);
 vm.runInContext("activeBudget='another';graphState()",c);assert.equal(vm.runInContext('sharedAnalysis.enabled',c),false);assert.equal(vm.runInContext('sharedAnalysis.method',c),'');
});

test('Common saved view retains metric version, filters and tags; month context describes the active slice',()=>{
 const {c}=context('?demo=1');for(const file of ['reports.js','consumption-client.js','analysis-filters-client.js','periodic-links-client.js','household-review-client.js'])vm.runInContext(fs.readFileSync('src/'+file,'utf8'),c);vm.runInContext("todayMonth=()=> '2026-10';plan=createDemoPlan('2026-10');loaded=true;loading=false;graphState();loadSharedView({id:'v',name:'בדיקה',metric:'identified',metricVersion:1,grouping:'category',count:3,end:'2026-09',category:'מזון',method:'card1',account:'unassigned',query:'סופר',person:'משותף',event:'חג'})",c);assert.equal(vm.runInContext('sharedAnalysis.metric',c),'identified');assert.equal(vm.runInContext('sharedAnalysis.person',c),'משותף');assert.match(vm.runInContext('dataContextBar()',c),/ללא שיוך חשבון ידוע/);assert.doesNotMatch(vm.runInContext('dataContextBar()',c),/כל החשבונות והכרטיסים בתקציב/);assert.match(vm.runInContext('sharedAnalysisBar()',c),/שמורות עם הגדרת המדד/);
});
