// Synthetic-only local browser probe. No budget API or real browser profile is used.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const executable=process.env.BUDGIT_TEST_BROWSER??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const directory=mkdtempSync(join(tmpdir(),'budgit-analysis-browser-')),profile=join(directory,'profile'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=String.raw`
setTimeout(async()=>{try{
 const results=[];todayMonth=()=> '2026-10';
 for(const [details,bank]of [[500,1000],[2500,5000],[5000,10000]]){
  plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];plan.startMonth='2024-11';
  plan.details=Array.from({length:details},(_,i)=>({id:'synthetic-'+i,name:'בית עסק '+i%200,category:'מזון',amount:(10000+i%9000)/100,method:'card1',month:'2026-10',date:'2026-10-12',number:'',accounting:'included',status:'cleared'}));
  plan.bankImport={version:1,accounts:[{id:'test',label:'חשבון מלאכותי',rules:[]}],batches:[{id:'batch',accountId:'test',file:'synthetic.csv',from:'2026-10-01',to:'2026-10-31',months:[]}],entries:Array.from({length:bank},(_,i)=>({key:i.toString(16).padStart(64,'0'),fingerprint:(i+bank).toString(16).padStart(64,'0'),accountId:'test',batchId:'batch',month:'2026-10',field:i%5?'variable':'card1',cents:-10000,source:{date:'2026-10-12',description:'בית עסק לבדיקה',details:'',beneficiary:'',purpose:'',reference:'',currency:'ILS'}}))};
  if(!validatePlan(plan))throw Error('Invalid synthetic fixture');
  loaded=true;loading=false;loadError='';budgets=[{id:'personal',role:'owner',name:'בדיקה'}];activeBudget='personal';tab='forecast';graphState();sharedAnalysis={enabled:true,metric:'identified',count:24,account:'',method:'',category:'',query:'',person:'',event:'',dateBasis:'billing'};setDataContextMonth('2026-10');reportView='overview';
  const measurements=[];for(let i=0;i<5;i++){const start=performance.now();render();void document.body.offsetHeight;measurements.push(performance.now()-start);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
  measurements.sort((a,b)=>a-b);results.push({details,bank,jsonChars:JSON.stringify(plan).length,renderAndLayoutMs:{median:measurements[2],p95:measurements[4]},domNodes:document.querySelectorAll('*').length,overflow:document.documentElement.scrollWidth>innerWidth,heapBytesAfter:performance.memory?.usedJSHeapSize??null});
 }
 document.body.dataset.benchmark=JSON.stringify({data:'synthetic only',rounds:5,viewport:390,rangeMonths:24,hardware:navigator.hardwareConcurrency,userAgent:navigator.userAgent,results});
}catch(error){document.body.dataset.benchmark=JSON.stringify({error:error.stack});}},100);
`;
let ws,chrome;try{
 const html=readFileSync('dist/index.html','utf8').replace(/<\/script><\/body>/,()=>probe+'</script></body>');writeFileSync(join(directory,'probe.html'),html);
 chrome=spawn(executable,['--headless','--disable-gpu','--no-sandbox','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 for(let i=0;i<100&&!existsSync(join(profile,'DevToolsActivePort'));i++)await pause(100);
 const port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0],targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
 ws=new WebSocket(targets.find(row=>row.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let sequence=0;const pending=new Map();ws.onmessage=event=>{const message=JSON.parse(event.data),request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:390,height:1600,deviceScaleFactor:1,mobile:true});await call('Page.navigate',{url:'file://'+join(directory,'probe.html')});
 let result;for(let i=0;i<120;i++){const output=await call('Runtime.evaluate',{expression:'document.body?.dataset.benchmark',returnByValue:true});if(output.result.value){result=JSON.parse(output.result.value);break;}await pause(250);}
 if(!result||result.error)throw Error(result?.error??'Browser benchmark timed out');console.log(JSON.stringify(result,null,2));
}finally{ws?.close();if(chrome){chrome.kill('SIGTERM');await new Promise(resolve=>{chrome.once('exit',resolve);setTimeout(resolve,2000);});}rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
