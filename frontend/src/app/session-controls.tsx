import type {FormEvent} from 'react'
import {useDraftGuard} from './draft-guard'
import {forgetNativeVault} from './vault-session'
/** Uses the original standalone POST destination after the shared draft guard. */
export function SessionControls({email}:{email?:string}){
 const guard=useDraftGuard()
 const logout=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget;guard.run(()=>{forgetNativeVault();form.submit()})}
 return <section className="surface space-y-3 rounded-xl p-4" aria-label="החשבון המחובר">{email&&<p className="break-words">מחובר כ־<bdi dir="ltr">{email}</bdi></p>}<form method="post" action="/auth/logout" onSubmit={logout}><button className="min-h-11 rounded-xl border px-4 py-2" type="submit">יציאה מהחשבון</button></form></section>
}
