import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,writeFileSync} from 'node:fs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const fixture=spawn(process.execPath,['test/helpers/classification-review-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{
 const lines=createInterface({input:fixture.stdout});
 lines.on('line',line=>{if(line.startsWith('{')){resolve(JSON.parse(line).url);lines.close();}});
 fixture.once('exit',code=>reject(Error('Fixture exited: '+code)));
});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[],errors=[];
const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
const request=(path,init={})=>fetch(origin+path,{...init,headers:{cookie:'qa-case=fresh','content-type':'application/json',...init.headers}});
const snapshot=async()=>{const response=await request('/api/plan');assert.equal(response.status,200);return response.json();};
const write=async base=>{const response=await request('/api/plan',{method:'PUT',body:JSON.stringify({plan:base.plan,revision:base.revision})});assert.equal(response.status,200);};
const output='work/ui-redesign/bank-account-classification';mkdirSync(output,{recursive:true});
try{
 const audit=await(await fetch(origin+'/__audit')).json(),base=await snapshot();
 const account=base.plan.cashPlanning.accounts.find(value=>value.id==='bank-a');
 account.classificationScope='personal';
 base.plan.cashPlanning.accounts.push({id:'joint',label:'חשבון משותף לדוגמה',buffer:0,classificationScope:'shared',bankName:account.bankName});
 base.plan.creditCards.push({id:'card2',name:'כרטיס משותף לדוגמה',alias:'5678',provider:'cal'});
 base.plan.defaults.card2=0;base.plan.cashPlanning.cardAccounts.card2='joint';
 await write(base);
 const reviewBaseline=await snapshot();
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'qa-case',value:'fresh',url:origin}]);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const open=async()=>{await page.goto(origin+'/next/upload/'+audit.cases.fresh.id+'/group');await page.locator('#report-classification-0-1').waitFor();};
 await open();
 const select=page.locator('#report-classification-0-1 select');
 const optionKeys=()=>select.locator('option:not([disabled])').evaluateAll(nodes=>nodes.map(node=>node.value));
 let options=await optionKeys();
 check(!options.includes('rent')&&!options.includes('houseCommittee'),'private bank does not offer rent or house committee');
 check(options.includes('personalInvest')&&!options.includes('sharedInvest'),'private bank shows only private investments');
 check(options.includes('card1')&&!options.includes('card2'),'only the linked bank card appears');
 for(const [width,scheme] of [[390,'light'],[767,'dark'],[768,'light'],[1440,'dark']]){
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'report fits '+width+'px '+scheme);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#report-classification-0-1').scrollIntoViewIfNeeded();
 await page.screenshot({path:output+'/private-phone.png'});
 const untouched=await snapshot();check(JSON.stringify(untouched)===JSON.stringify(reviewBaseline),'reading the review makes no financial write');
 await page.goto(origin+'/next/accounts/bank-a/edit');
 const scope=page.getByRole('combobox',{name:'סוג החשבון לסיווג תנועות'});await scope.waitFor();
 check(await scope.inputValue()==='personal','account editor loads the saved bank scope');
 for(const width of [390,767,768,1440]){
  await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'account editor fits '+width+'px');
 }
 await scope.selectOption('shared');
 await page.getByRole('button',{name:'שמירת החשבון',exact:true}).click();
 await page.getByText('פרטי החשבון נשמרו.',{exact:true}).waitFor();
 const saved=await snapshot(),expected=structuredClone(untouched.plan),changedAccount=expected.cashPlanning.accounts.find(value=>value.id==='bank-a');changedAccount.classificationScope='shared';expected.cashPlanning.accounts=[...expected.cashPlanning.accounts.filter(value=>value.id!=='bank-a'),changedAccount];
 check(JSON.stringify(saved.plan)===JSON.stringify(expected),'guarded scope save changes only the selected bank metadata');
 await open();options=await optionKeys();
 check(options.includes('sharedInvest')&&!options.includes('personalInvest'),'the same bank filters by its newly saved shared scope');
 check(options.includes('rent')&&options.includes('houseCommittee'),'only an explicitly shared bank offers rent and house committee');
 check(options.includes('card1')&&!options.includes('card2'),'scope changes never reassign cards');
 const before=await snapshot();
 await select.selectOption('rent');await page.waitForFunction(()=>document.querySelector('#report-classification-0-1 select')?.value==='rent');
 check((await page.locator('#report-classification-0-1').innerText()).includes('שכירות'),'housing selection is reflected in the existing review workflow');
 check(JSON.stringify(before)===JSON.stringify(await snapshot()),'classification edits do not silently save financial totals');
 await page.screenshot({path:output+'/shared-desktop.png'});
 check(errors.length===0,'no browser runtime errors');
 writeFileSync(output+'/results.json',JSON.stringify({checks,errors,productionWrites:0},null,2));
 await context.close();
}finally{await browser.close();fixture.kill('SIGTERM');}
