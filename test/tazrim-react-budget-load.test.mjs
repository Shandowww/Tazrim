import test from 'node:test'
import assert from 'node:assert/strict'
import { loadBudgetSnapshot } from '../frontend/src/app/use-budget.ts'

const shared = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const space = { id: shared, name: 'משפחה', role: 'viewer', revision: 4, scope: 'budget:' + shared }
const list = { budgets: [{ id: 'personal', name: 'האישי שלי', role: 'owner', revision: 2, scope: 'personal:alice' }, space], accountId: 'alice', accountEmail: 'alice@example.test' }
const plan = { plan: { startMonth: '2026-01' }, revision: 4, accountId: 'alice', accountEmail: 'alice@example.test', budget: space }

test('space load checks access before plan fetch and retains role/identity', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push([url, options.cache, options.credentials])
    return Response.json(url === '/api/budgets' ? list : plan)
  }
  const snapshot = await loadBudgetSnapshot(shared, new AbortController().signal, fetcher)
  assert.deepEqual(calls.map(row => row[0]), ['/api/budgets', '/api/plan?budget=' + shared])
  assert.ok(calls.every(row => row[1] === 'no-store' && row[2] === 'same-origin'))
  assert.equal(snapshot.value.budget.role, 'viewer')
  assert.equal(snapshot.spaces.length, 2)
  calls.length = 0
  await assert.rejects(loadBudgetSnapshot('foreign', new AbortController().signal, fetcher), /אינו זמין/)
  assert.deepEqual(calls.map(row => row[0]), ['/api/budgets'])
})

test('space load rejects an identity change between list and plan responses', async () => {
  const fetcher = async url => Response.json(url === '/api/budgets' ? list : { ...plan, accountId: 'bob' })
  await assert.rejects(loadBudgetSnapshot(shared, new AbortController().signal, fetcher), /החשבון השתנה/)
})

test('Malformed identity/revision and a missing shared-space identity cannot become an editable snapshot', async () => {
  for (const [listValue, planValue] of [
    [{ ...list, accountId: '' }, plan], [list, { ...plan, revision: -1 }], [list, { ...plan, budget: undefined }], [list, { ...plan, plan: [] }],
  ]) {
    const fetcher = async url => Response.json(url === '/api/budgets' ? listValue : planValue)
    await assert.rejects(loadBudgetSnapshot(shared, new AbortController().signal, fetcher))
  }
})
