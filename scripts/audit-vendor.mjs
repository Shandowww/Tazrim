// Advisory checks complement build-time byte hashes for parsers outside npm's lockfile.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyVendors} from './verify-vendor.mjs';
export function assess(vulns, policy, now=new Date()) {
 if(!Array.isArray(vulns)) throw Error('Invalid advisory response');
 return vulns.map(v=>{
  if(!v || typeof v.id!=='string') throw Error('Invalid advisory record');
  const exception=policy.exceptions?.find(e=>e.id===v.id && e.modified===v.modified);
  const accepted=!!exception && now.getTime()<Date.parse(exception.reviewBefore+'T00:00:00Z');
  return {id:v.id,accepted,reason:accepted?exception.reason:'New, changed or expired advisory: review required'};
 });
}
export async function auditVendors(fetcher=fetch) {
 verifyVendors();
 const manifest=JSON.parse(readFileSync('tools/bank-csv/vendor/manifest.json','utf8'));
 const policies=JSON.parse(readFileSync('tools/bank-csv/vendor/advisories.json','utf8'));
 let failed=false;
 for(const policy of policies){
  const files=manifest.files.filter(f=>policy.files.includes(f.path));
  if(files.length!==policy.files.length || files.some(f=>f.version!==policy.version))throw Error('Vendor advisory mapping must match pinned files');
  const response=await fetcher('https://api.osv.dev/v1/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package:{name:policy.package,ecosystem:'npm'},version:policy.version}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Vendor advisory service failed: '+response.status);
  const data=await response.json();
  if(!data || typeof data!=='object' || Array.isArray(data))throw Error('Invalid advisory response');
  const results=assess(data.vulns??[],policy);
  console.log(JSON.stringify({package:policy.package,version:policy.version,findings:results}));
  failed ||= results.some(v=>!v.accepted);
 }
 if(failed)throw Error('Unreviewed vendor vulnerability findings');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))auditVendors().catch(e=>{console.error(e.message);process.exitCode=1;});
