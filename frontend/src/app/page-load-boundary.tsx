import {Component, useState, type ReactNode} from 'react'
import {RefreshCw} from 'lucide-react'
import {useDraftGuard} from './draft-guard'

type BoundaryProps = {children:ReactNode; fallback:ReactNode; resetKey:string}

class ScreenBoundary extends Component<BoundaryProps, {failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidUpdate(previous:BoundaryProps){if(this.state.failed&&previous.resetKey!==this.props.resetKey)this.setState({failed:false})}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}

export function PageLoadBoundary({children,resetKey}:{children:ReactNode;resetKey:string}){
 const guard=useDraftGuard(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const reload=async()=>{
  if(busy)return
  setBusy(true);setError('')
  try{
   const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(10000)})
   if(!response.ok||!(await response.json()).ok)throw Error('unavailable')
   guard.run(()=>window.location.reload())
  }catch{setError('לא הצלחנו להתחבר. בדקו את החיבור ונסו שוב. אפשר לעבור למסך אחר דרך התפריט.')}
  finally{setBusy(false)}
 }
 return <ScreenBoundary resetKey={resetKey} fallback={<section className="surface mx-auto max-w-xl space-y-4 rounded-2xl p-5" role="alert"><h1 className="text-xl font-semibold">לא ניתן לטעון את המסך</h1><p className="text-sm leading-relaxed text-muted-foreground">ייתכן שהאפליקציה עודכנה או שהחיבור נותק. טעינה מחדש תנסה לפתוח את המסך שוב. הנתונים השמורים אינם משתנים.</p><button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy} onClick={()=>void reload()}><RefreshCw size={18} aria-hidden="true"/>{busy?'בודקים חיבור…':'טעינה מחדש'}</button>{error&&<p role="status" className="text-sm">{error}</p>}</section>}>{children}</ScreenBoundary>
}
