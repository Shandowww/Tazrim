/** Keep the selected budget space and display period across internal routes. */
export function withViewQuery(href, search, development = false) {
  const current = new URLSearchParams(search)
  const [path, query = ''] = href.split('?')
  const next = new URLSearchParams(query)
  for (const key of ['year', 'month', 'budget']) {
    if (!next.has(key) && current.has(key)) next.set(key, current.get(key) || '')
  }
  if (development && !next.has('demo') && current.get('demo') === '1') next.set('demo', '1')
  return `${path}${next.size ? `?${next}` : ''}`
}

/** Existing editor bridge keeps the explicitly selected space, never a prior device selection. */
export function legacyBudgetHref(search) {
  const budget = new URLSearchParams(search).get('budget') || 'personal'
  return '/?' + new URLSearchParams({ budget })
}
