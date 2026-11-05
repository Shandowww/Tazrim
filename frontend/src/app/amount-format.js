/** Group money input for display while leaving the original amount parser in charge of validation. */
export function groupAmountText(value){
 const raw=String(value).replaceAll(',','')
 if(!/^-?\d*(?:\.\d*)?$/.test(raw))return String(value)
 const [whole,fraction]=raw.split('.')
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction)
}

export function groupedCaret(before,after,position){
 const count=before.slice(0,position).replaceAll(',','').length
 if(position===0)return 0
 let seen=0
 for(let i=0;i<after.length;i++){
  if(after[i]!==',')seen++
  if(seen===count)return i+1
 }
 return after.length
}

/** Keep the cursor beside the same digit when a comma appears during typing. */
export function groupedAmountChange(event,update){
 const input=event.currentTarget,before=input.value,after=groupAmountText(before)
 const start=input.selectionStart,end=input.selectionEnd
 update(after)
 if(document.activeElement===input&&start!==null&&end!==null)requestAnimationFrame(()=>{
  if(input.isConnected&&document.activeElement===input)input.setSelectionRange(groupedCaret(before,after,start),groupedCaret(before,after,end))
 })
}
