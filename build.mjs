import {verifyVendors} from './scripts/verify-vendor.mjs';
verifyVendors();
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,cpSync,statSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const authority=JSON.parse(readFileSync('SOURCE-OF-TRUTH.json','utf8'));
const hosting=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(hosting.project_id!==authority.project_id)throw Error('Wrong Site identity: use the canonical Monthly Flow project described in SOURCE-OF-TRUTH.json.');
const frontendSources=(folder)=>readdirSync(folder).sort().flatMap(name=>{const path=folder+'/'+name;if(name==='node_modules'||name==='dist')return[];return statSync(path).isDirectory()?frontendSources(path):[path]});
const buildId=createHash('sha256').update(readdirSync('src').sort().map(name=>name+'\n'+readFileSync('src/'+name,'utf8')).join('\n')).update(readdirSync('tools/bank-csv').filter(name=>/\.(?:mjs|js)$/.test(name)&&!/(?:test|fixture|serve)/.test(name)).sort().map(name=>name+'\n'+readFileSync('tools/bank-csv/'+name,'utf8')).join('\n')).update(frontendSources('frontend/src').map(name=>name+'\n'+readFileSync(name)).join('\n')).digest('hex').slice(0,10);
execFileSync('npm',['run','build'],{cwd:'frontend',stdio:'inherit'});
mkdirSync('dist/server',{recursive:true});

// Stage 2 reuses the same pure controller graph and bounded document readers.
const copiedAutomaticModels=new Set();
function copyAutomaticModel(name){if(copiedAutomaticModels.has(name))return;copiedAutomaticModels.add(name);const source=readFileSync('src/'+name,'utf8');copyFileSync('src/'+name,'dist/server/'+name);for(const match of source.matchAll(/from ['"]\.\/([^'"]+\.js)['"]/g))copyAutomaticModel(match[1]);}
copyAutomaticModel('report-automation-model.js');
copyAutomaticModel('report-lifecycle-model.js');
cpSync('tools/bank-csv','dist/import-readers',{recursive:true,filter:path=>!/(?:node_modules|\.test\.mjs$|fixture|serve\.mjs$)/.test(path)});
writeFileSync('dist/server/report-parser-version.mjs','export const parserVersion = '+JSON.stringify(buildId)+';\n');

copyFileSync('tools/bank-csv/cal-activity.mjs','dist/server/cal-activity.mjs');
copyFileSync('tools/bank-csv/parser.mjs','dist/server/parser.mjs');
copyFileSync('tools/bank-csv/cal-pdf.mjs','dist/server/cal-pdf.mjs');
copyFileSync('tools/bank-csv/statement-notices.mjs','dist/server/statement-notices.mjs');
cpSync('frontend/dist','dist/frontend',{recursive:true,force:true});
copyFileSync('src/worker.js','dist/server/index.js');
copyFileSync('src/budget.js','dist/server/budget.js');
copyFileSync('src/reconciliation-model.js','dist/server/reconciliation-model.js');
copyFileSync('src/card-billing-model.js','dist/server/card-billing-model.js');
copyFileSync('src/spaces-worker.js','dist/server/spaces-worker.js');
copyFileSync('src/space-model.js','dist/server/space-model.js');
copyFileSync('src/space-migration-model.js','dist/server/space-migration-model.js');
copyFileSync('src/wallet-text-model.js','dist/server/wallet-text-model.js');
copyFileSync('src/card-metadata.js','dist/server/card-metadata.js');
copyFileSync('src/gmail-filter-model.js','dist/server/gmail-filter-model.js');
copyFileSync('src/purchase-notes-model.js','dist/server/purchase-notes-model.js');
copyFileSync('src/space-savings-model.js','dist/server/space-savings-model.js');
copyFileSync('src/space-savings-migration.js','dist/server/space-savings-migration.js');
copyFileSync('src/manual-account-migration.js','dist/server/manual-account-migration.js');
copyFileSync('src/card-account-migration.js','dist/server/card-account-migration.js');
copyFileSync('src/transfer-matching-model.js','dist/server/transfer-matching-model.js');
copyFileSync('src/vault.js','dist/server/vault.js');
rmSync('dist/index.html',{force:true});
rmSync('dist/server/page.js',{force:true});
const assets={'/sw.js':{type:'text/javascript; charset=utf-8',data:readFileSync('public/sw.js').toString('base64')}};
for(const name of readdirSync('public/icons')){if(!name.endsWith('.png'))continue;assets['/icons/'+name]={type:'image/png',data:readFileSync('public/icons/'+name).toString('base64')};}
assets['/shortcuts/install']={type:'text/html; charset=utf-8',data:Buffer.from(readFileSync('public/shortcut-install.html','utf8').replace('/*THEME*/',()=>readFileSync('src/theme.js','utf8'))).toString('base64')};
assets['/shortcuts/budgit-apple-pay-ios27.shortcut']={type:'application/octet-stream',download:'budgit-apple-pay-ios27.shortcut',data:readFileSync('public/shortcuts/budgit-apple-pay-ios27.shortcut').toString('base64')};
assets['/shortcuts/budgit-apple-pay.shortcut']={type:'application/octet-stream',download:'budgit-apple-pay.shortcut',data:readFileSync('public/shortcuts/budgit-apple-pay.shortcut').toString('base64')};
assets['/shortcuts/budgit-incoming.shortcut']={type:'application/octet-stream',download:'budgit-incoming.shortcut',data:readFileSync('public/shortcuts/budgit-incoming.shortcut').toString('base64')};
assets['/manifest.webmanifest']={type:'application/manifest+json; charset=utf-8',data:readFileSync('public/manifest.webmanifest').toString('base64')};
for(const [url,file]of Object.entries({'/bank-import/statement-notices.mjs':'statement-notices.mjs','/bank-import/intake-reader.mjs':'intake-reader.mjs','/bank-import/cal-billing.mjs':'cal-billing.mjs','/bank-import/cal-activity.mjs':'cal-activity.mjs','/bank-import/pdf-reader.mjs':'pdf-reader.mjs','/bank-import/isracard-pdf.mjs':'isracard-pdf.mjs','/bank-import/isracard-xlsx.mjs':'isracard-xlsx.mjs','/bank-import/cal-pdf.mjs':'cal-pdf.mjs','/bank-import/vendor/pdfjs/pdf.mjs':'vendor/pdfjs/pdf.mjs','/bank-import/vendor/pdfjs/pdf.worker.mjs':'vendor/pdfjs/pdf.worker.mjs','/bank-import/parser.mjs':'parser.mjs','/bank-import/classifier.mjs':'classifier.mjs','/bank-import/xlsx-reader.mjs':'xlsx-reader.mjs','/bank-import/xlsx-worker.js':'xlsx-worker.js','/bank-import/vendor/xlsx-mini.js':'vendor/xlsx-mini.cjs','/bank-import/vendor/xlsx-full.js':'vendor/xlsx-full.cjs'})){assets[url]={type:'text/javascript; charset=utf-8',data:readFileSync('tools/bank-csv/'+file).toString('base64')};}
writeFileSync('dist/server/assets.js','export const assets = '+JSON.stringify(assets)+';\n');
console.log('Budget app built.');
