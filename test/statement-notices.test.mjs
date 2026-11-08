import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {extractStatementNotices,pdfNoticePages,currentStatementNotices} from '../tools/bank-csv/statement-notices.mjs';
import {openDatabase} from '../server/database.mjs';import {createReportStore} from '../server/report-store.mjs';import {createStatementNotices} from '../server/statement-notices.mjs';import {verifyStoredReports,sealReport} from '../server/report-crypto.mjs';
import {actionIssues,validActionTarget} from '../src/action-center-model.js';import {createDemoPlan} from '../src/budget.js';
import {pdfFixture} from '../tools/bank-csv/pdf-fixture.mjs';import {readPDFPages} from '../tools/bank-csv/pdf-reader.mjs';
const pages=[{page:1,text:'ישראכרט\nהודעות חשובות\nהחל מתאריך 01.12.2026 תחויב עמלה בסך 25.50 ₪ עבור השירות.\nנדרש להסדיר את מסגרת החשבון עד לתאריך 15.12.2026.\nשינוי בתנאי השירות החל מ 01.01.2027 מפורט באתר המנפיק.\nהטבה מיוחדת: הנחה ברכישה עד לתאריך 31.12.2026.\nעדכונים\nשעות שירות הלקוחות יתעדכנו בחודש הבא.\nפירוט עסקאות\n01/11/2026,מבצע בחנות,100,200'}];
test('Readable issuer notices retain original text/page, explicit dates and all five categories without importing charges',()=>{
 const result=extractStatementNotices(pages);assert.equal(result.issuer,'isracard');assert.deepEqual(result.notices.map(notice=>notice.category),['charge','account','terms','promotion','update']);assert.equal(result.notices[0].dates[0].date,'2026-12-01');assert.deepEqual(result.notices[0].amounts,['25.50 ₪']);assert.equal(result.notices[0].text,pages[0].text.split('\n')[2]);assert.ok(result.notices.every(notice=>notice.page===1&&notice.needsReview));assert.equal(result.notices[3].attention,false);assert.equal(result.notices[4].attention,false);assert.ok(!result.notices.some(notice=>notice.text.includes('100,200')));
 const unknown=extractStatementNotices([{page:2,text:'הודעות\nשינוי בתנאי החשבון החל מ 31.02.2027. נדרש לעיין במסמך.'}]);assert.equal(unknown.issuer,'unknown');assert.deepEqual(unknown.notices[0].dates,[]);
});
test('Notice extraction bounds documents, handles readable PDF positioning and ignores ordinary transaction tables',()=>{
 assert.throws(()=>extractStatementNotices(Array.from({length:21},(_,index)=>({page:index+1,text:'text'}))));assert.throws(()=>extractStatementNotices([{page:1,text:'x'.repeat(200001)}]));assert.throws(()=>extractStatementNotices([{page:1,text:'a'},{page:1,text:'b'}]));assert.equal(extractStatementNotices([{page:1,text:'תאריך עסקה\n01/11/2026,הטבה,25\n02/11/2026,עמלה,10'}]).notices.length,0);
 const text=pdfNoticePages([{items:[{str:'הודעות',transform:[1,0,0,1,100,200]},{str:'נדרש להסדיר את מסגרת החשבון.',transform:[1,0,0,1,100,150]}]}]);assert.equal(extractStatementNotices(text).notices[0].category,'account');
});
test('The existing local PDF reader extracts actual Hebrew PDF bytes for the notice classifier',async()=>{
 globalThis.DOMMatrix??=class{};
 // PDF stores visual glyph order. Keep numeric runs LTR within the RTL lines;
 // pdfFixture reverses the whole Hebrew run before writing its glyphs.
 const document=[{width:595,height:842,items:pages[0].text.split('\n').map((text,index)=>({str:text.replace(/\d+(?:[./]\d+)*/g,run=>[...run].reverse().join('')),dir:'rtl',transform:[10,0,0,10,550-text.length*5,780-index*22],width:text.length*5,height:10}))}];
 const result=extractStatementNotices(pdfNoticePages(await readPDFPages(pdfFixture(document))));assert.equal(result.notices.length,5);assert.equal(result.notices[0].category,'charge');assert.equal(result.notices[0].page,1);assert.match(result.notices[0].text,/25.50/);
});
test('Only exact notices with the same explicit issuer and account identity suppress an overlapping email alert',()=>{
 const text='נדרש להסדיר את מסגרת החשבון עד לתאריך 15.12.2026.',statement={id:'a'.repeat(64),issuer:'hapoalim',accountReference:'account:123456',text,category:'account',attention:true,evidence:'same'},mail={id:'mail',state:'review',subject:'עדכון',revision:1,issuer:'hapoalim',accountReference:'account:123456',text};
 const facts=value=>actionIssues(null,{asOf:'2026-11',statementNotices:[statement],notices:[value]});assert.equal(facts(mail).filter(issue=>issue.code==='bank.notice').length,0);assert.equal(facts({...mail,accountReference:'account:987654'}).filter(issue=>issue.code==='bank.notice').length,1);assert.equal(facts({...mail,accountReference:null}).filter(issue=>issue.code==='bank.notice').length,1);assert.equal(facts({...mail,text:text.replace('15.12','16.12')}).filter(issue=>issue.code==='bank.notice').length,1);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'}}),alice={id:'alice',email:'alice@test'},bob={id:'bob',email:'bob@test'},origin='https://test.invalid';
function setup(){const {db,DB}=openDatabase(':memory:'),key=randomBytes(32),store=createReportStore(db,{DB,key,recoveryPublicKey:pair.publicKey,isAllowed:()=>true}),service=createStatementNotices(db,{isAllowed:()=>true,secret:store.secret});const plan=createDemoPlan('2026-11');db.prepare('INSERT INTO plans(user_id,data,revision,updated_at) VALUES(?,?,?,?)').run('alice',JSON.stringify(plan),3,'now');return{db,key,store,service}}
function call(context,user=alice,input,scope='personal',bound=user.id){return context.service.handle(new Request(origin+'/api/statement-notices?budget='+scope,{method:input?'POST':'GET',headers:{'x-budget-account-id':bound},...(input?{body:JSON.stringify(input)}:{})}),user)}
test('Notice scans are encrypted, idempotent, account-bound and independent of financial/source revisions',async()=>{
 const context=setup();try{const source=context.store.upload({scope:'personal:alice',plan:null},Buffer.from('synthetic statement'),'statement.pdf'),before=context.db.prepare('SELECT * FROM plans').all(),input={sourceId:source.receiptId,sourceHash:source.sourceHash,revision:0,status:'complete',pages};
 assert.equal((await call(context,alice,input)).status,200);assert.equal((await (await call(context,alice,input)).json()).recovered,true);assert.equal((await call(context,alice,{...input,pages:[{page:1,text:'הודעות\nנדרש להסדיר את מסגרת החשבון בהקדם האפשרי.'}]})).status,409);
 const row=context.db.prepare('SELECT * FROM statement_notice_scans').get();assert.equal(row.revision,1);assert.ok(!Buffer.from(row.data).includes('עמלה'));assert.equal(verifyStoredReports(context.db,context.key),1);assert.equal(context.db.prepare('SELECT revision FROM report_sources').get().revision,1);assert.deepEqual(context.db.prepare('SELECT * FROM plans').all(),before);
 const value=await (await call(context)).json();assert.equal(value.notices.length,5);assert.equal((await (await call(context,bob)).json()).notices.length,0);assert.equal((await call(context,bob,input)).status,404);assert.equal((await call(context,alice,input,'personal','bob')).status,403);
 const issues=actionIssues(null,{scope:'alice/personal',asOf:'2026-11',statementNotices:value.notices});assert.equal(issues.filter(issue=>issue.severity==='info').length,2);assert.equal(issues.filter(issue=>issue.severity!=='info').length,3);assert.ok(issues.every(issue=>validActionTarget(issue.target)));assert.equal(actionIssues(null,{locked:true,asOf:'2026-11',statementNotices:value.notices}).some(issue=>issue.code==='statement.notice'),false);
 assert.equal((await call(context,alice,{...input,revision:1,status:'failed',pages:[]})).status,200);const failed=await (await call(context)).json();assert.equal(failed.scans[0].status,'failed');assert.equal(failed.notices.length,5);assert.deepEqual(context.db.prepare('SELECT * FROM plans').all(),before);
 context.db.prepare("UPDATE report_sources SET state='archived'").run();assert.equal((await (await call(context)).json()).notices.length,0);context.db.prepare("UPDATE report_sources SET state='received'").run();assert.equal((await (await call(context)).json()).notices.length,5);context.db.prepare('DELETE FROM report_sources').run();assert.equal(context.db.prepare('SELECT COUNT(*) AS count FROM statement_notice_scans').get().count,0);
 }finally{context.db.close()}
});
test('Shared viewers can read notices; write downgrade/revocation and source hashes fail closed',async()=>{
 const context=setup();try{context.db.prepare('INSERT INTO budgets VALUES(?,?,?,?,?,?)').run('house','alice','house',null,0,'now');context.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run('house','bob',bob.email);context.db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run('house','bob','editor');const source=context.store.upload({scope:'budget:house',plan:null},Buffer.from('shared statement'),'shared.pdf'),input={sourceId:source.receiptId,sourceHash:source.sourceHash,revision:0,status:'complete',pages};assert.equal((await call(context,bob,input,'house')).status,200);context.db.prepare("UPDATE budget_member_roles SET role='viewer'").run();assert.equal((await (await call(context,bob,undefined,'house')).json()).notices.length,5);assert.equal((await call(context,bob,input,'house')).status,403);assert.equal((await call(context,alice,{...input,sourceHash:'bad'},'house')).status,409);
 context.db.prepare("UPDATE budget_member_roles SET role='editor'").run();const request={url:origin+'/api/statement-notices?budget=house',method:'POST',headers:new Headers({'x-budget-account-id':'bob'}),text:async()=>{context.db.prepare("UPDATE budget_member_roles SET role='viewer'").run();return JSON.stringify({...input,revision:1})}};assert.equal((await context.service.handle(request,bob)).status,403);
 context.db.prepare("DELETE FROM budget_members WHERE user_id='bob'").run();assert.equal((await call(context,bob,undefined,'house')).status,404);
 }finally{context.db.close()}
});

test('Salary transfers and transaction actors never become promotions, including table continuations and legacy stored discoveries',()=>{
 const salary='56321 משכורת-נט "המבצע: חברה לדוגמה בע״מ" 654321 12,345.67 23,456.78',transfer='98234 העברה נכנסת המבצע: חברה לדוגמה 1,000.00 9,000.00'
 for(const row of [salary,transfer,'משכורת נטו 1000.00','המבצע: חברה לדוגמה בע״מ']){
  assert.equal(extractStatementNotices([{page:1,text:'הפועלים\nהודעות\n'+row}]).notices.length,0,row)
  assert.deepEqual(currentStatementNotices([{text:row,category:'promotion',attention:false}]),[])
 }
 const result=extractStatementNotices([{page:1,text:'ישראכרט\nפירוט עסקאות\nמבצע בלעדי בבית עסק\n56321 העברה 100.00 200.00\nהודעות חשובות\nהטבה מיוחדת: 15% הנחה ברכישה באתר המועדון.'}]);assert.equal(result.notices.length,1);assert.equal(result.notices[0].category,'club')
 assert.equal(extractStatementNotices([{page:1,text:'מבצע: 20% הנחה ברכישה הבאה עד סוף החודש.'}]).notices[0].category,'promotion')
 assert.equal(extractStatementNotices([{page:1,text:'תנאי המבצע: הנחה ברכישה במחיר 100.00 ₪ במקום 200.00 ₪.'}]).notices[0].category,'promotion')
 // A real salary-linked customer benefit remains a notice, rather than a transfer row.
 assert.equal(extractStatementNotices([{page:1,text:'הטבה מיוחדת ללקוחות המעבירים משכורת: 10% הנחה ברכישה.'}]).notices[0].category,'promotion')
})
test('Isracard and Cal notices distinguish limit changes, interest, earned points and club benefits with original page and dates',()=>{
 for(const issuer of ['ישראכרט','כאל']){
  const rows=['מסגרת האשראי שלך תוגדל החל מתאריך 01.12.2026 לסך 30,000 ₪.','הריבית על האשראי תעודכן החל מתאריך 01.01.2027 לריבית פריים בתוספת 2%.','בחודש האחרון צברת 120 נקודות למימוש ברכישה הבאה.','חברי מועדון לדוגמה זכאים להטבות ולמימוש קופון אישי.']
  const notices=extractStatementNotices([{page:2,text:issuer+'\nהודעות חשובות\n'+rows.join('\n')}]).notices
  assert.deepEqual(notices.map(n=>n.category),['limit','interest','points','club']);assert.deepEqual(notices.map(n=>n.attention),[true,true,false,false]);assert.deepEqual(notices.map(n=>n.text),rows);assert.ok(notices.every(n=>n.page===2));assert.equal(notices[0].dates[0].date,'2026-12-01')
  const issues=actionIssues(null,{scope:'alice/personal',asOf:'2026-11',statementNotices:notices.map((n,i)=>({...n,id:String(i).repeat(64),evidence:String(i)}))});assert.deepEqual(issues.map(i=>i.title),['עדכון מסגרת אשראי','עדכון ריבית','צבירת נקודות','הטבות מועדון']);assert.deepEqual(issues.map(i=>i.severity),['incomplete','incomplete','info','info'])
 }
})
test('Real readable Hebrew PDF bytes retain the four issuer-announcement categories outside transaction rows',async()=>{
 globalThis.DOMMatrix??=class{};
 const rows=['ישראכרט','הודעות חשובות','מסגרת האשראי שלך הוגדלה לסך 30,000 ₪.','הריבית על האשראי תעודכן החל מתאריך 01.01.2027.','יתרת הנקודות שצברת עומדת על 120 נקודות.','חברי מועדון זכאים להטבות ולמימוש קופון אישי.'],document=[{width:595,height:842,items:rows.map((text,index)=>({str:text.replace(/\d+(?:[./]\d+)*/g,run=>[...run].reverse().join('')),dir:'rtl',transform:[10,0,0,10,550-text.length*5,780-index*22],width:text.length*5,height:10}))}]
 const result=extractStatementNotices(pdfNoticePages(await readPDFPages(pdfFixture(document))));assert.deepEqual(result.notices.map(n=>n.category),['limit','interest','points','club'])
})
test('Reading old encrypted scans hides payroll false positives and reclassifies valid notices without rewriting any stored bytes',async()=>{
 const context=setup();try{
  const source=context.store.upload({scope:'personal:alice',plan:null},Buffer.from('synthetic old notice source'),'legacy.pdf'),scope='personal:alice',old={version:1,issuer:'hapoalim',status:'complete',notices:[{category:'promotion',issuer:'hapoalim',text:'56321 משכורת-נט המבצע: חברה לדוגמה בע״מ 12,345.67 23,456.78',page:1,dates:[],amounts:[],attention:false,needsReview:true},{category:'terms',issuer:'isracard',text:'מסגרת האשראי שלך תוגדל החל מתאריך 01.12.2026 לסך 30,000 ₪.',page:2,dates:[],amounts:[],attention:true,needsReview:true}]},encrypted=sealReport(context.store.secret(),Buffer.from(JSON.stringify(old)),scope+'|'+source.receiptId+'|notices')
  context.db.prepare('INSERT INTO statement_notice_scans VALUES(?,?,?,?,?,?)').run(source.receiptId,scope,source.sourceHash,encrypted,7,123)
  const before=context.db.prepare('SELECT * FROM statement_notice_scans').all(),financial=context.db.prepare('SELECT * FROM plans').all(),sources=context.db.prepare('SELECT * FROM report_sources').all()
  for(let i=0;i<2;i++){const value=await(await call(context)).json();assert.equal(value.notices.length,1);assert.equal(value.notices[0].category,'limit');assert.equal(value.scans[0].count,1);assert.equal(value.scans[0].revision,7)}
  assert.deepEqual(context.db.prepare('SELECT * FROM statement_notice_scans').all(),before);assert.deepEqual(context.db.prepare('SELECT * FROM plans').all(),financial);assert.deepEqual(context.db.prepare('SELECT * FROM report_sources').all(),sources)
 }finally{context.db.close()}
})
