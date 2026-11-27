import { ChevronDown, Palette as PaletteIcon } from 'lucide-react'
import { useId } from 'react'
import type { Palette } from './appearance'

export interface AppearanceSettingsProps {
  theme: string
  palette: Palette
  onThemeChange: (value: string) => void
  paletteSpaceName?: string
  onPaletteChange?: (value: Palette) => void
}

export function AppearanceSettings({ theme, palette, paletteSpaceName, onThemeChange, onPaletteChange }: AppearanceSettingsProps) {
  const scopeLabelId = useId()
  return <section className="surface household-settings-appearance">
    <div className="household-settings-icon"><PaletteIcon size={21} aria-hidden/></div>
    <div className="household-appearance-fields">
      <label>
        <span>מראה</span>
        <span className="appearance-select">
          <select value={theme} onChange={event => onThemeChange(event.target.value)}>
            <option value="system">מערכת</option>
            <option value="light">בהיר</option>
            <option value="dark">כהה</option>
          </select>
          <ChevronDown size={14} aria-hidden/>
        </span>
      </label>
      <label>
        <span>ערכת נושא</span>
        <span className="appearance-select">
          <select value={palette} disabled={!onPaletteChange} aria-describedby={scopeLabelId}
            onChange={event => onPaletteChange?.(event.target.value === 'porcelain-ink' ? 'porcelain-ink' : 'default')}>
            <option value="default">ברירת המחדל</option>
            <option value="porcelain-ink" dir="ltr">Porcelain &amp; Ink</option>
          </select>
          <ChevronDown size={14} aria-hidden/>
        </span>
      </label>
      <p id={scopeLabelId} className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {paletteSpaceName ? <>חל על <bdi>{paletteSpaceName}</bdi> במכשיר זה.</> : 'אפשר לבחור ערכת נושא כשהמרחב זמין.'}
      </p>
    </div>
  </section>
}
