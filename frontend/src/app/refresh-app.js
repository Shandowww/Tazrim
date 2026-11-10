/** Reload the running interface, like the original Budgit refresh, after a
 * network check. Never replace the usable page with an offline/login response.
 * The caller uses the existing draft guard before starting this operation. */
export function createAppRefresh({location,fetch,guard,onState,timeoutMs=15000}){
 let pending=false,leaving=false
 return async()=>{
  if(pending||leaving)return
  pending=true;onState({pending:true,error:null})
  const href=location.href,controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),timeoutMs)
  try{
   const response=await fetch(href,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal})
   if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Unavailable interface')
   const html=await response.text()
   if(!/<div\b[^>]*\bid=["']root["']/.test(html)||!/<script\b[^>]*\btype=["']module["']/.test(html))throw Error('Invalid interface')
   if(location.href!==href){onState({pending:false,error:null});return}
   // A draft/save may have started while checking the connection. Ask the
   // same guard again; do not lose those edits or implicitly save anything.
   guard(()=>{if(location.href===href){leaving=true;onState({pending:true,error:null});location.reload()}})
  }catch{
   leaving=false;onState({pending:false,error:'לא ניתן לרענן את האפליקציה כרגע. יש לבדוק את החיבור ולנסות שוב.'})
   return
  }finally{
   clearTimeout(timeout);pending=false
  }
  if(!leaving)onState({pending:false,error:null})
 }
}
