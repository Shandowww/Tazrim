import http from 'node:http'
import {createHash,randomBytes} from 'node:crypto'
import {networkInterfaces} from 'node:os'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {zero} from '../src/budget.js'
import {demoHouseholdPlan} from '../frontend/src/app/demo-fixture.ts'

// Deliberately uses a new in-memory database and synthetic identity on every start.
// No production configuration, database, credentials or proxy is loaded.
const {db,DB}=openDatabase(':memory:')
const origin='https://platform-preview.invalid',actor='platform-preview',email='preview@example.test'
const session=randomBytes(32).toString('base64url'),now=Date.now()
db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(actor,actor,email,now)
db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(session).digest('hex'),actor,now+7*86400000)
const app=createApp({db,DB,origin,allowedEmails:[email],reportOptions:{key:randomBytes(32)}})
const headersFor=()=>new Headers({origin,cookie:'__Host-mf_session='+session,'x-budget-account-id':actor})
const plan=structuredClone(demoHouseholdPlan)
plan.demo=false;plan.setupCompleted=true;plan.profileName='תקציב לדוגמה'
const sampleIncomes=[13900,14500,15000,15800,15100,15000],sampleExpenses=[2100,2800,2400,3100,2200,2500]
Object.keys(plan.months).sort().forEach((month,index)=>{
 const values=plan.months[month].values,bankRows=plan.cashPlanning.months[month]
 values.salary=sampleIncomes[index];values.variable=sampleExpenses[index]
 bankRows['sample-bank-1'].values.salary=Math.round(sampleIncomes[index]*2/3);bankRows['sample-bank-2'].values.salary=sampleIncomes[index]-bankRows['sample-bank-1'].values.salary
 bankRows['sample-bank-1'].values.variable=sampleExpenses[index]-500
})
plan.details[0].amount=43.21;plan.details[0].statement.originalCents=4321
for(const [id,name,category,amount] of [['transport','תחבורה לדוגמה','תחבורה',25.3],['health','בית מרקחת לדוגמה','בריאות',18.5],['shopping','קנייה לדוגמה','קניות',14]])plan.details.push({id:'preview-'+id,name,category,amount,method:'card1',month:'2026-10',date:'2026-10-08',number:'',status:'cleared',accounting:'included'})
// Outlook prototype: explicit per-account estimates, matched to the aggregate budget.
plan.cashPlanning.accounts[0].buffer=6000;plan.cashPlanning.accounts[1].buffer=2000
for(const month of ['2026-11','2026-12','2027-01']){
 const main={...zero(),salary:10000,variable:3400,checks:800,loanRepayment:350,card1:2200,card2:900,card_home:0,personalSaving:700},second={...zero(),salary:5000,variable:2500,card1:0,card2:0,card_home:450,sharedSaving:500}
 plan.cashPlanning.months[month]={'sample-bank-1':{actual:false,includesPlannedCard:true,includesPlannedDirect:false,values:main},'sample-bank-2':{actual:false,includesPlannedCard:true,includesPlannedDirect:false,values:second}}
 plan.months[month]={actual:false,includesPlannedCard:true,includesPlannedDirect:false,values:Object.fromEntries([...new Set([...Object.keys(main),...Object.keys(second)])].map(key=>[key,(main[key]??0)+(second[key]??0)]))}
}
plan.expenses.push({id:'preview-appliance',name:'החלפת מכונת כביסה',amount:3600,fees:0,firstMonth:'2026-12',payments:1,source:'direct',kind:'expense',cashAccountId:'sample-bank-1'})
plan.details.push({id:'preview-next-cheque',name:'תשלום לוועד הבית',amount:800,category:'בית',method:'checks',date:'2026-11-25',month:'2026-11',number:'',status:'pending',accounting:'included',cashAccountId:'sample-bank-1'})
plan.cardBilling={version:1,reports:[{cardId:'card1',accountId:'sample-bank-1',dueDate:'2026-11-20',updatedOn:'2026-11-10',amount:2200,status:'pending',source:'manual'}]}
const initial=await app(new Request(origin+'/api/plan',{method:'PUT',headers:{...Object.fromEntries(headersFor()),'Content-Type':'application/json'},body:JSON.stringify({plan,revision:0})}))
if(!initial.ok)throw Error('Synthetic seed refused: '+await initial.text())
const port=Number(process.env.PLATFORM_PREVIEW_PORT??5178),host=process.env.PLATFORM_PREVIEW_HOST??'127.0.0.1'
if(!Number.isInteger(port)||port<1024||port>65535||!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Invalid preview bind')
const banner='<aside class="platform-preview-banner" dir="rtl" aria-label="תצוגה מקדימה">תצוגה מקדימה · נתוני דוגמה בלבד</aside>'
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.writeHead(302,{Location:'/next?year=2026&month=10'});res.end();return}
  // External account connections, uploads, PWA registration and login are outside this design preview.
  if(/^\/(?:auth|sw\.js|manifest\.webmanifest|api\/imports)(?:[/?]|$)/.test(req.url)){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});res.end('This sample-data preview does not connect external accounts or upload files.');return}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;chunks.push(chunk);if(size>2_000_000){res.writeHead(413);res.end();return}}
  const body=Buffer.concat(chunks),headers=headersFor()
  for(const key of ['content-type','accept'])if(req.headers[key])headers.set(key,String(req.headers[key]))
  const result=await app(new Request(origin+req.url,{method:req.method,headers,...(body.length?{body}:{})}))
  const outputHeaders=new Headers(result.headers);outputHeaders.delete('set-cookie');outputHeaders.set('Cache-Control','no-store')
  let output=Buffer.from(await result.arrayBuffer())
  if(outputHeaders.get('Content-Type')?.includes('text/html')){output=Buffer.from(output.toString().replace('<body>','<body>'+banner).replace(/<title>[^<]*<\/title>/,'<title>Budgit · תצוגה מקדימה</title>'));outputHeaders.delete('content-length')}
  res.writeHead(result.status,Object.fromEntries(outputHeaders));res.end(output)
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Preview request failed')}
})
server.listen(port,host,()=>{
 const addresses=host==='0.0.0.0'?Object.values(networkInterfaces()).flat().filter(address=>address&&!address.internal&&address.family==='IPv4').map(address=>'http://'+address.address+':'+port+'/next?year=2026&month=10'):[]
 console.log(JSON.stringify({local:'http://127.0.0.1:'+port+'/next?year=2026&month=10',network:addresses,sampleDataOnly:true,persistent:false}))
})
const close=()=>server.close(()=>{db.close();process.exit(0)})
process.on('SIGTERM',close);process.on('SIGINT',close)
