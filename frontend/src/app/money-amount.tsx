/** Keep the shekel symbol physically before the signed amount in both RTL and LTR. */
export function MoneyAmount({value,minimumFractionDigits=0,missing='חסר דיווח'}:{value:number|null;minimumFractionDigits?:number;missing?:string}){
 if(value===null)return <span>{missing}</span>
 const number=new Intl.NumberFormat('en-US',{minimumFractionDigits,maximumFractionDigits:2}).format(value)
 return <bdi className="money-amount" dir="ltr"><span className="money-symbol">₪</span>{' '}<span className="money-number">{number}</span></bdi>
}
