import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {guidedFixture} from '../test/helpers/guided-report-fixture.mjs';
import {purchaseNotesFixture,sampleSheetId,sampleNotes} from '../test/helpers/purchase-notes-fixture.mjs';
import {purchaseNoteColumns} from '../src/purchase-notes-model.js';
import {sealReport} from '../server/report-crypto.mjs';
import {calTextFixture,calPDFFixture,glyphs} from '../tools/bank-csv/cal-pdf-fixture.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core'),google=purchaseNotesFixture();
const pages=calTextFixture();
for(const [index,reportPage]of pages.entries()){
 const y=index?746:500,amount=index?180:65;
 reportPage.items=reportPage.items.filter(item=>!(item.transform[5]===y&&(item.transform[4]>=450&&item.transform[4]<538||item.str.startsWith('תשלום'))));
 reportPage.items.push(...glyphs(index?'23/09/2026':'20/09/2026',538,y),...glyphs('פיס פלוס',498,y,true));
 for(const item of reportPage.items){if(item.transform[5]===y&&[140,200].includes(item.transform[4]))item.str='₪ '+amount.toFixed(2);if(index&&item.transform[5]===731&&item.transform[4]===145)item.str='₪ 245.00';}
}
const fixture=await guidedFixture({sourceBytes:calPDFFixture(pages),clientId:'synthetic-client',clientSecret:'synthetic-secret',purchaseNotesOAuthFactory:google.oauthFactory});
const seed=await fixture.load(),entries=seed.group.ui.items[0].report.entries;
google.state.values=[purchaseNoteColumns,...sampleNotes(),...entries.map((entry,index)=>['report-note-'+String(index).padStart(4,'0'),entry.date,entry.merchant,(entry.installment||/תשלום\s*\d+\s*(?:מתוך|מ)[\s-]*\d+/.test(entry.notes??'')?Math.sign(entry.amountCents)*Math.abs(entry.originalCents):entry.amountCents)/100,'ILS',index?'שובר לסופרמרקט':'שובר לפיצה דרך המועדון',index?'מזון':'מסעדות','1234',''])];
const notesPath='/api/purchase-notes?accountId=alice',snapshot=async()=>await(await fixture.req('alice',notesPath)).json();
const command=async body=>fixture.post(notesPath,{...body,accountId:'alice',requireAccountId:true,expectedRevision:(await snapshot()).revision,operationId:randomUUID()});
assert.equal((await command({action:'configure',url:sampleSheetId,tab:'Purchases'})).status,200);
await fixture.req('alice','/auth/purchase-notes?accountId=alice&revision=1');await fixture.req('alice','/auth/google/callback?state='+google.state.auth.state+'&code=fake');assert.equal((await command({action:'sync'})).status,200);
const source=fixture.sourceRow(),response=await fixture.req('alice','/api/reports?budget=personal&id='+fixture.id),draft=(await response.json()).draft;
draft.guided={version:1,step:'categories',done:['account','figures'],categories:'unset',budgetRevision:seed.base.revision};fixture.db.prepare('UPDATE report_sources SET draft=? WHERE id=?').run(sealReport(fixture.key,Buffer.from(JSON.stringify(draft)),source.scope+'|'+fixture.id+'|draft'),fixture.id);
const initial=fixture.financial(),checks=[],errors=[];let financialWrites=0;
const server=http.createServer(async(request,response)=>{try{
 const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks),headers=new Headers(request.headers);headers.set('origin',fixture.origin);headers.set('cookie','__Host-mf_session='+(String(request.headers.cookie??'').includes('qa-user=bob')?'bob':'alice'));
 if(request.method==='PUT'&&request.url.startsWith('/api/plan')||request.method==='POST'&&body.toString().includes('"action":"commit"'))financialWrites++;
 const result=await fixture.app(new Request(fixture.origin+request.url,{method:request.method,headers,...(body.length?{body}:{})}));response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){console.error(error);response.writeHead(500);response.end('Synthetic preview failure');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const check=(value,name)=>{assert.ok(value,name);checks.push(name);console.log('PASS',name);};
const out='work/purchase-notes-preview';mkdirSync(out,{recursive:true});
try{
 await page.goto(origin+'/next/settings/purchase-notes');await page.getByRole('heading',{name:'פתקי קנייה',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('#purchase-notes-url')?.disabled);
 check(await page.getByRole('heading',{name:'מקלדת לעבודה',exact:true}).isVisible(),'private notes load on settings page');
 check(await page.getByRole('button',{name:'עדכון מהגיליון',exact:true}).isEnabled(),'connected sheet has an explicit refresh action');
 for(const [width,height,scheme]of [[375,812,'light'],[390,844,'dark'],[667,375,'dark'],[767,844,'light'],[768,900,'dark'],[1440,900,'light']]){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'settings fits '+width+'px '+scheme);
  if(width===375||width===390||width===1440)await page.screenshot({path:out+'/settings-'+width+'-'+scheme+'.png',fullPage:true});
  if(width===375)await page.locator('main section').first().screenshot({path:out+'/sheet-connection-light.png'});
 }
 await page.setViewportSize({width:375,height:812});await page.evaluate(()=>document.documentElement.style.fontSize='200%');check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'settings reflows at 200% text');await page.evaluate(()=>document.documentElement.style.fontSize='');
 const row=page.locator('li').filter({has:page.getByRole('heading',{name:'מקלדת לעבודה',exact:true})});await row.getByRole('button',{name:'סימון כטופל'}).click();await page.getByRole('status').filter({hasText:'מצב הפתק נשמר'}).waitFor();check(await page.getByRole('heading',{name:'מקלדת לעבודה',exact:true}).count()===0,'done note leaves active list');
 await page.getByRole('button',{name:'הצגת פתקים שטופלו',exact:true}).click();await page.getByRole('heading',{name:'מקלדת לעבודה',exact:true}).waitFor();await page.getByRole('button',{name:'החזרה לפתקים פעילים',exact:true}).click();await page.getByRole('button',{name:'הצגת פתקים פעילים',exact:true}).click();check(await page.getByRole('heading',{name:'מקלדת לעבודה',exact:true}).isVisible(),'done note can be restored');
 await page.getByRole('button',{name:'עדכון מהגיליון',exact:true}).click();await page.getByRole('status').filter({hasText:'הפתקים עודכנו מהגיליון'}).waitFor();check((await snapshot()).notes.length===sampleNotes().length+entries.length,'refresh does not duplicate notes');
 // The existing encrypted device-draft guard preserves unfinished source input.
 const urlInput=page.getByLabel('קישור ל־Google Sheets'),savedUrl=await urlInput.inputValue();await urlInput.fill(savedUrl+'?draft=1');await page.getByText('טיוטה שמורה במכשיר · טרם נשמרה בתקציב',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>document.querySelector('#purchase-notes-url')?.value.endsWith('?draft=1'));check(true,'unfinished sheet input recovers after reload');await urlInput.fill(savedUrl);await page.getByRole('link',{name:'לבדיקת דוחות',exact:true}).click();
 await page.goto(origin+'/next/upload/'+fixture.id+'/group');await page.locator('.purchase-note-hint').first().waitFor();check((await page.locator('.purchase-note-hint').first().innerText()).includes('שובר לפיצה'),'matching note is shown beside report transaction');
 const beforeCategories=await page.locator('.report-category-picker-trigger').allTextContents();check(beforeCategories.every(value=>!value.includes('מסעדות')),'sheet category is not applied automatically');
 await page.locator('#report-classification-0-0 .report-category-picker-trigger').click();await page.getByRole('searchbox',{name:'חיפוש קטגוריה'}).fill('מזון');await page.locator('.report-category-picker-option').first().click();await page.waitForFunction(()=>document.activeElement?.id==='report-classification-0-1');check((await page.locator('#report-classification-0-0 .report-category-picker-trigger').innerText()).includes('מזון')&&(await page.locator('#report-classification-0-1 .report-category-picker-trigger').innerText()).includes('קטגוריה'),'one-purchase choice leaves the other purchase from the same merchant unchanged');
 for(const [width,scheme]of [[390,'light'],[390,'dark'],[767,'light'],[768,'dark'],[1440,'light']]){await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});check(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),'review hints fit '+width+'px '+scheme);if(width===390||width===1440)await page.screenshot({path:out+'/review-'+width+'-'+scheme+'.png',fullPage:true});if(width===390)await page.locator('#report-classification-0-0').screenshot({path:out+'/purchase-match-'+scheme+'.png'});}
 google.state.providerError={response:{status:403}};await page.reload();await page.getByRole('alert').filter({hasText:'אין גישה לגיליון'}).waitFor();check(await page.locator('.purchase-note-hint').count()>0,'failed provider refresh preserves cached report hints');google.state.providerError=null;
 await context.addCookies([{name:'qa-user',value:'bob',url:origin}]);await page.goto(origin+'/next/settings/purchase-notes');await page.waitForFunction(()=>!document.querySelector('#purchase-notes-url')?.disabled);check(await page.getByRole('heading',{name:'מקלדת לעבודה',exact:true}).count()===0,'another signed-in actor cannot see private notes');
 check(fixture.financial()===initial&&financialWrites===0,'notes and review leave every financial record unchanged');check(errors.length===0,'no browser runtime errors');
 writeFileSync(out+'/results.json',JSON.stringify({checks,errors,financialWrites,sampleDataOnly:true},null,2));
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));fixture.db.close();google.db.close();}
