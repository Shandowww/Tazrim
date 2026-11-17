import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from '../frontend/node_modules/esbuild/lib/main.js'
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const code=await build({entryPoints:['frontend/src/app/money-amount.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],logLevel:'silent'}),module={exports:{}}
new Function('require','module','exports',code.outputFiles[0].text)(require,module,module.exports)
const render=(value,minimumFractionDigits=0)=>renderToStaticMarkup(React.createElement(module.exports.MoneyAmount,{value,minimumFractionDigits}))
test('Shekel presentation keeps the currency before a stable signed number, including zero and large values',()=>{
 for(const [value,text]of [[1234.56,'1,234.56'],[-1234.56,'-1,234.56'],[0,'0'],[100000000.01,'100,000,000.01']]){
  const markup=render(value);assert.match(markup,/dir="ltr"/);assert.ok(markup.includes('<span class="money-symbol">₪</span> <span class="money-number">'+text+'</span>'))
 }
 assert.match(render(0,2),/>0\.00<\/span>/)
})
test('Missing-report text does not invent a zero balance or a currency amount',()=>{assert.equal(render(null),'<span>חסר דיווח</span>')})
