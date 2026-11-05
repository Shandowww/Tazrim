import type { ComponentProps } from 'react'
import { useLocation, Link as RouterLink } from 'react-router-dom'
import { useDraftGuard } from './draft-guard'
import {householdLinkState} from './household-model'
import {useInterfaceMode} from './interface-mode'
import {modeAllows} from './interface-mode-model'

type Props = Omit<ComponentProps<typeof RouterLink>, 'to'> & { href: string; modeFilter?:boolean }

/** Explicit Next-to-React-Router boundary for ported Tazrim presentation. */
export default function Link({ href, onClick, modeFilter=true, ...props }: Props) {
  const {registry}=useDraftGuard()
  const location=useLocation()
  const state=householdLinkState(location,href,props.state)
  const {mode}=useInterfaceMode()
  if(modeFilter&&!modeAllows(mode,href))return null
  return <RouterLink to={href} preventScrollReset={href.split(/[?#]/,1)[0] === location.pathname} {...props} state={state} onClick={event=>{const state=registry.getSnapshot();if(!state.dirty&&!state.busy)onClick?.(event)}} />
}
