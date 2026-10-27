// Pinned Tazrim chart-header surface; server/account-management sections are not used here.
import { cn } from '@/lib/utils/cn'

export interface LegendItem {
  label: string
  /** Any CSS color; use a CSS var so server and client markup match */
  color: string
}

/** The dashboard's chart header: title and subtitle, legend at the end. */
export function ChartHeader({
  title,
  subtitle,
  legend,
  className,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map(item => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Card surface used by every chart and list on these pages. */
export const SECTION = 'rounded-xl surface p-4 sm:p-6'
