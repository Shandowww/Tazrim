import test from 'node:test';import assert from 'node:assert/strict';import {createDemoPlan,reconcileBankMonth,clone} from '../src/budget.js';
test('Bank reconciliation requires complete source endpoints and includes excluded/internal cash movements without adding expenses',()=>{
 const p=createDemoPlan('2026-10'),month='2026-09';p.bankImport={accounts:[{id:'a',label:'חשבון'}],entries:[{accountId:'a',month,cents:100000,field:'exclude',source:{date:'2026-09-01'}},{accountId:'a',month,cents:-50000,field:'card1',source:{date:'2026-09-15'}}],batches:[]};
 const coverage=(m,balance)=>({month:m,after:{bankCoverage:{accountId:'a',complete:true,accountComplete:true,from:m+'-01',to:m==='2026-08'?'2026-08-31':'2026-09-30',sourceBalanceCents:balance}}});
 p.bankImport.batches=[{accountId:'a',months:[coverage('2026-08',100000),coverage(month,150000)]}];
 const before=clone(p),result=reconcileBankMonth(p,month,'a','2026-10');assert.equal(result.status,'matched');assert.equal(result.movementCents,50000);assert.deepEqual(p,before);
 p.bankImport.entries[0].cents=90000;assert.equal(reconcileBankMonth(p,month,'a','2026-10').differenceCents,10000);
 p.bankImport.batches[0].months[1].after.bankCoverage.accountComplete=false;assert.equal(reconcileBankMonth(p,month,'a','2026-10').status,'insufficient');
});
