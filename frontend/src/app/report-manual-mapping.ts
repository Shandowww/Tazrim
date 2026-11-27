import {mapReportSource as mapSource, mappingOptions as optionsFor, parseMappingChoice as parseChoice} from '../../../tools/bank-csv/manual-report-mapping.mjs'
import {inboxHash} from '../../../src/report-inbox-model.js'

type Choice={value:string;label:string;sample?:string;sampleLine?:number}
type BankRow={line:number;description:string;date:string;amountCents:number}
export type MappingChoice={kind:'bank'|'card';fields:Record<string,string>}
type MappingOptions={kind:'card';card:Record<string,Choice[]>}|{kind:'bank';columns:Choice[];headerLine:number;guess:Record<string,number>}
export const mappingOptions=(inspection:any):MappingOptions|null=>optionsFor(inspection) as MappingOptions|null
export const parseMappingChoice=(value:string|null|undefined):MappingChoice|null=>parseChoice(value)
type Parsed={identity:string;provider:string;skip:boolean}&({kind:'bank';records:BankRow[];from:string;to:string;bankOptions:{scope:string}}|{kind:'card';report:{last4:string;dueDate:string;amount:number;entries:any[]}})
export async function mapReportSource(inspection:any,choice:MappingChoice,hash:string){
 const parsed=mapSource(inspection,choice) as Parsed
 return {...parsed,hash,identityKey:parsed.identity?await inboxHash(parsed.identity):''}
}
export type MappedReport=Awaited<ReturnType<typeof mapReportSource>>
