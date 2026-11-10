import {deviceDraftDB,deviceDraftStore,sealDeviceDraft,openDeviceDraft,deviceDraftWitness} from './device-drafts.js';

export const FORM_DRAFT_PREFIX='form-draft:v1:';
export function formDraftScope({accountId,budgetId,kind,record='new',period='',context=''}){
  if(![accountId,budgetId,kind,record,period,context].every(v=>typeof v==='string')||![accountId,budgetId,kind,record].every(Boolean))throw Error('זהות הטיוטה אינה תקינה.');
  return JSON.stringify([accountId,budgetId,kind,record,period,context]);
}
// JSON data only. No financial validation: incomplete strings are intentional.
export function rawFormValue(value){
  const visit=(v,depth=0)=>{if(depth>40)throw Error('מבנה הטיוטה עמוק מדי.');if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){v.forEach(x=>visit(x,depth+1));return}if(v&&Object.getPrototypeOf(v)===Object.prototype){for(const x of Object.values(v)){if(x!==undefined)visit(x,depth+1)}return}throw Error('הטיוטה מכילה שדה שאינו ניתן לשחזור.');};visit(value);
  const text=JSON.stringify(value);if(text.length>2000000)throw Error('הטיוטה גדולה מדי לשמירה במכשיר.');return JSON.parse(text);
}
export function formDraftEnvelope(scope,revision,values,baseline,href){
  if(!Number.isInteger(revision)||revision<0||typeof href!=='string'||!href.startsWith('/next/')||href.startsWith('//'))throw Error('פרטי שחזור הטיוטה אינם תקינים.');
  return {format:'budgit-form-draft',version:1,scope,revision,updatedAt:Date.now(),href,values:rawFormValue(values),baseline:rawFormValue(baseline)};
}
export function validateFormDraft(value,scope){
  if(value?.format!=='budgit-form-draft'||value.version!==1||value.scope!==scope||!Number.isInteger(value.revision)||value.revision<0||!Number.isFinite(value.updatedAt)||typeof value.href!=='string'||!value.href.startsWith('/next/'))throw Error('גרסת הטיוטה או זהותה אינה נתמכת. העותק נשמר במכשיר.');
  rawFormValue(value.values);rawFormValue(value.baseline);return value;
}
// The witness check and write/delete share one transaction, including the lifecycle check.
export async function compareFormDraft(scope,expected,box,current=()=>true,open=deviceDraftDB){
  const db=await open();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get(FORM_DRAFT_PREFIX+scope);let refused=false,failure=null;
    get.onsuccess=()=>{try{if(!current()||deviceDraftWitness(get.result)!==expected){refused=true;tx.abort();return}if(box)store.put(box,FORM_DRAFT_PREFIX+scope);else store.delete(FORM_DRAFT_PREFIX+scope)}catch(error){failure=error;tx.abort()}};
    tx.oncomplete=()=>resolve(deviceDraftWitness(box));tx.onabort=()=>reject(failure??Error(refused?'טיוטת המכשיר השתנתה בחלון אחר או שהתקציב ננעל. העותק הקודם נשמר.':'לא ניתן לשמור טיוטה במכשיר.'));tx.onerror=()=>reject(tx.error);
  })}finally{db.close()}
}
const defaults={read:scope=>deviceDraftStore('readonly',store=>store.get(FORM_DRAFT_PREFIX+scope)),seal:sealDeviceDraft,open:openDeviceDraft,compare:compareFormDraft};
/** One scoped writer. The caller owns editable state; this class never sends a request. */
export class FormDraftWriter {
  constructor({scope,revision,baseline,href,key,keyId='',current=()=>true},deps={}){
    this.options={scope,revision,baseline,href,key,keyId,current};this.deps={...defaults,...deps};this.alive=true;this.expected='';this.queue=Promise.resolve();this.generation=0;this.persisted=0;this.latest=null;this.failure=null;this.conflict=false;
    this.loadFailure=null;this.ready=this.load().catch(e=>{this.loadFailure=e;throw e});void this.ready.catch(()=>{});
  }
  current=()=>this.alive&&this.options.current();
  async load(){const {scope,key,keyId,revision,baseline}=this.options;const box=await this.deps.read(scope);if(!this.current())throw Error('טעינת הטיוטה בוטלה.');this.expected=deviceDraftWitness(box);if(!box)return null;const value=validateFormDraft(await this.deps.open(scope,box,key,keyId),scope);if(!this.current())throw Error('טעינת הטיוטה בוטלה.');this.conflict=value.revision!==revision||JSON.stringify(value.baseline)!==JSON.stringify(baseline);return {value,conflict:this.conflict};}
  retryLoad(){if(!this.loadFailure)return this.ready;this.loadFailure=null;this.ready=this.load().catch(e=>{this.loadFailure=e;throw e});void this.ready.catch(()=>{});return this.ready;}
  stage(values){const copy=rawFormValue(values);if(JSON.stringify(copy)!==JSON.stringify(this.latest)){this.latest=copy;this.generation++}return this.generation;}
  durable(){return this.current()&&!this.conflict&&!this.failure&&this.persisted===this.generation;}
  flush(){const work=this.queue.catch(()=>{}).then(async()=>{
    await this.ready;if(!this.current()||this.conflict)throw Error('יש לבדוק את טיוטת המכשיר לפני יציאה.');
    while(this.persisted!==this.generation){const generation=this.generation,values=this.latest,{scope,revision,baseline,href,key,keyId}=this.options;
      const payload=formDraftEnvelope(scope,revision,values,baseline,href),box=await this.deps.seal(scope,payload,key,keyId);
      if(!this.current())throw Error('שמירת הטיוטה נעצרה.');this.expected=await this.deps.compare(scope,this.expected,box,this.current);this.persisted=generation;
    }this.failure=null;return true;
  }).catch(e=>{this.failure=e;throw e});this.queue=work;return work;}
  // Drain preceding work; queued writes cannot recreate the deleted generation.
  remove(generation=this.generation){const work=this.queue.catch(()=>{}).then(async()=>{await this.ready;if(generation!==this.generation)return false;if(!this.options.current())throw Error('התקציב ננעל.');this.expected=await this.deps.compare(this.options.scope,this.expected,null,()=>this.options.current()&&generation===this.generation);this.persisted=this.generation;return true});this.queue=work;return work;}
  stop(){this.alive=false;}
}

