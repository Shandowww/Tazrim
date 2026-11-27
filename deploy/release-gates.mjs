import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '/app/server/app.mjs';
import { openDatabase } from '/app/server/database.mjs';
import { createDriveBackup } from '/app/server/drive-backup.mjs';
import { assertStoredRecords, snapshotStoredRecords } from '/app/server/preflight-preservation.mjs';
import { verifyStoredReports } from '/app/server/report-crypto.mjs';

const [mode, source, keyFile, publicKeyFile, target, ...extra] = process.argv.slice(2);
assert(!extra.length && source && keyFile && publicKeyFile && (
  (mode === 'access' && !target) || (mode === 'restore' && target)
), 'Usage: release-gates.mjs access|restore <snapshot> <report-key> <backup-public-key> [restore-target]');

const origin = 'https://isolated-preflight.invalid';
const protectedApis = [
  '/api/report-lifecycle', '/api/report-automation', '/api/plan', '/api/reports',
  '/api/actions', '/api/plan-history', '/api/gmail', '/api/space-migrations',
  '/api/space-migration-review', '/api/transfer-matches', '/api/admin/access', '/api/admin/backup/files',
];
const deepRoutes = [
  '/next', '/next/accounts', '/next/checks', '/next/loans', '/next/savings',
  '/next/plans/scenario', '/next/details/new', '/next/settings/security', '/next/upload/group', '/next/analysis',
];

async function checkAccess(db, app) {
  const id = randomUUID();
  const email = `${id}@preflight.invalid`;
  const token = randomUUID();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const authenticated = { cookie: `__Host-mf_session=${token}` };
  const claimedIdentity = { 'oai-authenticated-user-id': id, 'oai-authenticated-user-email': email };
  const request = (path, headers) => app(new Request(origin + path, { headers: { origin, ...headers } }));
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id, id, email, Date.now());
    db.prepare('INSERT INTO auth_access VALUES(?,?)').run(email, Date.now());
    db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(tokenHash, id, Date.now() + 120000);

    for (const path of protectedApis) {
      assert.equal((await request(path)).status, 401, `Anonymous ${path}`);
      assert.equal((await request(path, claimedIdentity)).status, 401, `Unverified identity on ${path}`);
    }
    for (const path of deepRoutes) {
      const login = await request(path);
      assert.equal(login.status, 200, path);
      const loginHtml = await login.text();
      assert(loginHtml.includes('/auth/google') && !loginHtml.includes('id="root"'), `Login page for ${path}`);
      const page = await request(path, authenticated);
      assert.equal(page.status, 200, path);
      assert.equal(page.headers.get('cache-control'), 'no-store', path);
      assert.equal(page.headers.get('x-frame-options'), 'DENY', path);
      assert(page.headers.get('content-type')?.includes('text/html'), path);
      assert((await page.text()).includes('id="root"'), `App shell for ${path}`);
    }
    assert.equal((await request('/')).headers.get('location'), '/next');
    // The same gate also exercises the previous image as the rollback target.
    const hasRetiredPage = existsSync('/app/dist/server/page.js');
    assert.equal((await request('/', { cookie: 'budgit-interface=original' })).headers.get('location'), hasRetiredPage ? '/?mf-view=home' : '/next');
    if (!hasRetiredPage) {
      const bookmark = await request('/?mf-view=savings&budget=personal&year=2026&month=7', authenticated);
      assert.equal(bookmark.status, 303);
      assert.equal(bookmark.headers.get('location'), '/next/savings?budget=personal&year=2026&month=7');
    }

    const html = readFileSync('/app/dist/frontend/index.html', 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="(\/ui-assets\/[^\"]+\.(?:js|css))"/g)];
    assert(assets.length >= 2, 'Built frontend assets');
    for (const [, path] of assets) {
      assert.notEqual((await request(path)).status, 200, 'Anonymous asset');
      const asset = await request(path, authenticated);
      assert.equal(asset.status, 200, path);
      assert.match(asset.headers.get('cache-control') ?? '', /\bprivate\b/);
      assert.match(asset.headers.get('cache-control') ?? '', /\bimmutable\b/);
      assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
      assert(asset.headers.get('content-type')?.includes(path.endsWith('.js') ? 'javascript' : 'css'), path);
    }

    const ownPlan = await request('/api/plan', authenticated);
    assert.equal(ownPlan.status, 200);
    const plan = await ownPlan.json();
    assert(plan.plan === null && plan.accountId === id && plan.writeIdentityBound === true, 'Fresh isolated actor');
    assert.equal((await request('/api/admin/access', authenticated)).status, 403);
    for (const { id: budget } of db.prepare('SELECT id FROM budgets').all()) {
      const response = await request(`/api/plan?budget=${encodeURIComponent(budget)}`, authenticated);
      assert.equal(response.status, 404, 'Existing budget is private');
    }
    const unknown = await request('/api/not-a-react-route', authenticated);
    assert(!unknown.headers.get('content-type')?.includes('text/html'), 'Unknown API must not return a page');
  } finally {
    db.exec('ROLLBACK');
  }
}

const directory = mode === 'access' ? mkdtempSync(join(tmpdir(), 'budgit-access-')) : null;
const copy = target ?? join(directory, 'copy.sqlite');
let db;
try {
  const original = new DatabaseSync(source, { readOnly: true });
  let before;
  try {
    before = snapshotStoredRecords(original);
    original.prepare('VACUUM INTO ?').run(copy);
  } finally {
    original.close();
  }
  const opened = openDatabase(copy);
  db = opened.db;
  const checkHttp = mode === 'access';
  const app = createApp({
    db, DB: opened.DB, origin,
    reportAutomationEnabled: checkHttp,
    reportRetentionEnabled: checkHttp,
    reportOptions: { keyFile, publicKeyFile },
  });
  if (checkHttp) {
    await checkAccess(db, app);
  } else {
    createDriveBackup({ db, origin, admins: new Set() }).trackTables();
  }
  assertStoredRecords(db, before);
  const storedSourcesDecrypted = verifyStoredReports(db, readFileSync(keyFile));
  if (mode === 'restore') {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    assert.equal(db.prepare('PRAGMA journal_mode=DELETE').get().journal_mode, 'delete');
  }
  console.log(JSON.stringify({ mode, recordsPreserved: true, storedSourcesDecrypted }));
} finally {
  db?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
}
