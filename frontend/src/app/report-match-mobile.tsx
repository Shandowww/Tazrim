import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowDown, ArrowLeft, Check, ChevronDown, ChevronLeft, CirclePlus, Clock3, GitCompareArrows, Search} from 'lucide-react'
import {budgetFields, cashAccountList, creditCards} from '../../../src/budget.js'
import {bankMatchCandidates, reportMatchRows} from './report-match-model'
import {ReportTransactionDetails} from './report-transaction-details'
import './report-match-mobile.css'

type Match = ReturnType<typeof reportMatchRows>[number]
type Choice = (item: number, row: string, value: string) => void
type Candidate = {key: string; row: any; source?: string; category?: string; link: string; differences: string[]; staged: boolean}
const amountText = new Intl.NumberFormat('he-IL', {style: 'currency', currency: 'ILS'})
const dateText = new Intl.DateTimeFormat('he-IL', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'})
const decisionTitle = (decision: string) => decision === 'new' ? 'תנועה חדשה' : decision ? 'כבר נרשמה' : 'ממתינה לבדיקה'
const titleFor = (value: Match) => value.match.row.entry?.merchant ?? value.match.row.description ?? 'תנועה ללא תיאור'

function Movement({label, row, kind, sourceName, accounts, category}: {
 label: string; row: any; kind: 'bank' | 'card'; sourceName?: string; accounts: ReturnType<typeof cashAccountList>; category?: string
}) {
 const entry = row.entry ?? row
 const date = entry.date && Date.parse(entry.date)
 return <section className="duplicate-movement" aria-label={label}>
  <div className="duplicate-movement-top"><h4>{label}</h4>{Number.isSafeInteger(entry.amountCents) && <bdi dir="ltr">{amountText.format(entry.amountCents / 100)}</bdi>}</div>
  <p className="duplicate-movement-name"><bdi>{entry.merchant || row.description || 'ללא תיאור במקור'}</bdi></p>
  <p className="duplicate-movement-date">{date ? dateText.format(date) : 'תאריך המקור אינו שמור'}{category && <> · <bdi>{category}</bdi></>}</p>
  {sourceName && <p className="duplicate-movement-source"><bdi>{sourceName}</bdi></p>}
  <details className="duplicate-disclosure duplicate-evidence">
   <summary>פרטי התנועה <ChevronDown size={16} aria-hidden="true"/></summary>
   <ReportTransactionDetails rows={[row]} kind={kind} accounts={accounts} sourceName={sourceName}/>
  </details>
 </section>
}

function Comparison({value, plan, disabled, onChoose, onNext, onPrevious, hasNext, hasPrevious, onSummary}:{
 value: Match; plan: any; disabled: boolean; onChoose: Choice; onNext: () => void; onPrevious: () => void;
 hasNext: boolean; hasPrevious: boolean; onSummary: () => void
}) {
 const {item, match, itemIndex, id} = value
 const isBank = match.type === 'duplicate'
 const kind = isBank ? 'bank' : 'card'
 const accounts = cashAccountList(plan)
 const accountName = isBank ? accounts.find(account => account.id === item.target)?.label : creditCards(plan).find((card: {id: string}) => card.id === item.target)?.name
 const fieldLabels = new Map([...budgetFields(plan), ['exclude', 'ללא השפעה על התקציב']])
 const [query, setQuery] = useState('')
 const [showMore, setShowMore] = useState(false)
 const searchHeading = useRef<HTMLElement>(null)
 const [visibleCount, setVisibleCount] = useState(5)
 const [selectedKey, setSelectedKey] = useState<string>()
 const results = useMemo(() => isBank ? bankMatchCandidates(plan, item, match, query) : [], [isBank, plan, item, match, query])
 const defaultResults = useMemo(() => query && isBank ? bankMatchCandidates(plan, item, match) : results, [isBank, plan, item, match, query, results])
 const saved: Candidate[] = isBank ? [...new Map([...results, ...defaultResults].map(candidate => [candidate.entry.key, candidate])).values()].map(candidate => ({
  key: candidate.entry.key,
  row: {...candidate.entry.source, amountCents: candidate.entry.cents, accountId: candidate.entry.accountId},
  source: candidate.batch?.file,
  category: fieldLabels.get(candidate.entry.field) ?? candidate.entry.field,
  link: candidate.link,
  differences: candidate.differences,
  staged: !candidate.saved
 })) : (match.candidates ?? []).map((entry: any) => ({
  key: entry.id, row: {date: entry.date, merchant: entry.name, amountCents: Math.round(entry.amount * 100)}, source: 'פירוט ידני בכרטיס',
  category: entry.category, link: entry.id, differences: [], staged: false
 }))
 const selected = saved.find(candidate => candidate.key === selectedKey) ?? saved.find(candidate => candidate.link && candidate.link === match.decision) ?? saved[0]
 const amount = (match.row.entry ?? match.row).amountCents
 const cardDelta = !isBank && selected && amount !== selected.row.amountCents
 const choose = (choice: string) => onChoose(itemIndex, match.id, choice)

 return <article id={id} tabIndex={-1} className="duplicate-comparison" aria-label="השוואה והחלטת קליטה">
  <div className="duplicate-comparison-title">
   <div><p><bdi>{accountName}</bdi></p><h3><bdi>{titleFor(value)}</bdi></h3></div>
   <span className="duplicate-status" data-decided={!!match.decision} role="status">{decisionTitle(match.decision)}</span>
  </div>
  <div className="duplicate-pair">
   <Movement label="בדוח החדש" row={match.row} kind={kind} sourceName={item.name} accounts={accounts}/>
   {selected ? <Movement label={selected.staged ? 'בדוח נוסף בקבוצה' : 'הרישום הקיים'} row={selected.row} kind={kind} sourceName={selected.source} accounts={accounts} category={selected.category}/>
     : <div className="duplicate-empty">לא נמצא רישום מתאים להשוואה.</div>}
  </div>
  {selected && <p className="duplicate-evidence-note">
   {cardDelta ? <>הסכום שונה. קישור יחליף את הפירוט הידני בסכום שבדוח.</>
   : selected.differences.length ? selected.differences.join(' · ')
   : selected.link ? 'הרישום הקיים יכול לשמש לקליטה.' : 'אין מספיק פרטים לקישור בטוח לרישום הזה.'}
  </p>}
  {(isBank || saved.length > 1) && <details open={showMore} onToggle={event => setShowMore(event.currentTarget.open)} className="duplicate-disclosure duplicate-search">
   <summary ref={searchHeading}><Search size={17} aria-hidden="true"/> רישומים נוספים <ChevronDown size={16} aria-hidden="true"/></summary>
   {isBank && <label>חיפוש בחשבון<input type="search" value={query} maxLength={100} placeholder="תיאור, תאריך, סכום או אסמכתה" onChange={event => {setVisibleCount(5); setQuery(event.target.value)}}/></label>}
   <ul>{(query ? saved.filter(candidate => results.some(result => result.entry.key === candidate.key)) : saved).slice(0, visibleCount).map(candidate => (
    <li key={candidate.key}><button type="button" aria-pressed={candidate.key === selected?.key} onClick={() => {setSelectedKey(candidate.key); setShowMore(false); searchHeading.current?.focus()}}>
     <bdi>{candidate.row.description || candidate.row.merchant || 'ללא תיאור'}</bdi><bdi dir="ltr">{amountText.format(candidate.row.amountCents / 100)}</bdi>
    </button></li>
   ))}</ul>
   {query && !results.length && <p role="status">לא נמצאו רישומים.</p>}
   {(query ? results.length : saved.length) > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 5)}>הצגת רישומים נוספים</button>}
  </details>}
  {match.storedDecision && !match.decision && <p role="status" className="duplicate-evidence-note">הרישום שבחרת השתנה או מקושר לתנועה אחרת. יש לבחור שוב.</p>}
  <fieldset disabled={disabled} className="duplicate-choices">
   <legend>מה לעשות עם התנועה?</legend>
   {selected?.link && <button type="button" aria-pressed={match.decision === selected.link} onClick={() => choose(selected.link)}>
    <Check size={19} aria-hidden="true"/><span>{cardDelta ? 'קישור ועדכון לפי הדוח' : 'כבר נרשמה'}<small>{isBank ? 'שימוש ברישום הקיים' : 'החלפת הפירוט הידני בפרטי הדוח'}</small></span>
   </button>}
   <button type="button" aria-pressed={match.decision === 'new'} onClick={() => choose('new')}>
    <CirclePlus size={19} aria-hidden="true"/><span>תנועה חדשה<small>קליטה כרישום נפרד באישור הסופי</small></span>
   </button>
   <button type="button" className="duplicate-defer" onClick={() => {if (match.storedDecision) choose(''); else if (hasNext) onNext(); else onSummary()}}>
    <Clock3 size={18} aria-hidden="true"/> להשאיר לבדיקה
   </button>
  </fieldset>
  <nav className="duplicate-navigation" aria-label="מעבר בין בדיקות כפילות">
   <button type="button" disabled={!hasPrevious || disabled} onClick={onPrevious}>הקודמת</button>
   <button type="button" disabled={disabled} onClick={hasNext ? onNext : onSummary}>{hasNext ? 'הבאה לבדיקה' : 'לסיכום הדוח'}{hasNext ? <ArrowLeft size={18} aria-hidden="true"/> : <ArrowDown size={18} aria-hidden="true"/>}</button>
  </nav>
 </article>
}

