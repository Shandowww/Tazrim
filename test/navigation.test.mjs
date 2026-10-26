import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationViewportInset} from '../src/navigation.js';

test('navigation follows the visible screen and keyboard without accumulating scroll',()=>{
 assert.equal(navigationViewportInset(844,{height:844,offsetTop:0,scale:1}),0);
 assert.equal(navigationViewportInset(844,{height:760,offsetTop:0,scale:1}),84);
 assert.equal(navigationViewportInset(844,{height:500,offsetTop:40,scale:1}),304);
 assert.equal(navigationViewportInset(844,{height:804,offsetTop:40,scale:1}),0);
 assert.equal(navigationViewportInset(844,{height:850,offsetTop:0,scale:1}),0);
 assert.equal(navigationViewportInset(844,{height:422,offsetTop:100,scale:2}),0);
 assert.equal(navigationViewportInset(844,null),0);
});
