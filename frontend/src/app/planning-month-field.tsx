import {monthAt} from '../../../src/budget.js'

const monthFormat = new Intl.DateTimeFormat('he-IL', {month: 'long', timeZone: 'UTC'})
const monthOptions = Array.from({length: 12}, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: monthFormat.format(new Date(Date.UTC(2000, index, 1))),
}))

export function PlanningMonthField({label, value, startMonth, onChange, className}: {
  label: string
  value: string
  startMonth: string
  onChange: (value: string) => void
  className: string
}) {
  const [year, month] = value.split('-')
  const firstYear = Number(startMonth.slice(0, 4))
  const lastMonth = monthAt(startMonth, 119)
  const lastYear = Math.min(2099, Number(lastMonth.slice(0, 4)))
  const years = Array.from({length: lastYear - firstYear + 1}, (_, index) => String(firstYear + index))
  const monthsFor = (year: string) => monthOptions.filter(option => {
    const date = year + '-' + option.value
    return date >= startMonth && date <= lastMonth
  })
  const selectYear = (nextYear: string) => {
    const options = monthsFor(nextYear)
    const nextMonth = options.find(option => option.value === month) ?? options[0]
    if (nextMonth) onChange(nextYear + '-' + nextMonth.value)
  }
  const selectedYear = years.includes(year) ? year : ''
  const months = monthsFor(selectedYear)
  const selectedMonth = months.some(option => option.value === month) ? month : ''

  return <fieldset className="min-w-0">
    <legend className="text-sm">{label}</legend>
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
      <select className={className} aria-label={label + ' · חודש'} value={selectedMonth} disabled={!selectedYear}
        onChange={event => onChange(year + '-' + event.target.value)}>
        <option value="" disabled>חודש</option>
        {months.map(option =>
          <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select className={className} aria-label={label + ' · שנה'} value={selectedYear}
        onChange={event => selectYear(event.target.value)}>
        <option value="" disabled>שנה</option>
        {years.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  </fieldset>
}
