import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
// Pinned Tazrim confirmation surface/buttons, adapted to a native top-layer dialog
// so unsaved work is protected even when another native modal is open.
const BUTTON = 'inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-[background-color,transform] duration-quick ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50'
export function ConfirmDialog({open,onOpenChange,onConfirm,title,description,confirmLabel='שמירה והמשך',cancelLabel='להישאר',busy=false,confirmDisabled=false,error,children}:{open:boolean;onOpenChange:(open:boolean)=>void;onConfirm:()=>void;title:ReactNode;description:ReactNode;confirmLabel?:string;cancelLabel?:string;busy?:boolean;confirmDisabled?:boolean;error?:string|null;children?:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null),cancelRef=useRef<HTMLButtonElement>(null),id=useId()
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open){dialog.showModal();cancelRef.current?.focus()}else if(!open&&dialog.open)dialog.close()},[open])
 useEffect(()=>()=>{ref.current?.close()},[])
 return <dialog ref={ref} dir="rtl" aria-labelledby={id+'-title'} aria-describedby={id+'-description'} className="draft-guard-layer fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-0 text-card-foreground" onCancel={event=>{event.preventDefault();onOpenChange(false)}}>
  <div className="confirm-dialog fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-sm rounded-3xl surface-overlay p-5 focus:outline-none sm:inset-x-4 sm:top-0 sm:bottom-0 sm:my-auto sm:h-fit">
   <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(!busy&&!confirmDisabled)onConfirm()}}>
    <div className="space-y-1.5"><h2 id={id+'-title'} className="text-base font-semibold">{title}</h2><div id={id+'-description'} className="space-y-2 text-sm leading-relaxed text-muted-foreground">{description}</div></div>
    {children}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid grid-cols-2 gap-2"><button type="button" ref={cancelRef} className={cn(BUTTON,'bg-muted text-foreground hover:bg-muted/70')} onClick={()=>onOpenChange(false)}>{cancelLabel}</button><button type="submit" className={cn(BUTTON,'bg-primary text-primary-foreground hover:bg-primary/90')} disabled={busy||confirmDisabled}>{busy?'שומרים…':confirmLabel}</button></div>
   </form>
  </div>
 </dialog>
}
