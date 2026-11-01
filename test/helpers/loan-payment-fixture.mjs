import {zero,setLoan} from '../../src/budget.js'
import {bankIdentity,applyBankImport} from '../../src/bank-import-model.js'
const base=()=>({startMonth:'2026-01',opening:10000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'חשבון בדיקה',buffer:0,opening:10000,openingMonth:'2026-01'}],months:{'2026-01':{a:{values:zero(),actual:false,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]}})
async function rows(month='2026-01',amount=-100000,ref=month){return[await bankIdentity({line:1,date:month+'-15',valueDate:null,description:'הוראת קבע 123',beneficiary:'מוטב בדיקה',details:'',purpose:'',reference:ref,amountCents:amount,currency:'ILS',valid:true,balanceCents:900000},'a')]}
const options=(month,id=month,choices={1:{field:'variable',reviewed:true,manual:true}})=>({id,fileName:'synthetic.csv',accountId:'a',label:'חשבון בדיקה',from:month+'-01',to:month+'-'+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),asOf:'2026-03',coverageConfirmed:true,monthsConfirmed:true,choices,modes:{[month]:'full'}})
async function fixture(){const r=await rows(),p=applyBankImport(base(),r,options('2026-01'));return{r,p:setLoan(p,{id:'loan',name:'הלוואה לבדיקה',monthly:1000,from:'2026-01',months:3,cashAccountId:'a'})}}

export {base,rows,options,fixture}
