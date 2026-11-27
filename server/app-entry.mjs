const screens = new Map([
  ['home', '/next'],
  ['reports', '/next/upload'],
  ['report-history', '/next/upload/history'],
  ['savings', '/next/savings'],
  ['accounts', '/next/accounts'],
  ['security', '/next/settings/security'],
  ['connections', '/next/settings'],
  ['backups', '/next/settings/history'],
  ['spaces', '/next/settings/spaces'],
  ['details', '/next/details/manage'],
  ['monthly', '/next/monthly'],
  ['plans', '/next/plans'],
  ['overview', '/next/overview'],
  ['actions', '/next/actions'],
  ['migration', '/next/overview/migration'],
  ['gmail', '/next/settings/gmail'],
  ['appearance', '/next/settings'],
  ['wallet', '/next/settings/wallet'],
  ['analysis', '/next/analysis'],
  ['admin', '/next/settings/access'],
]);

// Old bookmarks carry display context only. The destination applies Tazrim's normal access checks.
export function appEntryDestination(query) {
  const view = query.get('mf-view');
  let path = screens.get(view) ?? '/next';
  const next = new URLSearchParams();
  const budget = query.get('budget'), year = query.get('year'), month = query.get('month');
  if (budget && /^[\w:-]{1,100}$/.test(budget)) next.set('budget', budget);
  if (/^20\d{2}$/.test(year ?? '')) {
    next.set('year', year);
    if (/^(?:0?[1-9]|1[0-2])$/.test(month ?? '')) next.set('month', String(Number(month)));
  }
  const report = query.get('mf-report');
  if (view === 'reports' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(report ?? '')) {
    path += '/' + report + '/review';
  }
  if (!view) {
    // Links from earlier notification workers or OAuth callbacks can already be in flight.
    if (query.get('card-update') === '1') path = '/next/accounts';
    for (const [key, route] of [['gmail', '/next/settings/gmail'], ['driveBackup', '/next/settings/drive']]) {
      const status = query.get(key);
      if (!['connected', 'failed'].includes(status)) continue;
      path = route;
      next.set(key, status);
      break;
    }
  }
  return path + (next.size ? '?' + next : '');
}
