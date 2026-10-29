import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
import {createRequire} from 'node:module'
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const bundle=await build({entryPoints:['frontend/src/app/drive-backup-page.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],logLevel:'silent'}),module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);const {DriveBackupSummary}=module.exports
const render=value=>renderToStaticMarkup(React.createElement(DriveBackupSummary,{value}))
test('Native Drive summary separates connection, verified upload and real restore practice; safe provider error text is escaped',()=>{let html=render({connected:true,ready:true,enabled:false,lastSuccess:null,error:'<script>secret</script>'});assert.match(html,/עדיין אין גיבוי חיצוני מוצלח/);assert.match(html,/אינה תרגיל שחזור/);assert.match(html,/&lt;script&gt;secret&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>|גיבוי אחרון שהועלה/);html=render({connected:true,ready:true,enabled:true,scheduleMode:'changes-nightly',lastSuccess:100000000,pendingChanges:true});for(const text of ['שלמותו נבדקה בהורדה חוזרת','23:59','נתונים שטרם גובו','האפליקציה אינה מאמתת שבוצע תרגיל שחזור'])assert.ok(html.includes(text),text)})
