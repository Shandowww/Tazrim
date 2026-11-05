import type {ComponentProps} from 'react'
import {ChevronRight} from 'lucide-react'
import Link from './link'

/** Shared visual treatment; Link retains the existing scope and draft guards. */
export default function BackLink({children='חזרה',iconOnly=false,className='',...props}:ComponentProps<typeof Link>&{iconOnly?:boolean}){
 const label=typeof children==='string'?children:'חזרה'
 return <Link {...props} className={`household-back${iconOnly?' household-back--icon':' household-back--text'} ${className}`} aria-label={props['aria-label']??(iconOnly?label:undefined)} title={props.title??(iconOnly?label:undefined)}><ChevronRight className="household-back-chevron" size={21} strokeWidth={2.25} aria-hidden="true" focusable="false"/>{!iconOnly&&<span>{children}</span>}</Link>
}
