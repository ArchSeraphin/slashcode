import type { LiveSession } from '@shared/types'
import { Icon } from './Icon'

export function statusLabel(live: LiveSession | undefined): string {
  if (!live) return 'Interrompue'
  return live.message || live.status
}

export function StatusIcon({ live, size = 14 }: { live: LiveSession | undefined; size?: number }) {
  if (!live) return <Icon name="pause" size={size} />
  switch (live.status) {
    case 'starting':
      return <Icon name="hourglass" size={size} className="spin" />
    case 'working':
      return <Icon name="hourglass" size={size} className="spin" />
    case 'permission':
      return <Icon name="warning" size={size} />
    case 'done':
      return <Icon name="check" size={size} />
    case 'ready':
      return <Icon name="console" size={size} />
    case 'exited':
      return <Icon name="close" size={size} />
  }
}
