export const interfaceModes=['basic','advanced','expert']
export const modeLabels={basic:'בסיסי',advanced:'מתקדם',expert:'מומחה'}
export const modeDescriptions={basic:'דוחות, יתרות ותמונה ברורה של המצב',advanced:'גם תכנון ועדכון ידני של הנתונים',expert:'כל הכלים והאפשרויות'}
export function modeStorageKey(accountId){return 'budgit-interface-mode:'+encodeURIComponent(accountId)}
export function initialInterfaceMode(saved,hasPlan){return interfaceModes.includes(saved)?saved:hasPlan?'expert':'basic'}
export function routeInterfaceMode(href){
 const path=String(href).split(/[?#]/)[0].replace(/\/$/,'')||'/'
 if(['/','/accounts','/banks','/cards','/checks','/loans','/savings','/categories','/more','/plans/scenario','/actions','/notices','/settings','/about','/start','/accounts/new','/card-setup/new','/settings/security','/settings/profile','/settings/spaces','/settings/gmail','/settings/drive','/settings/device-draft'].includes(path))return 'basic'
 if(/^\/(banks|cards)\/[^/]+$/.test(path)||/^\/notices\//.test(path)||/^\/settings\/gmail\/notices\//.test(path))return 'basic'
 if(path==='/upload'||/^\/upload\/(?!history(?:\/|$))[^/]+(?:\/(?:bank|card|group|review))?$/.test(path)||/^\/details\/(?!new$|manage$)[^/]+$/.test(path))return 'basic'
 if(path==='/upload/history'||/^\/upload\/.+\/(?:delete|state)$/.test(path))return 'expert'
 if(path==='/categories/manage')return 'advanced'
 if(['/monthly','/income','/plans','/recurring','/card-setup','/categories/limits','/settings/report-expectations','/settings/forecast','/accounts/transfers','/savings/transfers','/savings/transfer','/savings/accounts','/savings/schedule','/savings/new','/details/manage','/details/new','/loans/new','/goals'].includes(path))return 'advanced'
 if(/^\/accounts\/[^/]+\/(?:edit|monthly(?:\/correction)?)$/.test(path)||/^\/accounts\/transfers\//.test(path)||/^\/card-setup\/[^/]+$/.test(path)||/^\/cards\/[^/]+\/(?:billing(?:\/[^/]+)?|no-activity|stop)$/.test(path))return 'advanced'
 if(/^\/(?:loans\/[^/]+\/(?:edit|remove)|details\/[^/]+\/(?:edit|delete|clear)|plans\/[^/]+(?:\/(?:edit|remove))?|savings\/[^/]+\/(?:edit|deposit|remove)|savings\/transfers\/.*)$/.test(path))return 'advanced'
 return 'expert'
}
export function modeAllows(mode,href){return interfaceModes.indexOf(mode)>=interfaceModes.indexOf(routeInterfaceMode(href))}
