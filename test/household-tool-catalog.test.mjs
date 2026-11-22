import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toolGroups} from '../frontend/src/app/tool-catalog.js'
import {modeAllows} from '../frontend/src/app/interface-mode-model.js'
import {navigationLabels,visibleNavigation} from '../frontend/src/app/navigation-sections.js'

test('The compact menu retains every previously linked Budgit workflow',()=>{
 const paths=toolGroups.flatMap(group=>group.items.map(([path])=>path))
 assert.equal(paths.length,new Set(paths).size,'each tool has one catalog entry')
 const prior=readFileSync(new URL('../frontend/src/app/existing-workflow-links.tsx',import.meta.url),'utf8')
 const existing=[...prior.matchAll(/\['(\/[^']+)'\s*,/g)].map(match=>match[1])
 const formerMenu=['/income','/monthly','/recurring','/loans','/checks','/incoming','/upload','/upload/history','/search','/actions','/notices','/settings/spaces']
 for(const path of new Set([...existing,...formerMenu]))assert.ok(paths.includes(path.split('?')[0]),`${path} remains discoverable`)
 assert.ok(readFileSync(new URL('../frontend/src/app/planned-items-page.tsx',import.meta.url),'utf8').includes('PlanningCalculator'),'calculator moved to Planning')
 assert.ok(modeAllows('basic','/more'),'the catalog opens in the basic interface')
})

test('Sync Center and report sources have the same names in the desktop and compact catalogs',()=>{
 const reports=visibleNavigation('basic').find(section=>section.key==='reports')
 const compact=new Map(toolGroups.flatMap(group=>group.items))
 assert.equal(reports.label,navigationLabels.sync)
 assert.deepEqual(reports.items,[['/incoming',navigationLabels.sync],['/upload',navigationLabels.sources]])
 for(const [path,label] of reports.items)assert.equal(compact.get(path),label)
})
