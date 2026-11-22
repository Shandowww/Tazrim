import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync} from 'node:fs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const fixture=spawn(process.execPath,['test/helpers/classification-review-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
let browser;
const output='work/ui-redesign/iphone-duplicate-review';
mkdirSync(output,{recursive:true});
try {
 const origin=await new Promise((resolve,reject)=>{
  const lines=createInterface({input:fixture.stdout});
  lines.on('line',line=>{if(line.startsWith('{')){resolve(JSON.parse(line).url);lines.close();}});
  fixture.once('exit',code=>reject(Error('Fixture exited: '+code)));
 });
 browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.setDefaultTimeout(14000);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const audit=()=>fetch(origin+'/__audit').then(result=>result.json());
 const seed=await audit();
 const mobile=page.locator('.duplicate-mobile');
 const comparison=mobile.getByRole('article');
 const queue=mobile.getByRole('navigation',{name:'מעבר בין בדיקות כפילות'});
 const chooseLink=()=>comparison.getByRole('button',{name:/^כבר נרשמה/});
 const open=async name=>{
  await page.context().clearCookies();
  await page.context().addCookies([{name:'qa-case',value:name,url:origin}]);
  await page.goto(origin+'/next/upload/'+seed.cases[name].id+'/group');
  await comparison.waitFor();
 };
 await open('unverified');
 assert.equal(await page.locator('[id^="report-match-"]').count(),1);
 assert.ok(await comparison.getByText('legacy-bank.pdf',{exact:true}).first().isVisible());
 assert.equal(await chooseLink().getAttribute('aria-pressed'),'false');
 await mobile.screenshot({path:output+'/iphone-comparison.png'});
 const firstId=await comparison.getAttribute('id');
 const nextId='report-match-0-'+(Number(firstId.split('-').at(-1))+1);
 await chooseLink().click();
 await page.waitForFunction(()=>document.querySelector('.duplicate-choices button[aria-pressed=true]')?.textContent?.includes('כבר נרשמה'));
 await queue.getByRole('button',{name:'הבאה לבדיקה'}).click();
 assert.equal(await comparison.getAttribute('id'),nextId);
 assert.equal(await page.evaluate(()=>document.activeElement?.id),nextId);
 await mobile.locator('summary').filter({hasText:'כל ההשוואות'}).click();
 await mobile.getByRole('button',{name:/משכורת.*כבר נרשמה/}).click();
 assert.equal(await comparison.getAttribute('id'),firstId);
 assert.equal(await chooseLink().getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'שמירת התקדמות',exact:true}).click();
 await page.getByText('החלטות הקבוצה נשמרו. נתוני התקציב לא השתנו.',{exact:true}).waitFor();
 await page.reload();
 await comparison.waitFor();
 assert.ok(await mobile.getByRole('status').filter({hasText:'39 לבדיקה · 1 נבדקו'}).isVisible());
 for(const [width,height] of [[375,812],[430,900],[667,375],[767,812],[768,850],[1440,900]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(expected=>Boolean(document.querySelector('.duplicate-mobile'))===expected,width<768);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);
  if(width<768){
   assert.ok(await page.locator('.duplicate-mobile button:visible, .duplicate-mobile summary:visible').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)));
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await comparison.waitFor();
 await page.evaluate(()=>document.documentElement.style.fontSize='125%');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 await mobile.screenshot({path:output+'/iphone-dark.png'});
 await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
 console.log('PASS iPhone queue, evidence, resume, keyboard focus, 44px actions, dark, larger text and the responsive breakpoint');
 await open('conflicts');
 for(let index=0;index<13;index++){
  await chooseLink().click();
  await page.waitForFunction(()=>document.querySelector('.duplicate-choices button[aria-pressed=true]')?.textContent?.includes('כבר נרשמה'));
  if(index<12)await queue.getByRole('button',{name:'הבאה לבדיקה'}).click();
 }
 await queue.getByRole('button',{name:'לסיכום הדוח'}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'report-review-summary');
 const finish=page.getByRole('button',{name:'סיום ללא שינוי בתקציב',exact:true});
 assert.ok(await finish.isDisabled());
 await page.getByText('בדקתי: הדוח כבר נרשם ואין שינויים חדשים',{exact:true}).click();
 assert.ok(await finish.isEnabled());
 await page.locator('#report-review-summary').screenshot({path:output+'/iphone-summary.png'});
 await finish.click();
 const checkResult=()=>page.goto(origin+'/next/upload/'+seed.cases.conflicts.id+'/group');
 await page.getByText('הדוח הכפול סומן כנקלט. לא בוצע שינוי כספי נוסף.',{exact:true}).waitFor();
 await checkResult();
 const history=page.locator('summary').filter({hasText:'החלטות שנשמרו בבדיקת הכפילויות'});
 await history.click();
 assert.ok(await page.getByText('13 קישורים לרישומים קיימים · 0 אושרו כתנועות נפרדות',{exact:true}).isVisible());
 const final=await audit();
 assert.equal(final.financialWrites,0);
 assert.ok(Object.values(final.cases).every(value=>value.unchanged));
 assert.deepEqual(errors,[]);
 console.log('PASS all 13 matches finish through the verified server action, a stored decision receipt reopens, and financial records are unchanged');
} finally {
 try{if(browser)await browser.close()}finally{fixture.kill('SIGTERM');}
}
