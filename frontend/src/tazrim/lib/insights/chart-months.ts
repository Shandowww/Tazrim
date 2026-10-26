import { monthName } from '@/lib/utils/date'

/**
 * Rows for a monthly bar chart (ENG-70): always January to December, so every
 * month the picker offers is on the chart. A month without a reported value in any
 * of the chart's series is `empty` and its values are null: Recharts draws no
 * bar there. A reported zero remains a value.
 */
export type YearChartRow<K extends string> = { month: number; name: string; empty: boolean } & Record<K, number | null>

export const YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function yearChartRows<K extends string>(
  keys: readonly K[],
  value: (month: number, key: K) => number | null | undefined
): YearChartRow<K>[] {
  return YEAR_MONTHS.map(month => {
    const values = keys.map(k => [k, value(month, k)] as const)
    const empty = values.every(([, v]) => v == null)
    const row = { month, name: monthName(month), empty } as YearChartRow<K>
    for (const [k, v] of values) (row as Record<string, unknown>)[k] = v ?? null
    return row
  })
}

/**
 * Whether a month's x-axis label shows. On phones (`everyOther`) 12 labels
 * don't fit, so every other month shows, but the selected month always does
 * and its neighbours give way so the two labels don't touch.
 */
export function showMonthLabel(month: number, selectedMonth: number | undefined, everyOther: boolean): boolean {
  if (!everyOther || month === selectedMonth) return true
  if (selectedMonth && Math.abs(month - selectedMonth) === 1) return false
  return month % 2 === 1
}
