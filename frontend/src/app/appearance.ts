import { createContext, useContext, useMemo, useState } from 'react'

export const AppearanceContext = createContext(false)
export const useDarkAppearance = () => useContext(AppearanceContext)

export type Palette = 'default' | 'porcelain-ink'

const PALETTE_KEY = 'budgit-react-palette'

function readPalette(key: string): Palette {
  try {
    const saved = localStorage.getItem(key) ?? localStorage.getItem(PALETTE_KEY)
    return saved === 'porcelain-ink' ? 'porcelain-ink' : 'default'
  } catch {
    return 'default'
  }
}

export function useBudgetPalette(scope: string | null) {
  const key = scope === null ? null : `${PALETTE_KEY}:${scope}`
  const stored = useMemo(() => key === null ? 'default' : readPalette(key), [key])
  const [selections, setSelections] = useState<ReadonlyMap<string, Palette>>(() => new Map())
  const palette = key === null ? 'default' : selections.get(key) ?? stored

  function choosePalette(value: Palette) {
    if (key === null) return
    setSelections(previous => new Map(previous).set(key, value))
    try { localStorage.setItem(key, value) } catch { /* Keep the in-memory selection. */ }
  }

  return { palette, choosePalette }
}
