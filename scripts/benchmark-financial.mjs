// Synthetic-only capacity probe. Never point this at a real budget or database.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {queryFinancialTransactions} from '../server/financial-data.mjs';
import {createDemoPlan,validatePlan} from '../src/budget.js';

const tiers=[{details:500,bank:1000},{details:1500,bank:3000},{details:2500,bank:5000},{details:5000,bank:10000}];
const rounds=5;
const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const measure=async action=>{const start=performance.now(),value=await action();return{ms:performance.now()-start,value};};
const source={date:'2026-10-12',valueDate:'2026-10-12',description:'תשלום קבוע לבדיקה',details:'נתונים סינתטיים',beneficiary:'בית עסק לדוגמה',purpose:'',reference:'',currency:'ILS'};
function syntheticPlan(detailCount,bankCount){
 const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];
 plan.details=Array.from({length:detailCount},(_,i)=>({id:'synthetic-detail-'+i,name:'בית עסק '+(i%200),amount:(10000+i%9000)/100,category:'קניות / כללי',method:'card1',month:'2026-10',date:'2026-10-'+String(1+i%28).padStart(2,'0'),number:'',status:'cleared',accounting:'included'}));
 plan.bankImport={version:1,accounts:[{id:'synthetic-account',label:'חשבון בדיקה',rules:[]}],batches:[{id:'synthetic-batch',accountId:'synthetic-account',file:'synthetic.csv',from:'2026-10-01',to:'2026-10-31',months:[]}],entries:Array.from({length:bankCount},(_,i)=>({key:i.toString(16).padStart(64,'0'),fingerprint:(i+bankCount).toString(16).padStart(64,'0'),month:'2026-10',field:i%5===0?'card1':'variable',cents:-(10000+i%9000),batchId:'synthetic-batch',accountId:'synthetic-account',source:{...source,reference:'test-'+i}}))};
 assert.equal(validatePlan(plan),true,'synthetic plan must pass production validation');
 return plan;
}
async function runTier(tier){
 const plan=syntheticPlan(tier.details,tier.bank),directory=mkdtempSync(join(tmpdir(),'budgit-bench-')),path=join(directory,'synthetic.sqlite');
 const serialized=JSON.stringify(plan),jsonChars=serialized.length,jsonBytes=Buffer.byteLength(serialized);
 let db;try{
  const opened=openDatabase(path);db=opened.db;const DB=opened.DB,saves=[],searches=[],pageBytes=[];
  const save=async revision=>{
   const data=JSON.stringify(plan),date='2026-10-18';
   const sql=revision?'UPDATE plans SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?':'INSERT INTO plans(user_id,data,revision,updated_at) VALUES(?,?,?,?)';
   const args=revision?[data,date,'synthetic-user',revision]:['synthetic-user',data,1,date];
   const result=await DB.prepare(sql).bind(...args).run();assert.equal(result.meta.changes,1);
  };
  for(let i=0;i<rounds;i++){
   if(i)plan.details[0].amount=Math.round((plan.details[0].amount+0.01)*100)/100;
   const stored=await measure(()=>save(i));saves.push(stored.ms);
   const found=await measure(()=>queryFinancialTransactions(db,'personal:synthetic-user',{q:'בית עסק 42',limit:200}));searches.push(found.ms);
   assert.equal(found.value.revision,i+1);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM financial_transactions WHERE scope=?').get('personal:synthetic-user').count,tier.details+tier.bank);
   pageBytes.push(Buffer.byteLength(JSON.stringify(found.value)));
  }
  return {...tier,jsonChars,jsonBytes,exceedsImportGuard:jsonChars>2000000,saveMs:{median:percentile(saves,.5),p95:percentile(saves,.95)},searchMs:{median:percentile(searches,.5),p95:percentile(searches,.95)},searchResponseBytes:Math.max(...pageBytes),rssMbAfter:Math.round(process.memoryUsage().rss/1048576)};
 }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
}
const index=process.argv[2]===undefined?null:Number(process.argv[2]);
if(index!==null&&(!Number.isInteger(index)||index<0||index>=tiers.length))throw Error('Supply a tier index from 0 to '+(tiers.length-1));
const results=[];for(const tier of index===null?tiers:[tiers[index]])results.push(await runTier(tier));
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,rounds,storage:'temporary local SQLite',data:'synthetic only',results},null,2));
