import type {summarizeBankBalances} from './budget-adapter.js'
import {RollingNumber} from '../tazrim/components/ui/rolling-number'
export type BankBalanceSummary=ReturnType<typeof summarizeBankBalances>

export function BankWalletSummary({summary}:{summary:BankBalanceSummary}){
 return <>
  <p className="wallet-pocket__label">{summary.reported===summary.total&&summary.total>0?'סה״כ יתרות מדווחות':'יתרות מדווחות · סיכום חלקי'}</p>
  <p className="wallet-pocket__total" dir="ltr">{summary.value===null?<span aria-label="אין יתרות מדווחות">—</span>:<RollingNumber value={summary.value} format="currencyExact"/>}</p>
  <p className="wallet-pocket__balance-note">{summary.reported===0?'לא דווחו יתרות בתקופה שנבחרה':summary.reported<summary.total?<>יתרות של <bdi>{summary.reported}</bdi> מתוך <bdi>{summary.total}</bdi> חשבונות</>:'לפי הדיווחים בתקופה שנבחרה'}</p>
  {summary.reported>0&&<p className="wallet-pocket__balance-note">{summary.from===summary.to?<>תאריך הדיווח: <bdi dir="ltr">{summary.to}</bdi></>:<>תאריכי דיווח שונים: <bdi dir="ltr">{summary.from}</bdi>–<bdi dir="ltr">{summary.to}</bdi></>}</p>}
 </>
}
