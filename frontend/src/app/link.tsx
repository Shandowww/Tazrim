import type { ComponentProps } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useDraftGuard } from './draft-guard'

type Props = Omit<ComponentProps<typeof RouterLink>, 'to'> & { href: string }

/** Explicit Next-to-React-Router boundary for ported Tazrim presentation. */
export default function Link({ href, onClick, ...props }: Props) {
  const {registry}=useDraftGuard()
  return <RouterLink to={href} {...props} onClick={event=>{const state=registry.getSnapshot();if(!state.dirty&&!state.busy)onClick?.(event)}} />
}
