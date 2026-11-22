import {useEffect, useId, useLayoutEffect, useRef, useState, type TouchEvent} from 'react'
import {createPortal} from 'react-dom'
import {CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react'
import {indexMonth, monthAt} from '../../../src/budget.js'
import {monthNameShort} from '../tazrim/lib/utils/date'

const monthFormat = new Intl.DateTimeFormat('he-IL', {month: 'long', timeZone: 'UTC'})
const monthName = (month: string) => monthFormat.format(new Date(month + '-01T00:00:00Z'))
const monthLabel = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`
const pageSize = 6

export function availableMonths(anchor: string, min = '2000-01', max = '2099-12') {
  const first = min < anchor ? min : anchor
  const last = max > anchor ? max : anchor
  return Array.from({length: indexMonth(last) - indexMonth(first) + 1}, (_, index) => monthAt(first, index))
    .filter(month => month === anchor || (month >= min && month <= max))
}

export function MobileMonthPicker({months, selected, anchor = selected, label, disabled = false, onChange, onYearChange, topBar = true}: {
  months: string[]
  selected?: string
  anchor?: string
  label: string
  disabled?: boolean
  onChange: (month: string) => void
  onYearChange?: (year: number) => void
  topBar?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const swipe = useRef<{id: number; x: number; y: number} | null>(null)
  const lastPage = Math.max(0, Math.ceil(months.length / pageSize) - 1)
  const pageNumber = Math.min(page, lastPage)
  // Keep the newest page full in bounded histories and preserve year halves in annual mode.
  const offset = onYearChange ? 0 : (pageSize - months.length % pageSize) % pageSize
  const visible = months.slice(Math.max(0, pageNumber * pageSize - offset), (pageNumber + 1) * pageSize - offset)
  const firstYear = visible[0]?.slice(0, 4), lastYear = visible.at(-1)?.slice(0, 4)
  const shortName = (month: string) => monthNameShort(Number(month.slice(5)))
  const rangeLabel = visible.length && `${shortName(visible[0])}–${shortName(visible.at(-1)!)} ${firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}`
  const valueLabel = selected ? monthLabel(selected) : onYearChange && anchor ? `כל ${anchor.slice(0, 4)}` : 'בחירת חודש'

  useLayoutEffect(() => {
    if (topBar) setHost(document.getElementById('mobile-month-slot'))
  }, [topBar])

  useLayoutEffect(() => {
    if (!open) return
    const selectedButton = root.current?.querySelector<HTMLButtonElement>('[data-month-choice][aria-pressed=true]')
    const firstButton = root.current?.querySelector<HTMLButtonElement>('[data-month-choice]')
    const target = selectedButton ?? firstButton
    target?.focus({preventScroll: true})
  }, [open])

  useEffect(() => {
    if (!open) return
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 768px)')
    const dismissOnDesktop = () => {if (desktop.matches) setOpen(false)}
    document.addEventListener('pointerdown', dismissOutside)
    desktop.addEventListener('change', dismissOnDesktop)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      desktop.removeEventListener('change', dismissOnDesktop)
    }
  }, [open])

  function closeAndFocus() {
    setOpen(false)
    trigger.current?.focus({preventScroll: true})
  }

  function movePage(step: number) {
    setPage(Math.max(0, Math.min(lastPage, pageNumber + step)))
  }

  function beginSwipe(event: TouchEvent) {
    const touch = event.touches[0]
    swipe.current = lastPage > 0 && event.touches.length === 1
      ? {id: touch.identifier, x: touch.clientX, y: touch.clientY}
      : null
  }

  function endSwipe(event: TouchEvent) {
    const start = swipe.current
    swipe.current = null
    const touch = event.changedTouches[0]
    if (!start || event.touches.length || event.changedTouches.length !== 1 || touch.identifier !== start.id) return
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (event.cancelable) event.preventDefault()
    const step = dx > 0 ? -1 : 1
    if (pageNumber + step < 0 || pageNumber + step > lastPage) return
    if (event.currentTarget.contains(document.activeElement) && document.activeElement?.matches('[data-month-choice], .mobile-month-annual')) {
      event.currentTarget.querySelector<HTMLButtonElement>(step < 0 ? '[data-month-previous]' : '[data-month-next]')?.focus({preventScroll: true})
    }
    movePage(step)
  }

  const picker = <div className="mobile-month-picker" ref={root} dir="rtl"
    onBlur={event => {if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)}}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      event.stopPropagation()
      closeAndFocus()
    }} data-tab-swipe-ignore data-pull-refresh-ignore>
    <button type="button" className="mobile-month-trigger" ref={trigger}
      disabled={disabled || months.length === 0} aria-label={`${label} · ${valueLabel}`} aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        if (!open) setPage(Math.max(0, Math.floor((months.indexOf(anchor ?? '') + offset) / pageSize)))
        setOpen(!open)
      }}>
      <CalendarDays size={16} aria-hidden/><span>{valueLabel}</span><ChevronDown size={14} aria-hidden/>
    </button>
    {open && !disabled && <div id={id} className="mobile-month-panel" role="group" aria-label={label}
      onTouchStart={beginSwipe} onTouchEnd={endSwipe} onTouchCancel={() => {swipe.current = null}}>
      {lastPage > 0 && <div className="mobile-month-pager">
        <button type="button" aria-label="חודשים קודמים" data-month-previous aria-disabled={pageNumber === 0} onClick={() => movePage(-1)}><ChevronRight size={17} aria-hidden/></button>
        <span aria-live="polite">{rangeLabel}</span>
        <button type="button" aria-label="חודשים הבאים" data-month-next aria-disabled={pageNumber === lastPage} onClick={() => movePage(1)}><ChevronLeft size={17} aria-hidden/></button>
      </div>}
      <div className="mobile-month-grid" dir="rtl">
        {visible.map(month => <button key={month} type="button" data-month-choice aria-label={monthLabel(month)} aria-pressed={month === selected}
          onClick={() => {closeAndFocus(); if (month !== selected) onChange(month)}}>
          {month === selected && <Check size={13} aria-hidden/>}
          <span>{monthName(month)}</span><bdi dir="ltr">{month.slice(0, 4)}</bdi>
        </button>)}
      </div>
      {onYearChange && firstYear === lastYear && firstYear && <button type="button" className="mobile-month-annual"
        aria-pressed={!selected && firstYear === anchor?.slice(0, 4)} onClick={() => {closeAndFocus(); onYearChange(Number(firstYear))}}>כל שנת <bdi dir="ltr">{firstYear}</bdi></button>}
    </div>}
  </div>
  return topBar ? (host && createPortal(picker, host)) : picker
}
