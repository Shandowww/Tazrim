import {to64,from64} from './vault.js';
export const transferMatchFormat='monthly-flow-sealed-transfer-v1';
const matchUTF8=value=>new TextEncoder().encode(value);
export function transferMatchSources(sources){
 return sources.map(s=>({budget:s.budget,revision:s.revision,token:s.token,...(s.keyId?{keyId:s.keyId,context:s.context}:{})})).sort((a,b)=>a.budget<b.budget?-1:a.budget>b.budget?1:0);
}
export async function deriveTransferMatchKeys(raw,envelope){
 const material=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
 const params=label=>({name:'HKDF',hash:'SHA-256',salt:matchUTF8(transferMatchFormat),info:matchUTF8(JSON.stringify([label,envelope.context,envelope.keyId]))});
 return {encryption:await crypto.subtle.deriveKey(params('payload'),material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']),tag:await crypto.subtle.deriveKey(params('source-token'),material,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']),keyId:envelope.keyId,context:envelope.context};
}
export async function transferMatchToken(user,ref,keys){
 const bytes=matchUTF8(JSON.stringify([user,ref.budget,ref.key]));
 const value=keys?await crypto.subtle.sign('HMAC',keys.tag,bytes):await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');
}
function matchLayerKey(source,keys){const key=keys.get(source.budget);if(!key||key.keyId!==source.keyId||key.context!==source.context)throw Error('יש לפתוח את כל המרחבים המוצפנים של ההתאמה.');return key.encryption;}
const matchAAD=(user,id,sources,index)=>matchUTF8(JSON.stringify([transferMatchFormat,user,id,transferMatchSources(sources),index]));
export async function sealTransferMatch(user,sources,out,incoming,keys,id=crypto.randomUUID()){
 sources=transferMatchSources(sources);const layers=sources.filter(s=>s.keyId);if(!layers.length)throw Error('Missing encrypted source');
 let bytes=matchUTF8(JSON.stringify({out,in:incoming})),box;
 for(let i=0;i<layers.length;i++){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  box={iv:to64(iv),data:to64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:matchAAD(user,id,sources,i)},matchLayerKey(layers[i],keys),bytes))};
  bytes=matchUTF8(JSON.stringify(box));
 }
 return {format:transferMatchFormat,id,sources,box};
}
export async function openTransferMatch(user,record,keys){
 if(record?.format!==transferMatchFormat||!Array.isArray(record.sources)||record.sources.length!==2)throw Error('Invalid sealed match');
 const layers=transferMatchSources(record.sources).filter(s=>s.keyId);if(!layers.length)throw Error('Missing encrypted source');
 let box=record.box;
 for(let i=layers.length-1;i>=0;i--){
  if(typeof box?.iv!=='string'||box.iv.length!==16||typeof box?.data!=='string'||box.data.length>8192)throw Error('Invalid match ciphertext');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(box.iv),additionalData:matchAAD(user,record.id,record.sources,i)},matchLayerKey(layers[i],keys),from64(box.data));
  box=JSON.parse(new TextDecoder().decode(bytes));
 }
 return box;
}