export async function listFormDrafts(accountId,budgetId,key,keyId='',current=()=>true){
  const all=await deviceDraftStore('readonly',store=>store.getAllKeys()),result=[];
  for(const id of all){if(typeof id!=='string'||!id.startsWith(FORM_DRAFT_PREFIX))continue;const scope=id.slice(FORM_DRAFT_PREFIX.length);let parts;try{parts=JSON.parse(scope)}catch{continue}if(parts?.[0]!==accountId||parts?.[1]!==budgetId)continue;
    const box=await deviceDraftStore('readonly',store=>store.get(id));if(!current())throw Error('התקציב ננעל.');if(!box)continue;
    try{const value=validateFormDraft(await openDeviceDraft(scope,box,key,keyId),scope);if(!current())throw Error('התקציב ננעל.');result.push({scope,witness:deviceDraftWitness(box),kind:parts[2],value,error:''})}
    catch(e){if(!current())throw Error('התקציב ננעל.');result.push({scope,witness:deviceDraftWitness(box),kind:parts[2],value:null,error:e instanceof Error?e.message:'לא ניתן לפתוח טיוטה.'})}
  }return result;
}

// Structural checks deliberately accept incomplete numeric/text fields. They do
// not run financial validation or infer values from a saved budget snapshot.
export function formValuesMatchShape(value,template){
  if(template===null)return value===null||!!value&&typeof value==='object'&&!Array.isArray(value);
  if(Array.isArray(template))return Array.isArray(value)&&value.every(item=>item!==null&&(template.length?formValuesMatchShape(item,template[0]):true));
  if(template&&typeof template==='object')return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(template).every(key=>template[key]===undefined||Object.hasOwn(value,key)&&formValuesMatchShape(value[key],template[key]));
  if(typeof template==='number')return typeof value==='number'&&Number.isFinite(value)||typeof value==='string';
  return typeof value===typeof template;
}
