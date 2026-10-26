// Run on a trusted external machine, optionally pointing DESTINATION at a synced folder.
// SSH and destination must be explicitly configured. Never copies a plaintext database.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const {BACKUP_SSH_HOST:host,BACKUP_SSH_KEY:key,BACKUP_DESTINATION:directory}=process.env;
if(!host||!key||!directory||!/^[a-zA-Z0-9_.@-]+$/.test(host))throw Error('Configure BACKUP_SSH_HOST, BACKUP_SSH_KEY and BACKUP_DESTINATION');
const run=(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:1024*1024});if(r.status!==0)throw Error(command+' failed; no successful external backup recorded');return r.stdout;};
await mkdir(directory,{recursive:true,mode:0o700});
const options=['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15'];
const receipt=JSON.parse(run('ssh',[...options,host,'docker exec -e BACKUP_PUBLIC_KEY_FILE=/app/data/backup-recipient.pem -e BACKUP_ENCRYPTED_DIR=/app/data/encrypted-backups budgit-budgit-1 node server/offsite-backup.mjs create']));
if(!/^\/app\/data\/encrypted-backups\/budgit-[0-9TZ.-]+\.backup$/.test(receipt.file)||!/^[a-f0-9]{64}$/.test(receipt.sha256))throw Error('Invalid remote backup receipt');
const name=receipt.file.split('/').at(-1),output=resolve(directory,name),temporary=output+'.partial';
try{
 run('scp',[...options,host+':/opt/budgit/data/encrypted-backups/'+name,temporary]);const data=await readFile(temporary);
 if(createHash('sha256').update(data).digest('hex')!==receipt.sha256)throw Error('External backup checksum mismatch');
 await rename(temporary,output);await writeFile(resolve(directory,'last-success.json'),JSON.stringify({copiedAt:new Date().toISOString(),file:name,sha256:receipt.sha256,keyFingerprint:receipt.keyFingerprint},null,2),{mode:0o600});
 console.log('Encrypted backup copied and checksum verified. Cloud synchronization, when used, must be checked separately.');
}finally{await rm(temporary,{force:true});}
