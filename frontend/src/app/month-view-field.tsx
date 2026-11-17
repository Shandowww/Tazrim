import {MobileMonthPicker, availableMonths} from './mobile-month-picker'
import {periodFor} from './detail-period'

/** A month that controls a view, with an exact month input on desktop. */
export function MonthViewField({label, value, onChange, min, max, disabled, className, inputClassName, direction}: {
  label: string
  value: string
  onChange: (month: string) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  direction?: 'ltr'
}) {
  const valid = /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value)
  const anchor = valid ? value : (max || min || periodFor('').asOf)
  return <div className={'month-view-field min-w-0 ' + (className ?? '')}>
    <label className="mobile-month-desktop">{label}<input type="month" aria-label={label} className={inputClassName} dir={direction}
      min={min} max={max} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}/></label>
    <MobileMonthPicker months={availableMonths(anchor, min, max)} selected={valid ? value : undefined} anchor={anchor}
      label={label} disabled={disabled} onChange={onChange}/>
  </div>
}
