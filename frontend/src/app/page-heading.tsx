import type {ComponentProps} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {PeriodPicker} from '../tazrim/components/layout/period-picker'
import type {Period} from '../tazrim/lib/period'
import {MobileMonthPicker, availableMonths} from './mobile-month-picker'
import {periodFor} from './detail-period'

function useRoutePeriod(){
 const {pathname,search,state}=useLocation(),navigate=useNavigate()
 const requested=periodFor(search)
 const year=Number(requested.year),month=Number(requested.month)||undefined
 const current=Number(requested.asOf.slice(0,4)),currentMonth=Number(requested.asOf.slice(5))
 const selectPeriod=(next:Period)=>{
  if(next.year<1900||next.year>2999)return
  const query=new URLSearchParams(search)
  query.set('year',String(next.year))
  if(next.month)query.set('month',String(next.month));else query.delete('month')
  navigate(pathname+'?'+query,{state,preventScrollReset:true})
 }
 return {year,month,current,currentMonth,selectPeriod}
}

export function SidebarPeriodPicker(){
 const {year,month,selectPeriod}=useRoutePeriod()
 return <div className="household-period"><PeriodPicker period={{year,month}} onChange={selectPeriod}/></div>
}

export function PageHeading({children,mobilePeriod=true,...props}:ComponentProps<'h1'> & {mobilePeriod?: boolean}){
 const {pathname}=useLocation()
 const {year,month,current,currentMonth,selectPeriod}=useRoutePeriod()
 const monthKey=(part:number)=>`${year}-${String(part).padStart(2,'0')}`
 const anchor=monthKey(month??(year===current?currentMonth:6))
 return <div className="household-page-heading">
  <h1 {...props}>{children}</h1>
  {pathname!=='/'&&mobilePeriod&&<MobileMonthPicker months={availableMonths(anchor)} selected={month?anchor:undefined} anchor={anchor} label="חודש לתצוגה"
    onChange={key=>selectPeriod({year:Number(key.slice(0,4)),month:Number(key.slice(5))})} onYearChange={year=>selectPeriod({year})}/>}
 </div>
}
