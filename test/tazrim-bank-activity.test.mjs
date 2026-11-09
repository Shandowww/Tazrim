import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,forecast,validatePlan} from '../src/budget.js'
import {bankIdentity,applyBankImport} from '../src/bank-import-model.js'
import {bankActivityView} from '../frontend/src/app/bank-activity-read.js'
import {modeAllows} from '../frontend/src/app/interface-mode-model.js'
import {accountWorkflows} from '../frontend/src/app/account-workflows.js'
import {budgetDetailView} from '../frontend/src/app/detail-adapter.js'

async function imported(){
 const base={startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false}
 const records=await Promise.all([[1,100001,'משכורת'],[2,-23456,'חיוב כרטיס'],[3,-50000,'העברה'],[4,1234,'זיכוי']].map(async([line,amountCents,description])=>bankIdentity({line,amountCents,description,date:'2026-09-23',reference:String(line),valid:true,currency:'ILS',balanceCents:null,details:'פרטים נוספים',beneficiary:'מוטב',purpose:''},'bank-a')))
 return applyBankImport(base,records,{id:'batch-a',accountId:'bank-a',label:'בנק לדוגמה',fileName:'synthetic.csv',from:'2026-09-01',to:'2026-09-30',asOf:'2026-11',coverageConfirmed:true,monthsConfirmed:true,rules:[],modes:{'2026-09':'full'},choices:{1:{field:'salary',reviewed:true},2:{field:'card1',reviewed:true},3:{field:'outgoingTransfers',reviewed:true},4:{field:'exclude',reviewed:true}}})
}
const options={year:'2026',month:'09',asOf:'2026-11'}
test('Wallet bank activity shows original signed bank entries when expense details are empty, without any financial mutation',async()=>{
 const p=await imported(),before=JSON.stringify(p),cash=forecast(p)
 assert.ok(validatePlan(p));assert.equal(budgetDetailView(p,options).rows.length,0)
 const v=bankActivityView(p,'bank-a',options)
 assert.equal(v.rows.length,4);assert.equal(v.debitCents,73456);assert.equal(v.creditCents,101235);assert.equal(v.netCents,27779)
 assert.ok(v.rows.some(row=>row.field==='card1'&&row.cents===-23456));assert.ok(v.rows.some(row=>row.field==='exclude'&&row.cents===1234))
 assert.equal(v.rows[0].source.date,'2026-09-23');assert.ok(v.coverage)
 assert.deepEqual(forecast(p),cash);assert.equal(JSON.stringify(p),before)
})
test('Bank activity respects exact account, historical month, annual range, future cutoff and source search',async()=>{
 const p=await imported();p.bankImport.accounts.push({id:'bank-b',label:'אחר',rules:[]})
 p.bankImport.entries.push({...p.bankImport.entries[0],key:'b'.repeat(64),accountId:'bank-b'})
 assert.equal(bankActivityView(p,'bank-a',options).rows.length,4)
 assert.equal(bankActivityView(p,'bank-b',options).rows.length,1)
 assert.equal(bankActivityView(p,'bank-a',{...options,month:'08'}).rows.length,0)
 assert.equal(bankActivityView(p,'bank-a',{...options,month:''}).rows.length,4)
 assert.equal(bankActivityView(p,'bank-a',{...options,asOf:'2026-08'}).rows.length,0)
 assert.equal(bankActivityView(p,'bank-a',{...options,query:'כרטיס'}).rows.length,1)
 assert.equal(bankActivityView(p,'bank-a',{...options,query:'מוטב'}).rows.length,4)
 assert.equal(bankActivityView(p,'bank-a',{...options,query:'לא קיים'}).totalCount,4)
 assert.throws(()=>bankActivityView(p,'foreign-space',options),/אינו זמין/)
 assert.throws(()=>bankActivityView(p,'bank-a',{...options,month:'13'}),/תקופה/)
})
test('Old imports without original row evidence retain signed amounts and have no invented description or date',async()=>{
 const p=await imported();delete p.bankImport.entries[0].source
 const row=bankActivityView(p,'bank-a',options).rows.find(row=>row.key===p.bankImport.entries[0].key)
 assert.equal(row.cents,100001);assert.equal(row.source,undefined)
})

test('Read-only wallet bank activity remains available in every interface mode',()=>{
 for(const mode of ['basic','advanced','expert'])for(const action of accountWorkflows('banks','bank-a',true))assert.ok(modeAllows(mode,action.href))
})
