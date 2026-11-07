// A bounded semantic check of the generated native graph. This is not an iOS
// execution claim: it covers branches, references and strict receipt values.
export function runIncomingWorkflow(workflow,{catalog,receipt,bytes=Buffer.from('synthetic')}={}){
 const outputs=new Map(),variables=new Map(),notifications=[],requests=[];let exited=false;
 const native=v=>v===true?'Yes':v===false?'No':v==null?'':Array.isArray(v)?v.map(native).join('\n'):typeof v==='object'?'Dictionary':String(v);
 const value=v=>{
  if(v?.WFSerializationType==='WFTextTokenAttachment')return value(v.Value);
  if(v?.WFSerializationType==='WFTextTokenString'){let text=v.Value.string;for(const [range,ref]of Object.entries(v.Value.attachmentsByRange??{}).sort(([a],[b])=>parseInt(b.slice(1))-parseInt(a.slice(1)))){const at=Number(range.match(/\d+/)[0]);text=text.slice(0,at)+native(value(ref))+text.slice(at+1);}return text;}
  if(v?.Type==='ActionOutput')return outputs.get(v.OutputUUID);
  if(v?.Type==='Variable')return v.Variable?value(v.Variable):variables.get(v.VariableName);
  return v;
 };
 const actions=workflow.WFWorkflowActions;
 function block(start,end){for(let i=start;i<end&&!exited;i++){
  const {WFWorkflowActionIdentifier:id,WFWorkflowActionParameters:p}=actions[i],name=id.replace('is.workflow.actions.','');let result;
  if(['conditional','repeat.each'].includes(name)&&p.WFControlFlowMode===0){let depth=1,otherwise=-1,close=i+1;for(;close<end;close++){const next=actions[close].WFWorkflowActionParameters;if(next.GroupingIdentifier===p.GroupingIdentifier){if(next.WFControlFlowMode===1)otherwise=close;if(next.WFControlFlowMode===2){depth--;if(!depth)break;}}}if(close>=end)throw Error('Unclosed native control block');
   if(name==='repeat.each'){for(const item of value(p.WFInput)??[]){variables.set('Repeat Item',item);block(i+1,close);}}
   else{const match=native(value(p.WFInput))===native(value(p.WFConditionalActionString));if(p.WFCondition!==4)throw Error('Unsupported test condition');if(match)block(i+1,otherwise<0?close:otherwise);else if(otherwise>=0)block(otherwise+1,close);}
   i=close;continue;
  }
  switch(name){
   case 'comment':break;
   case 'file':result='synthetic-folder';break;
   case 'file.getfoldercontents':result=[{name:'synthetic.csv',extension:'csv',bytes}];break;
   case 'gettext':result=native(value(p.WFTextActionText));break;
   case 'getvalueforkey':{let input=value(p.WFInput);if(typeof input==='string'){try{input=JSON.parse(input)}catch{input={}}}result=input?.[value(p.WFDictionaryKey)];break;}
   case 'getitemtype':{const input=value(p.WFInput);result=typeof input==='boolean'?'Boolean':typeof input==='string'?'Text':typeof input==='number'?'Number':input==null?'Nothing':'Dictionary';break;}
   case 'count':{const input=value(p.Input);result=p.WFCountType==='Characters'?native(input).length:Array.isArray(input)?input.length:input==null?0:1;break;}
   case 'list':result=[];break;
   case 'setvariable':variables.set(p.WFVariableName,value(p.WFInput));break;
   case 'appendvariable':variables.set(p.WFVariableName,[...(variables.get(p.WFVariableName)??[]),value(p.WFInput)]);break;
   case 'properties.files':result=p.WFContentItemPropertyName==='Name'?value(p.WFInput).name:value(p.WFInput).extension;break;
   case 'text.replace':result=native(value(p.WFInput)).replace(new RegExp(p.WFReplaceTextFind.replace('(?i)',''),p.WFReplaceTextCaseSensitive?'':'i'),p.WFReplaceTextReplace);break;
   case 'urlencode':result=encodeURIComponent(native(value(p.WFInput)));break;
   case 'hash':result='a'.repeat(64);break;
   case 'downloadurl':{const url=value(p.WFURL);requests.push({url,method:p.WFHTTPMethod});result=p.WFHTTPMethod==='GET'?catalog:receipt;break;}
   case 'notification':notifications.push(native(value(p.WFNotificationActionBody)));break;
   case 'exit':exited=true;break;
   default:throw Error('Unsupported generated action '+name);
  }
  outputs.set(p.UUID,result);
 }}
 block(0,actions.length);return{exited,notifications,requests,uploaded:variables.get('BudgitUploaded')??[],receipt:variables.get('BudgitReceipt')};
}
