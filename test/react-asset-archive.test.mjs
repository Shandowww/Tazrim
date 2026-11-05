import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,utimesSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {retainReactAssets} from '../server/react-asset-archive.mjs'
import {reactUiResponse} from '../server/react-ui.mjs'
import {createApp} from '../server/app.mjs'
import {openDatabase} from '../server/database.mjs'

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'budgit-ui-assets-')),frontendRoot=join(root,'frontend'),archiveRoot=join(root,'retained')
 mkdirSync(join(frontendRoot,'assets'),{recursive:true})
 writeFileSync(join(frontendRoot,'index.html'),'<h1>Current app</h1>')
 return {root,frontendRoot,archiveRoot,close:()=>rmSync(root,{recursive:true,force:true})}
}

test('An open previous release keeps importing its original modules after a deployment',async()=>{
 const files=fixture(),name='loans-page-Previous1.js',old='export const version="previous"'
 try{
  writeFileSync(join(files.frontendRoot,'assets',name),old)
  writeFileSync(join(files.frontendRoot,'assets','scenario-page-Previous2.js'),'export const calculator=true')
  assert.equal(retainReactAssets(files.archiveRoot,files),2)
  rmSync(join(files.frontendRoot,'assets',name))
  writeFileSync(join(files.frontendRoot,'assets','loans-page-Current01.js'),'export const version="current"')
  retainReactAssets(files.archiveRoot,files)
  const request=new Request('https://app.test/ui-assets/assets/'+name)
  const options={frontendRoot:files.frontendRoot,assetArchiveRoot:files.archiveRoot}
  assert.equal(reactUiResponse(request,{frontendRoot:files.frontendRoot}).status,404)
  const response=reactUiResponse(request,options)
  assert.equal(response.status,200);assert.equal(await response.text(),old)
  assert.match(response.headers.get('Content-Type'),/^text\/javascript/)
  assert.equal(response.headers.get('Cache-Control'),'private, max-age=31536000, immutable')
  assert.equal(await reactUiResponse(new Request(request,{method:'HEAD'}),options).text(),'')
  assert.match(await reactUiResponse(new Request('https://app.test/next/loans'),options).text(),/Current app/)
  assert.equal(reactUiResponse(new Request('https://app.test/ui-assets/assets/missing-Abcdef12.js'),options).status,404)
 }finally{files.close()}
})

test('Retention excludes non-assets, expires old releases and refuses immutable collisions',()=>{
 const files=fixture(),now=Date.now(),old=now-31*86400000
 try{
  writeFileSync(join(files.frontendRoot,'assets','index-Current1.js'),'current')
  writeFileSync(join(files.frontendRoot,'assets','private.json'),'private')
  retainReactAssets(files.archiveRoot,{...files,now:old})
  writeFileSync(join(files.archiveRoot,'loans-page-Expired1.js'),'old')
  utimesSync(join(files.archiveRoot,'loans-page-Expired1.js'),old/1000,old/1000)
  retainReactAssets(files.archiveRoot,{...files,now})
  assert.equal(existsSync(join(files.archiveRoot,'loans-page-Expired1.js')),false)
  assert.equal(existsSync(join(files.archiveRoot,'index-Current1.js')),true)
  assert.equal(existsSync(join(files.archiveRoot,'private.json')),false)
  writeFileSync(join(files.frontendRoot,'assets','index-Current1.js'),'different')
  assert.throws(()=>retainReactAssets(files.archiveRoot,files),/Conflicting immutable UI asset/)
  assert.equal(readFileSync(join(files.archiveRoot,'index-Current1.js'),'utf8'),'current')
 }finally{files.close()}
})

test('Retained assets keep authentication, revoked access and path restrictions',async()=>{
 const files=fixture(),{db,DB}=openDatabase(':memory:'),origin='https://app.test'
 try{
  mkdirSync(files.archiveRoot)
  writeFileSync(join(files.archiveRoot,'loans-page-Previous1.js'),'export const safe=true')
  writeFileSync(join(files.archiveRoot,'private.json'),'not public')
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test'],reactAssetArchiveRoot:files.archiveRoot})
  db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run('alice','alice','alice@example.test',Date.now())
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update('token').digest('hex'),'alice',Date.now()+60000)
  const request=(path,headers={})=>app(new Request(origin+path,{headers})),cookie='__Host-mf_session=token',path='/ui-assets/assets/loans-page-Previous1.js'
  assert.equal((await request(path)).status,404)
  assert.equal((await request(path,{'oai-authenticated-user-id':'alice'})).status,404)
  assert.equal((await request(path,{cookie})).status,200)
  for(const invalid of ['/ui-assets/assets/private.json','/ui-assets/private.json','/ui-assets/assets/../../private.json','/ui-assets/assets/%2e%2e/private.json'])assert.equal((await request(invalid,{cookie})).status,404)
  db.prepare('DELETE FROM auth_access WHERE email=?').run('alice@example.test')
  assert.notEqual((await request(path,{cookie})).status,200)
 }finally{db.close();files.close()}
})
