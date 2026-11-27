import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {appEntryDestination} from '../server/app-entry.mjs';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';

const report = '12345678-1234-1234-1234-123456789abc';
const destination = query => appEntryDestination(new URLSearchParams(query));

test('Older bookmarks resolve to scoped Tazrim screens with allowlisted presentation parameters', () => {
  for (const [name, path] of [
    ['appearance', '/next/settings'], ['accounts', '/next/accounts'], ['savings', '/next/savings'],
    ['reports', '/next/upload'], ['report-history', '/next/upload/history'], ['security', '/next/settings/security'],
    ['admin', '/next/settings/access'], ['actions', '/next/actions'], ['migration', '/next/overview/migration'],
    ['analysis', '/next/analysis'], ['spaces', '/next/settings/spaces'], ['wallet', '/next/settings/wallet'],
  ]) assert.equal(destination('mf-view='+name+'&budget=house&year=2026&month=07&token=private&returnTo=//outside.test'), path+'?budget=house&year=2026&month=7');
  assert.equal(destination('mf-view=reports&mf-report='+report+'&budget=personal'),'/next/upload/'+report+'/review?budget=personal');
  assert.equal(destination('mf-view=reports&mf-report=../other'),'/next/upload');
  assert.equal(destination('mf-view=//outside.test&budget=a%26b&year=2026&month=13'),'/next?year=2026');
  assert.equal(destination('mf-view=__proto__'),'/next');
  assert.equal(destination('card-update=1'),'/next/accounts');
  assert.equal(destination('gmail=connected'),'/next/settings/gmail?gmail=connected');
  assert.equal(destination('driveBackup=failed'),'/next/settings/drive?driveBackup=failed');
});

test('Every root launch redirects to Tazrim without reading or writing financial data', async () => {
  const {db,DB}=openDatabase(':memory:'),origin='https://layout.test',app=createApp({db,DB,origin});
  try {
    for(const cookie of ['','budgit-interface=tazrim','budgit-interface=original','budgit-interface=https://outside.test']) {
      for(const method of ['GET','HEAD']) {
        const r=await app(new Request(origin+'/',{method,headers:{cookie}}));
        assert.equal(r.status,303);
        assert.equal(r.headers.get('location'),'/next');
        assert.equal(r.headers.get('cache-control'),'no-store');
        assert.equal(await r.text(),'');
      }
    }
    const bookmark=await app(new Request(origin+'/?mf-view=reports&mf-report='+report+'&budget=house'));
    assert.equal(bookmark.status,303);
    const path=bookmark.headers.get('location');
    const login=await app(new Request(origin+path));
    assert.equal(login.status,200);
    assert.match(await login.text(),/כניסה עם Google/);
    const denied=await app(new Request(origin+'/api/plan?budget=house',{headers:{'oai-authenticated-user-id':'forged'}}));
    assert.equal(denied.status,401);
    for(const table of ['auth_users','plans','budgets']) assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
  } finally { db.close(); }
});

test('The runtime build has a single shell and no retired inline application', () => {
  assert.ok(existsSync('dist/frontend/index.html'));
  assert.ok(!existsSync('dist/index.html'));
  assert.ok(!existsSync('dist/server/page.js'));
});
