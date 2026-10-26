import { createContext, useContext } from 'react'

export const AppearanceContext = createContext(false)
export const useDarkAppearance = () => useContext(AppearanceContext)
