import {transferLegs,transferBrowserSelection,transferPairValid,transferRefsEqual} from './transfer-matching-model.js';
import {deriveTransferMatchKeys,transferMatchToken,sealTransferMatch,openTransferMatch} from './transfer-match-crypto.js';
import {validatePlan} from './budget.js';
import {decryptVault,isVault,unlockVault} from './vault.js';
export async function prepareTransferMatchVault(state,meta,body,previous,activePlan,active={}){
 const envelope=body.plan,matching={envelope,revision:body.revision,status:'locked',key:null,keys:null,legs:[]};
 try{
  let source;
  if(activePlan&&meta.id===active.budgetId&&active.rawKey){matching.key=active.key;matching.keys=await deriveTransferMatchKeys(active.rawKey,envelope);source=await decryptVault(envelope,matching.key);}
  else if(previous?.key&&previous.envelope.keyId===envelope.keyId&&previous.envelope.context===envelope.context){matching.key=previous.key;matching.keys=previous.keys;source=await decryptVault(envelope,matching.key);}
  if(source){if(!validatePlan(source))throw Error('Invalid unlocked source');const legs=transferLegs(source,state.user,meta.id,body.revision,state.asOf);matching.legs=legs.slice(0,500);matching.truncated=legs.length>500;matching.status='ready';}
 }catch{matching.status='error';matching.key=null;matching.keys=null;matching.legs=[];}
 return matching;
}
export function transferMatchKeys(state){return new Map([...state.entries].filter(([,e])=>['ready','locked'].includes(e.status)&&e.matching?.status==='ready').map(([id,e])=>[id,e.matching.keys]));}
export async function hydrateTransferMatchSnapshot(state){
 const snapshot=state.privateMatches;if(!snapshot)return;
 const keys=transferMatchKeys(state),legs=transferBrowserSelection(state.entries,[]).legs;
 const items=await Promise.all(snapshot.items.map(async m=>{
  if(!m.sealed||!['sealed','locked','current'].includes(m.status))return m;
  const sources=m.sealed.sources;
  if(!sources.every(s=>{const e=state.entries.get(s.budget);return ['ready','locked'].includes(e?.status)&&(s.keyId?e.matching?.revision===s.revision&&e.matching.envelope.keyId===s.keyId&&e.matching.envelope.context===s.context:e.summary?.revision===s.revision);}))return{id:m.id,status:'unavailable'};
  if(sources.some(s=>s.keyId&&!keys.has(s.budget)))return{id:m.id,sealed:m.sealed,status:'locked'};
  try{
   const value=await openTransferMatch(state.user,m.sealed,keys),out=legs.find(l=>transferRefsEqual(l.ref,value.out)),incoming=legs.find(l=>transferRefsEqual(l.ref,value.in));
   if(!transferPairValid(out,incoming))throw Error('Source mismatch');
   for(const s of sources){const ref=[out.ref,incoming.ref].find(r=>r.budget===s.budget&&r.revision===s.revision);if(!ref||await transferMatchToken(state.user,ref,keys.get(s.budget))!==s.token)throw Error('Source token mismatch');}
   return {...m,status:'current',out:out.ref,in:incoming.ref};
  }catch{return{id:m.id,status:'unavailable'};}
 }));
 return {...snapshot,items};
}
export async function transferMatchRequest(state,action,id){
 const selection=transferBrowserSelection(state.entries,state.privateMatches?.items??[]),out=selection.legs.find(l=>l.key===state.transferOut),incoming=selection.legs.find(l=>l.key===state.transferIn);
 if(!state.privateMatches||!Number.isSafeInteger(state.privateMatches.revision))throw Error('יש לרענן לפני עדכון התאמות.');
 if(action==='transfer-save'&&(selection.blocked||!transferPairValid(out,incoming)))throw Error('יש לבחור ולאשר שתי תנועות מקור תקפות.');
 if(action==='transfer-delete'&&!state.privateMatches.items.some(m=>m.id===id))throw Error('ההתאמה אינה זמינה.');
 if(!['transfer-save','transfer-delete'].includes(action))throw Error('פעולה אינה תקינה.');
 let body=action==='transfer-save'?{accountId:state.user,out:out.ref,in:incoming.ref,confirmed:true,revision:state.privateMatches.revision}:{accountId:state.user,id,revision:state.privateMatches.revision};
 if(action==='transfer-save'&&[out,incoming].some(l=>state.entries.get(l.ref.budget)?.matching)){
  const keys=transferMatchKeys(state),sources=[];
  for(const leg of [out,incoming]){const matching=state.entries.get(leg.ref.budget)?.matching;sources.push({budget:leg.ref.budget,revision:leg.ref.revision,token:await transferMatchToken(state.user,leg.ref,keys.get(leg.ref.budget)),...(matching?{keyId:matching.envelope.keyId,context:matching.envelope.context}:{})});}
  body={accountId:state.user,confirmed:true,revision:state.privateMatches.revision,sealed:await sealTransferMatch(state.user,sources,out.ref,incoming.ref,keys)};
 }
 return body;
}
export async function openTransferMatchSource(user,id,matching,latest,secret,recovery=false,open=unlockVault){
 if(latest.accountId!==user)throw Object.assign(Error('החשבון השתנה.'),{status:403});
 if(latest.revision!==matching.revision||!isVault(latest.plan)||latest.plan.keyId!==matching.envelope.keyId||latest.plan.context!==matching.envelope.context||JSON.stringify(latest.plan.encrypted)!==JSON.stringify(matching.envelope.encrypted))throw Object.assign(Error('המרחב השתנה. יש לרענן ולפתוח מחדש.'),{status:409});
 const result=await open(matching.envelope,secret,recovery);
 try{if(!validatePlan(result.plan))throw Error('נתוני המקור אינם תקינים.');return{key:result.key,keys:await deriveTransferMatchKeys(result.rawKey,matching.envelope),plan:result.plan};}finally{result.rawKey.fill(0);}
}
export function clearTransferMatchEntries(entries){for(const entry of entries.values())if(entry.matching)Object.assign(entry.matching,{key:null,keys:null,legs:[],status:'locked'});}
