// Run on the trusted recovery computer. Never run on the production server.
import {generateKeyPairSync} from 'node:crypto';import {mkdir,writeFile,rm} from 'node:fs/promises';import {resolve,join} from 'node:path';import {keyFingerprint} from '../server/backup-crypto.mjs';
const destination=process.argv[2];if(!destination)throw Error('Supply a new private recovery directory outside cloud-synchronized folders');
const directory=resolve(destination);await mkdir(directory,{mode:0o700});
try{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 await writeFile(join(directory,'recovery-private.pem'),privateKey,{mode:0o600,flag:'wx'});await writeFile(join(directory,'backup-recipient.pem'),publicKey,{mode:0o644,flag:'wx'});
 console.log('Recovery keys created. Keep recovery-private.pem off Hetzner; retain a separate secure recovery copy. Public recipient fingerprint: '+keyFingerprint(publicKey));
}catch(error){await rm(directory,{recursive:true,force:true});throw error;}
