import {synchronizeFinancialData} from './financial-data.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDatabase(path){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS standalone_migrations(name TEXT PRIMARY KEY)');
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())if(!db.prepare('SELECT name FROM standalone_migrations WHERE name=?').get(name)){
  db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync('drizzle/'+name,'utf8'));db.prepare('INSERT INTO standalone_migrations VALUES (?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 db.exec(`CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE,email TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_pending(hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,nonce TEXT NOT NULL,return_to TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_access(email TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_access_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_limits(hash TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
 db.exec('BEGIN IMMEDIATE');try{synchronizeFinancialData(db);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
 const makeDB=(onPlanWrite=null,audit=null)=>({
  withPlanWrite(callback){return makeDB(()=>{onPlanWrite?.();callback();},audit);},
  withPlanAudit(callback){return makeDB(onPlanWrite,callback);},
  prepare(sql){
   return {bind(...args){
    return {
     async all(){return {results:db.prepare(sql).all(...args)};},
     async first(){return db.prepare(sql).get(...args)??null;},
     async run(){
      const project=/^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+[`"]?(?:plans|budgets)[`"]?\b/i.test(sql);
      if(project)db.exec('BEGIN IMMEDIATE');
      try{const finish=project?audit?.():null,r=db.prepare(sql).run(...args);if(project){if(r.changes){synchronizeFinancialData(db);finish?.();if(onPlanWrite)onPlanWrite();}db.exec('COMMIT');}return {meta:{changes:Number(r.changes)}};}catch(error){if(project)db.exec('ROLLBACK');throw error;}
     }
    };
   }};
  }
 });
 const DB=makeDB();
 return {db,DB};
}
