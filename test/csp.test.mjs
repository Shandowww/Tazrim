import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {scriptReportPolicy} from '../server/app.mjs';
test('Enforced script policy hashes exact inline script content and excludes unsafe-inline for scripts',()=>{
 const script='window.safe=true;';const policy=scriptReportPolicy('<script>'+script+'</script><script src="/module.js"></script>');
 assert.ok(policy.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"));assert.ok(!policy.split('script-src ')[1].split(';')[0].includes('unsafe-inline'));
 assert.notEqual(policy,scriptReportPolicy('<script>'+script+'evil()</script>'));assert.match(policy,/worker-src 'self' blob:/);
});
