import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetSpaceScope,spaceEntityKey,spaceDeviceKey,visibleBudgetSpaces,chooseBudgetSpace} from '../src/space-model.js';

const spaces=[{id:'personal',hasData:false,role:'owner'},{id:'house',role:'viewer'}];
test('Personal namespaces and entity references never collide between users or spaces',()=>{
 const tal=budgetSpaceScope('tal'),linoi=budgetSpaceScope('linoi'),house=budgetSpaceScope('tal','house');
 assert.notEqual(tal,linoi);assert.equal(house,budgetSpaceScope('linoi','house'));
 assert.equal(new Set([tal,linoi,house].map(scope=>spaceEntityKey(scope,'account','hapoalim'))).size,3);
 assert.notEqual(spaceEntityKey(tal,'card','same'),spaceEntityKey(tal,'goal','same'));
 assert.notEqual(spaceDeviceKey('tal'),spaceDeviceKey('linoi'));
 assert.throws(()=>budgetSpaceScope(''));assert.throws(()=>spaceEntityKey(tal,'account',''));
});
test('Shared-only hides only a known-empty personal space and cannot hide saved or encrypted data',()=>{
 assert.deepEqual(visibleBudgetSpaces(spaces,{personal:'later'}).map(s=>s.id),['house']);
 for(const hasData of [true,undefined])assert.equal(visibleBudgetSpaces([{...spaces[0],hasData},spaces[1]],{personal:'later'}).length,2);
 assert.equal(visibleBudgetSpaces([spaces[0]],{personal:'later'}).length,1);
 assert.equal(visibleBudgetSpaces(spaces,{personal:'enabled'}).length,2);
});
test('Stored selections are checked against accessible spaces; unknown IDs do not create spaces',()=>{
 assert.equal(chooseBudgetSpace(spaces,{active:'spouse-private'}),'personal');
 assert.equal(chooseBudgetSpace(spaces,{personal:'later',active:'personal'}),'house');
 assert.equal(chooseBudgetSpace(spaces,{personal:'enabled',active:'house'},'personal'),'personal');
 assert.equal(chooseBudgetSpace([spaces[0]],{active:'house',personal:'later'}),'personal');
});
