import {createHash} from 'node:crypto';import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
export function verifyVendors(){
 const manifest=JSON.parse(readFileSync('tools/bank-csv/vendor/manifest.json','utf8'));
 for(const entry of manifest.files){if(createHash('sha256').update(readFileSync(entry.path)).digest('hex')!==entry.sha256)throw Error('Vendored parser integrity mismatch: '+entry.path);}
 for(const path of ['tools/bank-csv/vendor/LICENSE','tools/bank-csv/vendor/pdfjs/LICENSE'])if(!existsSync(path))throw Error('Missing parser license');
 return manifest.files.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Verified '+verifyVendors()+' pinned parser files and retained licenses.');
