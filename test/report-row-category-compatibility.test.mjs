import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSupportedCategoryDrafts} from '../server/report-store.mjs';
test('a compatible rollback refuses transaction-specific category drafts before financial commit',()=>{
 const records=[{parsedDraft:{categoryChoices:[['transaction:cal-source-row','מזון']]}}];
 assert.throws(()=>assertSupportedCategoryDrafts(records,false),error=>error.status===409&&error.safeToExpose===true);
 assert.doesNotThrow(()=>assertSupportedCategoryDrafts(records,true));
});
test('legacy merchant-group categories and sources without category choices remain compatible',()=>{
 assert.doesNotThrow(()=>assertSupportedCategoryDrafts([null,{parsedDraft:null},{parsedDraft:{}},{parsedDraft:{categoryChoices:[['KSP','קניות']]}}],false));
});
