import {cashAccountList,cashCardAccount} from '../../../src/budget.js'
import {budgetAccountOverview} from './budget-adapter.js'
import {budgetDetailView} from './detail-adapter.js'
/** Single read-only composition of existing account, payer and detail models. */
export function householdAccounts(plan,period){
 const {year,month='',asOf}=period,scope={year,month,asOf}
 const overview=budgetAccountOverview(plan,scope),banks=cashAccountList(plan)
 return {...overview,cards:overview.cards.map(card=>{
  const payerId=cashCardAccount(plan,card.id),payer=banks.find(a=>a.id===payerId)??null
  return {...card,payer:payer?{id:payer.id,name:payer.label,provider:payer.bankName||''}:null,
   details:budgetDetailView(plan,{...scope,card:card.id})}
 })}
}
export function selectedWalletCard(cards,requested,remembered){return cards.find(c=>c.id===requested)??cards.find(c=>c.id===remembered)??cards[0]??null}
export function nextWalletCard(cards,current,delta){if(!cards.length)return null;const i=Math.max(0,cards.findIndex(c=>c.id===current));return cards[(i+delta%cards.length+cards.length)%cards.length].id}
export function walletSwipe(start,end){const dx=end.x-start.x,dy=end.y-start.y;return Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4?(dx>0?1:-1):0}
export function cardDetailCoverage(card){
 const detailed=card.details.valueCents===null?null:card.details.valueCents/100
 return {detailed,remainder:card.total===null||detailed===null?null:Math.round((card.total-detailed)*100)/100}
}
