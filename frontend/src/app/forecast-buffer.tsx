import {cents} from '../../../src/budget.js'
import {MoneyAmount} from './money-amount'

/** Compare an existing month-end projection to its own account's safety buffer. */
export function ForecastBuffer({balance,buffer}:{balance:number|null;buffer:number}){
 if(balance===null)return <span>חסרה יתרה להשוואה לרף הביטחון</span>
 const margin=cents(balance)-cents(buffer)
 if(margin===0)return <span>בדיוק ברף הביטחון</span>
 return <span className={margin<0?'text-destructive':undefined}>
  <MoneyAmount value={Math.abs(margin)/100}/> {margin<0?'מתחת לרף הביטחון':'מעל רף הביטחון'}
 </span>
}
