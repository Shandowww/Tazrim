// Original device-draft namespace and authenticated encryption, shared by both UIs.
export function deviceDraftScope(accountId,budgetId){return JSON.stringify([accountId,budgetId]);}
export function deviceDraftDB(){return new Promise((resolve,reject)=>{
 let settled=false;
 const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error)reject(error);else resolve(db);};
 const timer=setTimeout(()=>finish(Error('לא ניתן לפתוח את שמירת הטיוטות במכשיר. אפשר לעבור למסך אחר ולנסות שוב.')),5000);
 try{
  const request=indexedDB.open('monthly-flow-drafts',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records');};
  request.onblocked=()=>finish(Error('פתיחת הטיוטות ממתינה ללשונית אחרת. אפשר לעבור למסך אחר או לסגור את הלשונית ולנסות שוב.'));
  request.onerror=()=>finish(request.error??Error('לא ניתן לפתוח את הטיוטות במכשיר.'));
  request.onsuccess=()=>finish(null,request.result);
 }catch(error){finish(error);}
});}
export async function deviceDraftStore(mode,operation){const db=await deviceDraftDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),request=operation(tx.objectStore('records'));let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function sealDeviceDraft(scope,payload,key,keyId=''){const secret=key??await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode('monthly-flow-draft-v1:'+scope+':'+keyId),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},secret,new TextEncoder().encode(JSON.stringify(payload)));return{iv,encrypted,keyId,...(!key?{deviceKey:secret}:{})};}
export async function openDeviceDraft(scope,box,key,keyId=''){if(box.keyId!==keyId)throw Error('המפתח השתנה');const secret=key??box.deviceKey,aad=new TextEncoder().encode('monthly-flow-draft-v1:'+scope+':'+box.keyId),bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:box.iv,additionalData:aad},secret,box.encrypted);return JSON.parse(new TextDecoder().decode(bytes));}
export function deviceDraftExport(value){return{format:'monthly-flow-v1',plan:value.plan,draft:{selectedMonth:value.selectedMonth,raw:value.raw??{}}};}
export function deviceDraftWitness(box){return box?JSON.stringify({keyId:box.keyId,archived:!!box.archived,iv:Array.from(new Uint8Array(box.iv)),encrypted:Array.from(new Uint8Array(box.encrypted))}):'';}
// Compare and replace in one IndexedDB transaction; another tab's copy wins.
export async function compareDeviceDraft(scope,expected,box,current=()=>true,open=deviceDraftDB){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get('draft:'+scope);let refused=false;get.onsuccess=()=>{if(!current()||deviceDraftWitness(get.result)!==expected){refused=true;tx.abort();return;}store.put(box,'draft:'+scope);};tx.oncomplete=()=>resolve(deviceDraftWitness(box));tx.onabort=()=>reject(Error(refused?'טיוטת המכשיר השתנתה או שהתקציב ננעל. העותק הקודם נשמר.':'לא ניתן לשמור טיוטה במכשיר.'));tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
