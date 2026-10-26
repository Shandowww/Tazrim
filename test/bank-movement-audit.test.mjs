import test from 'node:test';
import assert from 'node:assert/strict';
import {bankMovementAudit,createDemoPlan,clone} from '../src/budget.js';

test('bank movement audit keeps direct spending separate from card settlement and internal transfers',()=>{
 const plan=createDemoPlan('2026-10');
 plan.bankImport={entries:[
  {month:'2026-04',field:'variable',cents:-321750,source:{date:'2026-04-12'}},
  {month:'2026-04',field:'variable',cents:20000},
  {month:'2026-04',field:'checks',cents:-50000},
  {month:'2026-04',field:'card1',cents:-528296},
  {month:'2026-04',field:'exclude',cents:-4000000},
  {month:'2026-04',field:'exclude',cents:4000000},
  {month:'2026-04',field:'transfers',cents:-501900},
  {month:'2026-04',field:'personalSaving',cents:-700000},
  {month:'2026-04',field:'loanRepayment',cents:-100000},
  {month:'2026-04',field:'salary',cents:1800000},
  {month:'2026-05',field:'variable',cents:-9900}
 ]};
 const before=clone(plan),audit=bankMovementAudit(plan,'2026-04');
 assert.equal(audit.totalCount,10);
 assert.deepEqual(audit.groups.direct,{count:3,debitCents:371750,creditCents:20000});
 assert.deepEqual(audit.groups.cards,{count:1,debitCents:528296,creditCents:0});
 assert.deepEqual(audit.groups.excluded,{count:2,debitCents:4000000,creditCents:4000000});
 assert.deepEqual(audit.groups.transfers,{count:1,debitCents:501900,creditCents:0});
 assert.equal(audit.groups.saving.debitCents,700000);
 assert.equal(audit.groups.loans.debitCents,100000);
 assert.equal(audit.groups.income.creditCents,1800000);
 assert.equal(audit.sourceMissing,9);
 assert.deepEqual(plan,before);
 assert.equal(bankMovementAudit(plan,'2026-05').groups.direct.debitCents,9900);
});

test('audit of a budget without bank imports is explicitly empty',()=>{
 const audit=bankMovementAudit(createDemoPlan('2026-10'),'2026-09');
 assert.equal(audit.totalCount,0);
 assert.equal(audit.groups.direct.debitCents,0);
});
