import test from 'node:test'
import assert from 'node:assert/strict'
import {groupAmountText,groupedCaret} from '../frontend/src/app/amount-format.js'
import {moneyInputCents} from '../frontend/src/app/monthly-report.ts'

test('Money fields group thousands while preserving typed cents, signs and incomplete drafts',()=>{
 for(const [raw,shown] of [['1000','1,000'],['1234567.50','1,234,567.50'],['-2500.','-2,500.'],['.5','.5'],['1,000','1,000'],['1,2x','1,2x']])assert.equal(groupAmountText(raw),shown)
 assert.equal(moneyInputCents(groupAmountText('1234567.50')),123456750)
 assert.equal(moneyInputCents(groupAmountText('1000')),100000)
})

test('Inserting grouping commas keeps the caret by the same digit',()=>{
 assert.equal(groupedCaret('1000','1,000',4),5)
 assert.equal(groupedCaret('1000','1,000',1),1)
 assert.equal(groupedCaret('1234.50','1,234.50',6),7)
 assert.equal(groupedCaret('-1000','-1,000',5),6)
})
