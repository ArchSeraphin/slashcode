import type { Settings } from '@shared/types'

export interface PushMessage {
  kind: 'permission' | 'done' | 'test'
  title: string // project
  subtitle: string // session
  body: string
  group: string
}

const trim = (url: string) => url.replace(/\/+$/, '')

// Bark downloads the icon itself, so it must be public: served from this repository.
const ICON_BASE = 'https://raw.githubusercontent.com/ArchSeraphin/slashcode/main/design/logo/final'

/** Accepts the raw device key or any Bark URL copied from the app (https://server/<key>/…). */
export function barkKeyOf(input: string): string {
  const s = input.trim()
  const m = s.match(/^https?:\/\/[^/]+(?:\/bark)?\/([A-Za-z0-9]{10,})/)
  return m ? m[1] : s
}

async function post(url: string, payload: unknown): Promise<'ok' | string> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    })
    return res.ok ? 'ok' : `Le serveur a répondu ${res.status}`
  } catch (err) {
    return `Envoi impossible : ${(err as Error).message}`
  }
}

/** Bark: custom icon per notification, grouped by project, time-sensitive for permission requests. */
function sendBark(s: Settings, m: PushMessage): Promise<'ok' | string> {
  const key = barkKeyOf(s.barkKey)
  if (!key) return Promise.resolve('Clé Bark manquante')
  const server = trim(s.barkServer)
  return post(`${server}/push`, {
    device_key: key,
    title: m.title,
    subtitle: m.subtitle,
    body: m.body,
    group: m.group,
    icon: `${ICON_BASE}/notif-${m.kind === 'test' ? 'logo' : m.kind}.png`,
    level: m.kind === 'permission' ? 'timeSensitive' : 'active',
    sound: m.kind === 'permission' ? 'glass' : 'minuet',
    isArchive: '1'
  })
}

function sendNtfy(s: Settings, m: PushMessage): Promise<'ok' | string> {
  if (!s.phoneTopic) return Promise.resolve('Sujet ntfy manquant')
  return post(`${trim(s.phoneServer)}/`, {
    topic: s.phoneTopic,
    title: m.subtitle ? `${m.title} · ${m.subtitle}` : m.title,
    message: m.body,
    tags: [m.kind === 'permission' ? 'warning' : 'white_check_mark'],
    priority: m.kind === 'permission' ? 4 : 3
  })
}

export function pushPhone(s: Settings, m: PushMessage): Promise<'ok' | string> {
  return s.phoneProvider === 'ntfy' ? sendNtfy(s, m) : sendBark(s, m)
}
