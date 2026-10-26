// Apply appearance before first paint; this is a device preference, not budget data.
(() => {
 const key='monthly-flow-theme',accentKey='monthly-flow-accent',choices=['system','light','dark'],accents=['lavender','blue','mint','peach','rose'];
 let choice='system',accent='lavender';
 try { const saved=localStorage.getItem(key);if(choices.includes(saved))choice=saved;const color=localStorage.getItem(accentKey);if(accents.includes(color))accent=color; } catch {}
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 function apply(){
  const effective=choice==='system'?(media.matches?'dark':'light'):choice;
  document.documentElement.dataset.theme=effective;
  document.documentElement.dataset.accent=accent;
  document.documentElement.style.colorScheme=effective;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',effective==='dark'?'#191c26':'#f8f5f0');
  const control=document.querySelector('[name="appearance-theme"]');if(control)control.value=choice;
  for(const control of document.querySelectorAll('[name="appearance-accent"]'))control.checked=control.value===accent;
 }
 window.monthlyFlowTheme={get choice(){return choice;},get accent(){return accent;},setAccent(next){
  if(!accents.includes(next))return false;accent=next;apply();
  try{localStorage.setItem(accentKey,accent);return true;}catch{return false;}
 },setChoice(next){
  if(!choices.includes(next))return false;
  choice=next;apply();
  try{localStorage.setItem(key,choice);return true;}catch{return false;}
 }};
 media.addEventListener('change',()=>{if(choice==='system')apply();});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)choice=choices.includes(event.newValue)?event.newValue:'system';if(event.key===accentKey||event.key===null)accent=accents.includes(event.newValue)?event.newValue:'lavender';if(event.key===key||event.key===accentKey||event.key===null)apply();});
 apply();
})();
