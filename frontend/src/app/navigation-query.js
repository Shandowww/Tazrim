import {legacyInterfaceHref} from '../../../src/interface-destination.js'
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
export function legacyBudgetHref(search,view='home',reportId='') {
  return legacyInterfaceHref(search,view,/^[a-f0-9-]{36}$/.test(reportId)?reportId:'')
}

/** Detail links carry only presentation filters; identity always stays in the URL. */
export function detailResultHref(id, search, from = 'categories') {
  const current = new URLSearchParams(search), next = new URLSearchParams()
  for (const key of ['budget', 'year', 'month', 'category', 'query', 'account', 'card', 'page']) if (current.has(key)) next.set(key, current.get(key))
  if (current.get('demo') === '1') next.set('demo', '1')
  next.set('from', from === 'search' ? 'search' : 'categories')
  return '/details/' + encodeURIComponent(id) + '?' + next
}
