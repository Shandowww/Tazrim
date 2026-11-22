import {useId,useLayoutEffect,useRef,useState} from 'react'
import {Check,ChevronDown,Search,X} from 'lucide-react'
import {categoryParent,categoryRegistryEntry,expenseCategoryOptions} from '../../../src/budget.js'
import {householdCategory} from './household-categories'
import {categoryMissing} from './report-classification-model'
import './report-category-picker.css'

type CategoryOption={value:string;label:string;search:string;hint?:string}
type CategoryGroup={parent:string;color:string;options:CategoryOption[]}

const homeBills='דיור / חשבונות הבית'
const internetTerms='אינטרנט ביתי סיבים ספק תקשורת internet broadband fiber fibre ISP wifi wi-fi'
const searchText=(text:string)=>text.normalize('NFKC').replace(/\p{M}/gu,'').toLowerCase()

export function reportCategoryGroups(plan:any,additional:string[]=[]){
 const groups=new Map<string,CategoryGroup>()
 const seen=new Set<string>()
 for(const category of [...expenseCategoryOptions(plan),...additional]){
  if(categoryMissing(category))continue
  const entry=categoryRegistryEntry(plan,category)
  const value=entry?.label??category
  if(entry?.archivedAt||seen.has(value))continue
  seen.add(value)
  const parent=categoryParent(value)
  let group=groups.get(parent)
  if(!group){
   group={parent,color:householdCategory(parent,plan).color,options:[]}
   groups.set(parent,group)
  }
  const includesInternet=value===homeBills||entry?.aliases.includes(homeBills)
  group.options.push({
   value,
   label:value===parent?'כללי':value.slice(parent.length+3),
   search:searchText([value,...(entry?.aliases??[]),includesInternet?internetTerms:''].join(' ')),
   hint:includesInternet?'כולל אינטרנט ביתי':undefined
  })
 }
 return [...groups.values()]
}

export function ReportCategoryPicker({groups,value,disabled,onChange,emptyLabel='ללא קטגוריה'}:{
 groups:CategoryGroup[];value:string;disabled:boolean;onChange:(value:string)=>void;emptyLabel?:string
}){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null)
 const trigger=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null)
 const focusSearch=useRef(true)
 const results=useRef<HTMLDivElement>(null)
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[expandedParent,setExpandedParent]=useState('')
 useLayoutEffect(()=>{
  const node=dialog.current
  if(!open||!node?.isConnected)return
  if(disabled){node.close();setOpen(false);return}
  if(!node.open)node.showModal()
  if(focusSearch.current)search.current?.focus()
  else closeButton.current?.focus()
 },[open,disabled])
 const words=searchText(query).trim().split(/\s+/).filter(Boolean)
 const filtered=groups.map(group=>({...group,options:group.options.filter(option=>words.every(word=>option.search.includes(word)))})).filter(group=>group.options.length)
 const showEmpty=words.every(word=>searchText(emptyLabel).includes(word))
 const count=filtered.reduce((total,group)=>total+group.options.length,Number(showEmpty))
 const close=()=>{
  dialog.current?.close()
  setOpen(false)
  trigger.current?.focus()
 }
 const choose=(next:string)=>{
  close()
  if(!disabled&&next!==value)onChange(next)
 }
 const choice=(option:CategoryOption,parent?:string)=><button type="button" key={option.value} className="report-category-picker-option" aria-label={option.value===parent?parent+' · '+option.label:undefined} aria-pressed={option.value===value} disabled={disabled} onClick={()=>choose(option.value)}>
  <span><bdi>{option.label}</bdi>{option.hint&&<small>{option.hint}</small>}</span>
  {option.value===value&&<Check size={17} aria-hidden="true"/>}
 </button>
 return <div className="report-category-picker">
  <span id={id+'-label'} className="text-sm">קטגוריה לבית העסק</span>
  <button type="button" className="report-category-picker-trigger" ref={trigger} aria-labelledby={id+'-label '+id+'-value'} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={event=>{
   focusSearch.current=!(event.nativeEvent instanceof PointerEvent&&event.nativeEvent.pointerType==='touch')
   setQuery('')
   setExpandedParent(value?categoryParent(value):'')
   setOpen(true)
  }}><bdi id={id+'-value'}>{value||emptyLabel}</bdi><ChevronDown size={17} aria-hidden="true"/></button>
  <dialog ref={dialog} className="report-category-picker-dialog" aria-labelledby={id+'-title'} dir="rtl" onCancel={event=>{
   event.preventDefault()
   close()
  }} onKeyDown={event=>{
   if(event.key==='Escape'&&!event.nativeEvent.isComposing){
    event.preventDefault()
    close()
   }
  }}>
   {open&&<>
    <div className="report-category-picker-header">
     <div className="report-category-picker-title">
      <h3 id={id+'-title'}>בחירת קטגוריה</h3>
      <button type="button" ref={closeButton} aria-label="סגירת בחירת קטגוריה" onClick={close}><X size={19} aria-hidden="true"/></button>
     </div>
     <label className="report-category-picker-search">
      <Search size={18} aria-hidden="true"/>
      <input type="search" ref={search} aria-label="חיפוש קטגוריה" placeholder="חיפוש קטגוריה" value={query} onChange={event=>{
       setQuery(event.target.value)
       if(results.current)results.current.scrollTop=0
      }} onKeyDown={event=>{
       if(event.nativeEvent.isComposing)return
       const first=results.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
       const result=results.current?.querySelector<HTMLButtonElement>('.report-category-picker-option:not(:disabled)')
       if(event.key==='ArrowDown'&&(result||first)){event.preventDefault();(words.length?result||first:first)?.focus()}
       if(event.key==='Enter'&&count===1&&result){event.preventDefault();result.click()}
      }}/>
     </label>
     {words.length>0&&<p role="status" className="sr-only">{count?'תוצאות חיפוש: '+count:'לא נמצאו קטגוריות'}</p>}
    </div>
    <div ref={results} className="report-category-picker-results">
     {showEmpty&&choice({value:'',label:emptyLabel,search:''})}
     {filtered.map((group,index)=>{
      const expanded=words.length>0||expandedParent===group.parent
      const optionsId=id+'-group-'+index
      const title=<><span className="report-category-picker-dot" aria-hidden="true" style={{backgroundColor:group.color}}/><bdi>{group.parent}</bdi></>
      return <section key={group.parent} className="report-category-picker-group">
       <h4>{words.length>0?title:<button type="button" aria-expanded={expanded} aria-controls={optionsId} onClick={()=>setExpandedParent(expanded?'':group.parent)}>
        {title}<ChevronDown size={16} aria-hidden="true"/>
       </button>}</h4>
       <div id={optionsId} hidden={!expanded}>{expanded&&group.options.map(option=>choice(option,group.parent))}</div>
      </section>
     })}
     {!count&&<p className="report-category-picker-empty">לא נמצאו קטגוריות. אפשר לנסות שם אחר.</p>}
    </div>
   </>}
  </dialog>
 </div>
}
