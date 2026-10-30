// Used only by isolated release preflight. Hash existing columns without logging values.
import {createHash} from 'node:crypto';
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
const derived=name=>name.startsWith('sqlite_')||name.startsWith('financial_')||['standalone_migrations','backup_data_state'].includes(name);
function storedDigest(db,name,columns){
 const hash=createHash('sha256');let rows=0;
 const statement=db.prepare(`SELECT ${columns.map(identifier).join(',')} FROM ${identifier(name)} ORDER BY ${columns.flatMap(column=>['typeof('+identifier(column)+')',identifier(column)+' COLLATE BINARY']).join(',')}`);statement.setReadBigInts(true);
 for(const row of statement.iterate()){
  rows++;hash.update('row:');
  for(const key of columns){const value=row[key],type=value===null?'null':value instanceof Uint8Array?'blob':typeof value,bytes=value instanceof Uint8Array?value:Buffer.from(value===null?'':String(value));hash.update(type+':'+bytes.length+':');hash.update(bytes);}
 }
 return{rows,sha256:hash.digest('hex')};
}
export function snapshotStoredRecords(db){
 return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().filter(({name})=>!derived(name)).map(({name})=>{
  const columns=db.prepare(`PRAGMA table_info(${identifier(name)})`).all().map(row=>row.name);
  return{name,columns,...storedDigest(db,name,columns)};
 });
}
export function assertStoredRecords(db,snapshot){
 for(const expected of snapshot){const columns=db.prepare(`PRAGMA table_info(${identifier(expected.name)})`).all().map(row=>row.name);if(expected.columns.some(column=>!columns.includes(column)))throw Error('Startup removed existing stored columns: '+expected.name);const actual=storedDigest(db,expected.name,expected.columns);if(actual.rows!==expected.rows||actual.sha256!==expected.sha256)throw Error('Startup changed existing stored records: '+expected.name);}
}
