import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
const source=process.env.DB_PATH??'/app/data/monthly-flow.sqlite';
const directory=resolve(process.env.BACKUP_DIR??'/app/data/backups');
mkdirSync(directory,{recursive:true,mode:0o700});
const target=resolve(directory,'monthly-flow-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(target);db.close();chmodSync(target,0o600);
const check=new DatabaseSync(target,{readOnly:true});if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity failed');check.close();console.log('Consistent SQLite backup created and verified.');
