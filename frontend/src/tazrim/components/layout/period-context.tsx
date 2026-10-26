import { useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { withViewQuery } from '../../../app/navigation-query'

/** Carries the currently selected period when following Tazrim navigation links. */
export function usePeriodHref() {
  const { search } = useLocation()
  return useCallback((href: string) => withViewQuery(href, search, import.meta.env.DEV), [search])
}
