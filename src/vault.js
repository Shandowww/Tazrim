// Browser-only encryption. No passwords, recovery secrets or raw keys go to the server.
export const vaultFormat='monthly-flow-encrypted-v1';
export const to64=bytes=>{const array=new Uint8Array(bytes);let s='';for(let i=0;i<array.length;i+=32768)s+=String.fromCharCode(...array.subarray(i,i+32768));return btoa(s);};
export const from64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const utf8=value=>new TextEncoder().encode(value);
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const b64=(value,length)=>typeof value==='string'&&value.length<=length&&/^[A-Za-z0-9+/]+={0,2}$/.test(value);
const boxOK=(box,max)=>box&&b64(box.iv,16)&&box.iv.length===16&&b64(box.data,max);
export function isVault(v){return !!v&&v.format===vaultFormat&&v.version===1&&typeof v.keyId==='string'&&/^[a-f0-9-]{36}$/.test(v.keyId)&&typeof v.context==='string'&&v.context.length>0&&v.context.length<=300&&v.iterations===600000&&b64(v.salt,24)&&v.salt.length===24&&boxOK(v.wrapped,64)&&v.wrapped.data.length===64&&boxOK(v.recovery,64)&&v.recovery.data.length===64&&boxOK(v.encrypted,8000000);}
const aes=bytes=>crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
async function passwordKey(password,salt){const material=await crypto.subtle.importKey('raw',utf8(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:from64(salt),iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function seal(key,data,aad){const iv=random(12);const out=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8(aad)},key,data);return{iv:to64(iv),data:to64(out)};}
async function open(key,box,aad){return crypto.subtle.decrypt({name:'AES-GCM',iv:from64(box.iv),additionalData:utf8(aad)},key,from64(box.data));}
const binding=(v,label)=>vaultFormat+'|'+v.context+'|'+v.keyId+'|'+label;
export async function createVault(plan,password,context){if(typeof password!=='string'||password.length<12||password.length>200)throw Error('בחרו סיסמה ארוכה של 12 תווים לפחות, ועד 200 תווים.');const bytes=random(32),recoverySecret=random(32),salt=to64(random(16));const v={format:vaultFormat,version:1,keyId:crypto.randomUUID(),context,iterations:600000,salt};v.wrapped=await seal(await passwordKey(password,salt),bytes,binding(v,'password'));v.recovery=await seal(await aes(recoverySecret),bytes,binding(v,'recovery'));const key=await aes(bytes);v.encrypted=await seal(key,utf8(JSON.stringify(plan)),binding(v,'data'));return{envelope:v,key,rawKey:bytes,recoveryKey:to64(recoverySecret)};}
export async function unlockVault(v,secret,recovery=false){if(!isVault(v))throw Error('הגיבוי המוצפן אינו בפורמט נתמך.');try{const wrapping=recovery?await aes(from64(secret.trim())):await passwordKey(secret,v.salt);const bytes=new Uint8Array(await open(wrapping,recovery?v.recovery:v.wrapped,binding(v,recovery?'recovery':'password'))),key=await aes(bytes);const plan=JSON.parse(new TextDecoder().decode(await open(key,v.encrypted,binding(v,'data'))));return{key,rawKey:bytes,plan};}catch{throw Error('לא ניתן לפתוח. בדקו את הסיסמה או מפתח השחזור ואת תקינות הגיבוי.');}}
export async function saveVault(v,key,plan){return{...v,encrypted:await seal(key,utf8(JSON.stringify(plan)),binding(v,'data'))};}
export async function decryptVault(v,key){return JSON.parse(new TextDecoder().decode(await open(key,v.encrypted,binding(v,'data'))));}
export async function sealDeviceKey(bytes,prf,v){return seal(await aes(prf),bytes,binding(v,'device'));}
export async function openDeviceKey(box,prf,v){return new Uint8Array(await open(await aes(prf),box,binding(v,'device')));}
export async function keyFromBytes(bytes){return aes(bytes);}
