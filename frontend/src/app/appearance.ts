import { createContext, useContext } from 'react'

export const AppearanceContext = createContext(false)
export const useDarkAppearance = () => useContext(AppearanceContext)

export type Palette = 'default' | 'porcelain-ink'

const PALETTE_KEY = 'budgit-react-palette'

export function readPalette(): Palette {
  try {
    return localStorage.getItem(PALETTE_KEY) === 'porcelain-ink' ? 'porcelain-ink' : 'default'
  } catch {
    return 'default'
  }
}

export function savePalette(palette: Palette) {
  try { localStorage.setItem(PALETTE_KEY, palette) } catch { /* Keep the in-memory selection. */ }
}
