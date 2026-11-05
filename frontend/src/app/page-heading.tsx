import type {ComponentProps} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {PeriodPicker} from '../tazrim/components/layout/period-picker'
import type {Period} from '../tazrim/lib/period'

export function PageHeading({children,...props}:ComponentProps<'h1'>){
 const {pathname,search,state}=useLocation(),navigate=useNavigate(),params=new URLSearchParams(search)
 const current=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric'}).format(new Date())
 const year=/^20\d{2}$/.test(params.get('year')||'')?Number(params.get('year')):Number(current)
 const month=/^(?:[1-9]|1[0-2]|0[1-9])$/.test(params.get('month')||'')?Number(params.get('month')):undefined
 const selectPeriod=(next:Period)=>{
  if(next.year<1900||next.year>2999)return
  const query=new URLSearchParams(search)
  query.set('year',String(next.year))
  if(next.month)query.set('month',String(next.month));else query.delete('month')
  navigate(pathname+'?'+query,{state,preventScrollReset:true})
 }
 return <div className="household-page-heading"><h1 {...props}>{children}</h1>{pathname!=='/'&&<div className="household-period"><PeriodPicker period={{year,month}} onChange={selectPeriod}/></div>}</div>
}
