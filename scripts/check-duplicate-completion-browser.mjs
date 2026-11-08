import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core'),fixture=spawn(process.execPath,['test/helpers/duplicate-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{const lines=createInterface({input:fixture.stdout});lines.on('line',line=>{if(line.startsWith('{')){try{resolve(JSON.parse(line).url);lines.close()}catch(error){reject(error)}}});fixture.once('exit',code=>reject(Error('Fixture exited: '+code)))});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name)};
try{
 const initial=await(await fetch(origin+'/__audit')).json();assert.equal(initial.lifecycle.lifecycle,'partial');
 await page.goto(origin+'/next/incoming?sync=report&report='+initial.privateId);
 await page.getByRole('link',{name:'המשך טיפול',exact:true}).click();
 await page.getByRole('heading',{name:'דוח כפול · אין נתונים חדשים',exact:true}).waitFor();
 check(await page.getByRole('button',{name:'סיום טיפול בדוח כפול',exact:true}).isDisabled(),'duplicate finish requires explicit acknowledgment');
 check(await page.getByRole('radio').count()===0,'duplicate does not require an irrelevant category decision');
 check(await page.evaluate(()=>document.activeElement?.textContent==='דוח כפול · אין נתונים חדשים'),'duplicate heading receives keyboard focus');
 for(const width of [320,390,430,1440]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width)}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/ui-redesign/duplicate-completion-mobile.png'});
 let lost=false,completionPosts=0;
 await page.route('**/api/report-lifecycle?*',async route=>{let action;try{action=route.request().postDataJSON()?.action}catch{}if(action==='complete-duplicate'){completionPosts++;if(!lost){lost=true;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic lost completion response'})});return}}await route.continue()});
 await page.getByRole('checkbox',{name:'בדקתי שהדוח כבר נקלט ושאין בו נתונים חדשים'}).check();
 await page.getByRole('button',{name:'סיום טיפול בדוח כפול',exact:true}).click();
 await page.getByRole('alert').waitFor();
 check((await(await fetch(origin+'/__audit')).json()).lifecycle.lifecycle==='digested','server saved duplicate completion before the lost response');
 await page.getByRole('button',{name:'בדיקת תוצאת הסיום',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('sync')==='attention');
 await page.getByRole('heading',{name:'אין כרגע דוחות שממתינים לטיפול',exact:true}).waitFor();
 check(completionPosts===1,'retry reads the successful result without replay');
 const final=await(await fetch(origin+'/__audit')).json();
 check(final.lifecycle.lifecycle==='digested'&&final.lifecycle.completionKind==='duplicate','duplicate leaves Partial and becomes Digested');
 check(final.lifecycle.removalAt-final.lifecycle.completedAt===30*86400000,'completion starts the existing 30-day retention notice');
 check(final.financialUnchanged&&final.financialWrites===0,'financial records and history remain byte-identical');
 check(errors.length===0,'no browser runtime errors');
 writeFileSync('work/ui-redesign/duplicate-completion-browser-results.json',JSON.stringify({checks,errors,financialUnchanged:final.financialUnchanged,financialWrites:final.financialWrites},null,2));
}finally{await browser.close();fixture.kill('SIGTERM')}
