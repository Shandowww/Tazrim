import type {ComponentProps} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {PeriodPicker} from '../tazrim/components/layout/period-picker'
import type {Period} from '../tazrim/lib/period'
import {MobileMonthPicker, availableMonths} from './mobile-month-picker'
import {monthAt} from '../../../src/budget.js'
import {periodFor} from './detail-period'

function useRoutePeriod(){
 const {pathname,search,state}=useLocation(),navigate=useNavigate()
 const requested=periodFor(search)
 const year=Number(requested.year),month=Number(requested.month)||undefined
 const current=Number(requested.asOf.slice(0,4)),currentMonth=Number(requested.asOf.slice(5))
 const latestMonth=monthAt(requested.asOf,1)
 const latestYear=Number(latestMonth.slice(0,4))
 const latestIndex=latestYear*12+Number(latestMonth.slice(5))
 const canSelect=(next:Period)=>next.year>=2000&&(next.month
  ? next.year*12+next.month<=latestIndex
  : next.year<=current)
 const selectPeriod=(next:Period)=>{
  if(!canSelect(next))return
  const query=new URLSearchParams(search)
  query.set('year',String(next.year))
  if(next.month)query.set('month',String(next.month));else query.delete('month')
  navigate(pathname+'?'+query,{state,preventScrollReset:true})
 }
 return {year,month,current,currentMonth,latestMonth,latestYear,canSelect,selectPeriod}
}

export function SidebarPeriodPicker(){
 const {year,month,latestYear,canSelect,selectPeriod}=useRoutePeriod()
 return <div className="household-period"><PeriodPicker period={{year,month}} latestYear={latestYear} canSelect={canSelect} onChange={selectPeriod}/></div>
}

export function PageHeading({children,mobilePeriod=true,...props}:ComponentProps<'h1'> & {mobilePeriod?: boolean}){
 const {pathname}=useLocation()
 const {year,month,current,currentMonth,latestMonth,canSelect,selectPeriod}=useRoutePeriod()
 const monthKey=(part:number)=>`${year}-${String(part).padStart(2,'0')}`
 const selected=monthKey(month??(year===current?currentMonth:6))
 const anchor=selected<latestMonth?selected:latestMonth
 return <div className="household-page-heading">
  <h1 {...props}>{children}</h1>
  {pathname!=='/'&&mobilePeriod&&<MobileMonthPicker months={availableMonths(anchor,'2000-01',latestMonth)} selected={month?selected:undefined} anchor={anchor} label="חודש לתצוגה"
    onChange={key=>selectPeriod({year:Number(key.slice(0,4)),month:Number(key.slice(5))})} onYearChange={year=>selectPeriod({year})} canSelectYear={year=>canSelect({year})}/>}
 </div>
}
