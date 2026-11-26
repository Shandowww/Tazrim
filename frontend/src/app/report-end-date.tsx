const reportEndPrefix='קיים מידע עד'
const reportDate=(date:string)=>date.split('-').reverse().join('/')

export function reportEndLabel(date:string){
 return reportEndPrefix+' '+reportDate(date)
}

export function ReportEndDate({date}:{date:string}){
 return <>{reportEndPrefix}{' '}<time dateTime={date} dir="ltr" className="inline-block whitespace-nowrap tabular-nums">{reportDate(date)}</time></>
}
