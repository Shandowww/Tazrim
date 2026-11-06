// Interactive, bounded native acceptance. Only generated fixtures reach loopback.
// Requires the owner to import the signed QA revision and approve native prompts.
import {execFileSync,spawn} from 'node:child_process';
import {writeFileSync,rmSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {startIncomingShortcutQA} from './incoming-shortcut-qa.mjs';

const qa=await startIncomingShortcutQA();
const shortcutName='Budgit-Incoming-QA-'+new URL(qa.origin).port;
const directory=join(qa.input,'..'),config=join(directory,'config.json'),unsigned=join(directory,'qa.wflow'),signed=join(directory,shortcutName+'.shortcut');
writeFileSync(config,JSON.stringify({endpoint:qa.endpoint,token:qa.token,qaName:shortcutName}),{mode:0o600,flag:'wx'});
try{
execFileSync('python3',['-B','scripts/build-incoming-shortcut.py','--qa-config',config,'--output',unsigned],{timeout:15000});
chmodSync(unsigned,0o600);
// QA starts in retain mode. Owner changes the SECOND Text action only after
// isolated import succeeds, then runs again to exercise confirmed deletion.
execFileSync('shortcuts',['sign','--mode','anyone','--input',unsigned,'--output',signed],{stdio:'pipe',timeout:30000});
chmodSync(signed,0o600);
}catch(error){await qa.close();throw error;}
rmSync(config);rmSync(unsigned);
console.log(JSON.stringify({signed,input:qa.input,endpoint:qa.endpoint,expiresMinutes:20,shortcutName,commands:['status','run','import','mode <fault-mode>','close'],instructions:'Import this session-specific copy and select the printed input folder in the first File action under setup 1/3, then run. Approve only loopback/generated-fixture prompts. After import command succeeds, change second Text from retain to delete-after-saved for cleanup acceptance.'}));
const rl=createInterface({input:process.stdin,terminal:false});let child,closed=false,busy=false;
async function close(){if(closed)return;closed=true;child?.kill('SIGTERM');rl.close();console.log(JSON.stringify({final:qa.stats(),fixturesRemaining:qa.filenames.filter(name=>existsSync(join(qa.input,name)))}));await qa.close();}
const expiry=setTimeout(()=>void close(),20*60000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void close());
rl.on('close',()=>{clearTimeout(expiry);void close();});
rl.on('line',async line=>{
 if(busy||closed)return;busy=true;
 try{
  const [command,...args]=line.trim().split(/\s+/);
  if(command==='close')await close();
  else if(command==='status')console.log(JSON.stringify({stats:qa.stats(),fixturesRemaining:qa.filenames.filter(name=>existsSync(join(qa.input,name)))}));
  else if(command==='mode'){qa.setMode(args[0]);console.log('Synthetic fault mode: '+args[0]);}
  else if(command==='import'){await qa.completeSavedImport();console.log('Original isolated review/import saved; fresh full-import cleanup receipt verified. Stored originals retained.');}
  else if(command==='run'){
   const started=new Date().toISOString();
   child=spawn('shortcuts',['run',shortcutName,'--input-path',qa.input],{stdio:['ignore','pipe','pipe']});
   const errors=[];child.stderr.on('data',v=>errors.push(v));child.stdout.resume();
   const timer=setTimeout(()=>child?.kill('SIGTERM'),60000);
   const result=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
   clearTimeout(timer);child=null;
   console.log(JSON.stringify({started,...result,stderr:Buffer.concat(errors).toString().replaceAll(qa.token,'[redacted]'),stats:qa.stats(),fixturesRemaining:qa.filenames.filter(name=>existsSync(join(qa.input,name)))}));
  }else console.log('Commands: status, run, import, mode <fault-mode>, close');
 }catch(error){console.log(String(error.message).replaceAll(qa.token,'[redacted]'));}finally{busy=false;}
});
