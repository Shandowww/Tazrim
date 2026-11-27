// Display grouping stays at the input boundary; models receive plain numbers.
function ungroupAmount(value){return String(value).replaceAll(',','');}
function readNumber(value){return Number(typeof value==='string'?ungroupAmount(value):value);}
function budgetFormData(form){const data=new FormData(form);for(const input of form.querySelectorAll('input[data-amount-input][name]'))data.set(input.name,ungroupAmount(input.value));return data;}
function groupAmount(value){const raw=ungroupAmount(value);if(!/^-?\d*(?:\.\d*)?$/.test(raw))return raw;const [whole,fraction]=raw.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction);}
function amountValidity(input){const raw=ungroupAmount(input.value),n=Number(raw);let error='';if(raw!==''&&(!/^-?\d+(?:\.\d{0,2})?$/.test(raw)||!Number.isFinite(n)))error='יש להזין סכום תקין, עם עד שתי ספרות אחרי הנקודה.';else if(raw!==''&&(input.min!==''&&n<Number(input.min)||input.max!==''&&n>Number(input.max)))error='הסכום מחוץ לטווח המותר.';input.setCustomValidity(error);return !error;}
function displayAmount(input){const old=input.value,next=groupAmount(old),start=input.selectionStart,end=input.selectionEnd;const offset=pos=>{const count=ungroupAmount(old.slice(0,pos)).length;let seen=0;for(let i=0;i<next.length;i++){if(next[i]!==',')seen++;if(seen===count)return i+1;}return next.length;};input.value=next;if(document.activeElement===input&&start!==null)input.setSelectionRange(start===0?0:offset(start),end===0?0:offset(end));amountValidity(input);}
function prepareAmountInputs(){if(!document.querySelectorAll)return;for(const input of document.querySelectorAll('input[type="number"][step="0.01"],input[data-amount-input]')){if(!input.dataset.amountInput){input.dataset.amountInput='true';input.type='text';input.inputMode='decimal';input.dir='ltr';}if(/^[-\d,.]+$/.test(input.placeholder))input.placeholder=groupAmount(input.placeholder);displayAmount(input);}}
for(const eventName of ['input','change'])document.addEventListener(eventName,event=>{
 const target=event.target;if(!target?.dataset?.amountInput)return;
 displayAmount(target);
 if(eventName==='input')target.dataset.amountEdited='true';
 else delete target.dataset.amountEdited;
 if(eventName==='change'&&!target.checkValidity()){event.stopImmediatePropagation();target.reportValidity();}
},true);
// Updating .value for grouping can suppress the browser's native change-on-blur.
// Commit through the same existing change handlers when that happens.
document.addEventListener('focusout',event=>{const input=event.target;if(input?.dataset?.amountEdited&&input.isConnected){delete input.dataset.amountEdited;input.dispatchEvent(new Event('change',{bubbles:true}));}},true);
