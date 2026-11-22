import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const fixture=spawn(process.execPath,['test/helpers/classification-review-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{const lines=createInterface({input:fixture.stdout});lines.on('line',line=>{if(line.startsWith('{')){resolve(JSON.parse(line).url);lines.close();}});fixture.once('exit',code=>reject(Error('Fixture exited '+code)));});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
try{
 const audit=()=>fetch(origin+'/__audit').then(r=>r.json()),data=await audit(),id=data.cases.unverified.id;
 await page.context().addCookies([{name:'qa-case',value:'unverified',url:origin}]);
 await page.goto(origin+'/next/upload/'+id+'/group');
 const declarationMenu=page.locator('summary').filter({hasText:'הדוח כולו כבר טופל?'});
 const start=page.getByRole('button',{name:'סימון הדוח ככפול וסיום ללא קליטה',exact:true});
 await declarationMenu.click();await start.waitFor();
 check(await page.getByText('כדי להשתמש ברישום קיים, בחרו אותו בהשוואה אם יש מספיק ראיות.',{exact:false}).count()>0,'duplicate closure is available without an automatic row match');
 for(const [width,scheme]of [[375,'light'],[767,'light'],[768,'dark'],[1440,'dark']]){
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});await start.click();
  const heading=page.getByRole('heading',{name:'סיום ללא קליטה — הדוח כולו כפול',exact:true});await heading.waitFor();
  check(await heading.evaluate(element=>document.activeElement===element),'confirmation receives keyboard focus '+width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'confirmation fits '+width+'px '+scheme);
  mkdirSync('work/ui-redesign',{recursive:true});if([375,1440].includes(width))await page.screenshot({path:'work/ui-redesign/declared-duplicate-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'חזרה לבדיקת הדוח',exact:true}).click();check(await start.evaluate(element=>document.activeElement===element),'cancel returns focus '+width);
 }
 await page.route('**/api/report-lifecycle?*',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='declare-duplicate'){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Synthetic stale review'})});return;}await route.continue();});
 await start.click();await page.getByRole('button',{name:'אישור — סימון ככפול וסיום ללא קליטה',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic stale review'}).waitFor();
 check(await page.getByRole('button',{name:'חזרה לבדיקת הדוח',exact:true}).isEnabled(),'definite refusal keeps the review available for correction');await page.getByRole('button',{name:'חזרה לבדיקת הדוח',exact:true}).click();await page.unroute('**/api/report-lifecycle?*');
 let failed=false,requests=[];
 await page.route('**/api/report-lifecycle?*',async route=>{const request=route.request();if(request.method()==='POST'&&request.postDataJSON()?.action==='declare-duplicate'){
  requests.push(request.postData());if(!failed){failed=true;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic lost success'})});return;}}
  await route.continue();});
 await start.click();await page.getByRole('button',{name:'אישור — סימון ככפול וסיום ללא קליטה',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('alert').filter({hasText:'Synthetic lost success'}).waitFor();
 check(await page.getByRole('button',{name:'חזרה לבדיקת הדוח',exact:true}).isDisabled(),'unknown result locks changes until the same retry');
 await page.getByRole('button',{name:'בדיקת תוצאת הסיום',exact:true}).click();await page.getByRole('status').filter({hasText:'הדוח סומן ככפול והטיפול הסתיים'}).waitFor();
 check(requests.length===2&&requests[0]===requests[1],'lost-success retry uses identical witnesses and action ID');
 const after=await audit();check(after.financialWrites===0&&Object.values(after.cases).every(value=>value.unchanged),'closure leaves every synthetic budget unchanged with zero financial writes');
 await page.goto(origin+'/next/upload/'+id+'/group');await page.getByRole('heading',{name:/נקלט/}).waitFor();
 check(await page.getByText('הדוח סומן ככפול לפי בחירתך',{exact:false}).isVisible(),'saved completion explains the explicit decision and retained source');
 await page.getByRole('link',{name:'בדיקה מחודשת של המקור',exact:true}).click();await declarationMenu.click();await start.waitFor();check(true,'reopening restores the original review without re-upload');
 check(errors.length===0,'no browser runtime errors');
 console.log(JSON.stringify({checks:checks.length,origin}));
}finally{await browser.close();fixture.kill('SIGTERM');}
