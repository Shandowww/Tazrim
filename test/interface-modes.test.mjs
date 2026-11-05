import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initialInterfaceMode,modeStorageKey,modeAllows,routeInterfaceMode} from '../frontend/src/app/interface-mode-model.js';
test('Existing accounts retain Expert; new users start Basic; stored choice is independent of financial scope',()=>{
 assert.equal(initialInterfaceMode(null,true),'expert');assert.equal(initialInterfaceMode(null,false),'basic');assert.equal(initialInterfaceMode('advanced',true),'advanced');assert.equal(initialInterfaceMode('invalid',true),'expert');assert.notEqual(modeStorageKey('alice'),modeStorageKey('bob'));assert.equal(modeStorageKey('alice'),'budgit-interface-mode:alice');
});
test('Basic supports setup, report intake/review, read-only summaries, security and every notification destination',()=>{
 for(const route of ['/','/accounts','/accounts/new','/card-setup/new','/start','/upload','/upload/group','/upload/abc/group','/upload/abc/review','/savings','/loans','/checks','/categories','/details/abc','/actions','/notices/abc','/settings','/settings/spaces','/settings/security','/settings/gmail/notices/id'])assert.equal(modeAllows('basic',route),true,route);
 for(const route of ['/monthly','/details/new','/accounts/abc/edit','/savings/abc/deposit','/loans/new','/upload/abc/delete','/upload/history'])assert.equal(modeAllows('basic',route),false,route);
});
test('Advanced exposes routine edits while Expert retains every current route and reconciliation tool',()=>{
 for(const route of ['/monthly','/income','/plans/scenario','/plans/new','/accounts/transfers/new','/details/abc/clear','/loans/abc/edit','/savings/schedule','/settings/report-expectations'])assert.equal(modeAllows('advanced',route),true,route);
 for(const route of ['/accounts/assignments','/categories/manage','/overview/migration','/upload/history/x/undo','/settings/access','/analysis','/loans/x/payments']){assert.equal(routeInterfaceMode(route),'expert');assert.equal(modeAllows('advanced',route),false)}
 for(const [,path]of readFileSync('frontend/src/main.tsx','utf8').matchAll(/<Route path="([^"]+)"/g))assert.equal(modeAllows('expert',path),true,path);
});
