import {guessMapping,normalizeRows} from './parser.mjs'
import {isracardMetadataOptions,parseIsracardSpreadsheet} from './isracard-xlsx.mjs'
import {bankIdentityHints} from './intake-reader.mjs'

export function mappingOptions(inspection){
 const card=isracardMetadataOptions(inspection)
 if(card)return {kind:'card',card}
 // A partially recognized card format must pass its own reconciliation.
 const metadata=inspection.rows.slice(0,35).flatMap((row)=>row.cells).join(' ')
 if(/עסקאות למועד חיוב|עסקאות לחיוב ב-|עסקאות שטרם חויבו|סכום חיוב.{0,25}מטבע חיוב/.test(metadata))return null
 const headers=inspection.rows[inspection.headerIndex]?.cells??[]
 if(headers.length<3||inspection.rows.length<=inspection.headerIndex+1)return null
 const sampleRows=inspection.rows.slice(inspection.headerIndex+1,inspection.headerIndex+11)
 const columns=headers.map((label,i)=>{
  const sample=sampleRows.find(row=>String(row.cells[i]??'').trim())
  return {value:String(i),label:label||'עמודה '+(i+1),sample:sample?.cells[i]??'',sampleLine:sample?.line}
 })
 return {kind:'bank',columns,headerLine:inspection.rows[inspection.headerIndex].line,guess:guessMapping(headers)}
}

export function parseMappingChoice(value){
 if(typeof value!=='string'||!value||value.length>450)return null
 try{
  const parsed=JSON.parse(value), keys=parsed?.kind==='bank'?['mode','date','description','amount','debit','credit','balance']:parsed?.kind==='card'?['card','date','total']:null
  if(!keys||!parsed.fields||typeof parsed.fields!=='object'||Array.isArray(parsed.fields)||Object.entries(parsed.fields).some(([key,val])=>!keys.includes(key)||typeof val!=='string'||!/^(?:\d{0,3}|\d{1,4}:\d{1,3}|signed|split)$/.test(val)))return null
  return {kind:parsed.kind,fields:parsed.fields}
 }catch{return null}
}

export function mapReportSource(inspection,choice){
 const options=mappingOptions(inspection)
 if(!options||options.kind!==choice.kind)throw Error('המיפוי אינו מתאים לקובץ. פתחו את הדוח ובחרו מחדש.')
 const fields=choice.fields
 if(options.kind==='card'){
  for(const key of ['card','date','total'])if(!options.card[key].some(option=>option.value===fields[key]))throw Error('בחרו את מספר הכרטיס, מועד החיוב וסכום החיוב מתוך הכותרת.')
  const report=parseIsracardSpreadsheet([inspection],fields)
  if(!report)throw Error('מבנה העסקאות אינו מתאים לדוח כרטיס נתמך.')
  const identity='isracard:'+report.last4
  return {kind:'card',provider:'isracard',identity,report,skip:false}
 }
 const {mode}=fields
 if(mode!=='split'&&mode!=='signed')throw Error('בחרו כיצד מוצגים הסכומים בדוח.')
 const index=(name)=>options.columns.findIndex(column=>column.value===fields[name])
 const date=index('date'),description=index('description'),balance=index('balance')
 const amount=mode==='signed'?index('amount'):-1,debit=mode==='split'?index('debit'):-1,credit=mode==='split'?index('credit'):-1
 if(date<0||description<0||(mode==='signed'?amount<0:debit<0&&credit<0))throw Error('בחרו עמודות לתאריך, לתיאור ולסכום.')
 if(options.guess.balance>=0&&balance<0)throw Error('נמצאה עמודת יתרה. בחרו אותה כדי לאמת את הסכומים.')
 const mapping={...options.guess,date,description,amount,debit,credit,balance}
 const {records}=normalizeRows(inspection,{mapping,mode,defaultCurrency:'ILS'})
 const invalid=records.find(row=>!row.valid||row.currency!=='ILS'||!row.description)
 if(invalid){
  const problem=invalid.issues[0]|| (invalid.currency!=='ILS'?'הסכום בדוח הוא במטבע '+invalid.currency+'. אפשר לייבא רק סכומים בשקלים.':'חסר תיאור תנועה.')
  throw Error('שורת מקור '+invalid.line+' — '+problem)
 }
 if(!records.length)throw Error('לא נמצאו תנועות אחרי הכותרת.')
 if(balance>=0){
  const reconciles=(rows)=>rows.every((row,i)=>Number.isSafeInteger(row.balanceCents)&&(!i||rows[i-1].date<=row.date&&row.balanceCents-rows[i-1].balanceCents===row.amountCents))
  if(!reconciles(records)&&!reconciles([...records].reverse()))throw Error('הסכומים אינם תואמים לרצף היתרות. בדקו את מיפוי העמודות.')
 }
 const dates=records.map(row=>row.date).sort(),heading=inspection.rows.slice(0,inspection.headerIndex+1).flatMap((row)=>row.cells).join(' ')
 const provider=/one\s*zero|וואן\s*זירו/i.test(heading)?'one-zero':/הפועלים/.test(heading)?'hapoalim':''
 const hints=bankIdentityHints(heading),identity=provider&&hints.accountHint&&!hints.identityAmbiguous?'bank:'+provider+':'+(hints.branchHint?hints.branchHint+':':'')+hints.accountHint:''
 return {kind:'bank',provider,identity,records,from:dates[0],to:dates.at(-1),skip:false,bankOptions:{scope:'partial'}}
}
