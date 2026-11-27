import {modeAllows} from './interface-mode-model.js'

export const navigationLabels={
 overview:'תמונה כללית',accounts:'חשבונות',sync:'סנכרון דוחות',sources:'מקורות והעלאה',analysis:'השוואות וניתוח מקורות',
 spending:'הוצאות',planning:'תכנון',savings:'חיסכון',settings:'הגדרות',
}

// Navigation only: each destination remains its existing guarded workflow.
export const navigationSections=[
 {key:'overview',label:navigationLabels.overview,description:'המצב החודשי במבט אחד',items:[['/',navigationLabels.overview]]},
 {key:'accounts',label:navigationLabels.accounts,description:'בנקים, כרטיסים והעברות',items:[['/accounts','בנקים וכרטיסים'],['/accounts/transfers','העברות בין חשבונות']]},
 {key:'reports',label:navigationLabels.sync,description:'תיבת כניסה, מקורות והיסטוריה',items:[['/incoming',navigationLabels.sync]]},
 {key:'spending',label:navigationLabels.spending,description:'קטגוריות, השוואות וחיובים קבועים',items:[['/categories','קטגוריות ופירוט'],['/analysis',navigationLabels.analysis],['/recurring','חיובים קבועים']]},
 {key:'planning',label:navigationLabels.planning,description:'רכישות, הכנסות, הלוואות וצ׳קים',items:[['/plans','רכישות ותשלומים'],['/income','הכנסות'],['/loans','הלוואות'],['/checks','צ׳קים']]},
 {key:'savings',label:navigationLabels.savings,description:'מטרות והפקדות',items:[['/savings','מטרות ויתרות'],['/savings/transfers','הפקדות']]},
 {key:'settings',label:navigationLabels.settings,description:'מראה, פרטיות, גיבוי ושיתוף',items:[['/settings',navigationLabels.settings]]},
 {key:'help',label:'עזרה',description:'הסברים על העבודה עם האפליקציה',items:[['/about','עזרה']]},
]
// Removed submenu entries remain available beside the records or settings they affect.
export const contextualNavigation=[
 {paths:['/accounts'],label:'הגדרות חשבונות',links:[['/accounts/assignments','השלמת שיוך חשבון משלם']]},
 {paths:['/upload','/upload/history','/monthly','/notices','/settings/report-expectations','/settings/purchase-notes'],label:'הגדרות ומידע על דוחות',links:[['/incoming?sync=settings','חיבורים ומועדי דוחות'],['/settings/purchase-notes','פתקי קנייה'],['/notices','הודעות מהדוחות'],['/monthly','הזנה ידנית לחודש הנבחר']]},
 {paths:['/plans','/income','/plans/scenario'],label:'הגדרות התכנון',links:[['/settings/forecast','הערכות בסיס לתחזית'],['/goals','יעדים חודשיים']]},
]
export function visibleNavigation(mode){return navigationSections.map(section=>({...section,items:section.items.filter(([path])=>modeAllows(mode,path)),tools:/** @type {string[][]} */ ([]) })).filter(section=>section.items.length)}
export function navigationSection(pathname){
 if(pathname==='/'||pathname==='/overview'||pathname==='/outlook')return 'overview'
 if(/^\/(accounts|banks|cards|card-setup|overview)(\/|$)/.test(pathname))return 'accounts'
 if(pathname==='/settings/forecast'||pathname==='/goals')return 'planning'
 if(pathname==='/settings/report-expectations'||/^\/(incoming|upload|monthly|notices|actions)(\/|$)/.test(pathname))return 'reports'
 if(/^\/(categories|search|details|analysis|recurring)(\/|$)/.test(pathname))return 'spending'
 if(/^\/(plans|income|loans|checks)(\/|$)/.test(pathname))return 'planning'
 if(/^\/(savings|investment)(\/|$)/.test(pathname))return 'savings'
 if(/^\/(settings|start|goals)(\/|$)/.test(pathname))return 'settings'
 if(pathname==='/about')return 'help'
 return null
}
export function currentNavigationItem(pathname,section){const aliases={'/upload':'/incoming','/upload/history':'/incoming','/outlook':'/','/search':'/categories','/categories/manage':'/categories','/categories/limits':'/categories','/details/manage':'/categories','/plans/scenario':'/plans','/savings/schedule':'/savings/transfers','/savings/accounts':'/savings','/savings/allocation':'/savings'};pathname=aliases[pathname]??pathname;return [...section.items,...(section.tools??[])].filter(([path])=>path==='/'?pathname==='/':pathname===path||pathname.startsWith(path+'/')).sort(([a],[b])=>b.length-a.length)[0]?.[0]??null}
