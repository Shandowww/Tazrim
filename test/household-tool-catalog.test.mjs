import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toolGroups} from '../frontend/src/app/tool-catalog.js'
import {modeAllows} from '../frontend/src/app/interface-mode-model.js'

test('The compact menu retains every previously linked Budgit workflow',()=>{
 const paths=toolGroups.flatMap(group=>group.items.map(([path])=>path))
 assert.equal(paths.length,new Set(paths).size,'each tool has one catalog entry')
 const prior=readFileSync(new URL('../frontend/src/app/existing-workflow-links.tsx',import.meta.url),'utf8')
 const existing=[...prior.matchAll(/\['(\/[^']+)'\s*,/g)].map(match=>match[1])
 const formerMenu=['/plans/scenario','/income','/monthly','/recurring','/loans','/checks','/incoming','/upload','/upload/history','/search','/actions','/notices','/settings/spaces']
 for(const path of new Set([...existing,...formerMenu]))assert.ok(paths.includes(path),`${path} remains discoverable`)
 assert.ok(modeAllows('basic','/more'),'the catalog opens in the basic interface')
})
