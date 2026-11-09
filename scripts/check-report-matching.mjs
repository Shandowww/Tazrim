import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core'),fixture=spawn(process.execPath,['test/helpers/classification-review-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{const lines=createInterface({input:fixture.stdout});lines.on('line',line=>{if(line.startsWith('{')){try{resolve(JSON.parse(line).url);lines.close()}catch(error){reject(error)}}});fixture.once('exit',code=>reject(Error('Fixture exited: '+code)))});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name)},audit=()=>fetch(origin+'/__audit').then(r=>r.json());
async function enterMatches(){const first=page.locator('#report-classification-0-0'),button=first.getByRole('button',{name:'השוואה לרישומים ושינוי ההחלטה'}),id=await button.getAttribute('aria-controls');await button.click();await page.waitForFunction(id=>document.activeElement?.id===id,id);return page.locator('[id="'+id+'"]')}
async function open(name){await page.context().clearCookies();await page.context().addCookies([{name:'qa-case',value:name,url:origin}]);const data=await audit();await page.goto(origin+'/next/upload/'+data.cases[name].id+'/group');await page.locator('#report-classification-0-0').waitFor();return enterMatches()}
const radio=(row,value)=>row.locator('input[type="radio"][value="'+value+'"]');
try{
 let first=await open('unverified');
 check(await first.getByText('legacy-bank.pdf',{exact:true}).count()>0,'existing bank source is visible beside the incoming row without leaving review');
 check(await first.getByText('סיווג שנשמר:',{exact:false}).count()>0,'saved classification is included in the inline comparison');
 check(await radio(first,'same').count()===0,'similar date and amount do not enable an unverified financial match');
 const search=first.getByRole('searchbox',{name:'חיפוש ברישומים של החשבון'});await search.fill('תשלום בדיקה 39');await first.getByText('תשלום בדיקה 39',{exact:true}).waitFor();check(true,'in-place search finds another saved account row');await search.fill('');
 await radio(first,'new').check();await first.getByRole('status').filter({hasText:'הבחירה הנוכחית: רישום חדש'}).waitFor();
 check(await first.isVisible()&&await radio(first,'new').isChecked(),'new choice remains visible and editable');
 await first.getByRole('button',{name:'ביטול ההחלטה וחזרה לבדיקה'}).click();await first.getByRole('status').filter({hasText:'עדיין אין החלטה'}).waitFor();check(await radio(first,'').isChecked(),'reset restores the unresolved check');
 await radio(first,'new').check();await first.getByRole('status').filter({hasText:'הבחירה הנוכחית: רישום חדש'}).waitFor();
 await page.getByRole('button',{name:'שמירת התקדמות',exact:true}).click();await page.getByText('החלטות הקבוצה נשמרו. נתוני התקציב לא השתנו.',{exact:true}).waitFor();
 await page.reload();await page.locator('#report-classification-0-0').waitFor();first=await enterMatches();
 check(await radio(first,'new').isChecked(),'an older saved New decision is restored with its editable comparison');
 await first.getByRole('button',{name:'ביטול ההחלטה וחזרה לבדיקה'}).click();await first.getByRole('status').filter({hasText:'עדיין אין החלטה'}).waitFor();
 await page.getByRole('button',{name:'שמירת התקדמות',exact:true}).click();await page.getByText('החלטות הקבוצה נשמרו. נתוני התקציב לא השתנו.',{exact:true}).waitFor();await page.reload();await page.locator('#report-classification-0-0').waitFor();first=await enterMatches();check(await radio(first,'').isChecked(),'reset survives progress save and reload');
 check(await page.locator('[id^="report-match-"]').count()===10,'forty checks start with a bounded comparison list');
 for(const remaining of [30,20,10])await page.getByRole('button',{name:'הצגת תנועות נוספות להשוואה · '+remaining,exact:true}).click();
 check(await page.locator('[id^="report-match-"]').count()===40,'all forty comparisons and choices are accessible inside the form');
 for(const width of [320,390,430,1440]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'inline comparisons fit RTL viewport '+width)}
 await page.setViewportSize({width:390,height:844});await first.scrollIntoViewIfNeeded();await page.screenshot({path:'work/ui-redesign/matching-inline-mobile.png'});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});check(await first.isVisible(),'dark and reduced-motion comparisons remain readable');await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
 first=await open('conflicts');check(await radio(first,'same').count()===1,'the original exact-match choice remains available with its saved evidence');
 await radio(first,'same').check();await first.getByRole('status').filter({hasText:'הבחירה הנוכחית: שימוש ברישום הקיים'}).waitFor();await radio(first,'new').check();await first.getByRole('status').filter({hasText:'הבחירה הנוכחית: רישום חדש'}).waitFor();check(true,'a confirmed Same choice can be changed back to New');
 await first.getByRole('button',{name:'ביטול ההחלטה וחזרה לבדיקה'}).click();await first.getByRole('status').filter({hasText:'עדיין אין החלטה'}).waitFor();
 await page.getByRole('button',{name:'הצגת תנועות נוספות להשוואה · 3',exact:true}).click();
 const ids=await page.locator('[id^="report-match-"]').evaluateAll(rows=>rows.map(row=>row.id));
 for(const id of ids){const row=page.locator('[id="'+id+'"]');await radio(row,'same').check();await row.getByRole('status').filter({hasText:'הבחירה הנוכחית: שימוש ברישום הקיים'}).waitFor()}
 check(await page.locator('[id^="report-match-"]').count()===13&&await first.isVisible(),'fully resolved matching decisions do not disappear into the duplicate shortcut');
 await first.getByRole('button',{name:'ביטול ההחלטה וחזרה לבדיקה'}).click();await first.getByRole('status').filter({hasText:'עדיין אין החלטה'}).waitFor();check(await radio(first,'').isChecked(),'even the last resolved group can be reopened before import');
 const manual=await open('manual');check(await radio(manual,'manual-qa').count()===1,'existing card detail is shown beside the incoming purchase');await radio(manual,'new').check();await manual.getByRole('status').filter({hasText:'הבחירה הנוכחית: רישום חדש'}).waitFor();await radio(manual,'manual-qa').check();await manual.getByRole('status').filter({hasText:'הבחירה הנוכחית: שימוש ברישום הקיים'}).waitFor();await manual.getByRole('button',{name:'ביטול ההחלטה וחזרה לבדיקה'}).click();await manual.getByRole('status').filter({hasText:'עדיין אין החלטה'}).waitFor();check(await radio(manual,'').isChecked(),'card New/link/reset decisions remain reversible');
 const final=await audit();check(Object.values(final.cases).every(value=>value.unchanged)&&final.financialWrites===0,'comparisons and decision editing preserve every financial record and history with zero financial writes');check(errors.length===0,'no browser runtime errors');
 writeFileSync('work/ui-redesign/matching-browser-results.json',JSON.stringify({checks,errors,financialUnchanged:true,financialWrites:0},null,2));
}catch(error){await page.screenshot({path:'work/ui-redesign/matching-failure.png',fullPage:false});console.error((await page.locator('body').innerText()).slice(-6000));throw error}
finally{await browser.close();fixture.kill('SIGTERM')}
