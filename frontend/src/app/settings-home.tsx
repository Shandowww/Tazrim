import {useLocation} from 'react-router-dom'
import {BookOpen, ChevronLeft, CircleHelp, History, LockKeyhole, Palette, UserRound, Users} from 'lucide-react'
import {PageHeading} from './page-heading'
import {InterfaceModeSelector} from './interface-mode'
import {InterfaceLayoutSetting} from './interface-layout-setting'
import {withViewQuery} from './navigation-query'
import Link from './link'

const tiles=[
 {href:'/more',title:'כל הכלים',summary:'תכנון, דוחות, ניהול ופרטיות',icon:BookOpen},
 {href:'/settings/profile',title:'הפרופיל שלי',summary:'שם לתצוגה וחשבון מחובר',icon:UserRound},
 {href:'/settings/spaces',title:'מרחבים ושיתוף',summary:'גישה לתקציב האישי והמשותף',icon:Users},
 {href:'/settings/security',title:'פרטיות והצפנה',summary:'נעילה, שחזור וייבוא גיבוי',icon:LockKeyhole},
 {href:'/settings/history',title:'גיבויים ויומן',summary:'יצוא ושחזור שינויים',icon:History},
 {href:'/about',title:'עזרה',summary:'הסברים על דוחות, תכנון וחיסכון',icon:CircleHelp},
]

export function SettingsHome({theme,onThemeChange,email}:{theme:string;onThemeChange:(value:string)=>void;email?:string}){
 const {search}=useLocation()
 return <div className="household-page household-settings">
  <PageHeading>הגדרות</PageHeading>
  {email&&<p className="text-sm text-muted-foreground">מחובר כ־<bdi dir="ltr">{email}</bdi></p>}
  <section className="surface household-settings-appearance"><div className="household-settings-icon"><Palette size={21} aria-hidden/></div><label><span>מראה</span><select value={theme} onChange={event=>onThemeChange(event.target.value)}><option value="system">מערכת</option><option value="light">בהיר</option><option value="dark">כהה</option></select></label></section>
  <InterfaceModeSelector/>
  <InterfaceLayoutSetting/>
  <nav className="household-settings-grid" aria-label="מסכי הגדרות וכלים">{tiles.map(({href,title,summary,icon:Icon})=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} className="surface household-settings-tile"><span className="household-settings-icon"><Icon size={21} aria-hidden/></span><span className="household-settings-tile-copy"><strong>{title}</strong><small>{summary}</small></span><ChevronLeft size={18} aria-hidden/></Link>)}</nav>
 </div>
}

