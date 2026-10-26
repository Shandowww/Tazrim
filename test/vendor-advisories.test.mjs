import test from 'node:test';import assert from 'node:assert/strict';import {assess} from '../scripts/audit-vendor.mjs';
const policy={exceptions:[{id:'known',modified:'2026-10-01',reviewBefore:'2026-11-01',reason:'Reviewed fixed CDN version'}]};
test('new and revised advisory records require review',()=>{assert.equal(assess([{id:'new'}],policy)[0].accepted,false);assert.equal(assess([{id:'known',modified:'2026-10-02'}],policy)[0].accepted,false);});
test('review exceptions expire and exact unchanged records are visible',()=>{const v=[{id:'known',modified:'2026-10-01'}];assert.equal(assess(v,policy,new Date('2026-10-24'))[0].accepted,true);assert.equal(assess(v,policy,new Date('2026-11-01'))[0].accepted,false);});
test('malformed advisory records cannot pass as a clean result',()=>{assert.throws(()=>assess({},policy));assert.throws(()=>assess([{}],policy));});
