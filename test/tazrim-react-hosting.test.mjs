import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { openDatabase } from '../server/database.mjs'
import { createApp } from '../server/app.mjs'

const origin = 'https://budgit.duckdns.org'

test('React preview is authenticated, keeps private responses uncached, and leaves plan APIs guarded', async () => {
  const { db, DB } = openDatabase(':memory:')
  const app = createApp({ db, DB, origin, allowedEmails: ['alice@example.test'] })
  const token = 'synthetic-session-token'
  db.prepare('INSERT INTO auth_users VALUES (?,?,?,?)').run('alice', 'google-alice', 'alice@example.test', Date.now())
  db.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 'alice', Date.now() + 60000)
  const cookie = `__Host-mf_session=${token}`
  const request = (path, headers = {}) => app(new Request(origin + path, { headers }))

  let r = await request('/next/', { 'oai-authenticated-user-id': 'alice' })
  assert.equal(r.status, 200)
  assert.match(await r.text(), /כניסה עם Google/)
  assert.equal((await request('/ui-assets/assets/private.js')).status, 404)
  assert.equal((await request('/api/plan', { 'oai-authenticated-user-id': 'alice' })).status, 401)

  r = await request('/next/banks', { cookie })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Cache-Control'), 'no-store')
  assert.match(r.headers.get('Content-Security-Policy'), /script-src 'self'/)
  assert.match(await r.text(), /<title>Budgit<\/title>/)

  const asset = readFileSync('dist/frontend/.vite/manifest.json', 'utf8')
  const file = JSON.parse(asset)['index.html'].file
  r = await request('/ui-assets/' + file, { cookie })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('Content-Type'), /javascript/)
  assert.match(r.headers.get('Cache-Control'), /private, max-age=/)
  assert.ok((await r.arrayBuffer()).byteLength > 1000)
  assert.equal((await request('/ui-assets/%2e%2e/server/app.mjs', { cookie })).status, 404)
  assert.equal((await request('/api/plan', { cookie })).status, 200)

  db.prepare('DELETE FROM auth_access WHERE email=?').run('alice@example.test')
  assert.equal((await request('/next/', { cookie })).status, 403)
  assert.equal((await request('/ui-assets/' + file, { cookie })).status, 404)
  db.close()
})
