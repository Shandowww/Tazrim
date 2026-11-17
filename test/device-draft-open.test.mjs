import test from 'node:test'
import assert from 'node:assert/strict'
import {deviceDraftDB} from '../src/device-drafts.js'

function fake(t){const request={};const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open:()=>request}});t.after(()=>{if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else delete globalThis.indexedDB});return request}
test('A stalled IndexedDB open fails within five seconds and closes a connection arriving afterward',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const request=fake(t),pending=deviceDraftDB(),rejected=assert.rejects(pending,/לא ניתן לפתוח/)
 t.mock.timers.tick(5000);await rejected
 let closed=0;request.result={close:()=>closed++};request.onsuccess();assert.equal(closed,1)
})
test('A blocked open gives an actionable failure and refuses late connection retention',async t=>{
 const request=fake(t),pending=deviceDraftDB(),rejected=assert.rejects(pending,/ללשונית אחרת/)
 request.onblocked();await rejected
 let closed=0;request.result={close:()=>closed++};request.onsuccess();assert.equal(closed,1)
})
test('An ordinary open resolves with its existing database, while errors remain failures',async t=>{
 const request=fake(t),pending=deviceDraftDB(),database={close:()=>{throw Error('caller owns this connection')}}
 request.result=database;request.onsuccess();assert.equal(await pending,database)
 const failure=deviceDraftDB(),rejected=assert.rejects(failure,/denied/);request.error=Error('denied');request.onerror();await rejected
})
