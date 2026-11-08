// Interactive, bounded native acceptance. Only generated fixtures reach loopback.
// Requires the owner to import the signed QA revision and approve native prompts.
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,rmSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {startIncomingShortcutQA} from './incoming-shortcut-qa.mjs';

const cleanup=process.argv.includes('--delete-after-upload')?'delete-after-upload':'retain';
if(process.argv.slice(2).some(arg=>arg!=='--delete-after-upload'))throw Error('Only --delete-after-upload is supported');
const qa=await startIncomingShortcutQA();
const shortcutName='Budgit-Incoming-QA-day0-'+new URL(qa.origin).port+'-'+randomBytes(3).toString('hex');
const directory=join(qa.input,'..'),config=join(directory,'config.json'),unsigned=join(directory,'qa.wflow'),signed=join(directory,shortcutName+'.shortcut');
writeFileSync(config,JSON.stringify({endpoint:qa.endpoint,token:qa.token,qaName:shortcutName,cleanupMode:cleanup}),{mode:0o600,flag:'wx'});
try{
execFileSync('python3',['-B','scripts/build-incoming-shortcut.py','--qa-config',config,'--output',unsigned],{timeout:15000});
chmodSync(unsigned,0o600);
// The explicit CLI cleanup option applies only to generated synthetic files.
// Production artifacts retain by default and require the owner's setup choice.
execFileSync('shortcuts',['sign','--mode','anyone','--input',unsigned,'--output',signed],{stdio:'pipe',timeout:30000});
chmodSync(signed,0o600);
}catch(error){await qa.close();throw error;}
rmSync(config);rmSync(unsigned);
console.log(JSON.stringify({signed,input:qa.input,endpoint:qa.endpoint,expiresMinutes:20,shortcutName,cleanup,commands:['status','run','reset','import','mode <fault-mode>','close'],instructions:'Import this session-specific copy and select the printed input folder in the first File action under setup 1/3, then run. Approve only loopback/generated-fixture prompts. This copy tests the printed cleanup mode; it requires no financial import. Files may ask deletion confirmation for generated fixtures only.'}));
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
  else if(command==='status')console.log(JSON.stringify({stats:qa.stats(),storedOriginal:await qa.verifyStoredOriginal(),fixturesRemaining:qa.filenames.filter(name=>existsSync(join(qa.input,name)))}));
  else if(command==='reset'){qa.resetFixtures();console.log('Generated fixtures restored; stored receipts retained.');}
  else if(command==='mode'){qa.setMode(args[0]);console.log('Synthetic fault mode: '+args[0]);}
  else if(command==='import'){await qa.completeSavedImport();console.log('Original isolated review/import saved; fresh full-import cleanup receipt verified. Stored originals retained.');}
  else if(command==='run'){
   const started=new Date().toISOString();
   child=spawn('shortcuts',['run',shortcutName,'--input-path',qa.input],{stdio:['ignore','pipe','pipe']});
   const errors=[];child.stderr.on('data',v=>errors.push(v));child.stdout.resume();
   const timer=setTimeout(()=>child?.kill('SIGTERM'),60000);
   const result=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
   clearTimeout(timer);child=null;
   console.log(JSON.stringify({started,...result,stderr:Buffer.concat(errors).toString().replaceAll(qa.token,'[redacted]'),stats:qa.stats(),storedOriginal:await qa.verifyStoredOriginal(),fixturesRemaining:qa.filenames.filter(name=>existsSync(join(qa.input,name)))}));
  }else console.log('Commands: status, run, reset, import, mode <fault-mode>, close');
 }catch(error){console.log(String(error.message).replaceAll(qa.token,'[redacted]'));}finally{busy=false;}
});
