import {useRef,useState} from 'react'
import {MoneyAmount} from './money-amount'
import {mapReportSource,mappingOptions,type MappedReport,type MappingChoice} from './report-manual-mapping'

const input='mt-1 min-h-11 w-full rounded-xl border bg-card px-3 text-sm'
const button='min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50'
export function ReportManualMapping({inspection,hash,disabled,onAccept,onCancel}:{inspection:any;hash:string;disabled?:boolean;onAccept:(mapped:MappedReport,choice:MappingChoice)=>void;onCancel?:()=>void}){
 const [options]=useState(()=>mappingOptions(inspection))
 const initialFields=():Record<string,string>=>{
  if(options?.kind!=='bank')return {}
  const guess=options.guess
  return {...Object.fromEntries(['date','description','amount','debit','credit','balance'].map(key=>[key,guess[key]>=0?String(guess[key]):''])),mode:guess.debit>=0||guess.credit>=0?'split':'signed'}
 }
 const [fields,setFields]=useState(initialFields)
 const [preview,setPreview]=useState<MappedReport|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false)
 const previewTitle=useRef<HTMLHeadingElement>(null)
 if(!options)return null
 const choices=options.kind==='card'?options.card:null
 const change=(key:string,value:string)=>{setFields(old=>({...old,[key]:value}));setPreview(null);setError('')}
 const pick=(key:string,label:string)=>{
  const list=options.kind==='bank'?options.columns:choices?.[key]??[]
  const sample=list.find(option=>option.value===fields[key])?.sample
  return <label className="block min-w-0 text-sm font-medium">{label}<select className={input} value={fields[key]??''} onChange={event=>change(key,event.target.value)}>
   <option value="">בחירה מהקובץ</option>{list.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}
  </select>{sample&&<span className="mt-1 block break-words text-xs text-muted-foreground">לדוגמה <bdi>{sample.slice(0,150)}</bdi></span>}</label>
 }
 const check=async()=>{
  setChecking(true);setError('');setPreview(null)
  try{setPreview(await mapReportSource(inspection,{kind:options.kind,fields},hash));requestAnimationFrame(()=>previewTitle.current?.focus())}
  catch(error){setError(error instanceof Error?error.message:'לא ניתן לאמת את המיפוי.')}
  finally{setChecking(false)}
 }
 const evidence=options.kind==='bank'?options.columns.slice(0,8):Object.values(options.card).flat().slice(0,8)
 const rows:{label:string;date:string;cents:number}[]|undefined=preview?.kind==='card'?preview.report.entries.map((row:any)=>({label:row.merchant,date:row.date,cents:row.amountCents})):preview?.records.map(row=>({label:row.description,date:row.date,cents:row.amountCents}))
 return <section className="surface space-y-3 rounded-xl border p-4" aria-label="התאמת שדות מהדוח">
  <h3 className="font-semibold">התאמת שדות מהדוח</h3>
  <p className="text-sm text-muted-foreground">{options.kind==='card'?'בחרו את הערכים המודפסים בכותרת הכרטיס.':'בחרו את העמודות מתוך הכותרת שנמצאה בקובץ.'}</p>
  <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
  <fieldset disabled={disabled||checking} className="grid min-w-0 content-start gap-3 rounded-xl border p-3"><legend className="px-1 text-sm font-medium">השדות הנדרשים</legend>
   {options.kind==='card'?<>{pick('card','4 ספרות אחרונות')}{pick('date','מועד חיוב')}{pick('total','סכום חיוב בש״ח')}</>:<>
    <label className="block text-sm font-medium">מבנה סכום<select className={input} value={fields.mode} onChange={event=>change('mode',event.target.value)}><option value="signed">סכום עם סימן</option><option value="split">עמודות חובה וזכות</option></select></label>
    {pick('date','תאריך תנועה')}{pick('description','תיאור')}
    {fields.mode==='split'?<>{pick('debit','חובה')}{pick('credit','זכות')}</>:pick('amount','סכום עם סימן')}
    {pick('balance','יתרה')}
   </>}
   <div className="flex flex-wrap gap-2"><button type="button" className={button+' bg-primary text-primary-foreground'} onClick={()=>void check()}>{checking?'בודקים התאמה…':'בדיקת התאמה'}</button><button type="button" className={button} onClick={()=>{setFields(initialFields());setPreview(null);setError('')}}>איפוס בחירות</button>{onCancel&&<button type="button" className={button} onClick={onCancel}>חזרה לדוח</button>}</div>
  </fieldset>
  <section aria-label="ערכים שנמצאו בקובץ" className="min-w-0 rounded-xl border p-3 text-sm">
   <h4 className="font-medium">ערכים שנמצאו בקובץ</h4>
   <ul className="mt-2 divide-y">{evidence.map(option=><li key={option.value} className="flex flex-wrap justify-between gap-2 break-words py-2"><bdi>{option.label.slice(0,150)}</bdi>{option.sample&&<bdi className="text-muted-foreground">{option.sample.slice(0,120)}</bdi>}</li>)}</ul>
  </section>
  </div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {preview&&rows?.length&&<section className="space-y-2 rounded-xl bg-muted p-3 text-sm">
   <h4 ref={previewTitle} tabIndex={-1} className="font-semibold">תצוגה מקדימה</h4>
   <p><bdi>{rows.length}</bdi> שורות · <MoneyAmount value={rows.reduce((sum,row)=>sum+row.cents,0)/100}/>{preview.kind==='card'&&<> · חיוב ב־<bdi dir="ltr">{preview.report.dueDate}</bdi></>}</p>
   <ul className="divide-y">{rows.slice(0,3).map((row,index)=><li key={index} className="flex flex-wrap justify-between gap-2 py-2"><bdi>{row.label}</bdi><bdi dir="ltr">{row.date}</bdi><MoneyAmount value={row.cents/100}/></li>)}</ul>
   <button type="button" disabled={disabled} className={button} onClick={()=>onAccept(preview,{kind:options.kind,fields})}>המשך לבדיקת הדוח</button>
  </section>}
 </section>
}