export function ReportMatchMobile({values, plan, disabled, focusId, onChoose}:{
 values: Match[]; plan: any; disabled: boolean; focusId: string | null; onChoose: Choice
}) {
 const [activeId, setActiveId] = useState<string>()
 const [reviewListOpen, setReviewListOpen] = useState(false)
 const [listLimit, setListLimit] = useState(12)
 const [focusAfterNavigation, setFocusAfterNavigation] = useState<string>()
 const pending = values.filter(value => !value.match.decision)
 const active = values.find(value => value.id === activeId) ?? pending[0] ?? values[0]
 const index = values.indexOf(active)
 const next = values.slice(index + 1).find(value => !value.match.decision) ?? pending.find(value => value !== active)
 const selected = values.length - pending.length
 useEffect(() => {
  if (focusId && values.some(value => value.id === focusId)) setActiveId(focusId)
 }, [focusId, values])
 useEffect(() => {
  if (!focusAfterNavigation) return
  const target = document.getElementById(focusAfterNavigation)
  if (!target) return
  target.focus({preventScroll: true})
  target.scrollIntoView({block: 'start'})
  setFocusAfterNavigation(undefined)
 }, [focusAfterNavigation, active])
 if (!active) return null
 const go = (id: string) => {setActiveId(id); setFocusAfterNavigation(id)}
 const summary = () => {
  const target = document.getElementById('report-review-summary')
  target?.focus({preventScroll: true})
  target?.scrollIntoView({block: 'start'})
 }
 return <section className="duplicate-mobile" aria-label="השוואת תנועות והחלטות">
  <header className="duplicate-queue-heading">
   <div className="duplicate-heading-icon"><GitCompareArrows size={22} aria-hidden="true"/></div>
   <div><h2>בדיקת כפילויות</h2><p role="status"><bdi>{pending.length}</bdi> לבדיקה · <bdi>{selected}</bdi> נבדקו</p></div>
   <span className="duplicate-position" dir="ltr">{index + 1} / {values.length}</span>
   <progress aria-label="התקדמות בדיקת כפילויות" value={selected} max={values.length}/>
  </header>
  <Comparison key={active.id} value={active} plan={plan} disabled={disabled} onChoose={(item, row, choice) => {setActiveId(active.id); onChoose(item, row, choice)}}
   hasPrevious={index > 0} hasNext={!!next} onPrevious={() => go(values[index - 1].id)}
   onNext={() => {if (next) go(next.id)}} onSummary={summary}/>
  {values.length > 1 && <details open={reviewListOpen} onToggle={event => setReviewListOpen(event.currentTarget.open)} className="duplicate-disclosure duplicate-queue-list">
   <summary>כל ההשוואות <bdi>{values.length}</bdi><ChevronDown size={18} aria-hidden="true"/></summary>
   <ul>{values.slice(0, listLimit).map(value => <li key={value.id}><button type="button" aria-current={active.id === value.id ? 'true' : undefined} onClick={() => {setReviewListOpen(false); go(value.id)}}>
    <span><bdi>{titleFor(value)}</bdi><small>{decisionTitle(value.match.decision)}</small></span><ChevronLeft size={18} aria-hidden="true"/>
   </button></li>)}</ul>
   {listLimit < values.length && <button type="button" onClick={() => setListLimit(limit => limit + 12)}>הצגת עוד השוואות</button>}
  </details>}
 </section>
}
