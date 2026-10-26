import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCardSources} from './sources.mjs';
const event=(source,cents,extra={})=>({source,cents,cardId:'card1',billingMonth:'2026-10',currency:'ILS',confirmed:true,reference:'001',...extra});
test('Bank card total owns cash flow, overlapping provider details explain it without adding again',()=>{
 const [r]=reconcileCardSources([{month:'2026-10',cardId:'card1',cents:100000}],[event('applePay',60000),event('cal',60000),event('cal',-10000,{reference:'refund'})]);
 assert.equal(r.cashFlowCents,100000);assert.equal(r.detailsCents,50000);assert.equal(r.unexplainedCents,50000);assert.equal(r.duplicates,1);assert.equal(r.complete,false);
});
test('Unbilled full installment prices, unknown identities and foreign currency never become card totals',()=>{
 const [r]=reconcileCardSources([],[event('applePay',120000,{fullInstallmentPrice:true}),event('cal',10000,{reference:''}),event('isracard',5000,{reference:'foreign',currency:'USD'})]);
 assert.equal(r.cashFlowCents,null);assert.equal(r.detailsCents,0);assert.equal(r.review,3);assert.equal(r.complete,false);
});
