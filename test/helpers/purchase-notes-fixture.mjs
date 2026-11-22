import {createHash,randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {openDatabase} from '../../server/database.mjs';
import {createApp} from '../../server/app.mjs';
import {purchaseNoteColumns} from '../../src/purchase-notes-model.js';
import {zero} from '../../src/budget.js';
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
export const sampleSheetId='sample_purchase_notes_12345678901234567890';
export const sampleNotes=()=>[
 ['purchase-note-0001','2026-10-08','KSP',249,'ILS','מקלדת לעבודה','מחשבים','1234','2026-10-08T12:00:00Z'],
 ['purchase-note-0002','2026-10-20','פיס פלוס',65,'ILS','שובר לפיצה','מסעדות','','2026-10-20T16:00:00Z'],
 ['purchase-note-0003','2026-10-23','סופר פארם',180,'ILS','תרופות ומוצרי טיפוח','','','2026-10-23T11:00:00Z']
];
export function purchaseNotesFixture(){
 const {db,DB}=openDatabase(':memory:'),origin='https://purchase-notes.test',key=randomBytes(32),clock=Date.parse('2026-11-21T12:00:00Z'),allowed=new Set(['alice@example.test','bob@example.test']),calls=[];
 const state={values:[purchaseNoteColumns,...sampleNotes()],auth:null,identityEmail:'alice@example.test',nonceMismatch:false,scopeMissing:false,requestHook:null,providerError:null};
 for(const id of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',clock);db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,clock+86400000);}
 const oauthFactory=()=>({
  async generateCodeVerifierAsync(){return{codeVerifier:'test-verifier',codeChallenge:'test-challenge'};},
  generateAuthUrl(value){state.auth=value;return 'https://accounts.google.test/consent';},
  async getToken(){return{tokens:{refresh_token:'synthetic-private-refresh-token',id_token:'synthetic-id',scope:state.scopeMissing?'openid email':'openid email https://www.googleapis.com/auth/spreadsheets.readonly'}};},
  async verifyIdToken(){return{getPayload:()=>({email:state.identityEmail,email_verified:true,nonce:state.nonceMismatch?'wrong':state.auth.nonce})};},
  setCredentials(){},async request(options){calls.push(options);if(state.requestHook)await state.requestHook();if(state.providerError)throw state.providerError;return{data:{values:structuredClone(state.values)}};}
 });
 const app=createApp({db,DB,origin,now:()=>clock,clientId:'synthetic-client',clientSecret:'synthetic-secret',allowedEmails:[...allowed],purchaseNotesOAuthFactory:oauthFactory,reportOptions:{key,recoveryPublicKey:pair.publicKey}});
 const req=(who,path,init={})=>app(new Request(origin+path,{...init,headers:{origin,cookie:who?'__Host-mf_session='+who:'',...Object.fromEntries(new Headers(init.headers))}}));
 const get=(who='alice')=>req(who,'/api/purchase-notes?accountId='+who),snapshot=async(who='alice')=>(await get(who)).json();
 const post=(body,who='alice')=>req(who,'/api/purchase-notes?accountId='+who,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const command=async(body,who='alice')=>{const base=await snapshot(who);return post({...body,accountId:who,requireAccountId:true,expectedRevision:base.revision,operationId:randomUUID()},who);};
 const configure=()=>command({action:'configure',url:'https://docs.google.com/spreadsheets/d/'+sampleSheetId+'/edit',tab:'Purchases',confirmChange:false});
 const begin=async()=>{const base=await snapshot();return req('alice','/auth/purchase-notes?accountId=alice&revision='+base.revision);};
 const callback=()=>req('alice','/auth/google/callback?state='+state.auth.state+'&code=synthetic');
 const connect=async()=>{await configure();await begin();return callback();};
 const financial=()=>JSON.stringify({plans:db.prepare('SELECT * FROM plans ORDER BY user_id').all(),budgets:db.prepare('SELECT * FROM budgets ORDER BY id').all(),history:db.prepare('SELECT * FROM plan_history ORDER BY id').all(),commits:db.prepare('SELECT * FROM report_commits ORDER BY scope,action_id').all()});
 const seed=async()=>{for(const who of ['alice','bob']){const plan={startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true,creditCards:[{id:'card1',name:'כרטיס בדיקה',alias:'1234',provider:'cal'}]};const result=await req(who,'/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision:0})});if(!result.ok)throw Error(await result.text());}};
 return{db,DB,key,app,origin,state,calls,oauthFactory,req,get,snapshot,post,command,configure,begin,callback,connect,financial,seed};
}
