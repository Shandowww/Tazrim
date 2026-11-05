import type { ComponentProps } from 'react'
import { useLocation, Link as RouterLink } from 'react-router-dom'
import { useDraftGuard } from './draft-guard'
import {householdLinkState} from './household-model'

type Props = Omit<ComponentProps<typeof RouterLink>, 'to'> & { href: string }

/** Explicit Next-to-React-Router boundary for ported Tazrim presentation. */
export default function Link({ href, onClick, ...props }: Props) {
  const {registry}=useDraftGuard()
  const location=useLocation()
  const state=householdLinkState(location,href,props.state)
  return <RouterLink to={href} preventScrollReset={href.split(/[?#]/,1)[0] === location.pathname} {...props} state={state} onClick={event=>{const state=registry.getSnapshot();if(!state.dirty&&!state.busy)onClick?.(event)}} />
}
