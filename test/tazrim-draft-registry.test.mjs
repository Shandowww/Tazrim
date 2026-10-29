import test from 'node:test'
import assert from 'node:assert/strict'
import {DraftRegistry} from '../frontend/src/app/draft-registry.ts'
const entry=extra=>({kind:'monthly',dirty:false,busy:false,discard(){},...extra})
test('Draft registration is inert until actual changes and removing a scoped form releases its guard',()=>{
 const r=new DraftRegistry();let notified=0;const off=r.subscribe(()=>notified++)
 r.set('personal:monthly',entry());assert.equal(r.getSnapshot().dirty,false);assert.equal(notified,0)
 r.set('personal:monthly',entry({dirty:true}));assert.equal(r.getSnapshot().dirty,true);assert.equal(r.getSnapshot().canSave,false)
 r.remove('personal:monthly');assert.deepEqual(r.getSnapshot(),{dirty:false,busy:false,canSave:false,count:0,errors:[]});off()
})
test('One explicit save runs once, blocks discard while pending and clears only after a real success',async()=>{
 const r=new DraftRegistry();let resolve,calls=0,discarded=0
 r.set('monthly',entry({dirty:true,discard(){discarded++},save:()=>{calls++;return new Promise(done=>resolve=done)}}))
 const pending=r.saveAll();assert.equal(r.getSnapshot().busy,true);assert.equal(r.discardAll(),false);assert.equal(await r.saveAll(),false);assert.equal(discarded,0);assert.equal(calls,1)
 resolve(true);assert.equal(await pending,true);assert.equal(r.getSnapshot().dirty,false);assert.equal(r.getSnapshot().busy,false)
})
test('Failed/unsupported saves retain dirty work; one successful form does not silently clear another failed form',async()=>{
 const r=new DraftRegistry();r.set('monthly',entry({dirty:true,save:async()=>true}));r.set('savings',entry({kind:'savings',dirty:true,save:async()=>false}))
 assert.equal(await r.saveAll(),false);assert.equal(r.getSnapshot().count,1);assert.equal(r.getSnapshot().dirty,true)
 let discarded=0;r.set('savings',entry({kind:'savings',dirty:true,discard(){discarded++}}));assert.equal(await r.saveAll(),false);assert.equal(discarded,0);assert.equal(r.discardAll(),true);assert.equal(discarded,1);assert.equal(r.getSnapshot().dirty,false)
})
test('Save exceptions cannot leave an in-flight guard stuck or declare a draft saved',async()=>{
 const r=new DraftRegistry();r.set('security',entry({kind:'security',dirty:true,save:async()=>{throw Error('synthetic')}}));await assert.rejects(r.saveAll(),/synthetic/);assert.equal(r.getSnapshot().dirty,true);assert.equal(r.getSnapshot().busy,false)
})
test('Only explicit dirty-entry save failures reach the registry error channel and disappear on discard, removal or a clean entry',()=>{const r=new DraftRegistry();r.set('ordinary',entry({dirty:true}));assert.deepEqual(r.getSnapshot().errors,[]);r.set('actual',entry({dirty:true,saveError:'synthetic failed save'}));assert.deepEqual(r.getSnapshot().errors,['synthetic failed save']);r.set('clean',entry({saveError:'stale error without a draft'}));assert.deepEqual(r.getSnapshot().errors,['synthetic failed save']);r.remove('actual');assert.deepEqual(r.getSnapshot().errors,[]);r.set('ordinary',entry({dirty:true,saveError:'retry required'}));r.discardAll();assert.deepEqual(r.getSnapshot().errors,[])});
