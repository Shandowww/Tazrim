import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetFields,zero,clone,validatePlan,forecast,cashAccountForecast} from '../src/budget.js';
import {bankIdentity,bankPreview,applyBankImport,undoBankImport} from '../src/bank-import-model.js';

const legacyValues=()=>Object.fromEntries(Object.entries(zero()).filter(([key])=>!['rent','houseCommittee'].includes(key)));
const base=()=>({startMonth:'2026-01',opening:10000,buffer:100,horizon:12,defaults:legacyValues(),months:{},expenses:[],demo:false});
const movement=(line,amount,description)=>({line,date:'2026-02-10',reference:String(line),amountCents:-amount,description,valid:true,currency:'ILS',balanceCents:null,details:'',beneficiary:'',purpose:''});

test('Housing and investment movement labels share stable financial keys',()=>{
 const fields=new Map(budgetFields(base()).map(([key,label,kind])=>[key,{label,kind}]));
 for(const [key,label,kind] of [['rent','שכירות','expense'],['houseCommittee','ועד בית','expense'],['personalInvest','השקעות פרטיות','saving'],['sharedInvest','השקעות משותפות','saving']])assert.deepEqual(fields.get(key),{label,kind});
 assert.equal(zero().rent,0);assert.equal(zero().houseCommittee,0);
});

test('Legacy defaults, monthly records and account records validate without housing fields or data migration',()=>{
 const plan=base();plan.defaults.personalInvest=100;plan.defaults.sharedInvest=200;
 plan.months['2026-02']={values:clone(plan.defaults),actual:true,includesPlannedCard:false};
 plan.cashPlanning={accounts:[{id:'personal',label:'אישי',opening:10000,buffer:100,defaults:clone(plan.defaults)}],months:{'2026-02':{personal:{values:clone(plan.defaults),actual:true,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]};
 const before=clone(plan);assert.equal(validatePlan(plan),true);
 assert.equal(forecast(plan)[1].spending,0);assert.equal(forecast(plan)[1].saving,300);
 assert.equal(cashAccountForecast(plan,'personal')[1].spending,0);
 assert.deepEqual(plan,before);
 for(const key of ['rent','houseCommittee'])for(const value of [-1,NaN,Infinity,'100',100000001]){
  const invalid=clone(plan);invalid.defaults[key]=value;assert.equal(validatePlan(invalid),false);
 }
});

test('Explicit housing and investment classifications import once, preserve account scope and undo exactly',async()=>{
 const plan=base();plan.cashPlanning={accounts:[{id:'personal',label:'אישי',opening:10000,buffer:100,defaults:legacyValues()},{id:'shared',label:'משותף',opening:5000,buffer:100,defaults:legacyValues()}],months:{'2026-02':{personal:{values:legacyValues(),actual:false,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]};
 const before=clone(plan),rows=await Promise.all([movement(1,450000,'העברה'),movement(2,25000,'העברה'),movement(3,100000,'השקעה'),movement(4,200000,'השקעה')].map(row=>bankIdentity(row,'personal')));
 const keys=['rent','houseCommittee','personalInvest','sharedInvest'];
 const options={id:'housing-import',accountId:'personal',label:'אישי',fileName:'housing.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-11',coverageConfirmed:true,monthsConfirmed:true,rules:[],modes:{'2026-02':'full'},choices:Object.fromEntries(rows.map((row,index)=>[row.line,{field:keys[index],reviewed:true}]))};
 assert.ok(bankPreview(plan,rows,options).rows.every(row=>row.reviewed));
 const imported=applyBankImport(plan,rows,options);assert.equal(validatePlan(imported),true);assert.deepEqual(plan,before);
 assert.deepEqual(imported.bankImport.entries.map(entry=>entry.field),keys);
 for(const [index,key] of keys.entries()){
  assert.equal(imported.months['2026-02'].values[key],-rows[index].amountCents/100);
  assert.equal(imported.cashPlanning.months['2026-02'].personal.values[key],-rows[index].amountCents/100);
 }
 const month=forecast(imported)[1];assert.equal(month.spending,4750);assert.equal(month.saving,3000);assert.equal(month.net,-7750);
 assert.equal(imported.cashPlanning.months['2026-02'].shared,undefined);
 assert.throws(()=>applyBankImport(imported,rows,{...options,id:'repeat'}),/בלי תנועות חדשות/);
 const undone=undoBankImport(imported,options.id);delete undone.bankImport;assert.deepEqual(undone,plan);
});
