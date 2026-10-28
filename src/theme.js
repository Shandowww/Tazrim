// Apply appearance before first paint; this is a device preference, not budget data.
(() => {
 const key='monthly-flow-theme',accentKey='monthly-flow-accent',designKey='monthly-flow-design',designs=['original','tazrim'],choices=['system','light','dark'],accents=['design','lavender','blue','mint','peach','rose'];
 let choice='system',accent='design',design='original';
 try { const saved=localStorage.getItem(key);if(choices.includes(saved))choice=saved;const color=localStorage.getItem(accentKey);if(accents.includes(color))accent=color;const style=localStorage.getItem(designKey);if(designs.includes(style))design=style; } catch {}
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 function apply(){
  const effective=choice==='system'?(media.matches?'dark':'light'):choice;
  document.documentElement.dataset.theme=effective;
  document.documentElement.dataset.accent=accent;
  document.documentElement.dataset.design=design;
  document.documentElement.style.colorScheme=effective;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',design==='tazrim'?(effective==='dark'?'#101522':'#f3f6fa'):(effective==='dark'?'#191c26':'#f8f5f0'));
  const styleControl=document.querySelector('[name="appearance-design"]');if(styleControl)styleControl.value=design;
  const control=document.querySelector('[name="appearance-theme"]');if(control)control.value=choice;
  for(const control of document.querySelectorAll('[name="appearance-accent"]'))control.checked=control.value===accent;
 }
 window.monthlyFlowTheme={get design(){return design;},setDesign(next){
  if(!designs.includes(next))return false;design=next;apply();
  try{localStorage.setItem(designKey,design);return true;}catch{return false;}
 },get choice(){return choice;},get accent(){return accent;},setAccent(next){
  if(!accents.includes(next))return false;accent=next;apply();
  try{localStorage.setItem(accentKey,accent);return true;}catch{return false;}
 },setChoice(next){
  if(!choices.includes(next))return false;
  choice=next;apply();
  try{localStorage.setItem(key,choice);return true;}catch{return false;}
 }};
 media.addEventListener('change',()=>{if(choice==='system')apply();});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)choice=choices.includes(event.newValue)?event.newValue:'system';if(event.key===accentKey||event.key===null)accent=accents.includes(event.newValue)?event.newValue:'design';if(event.key===designKey||event.key===null)design=designs.includes(event.newValue)?event.newValue:'original';if(event.key===key||event.key===accentKey||event.key===designKey||event.key===null)apply();});
 apply();
})();
