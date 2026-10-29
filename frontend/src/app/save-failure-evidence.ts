/** Actual attempted-save results only, held in memory while the owning editor remains open. */
export interface SaveFailureEvidence {scope:string;source:string;message:string;attempt:number}
let current:SaveFailureEvidence|null=null,sequence=0
const latest=new Map<string,number>(),listeners=new Set<()=>void>()
const publish=(next:SaveFailureEvidence|null)=>{current=next;for(const listener of listeners)listener()}
export const saveFailureSnapshot=()=>current
export const subscribeSaveFailure=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const saveEvidenceScope=(budgetId:string,actor:{accountId:string;accountEmail:string})=>actor.accountId+'/'+budgetId+'|'+actor.accountEmail
export const saveEvidenceSource=()=>typeof window==='undefined'?'node':window.location.pathname+window.location.search
export function clearSaveFailure(){latest.clear();if(current)publish(null)}
export async function observePreparedSave<T>(scope:string,source:string,operation:()=>Promise<T>):Promise<T>{const attempt=++sequence,key=JSON.stringify([scope,source]);latest.set(key,attempt);try{const value=await operation();if(latest.get(key)===attempt){latest.delete(key);if(current?.scope===scope&&current.source===source)publish(null)}return value}catch(e){if(latest.get(key)===attempt)publish({scope,source,attempt,message:e instanceof Error?e.message:'השינויים טרם נשמרו. יש לבדוק את השמירה.'});throw e}}
export function scopedSaveFailure(evidence:SaveFailureEvidence|null,scope:string,source:string,dirty:boolean){return dirty&&evidence?.scope===scope&&evidence.source===source?evidence.message:''}
