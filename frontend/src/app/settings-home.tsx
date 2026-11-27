import {useLocation} from 'react-router-dom'
import {BookOpen, ChevronLeft, CircleHelp, FileSpreadsheet, History, LockKeyhole, UserRound, Users} from 'lucide-react'
import {PageHeading} from './page-heading'
import {AppearanceSettings, type AppearanceSettingsProps} from './appearance-settings'
import {InterfaceModeSelector} from './interface-mode'
import {withViewQuery} from './navigation-query'
import Link from './link'

const tiles=[
 {href:'/more',title:'כל הכלים',summary:'תכנון, דוחות, ניהול ופרטיות',icon:BookOpen},
 {href:'/settings/profile',title:'הפרופיל שלי',summary:'שם לתצוגה וחשבון מחובר',icon:UserRound},
 {href:'/settings/spaces',title:'מרחבים ושיתוף',summary:'גישה לתקציב האישי והמשותף',icon:Users},
 {href:'/settings/security',title:'פרטיות והצפנה',summary:'נעילה, שחזור וייבוא גיבוי',icon:LockKeyhole},
 {href:'/settings/history',title:'גיבויים ויומן',summary:'יצוא ושחזור שינויים',icon:History},
 {href:'/settings/purchase-notes',title:'פתקי קנייה',summary:'תיעוד דרך Instinct ו־Google Sheets',icon:FileSpreadsheet},
 {href:'/about',title:'עזרה',summary:'הסברים על דוחות, תכנון וחיסכון',icon:CircleHelp},
]

export function SettingsHome({appearance,email}:{appearance:AppearanceSettingsProps;email?:string}){
 const {search}=useLocation()
 return <div className="household-page household-settings">
  <PageHeading>הגדרות</PageHeading>
  {email&&<p className="text-sm text-muted-foreground">מחובר כ־<bdi dir="ltr">{email}</bdi></p>}
  <AppearanceSettings {...appearance}/>
  <nav className="household-settings-grid" aria-label="מסכי הגדרות וכלים">{tiles.map(({href,title,summary,icon:Icon})=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} className="surface household-settings-tile"><span className="household-settings-icon"><Icon size={21} aria-hidden/></span><span className="household-settings-tile-copy"><strong>{title}</strong><small>{summary}</small></span><ChevronLeft size={18} aria-hidden/></Link>)}</nav>
  <InterfaceModeSelector/>
 </div>
}

