import {encryptedDatabaseBackup,restoreBackupToNewFile} from './backup-crypto.mjs';
// No destination or private key is inferred. Never overwrite the live DB.
try{
 const mode=process.argv[2];
 if(mode==='create'){
  if(!process.env.BACKUP_PUBLIC_KEY_FILE||!process.env.BACKUP_ENCRYPTED_DIR)throw Error('Configure BACKUP_PUBLIC_KEY_FILE and BACKUP_ENCRYPTED_DIR first');
  const result=await encryptedDatabaseBackup({source:process.env.DB_PATH??'/app/data/monthly-flow.sqlite',publicKeyFile:process.env.BACKUP_PUBLIC_KEY_FILE,directory:process.env.BACKUP_ENCRYPTED_DIR,release:process.env.BACKUP_RELEASE??''});const {reportCoverage,...receipt}=result;console.log(JSON.stringify(receipt));
 }else if(mode==='restore-check'){
  const [backup,privateKeyFile,output,reportKeyOutput]=process.argv.slice(3);if(!backup||!privateKeyFile||!output)throw Error('Usage: restore-check <archive.backup> <private-key.pem> <new-file.sqlite> [new-report-store.key]');
  console.log(JSON.stringify(await restoreBackupToNewFile({backup,privateKeyFile,output,reportKeyOutput})));
 }else throw Error('Use create or restore-check. Configuration and external transfer are required before this is an offsite backup.');
}catch(error){console.error(error.message);process.exitCode=1;}
