import {DatabaseSync} from 'node:sqlite'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {snapshotStoredRecords,assertStoredRecords} from '/app/server/preflight-preservation.mjs'
const [mode,source,receipt]=process.argv.slice(2)
const database=new DatabaseSync(source,{readOnly:true})
try{
 database.exec('BEGIN')
 if(mode==='snapshot'){
  const tables=snapshotStoredRecords(database).filter(table=>table.name!=='reference_interest')
  const backup=tables.find(table=>table.name==='drive_backup_connections')
  if(backup){
   backup.columns=backup.columns.filter(column=>column!=='last_attempt')
   const quote=value=>'"'+value.replaceAll('"','""')+'"',hash=createHash('sha256')
   const statement=database.prepare(`SELECT ${backup.columns.map(quote).join(',')} FROM ${quote(backup.name)} ORDER BY ${backup.columns.flatMap(column=>['typeof('+quote(column)+')',quote(column)+' COLLATE BINARY']).join(',')}`)
   statement.setReadBigInts(true);backup.rows=0
   for(const row of statement.iterate()){
    backup.rows++;hash.update('row:')
    for(const key of backup.columns){const value=row[key],type=value===null?'null':value instanceof Uint8Array?'blob':typeof value,bytes=value instanceof Uint8Array?value:Buffer.from(value===null?'':String(value));hash.update(type+':'+bytes.length+':');hash.update(bytes)}
   }
   backup.sha256=hash.digest('hex')
  }
  writeFileSync(receipt,JSON.stringify(tables),{mode:0o600})
  console.log(JSON.stringify({authoritativeTablesSnapshotted:tables.length,referenceInterestCacheExcluded:true,backupAttemptTimestampExcluded:true}))
 }else if(mode==='verify'){
  const tables=JSON.parse(readFileSync(receipt,'utf8'))
  assertStoredRecords(database,tables)
  if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||database.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database integrity check failed')
  console.log(JSON.stringify({authoritativeTablesPreserved:tables.length,integrity:true,foreignKeys:true,referenceInterestCacheExcluded:true,backupAttemptTimestampExcluded:true}))
 }else throw Error('Unknown preservation mode')
 database.exec('COMMIT')
}finally{database.close()}
