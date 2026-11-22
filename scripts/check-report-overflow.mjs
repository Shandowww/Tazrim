import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const fixture=spawn(process.execPath,['test/helpers/classification-review-browser-fixture.mjs'],{stdio:['ignore','pipe','inherit']});
let browser;
const evidence=[];
try{
 const origin=await new Promise((resolve,reject)=>{const lines=createInterface({input:fixture.stdout});lines.on('line',line=>{if(line.startsWith('{')){resolve(JSON.parse(line).url);lines.close()}});fixture.once('exit',code=>reject(Error('Fixture stopped '+code)))});
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 const {cases}=await(await fetch(origin+'/__audit')).json();
 await page.goto(origin+'/next/upload/'+cases.conflicts.id+'/group');
 await page.getByRole('heading',{name:'בדיקת הדוח וסיווג העסקאות',exact:true}).waitFor();
 await page.getByRole('heading',{name:/מה נשאר לבדוק/}).waitFor();
 if(process.argv.includes('--baseline'))await page.evaluate(()=>{
  for(const sheet of document.styleSheets)for(let i=sheet.cssRules.length-1;i>=0;i--)if(sheet.cssRules[i].selectorText?.startsWith('.household-report-page bdi:not('))sheet.deleteRule(i);
 });
 // Substitute only rendered source text, exercising the real review/check/detail markup.
 await page.evaluate(()=>{
  const checks=document.querySelector('details[aria-label="מה נשאר לבדוק"]');
  const source=checks.querySelector('li p bdi');
  source.textContent='shared-january-november-2026-original-bank-account-statement.xlsx';
  const description=checks.querySelector('ul[aria-label="פרטי התנועות לסיווג"] li p bdi');
  description.textContent='ועד הבית – תשלום עבור ועד נובמבר והשלמת תשלומים קודמים עבור הדירה';
  const fields=checks.querySelector('dl');
  const field=document.createElement('div');field.className='min-w-0 break-words';
  const label=document.createElement('dt');label.className='inline';label.textContent='פירוט: ';
  const value=document.createElement('dd');value.className='inline';
  const detail=document.createElement('bdi');detail.dir='auto';detail.className='[overflow-wrap:anywhere]';
  value.append(detail);field.append(label,value);fields.prepend(field);
  detail.textContent='תשלום עבור ועד הבית והשלמת תשלום מחודש קודם – אסמכתה '+('1234567890'.repeat(8));
 });
 mkdirSync('work/ui-redesign',{recursive:true});
 for(const scheme of ['light','dark'])for(const width of [320,390,430,767,768,1440]){
  await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
  const measurement=await page.evaluate(()=>{
   const root=document.documentElement,detail=document.querySelector('details[aria-label="מה נשאר לבדוק"]');
   window.scrollTo(-1000,0);const left=window.scrollX;window.scrollTo(1000,0);const right=window.scrollX;window.scrollTo(0,0);
   return {viewport:innerWidth,pageWidth:root.scrollWidth,left,right,detailWidth:detail.getBoundingClientRect().width,mainWidth:document.querySelector('main').getBoundingClientRect().width,overflow:[...detail.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.left< -1||r.right>document.documentElement.clientWidth+1}).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),ws:getComputedStyle(el).whiteSpace,width:el.getBoundingClientRect().width}))};
  });
  evidence.push({scheme,width,...measurement});console.log(JSON.stringify(evidence.at(-1)));
  if(!process.argv.includes('--baseline')){
   assert.equal(measurement.pageWidth,width,'page fits viewport');assert.equal(measurement.left,0,'cannot scroll left into empty space');assert.equal(measurement.right,0,'cannot scroll right into empty space');assert.equal(measurement.overflow.length,0,'review contents remain visible');
  }
  if([390,768,1440].includes(width))await page.screenshot({path:`work/ui-redesign/report-overflow-${process.argv.includes('--baseline')?'before':'after'}-${width}-${scheme}.png`});
 }
 if(!process.argv.includes('--baseline')){
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390,'review fits with enlarged text');
  assert.equal(await page.locator('bdi.money-amount').first().evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','financial values stay together');
 }
 const audit=await(await fetch(origin+'/__audit')).json();assert.equal(audit.financialWrites,0);assert.ok(Object.values(audit.cases).every(c=>c.unchanged));
 writeFileSync('work/ui-redesign/report-overflow-'+(process.argv.includes('--baseline')?'before':'after')+'.json',JSON.stringify({evidence,financialWrites:audit.financialWrites},null,2));
}finally{await browser?.close();fixture.kill('SIGTERM')}
