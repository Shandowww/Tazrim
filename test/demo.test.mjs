import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,fields,forecast,validatePlan,monthAt,achievements,yearProgress,detailSummary} from '../src/budget.js';
test('Full demonstration fills recurring amounts, varied months, category charts and cheques without double-counting',()=>{
 for(const asOf of ['2026-10','2027-01']){
  const p=createDemoPlan(asOf);assert.equal(validatePlan(p),true);const rows=forecast(p);assert.equal(rows.length,24);
  for(const values of [p.defaults,...Object.values(p.months).map(r=>r.values)])for(const [key, ,kind] of fields)if(kind==='transfer')assert.equal(values[key]??0,0);else assert.ok(values[key]>0);
  for(let i=0;i<rows.length;i++){for(const key of ['income','spending','saving','planned','net','balance'])assert.notEqual(rows[i][key],0);assert.equal(Math.round(rows[i].balance*100),Math.round((i?rows[i-1].balance:p.opening)*100)+Math.round(rows[i].net*100));const summary=detailSummary(p,rows[i].month);assert.equal(summary.hasDetails,true);assert.equal(summary.over,false);assert.equal(summary.categories.length,8);assert.ok(summary.unexplained>0);}
  assert.ok(yearProgress(p,asOf.slice(0,4),asOf).totals.saving>0);assert.deepEqual(achievements(p,asOf,asOf),[]);
  assert.ok(p.details.some(e=>e.method==='checks'&&e.status==='pending'&&e.month===asOf));
  assert.equal(rows[0].planned,450);assert.equal(rows[6].planned,1770);
 }
});
