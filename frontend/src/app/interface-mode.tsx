import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {useLocation} from 'react-router-dom'
import {useDraftGuard} from './draft-guard'
import {initialInterfaceMode,interfaceModes,modeAllows,modeDescriptions,modeLabels,modeStorageKey,routeInterfaceMode} from './interface-mode-model'
export type InterfaceMode='basic'|'advanced'|'expert'
const Context=createContext<{mode:InterfaceMode;change:(mode:InterfaceMode)=>void;storageError:boolean}>({mode:'expert',change:()=>{},storageError:false})
export const useInterfaceMode=()=>useContext(Context)
export function InterfaceModeProvider({accountId,hasPlan,children}:{accountId:string;hasPlan:boolean;children:ReactNode}){
 const guard=useDraftGuard(),key=modeStorageKey(accountId)
 const [mode,setMode]=useState<InterfaceMode>(()=>{let saved;try{saved=localStorage.getItem(key)}catch{}return initialInterfaceMode(saved,hasPlan)})
 const [storageError,setStorageError]=useState(false)
 useEffect(()=>{try{localStorage.setItem(key,mode);setStorageError(false)}catch{setStorageError(true)}},[key,mode])
 useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===key&&interfaceModes.includes(event.newValue??'')&&event.newValue!==mode)guard.run(()=>setMode(event.newValue as InterfaceMode))};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[key,mode,guard])
 const change=(next:InterfaceMode)=>{if(interfaceModes.includes(next)&&next!==mode)guard.run(()=>setMode(next))}
 return <Context.Provider value={{mode,change,storageError}}>{children}</Context.Provider>
}
export function InterfaceModeSelector({compact=false}:{compact?:boolean}){
 const {mode,change,storageError}=useInterfaceMode()
 return <div className={compact?'household-mode-compact':'surface space-y-2 rounded-xl p-4'}><label className="flex min-h-11 items-center gap-2"><span className={compact?'sr-only':'font-semibold'}>מצב תצוגה</span><select aria-label="מצב תצוגה" className="min-h-11 max-w-full rounded-xl border bg-card px-2 text-sm" value={mode} onChange={event=>change(event.target.value as InterfaceMode)}>{interfaceModes.map(value=><option value={value} key={value}>{modeLabels[value as InterfaceMode]}</option>)}</select></label>{!compact&&<><p className="text-sm text-muted-foreground">{modeDescriptions[mode]}. הבחירה נשמרת לחשבון הזה במכשיר ומשמשת בכל המרחבים.</p><p className="text-sm text-muted-foreground">החלפת מצב משנה את האפשרויות המוצגות. הנתונים וההרשאות נשארים כפי שהם.</p>{storageError&&<p role="status" className="text-sm">הבחירה פועלת כעת, אך הדפדפן אינו מאפשר לזכור אותה לפתיחה הבאה.</p>}</>}</div>
}
export function InterfaceModeBoundary({children}:{children:ReactNode}){
 const {pathname}=useLocation(),{mode,change}=useInterfaceMode(),required=routeInterfaceMode(pathname) as InterfaceMode
 if(modeAllows(mode,pathname))return <div key={mode} className="contents">{children}</div>
 return <section className="household-page"><h1>אפשרויות במצב {modeLabels[required]}</h1><div className="surface space-y-4 rounded-xl p-4"><p>הכלי הזה זמין במצב {modeLabels[required]}. אפשר לעבור ולהמשיך באותו מסך ובאותו מרחב.</p><button type="button" className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground" onClick={()=>change(required)}>מעבר למצב {modeLabels[required]}</button></div></section>
}
