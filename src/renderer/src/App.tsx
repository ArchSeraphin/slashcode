import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  allOpenSessions,
  api,
  closeSession,
  getState,
  gotoSession,
  goHome,
  newSession,
  onDictationEvent,
  openSessionsOf,
  setSplit,
  setLive,
  setUsage,
  setUI,
  toggleDictation,
  updateData,
  useStore
} from './store'
import type { SplitCount } from '@shared/types'
import { chime } from './sound'
import { Dialogs, currentProjectId } from './components/Dialogs'
import { Home } from './components/Home'
import { Icon } from './components/Icon'
import { useMenu, type MenuItem } from './components/Menu'
import { ProjectView } from './components/ProjectView'
import { Sidebar } from './components/Sidebar'
import { Taskbar } from './components/Taskbar'

function activeSessionId(): string | null {
  const pid = currentProjectId()
  return pid ? getState().ui.activeSession[pid] ?? null : null
}

function cycle(delta: number): void {
  const all = allOpenSessions()
  if (!all.length) return
  const i = all.findIndex((s) => s.id === activeSessionId())
  gotoSession(all[(i + delta + all.length) % all.length].id)
}

function nextAttention(): void {
  const { live } = getState()
  const all = allOpenSessions()
  const i = all.findIndex((s) => s.id === activeSessionId())
  for (let k = 1; k <= all.length; k++) {
    const s = all[(i + k + all.length) % all.length]
    if (live[s.id]?.attention) return gotoSession(s.id)
  }
}

function runMenu(action: string): void {
  const pid = currentProjectId()
  switch (action) {
    case 'settings':
      return setUI({ dialog: { kind: 'settings' } })
    case 'new-session':
      if (pid) newSession(pid)
      else setUI({ dialog: { kind: 'palette' } })
      return
    case 'new-project':
      return setUI({ dialog: { kind: 'project' } })
    case 'import':
      return setUI({ dialog: { kind: 'import' } })
    case 'close-session': {
      const sid = activeSessionId()
      if (sid) closeSession(sid)
      return
    }
    case 'palette':
      return setUI({ dialog: { kind: 'palette' } })
    case 'home':
      return goHome()
    case 'toggle-side':
      return setUI((ui) => ({ sideOpen: !ui.sideOpen }))
    case 'prev-session':
      return cycle(-1)
    case 'next-session':
      return cycle(1)
    case 'next-attention':
      return nextAttention()
    case 'dictate':
      return toggleDictation()
    case 'split-1':
    case 'split-2':
    case 'split-3':
    case 'split-4':
      if (pid) setSplit(pid, Number(action.slice(6)) as SplitCount)
      return
  }
}

export function App() {
  const ui = useStore((s) => s.ui)
  const projectName = useStore((s) => s.data!.projects.find((p) => p.id === s.ui.projectId)?.name)
  const split = useStore((s) => s.data!.projects.find((p) => p.id === s.ui.projectId)?.split)
  const appearance = useStore((s) => s.data!.settings.appearance)
  const menu = useMenu()
  const bar = useRef<HTMLDivElement>(null)

  // Before paint, so a dark start never flashes Luna. "system" follows macOS live.
  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = appearance === 'dark' || (appearance === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    if (appearance !== 'system') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [appearance])

  useEffect(() => {
    const offs = [
      api.onUpdate((info) => {
        setLive(info)
        if (info.status === 'working') {
          updateData((d) => ({
            ...d,
            sessions: d.sessions.map((s) => (s.id === info.id ? { ...s, lastActiveAt: Date.now() } : s))
          }))
        }
      }),
      api.onUsage(setUsage),
      api.onTitle((id, title) => {
        // Claude's own title only replaces the generic "Session n" names.
        const rec = getState().data?.sessions.find((s) => s.id === id)
        if (rec && /^Session \d+$/.test(rec.title)) {
          updateData((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === id ? { ...s, title } : s)) }))
        }
      }),
      api.onBalloon((info) => {
        const st = getState()
        const p = st.data?.projects.find((x) => x.id === info.projectId)
        const rec = st.data?.sessions.find((s) => s.id === info.id)
        const tone = info.status === 'permission' ? 'warning' : 'done'
        setUI({
          balloon: {
            sessionId: info.id,
            title: `${p?.name ?? 'Claude'} · ${rec?.title ?? ''}`,
            body: info.detail || (tone === 'warning' ? info.message : 'Claude a terminé, à toi de jouer.'),
            tone
          }
        })
        if (st.data?.settings.notifySound) chime(tone)
      }),
      api.onGoto((id) => gotoSession(id)),
      api.onDictation(onDictationEvent),
      api.onMenu(runMenu),
      api.onMaximized((maximized) => setUI({ maximized })),
      api.onFocus((focused) => setUI({ focused }))
    ]
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 9) {
        const pid = currentProjectId()
        if (!pid) return
        const tab = openSessionsOf(pid)[n - 1]
        if (tab) {
          e.preventDefault()
          gotoSession(tab.id)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  const menus: Record<string, MenuItem[]> = {
    Fichier: [
      { label: 'Nouvelle session', shortcut: '⌘T', icon: <Icon name="console" />, onClick: () => runMenu('new-session') },
      { label: 'Nouveau projet…', shortcut: '⌘⇧N', icon: <Icon name="plus" />, onClick: () => runMenu('new-project') },
      { label: 'Nouveau groupe…', icon: <Icon name="folder" />, onClick: () => setUI({ dialog: { kind: 'group' } }) },
      { label: 'Importer depuis Claude…', shortcut: '⌘I', icon: <Icon name="import" />, onClick: () => runMenu('import') },
      { sep: true },
      { label: 'Fermer la session', shortcut: '⌘W', onClick: () => runMenu('close-session') },
      { label: 'Dicter un prompt', shortcut: '⌘D', icon: <Icon name="mic" />, onClick: () => runMenu('dictate') },
      { label: 'Quitter', shortcut: '⌘Q', icon: <Icon name="power" />, onClick: () => api.close() }
    ],
    Affichage: [
      { label: 'Poste de travail', shortcut: '⌘⇧H', icon: <Icon name="computer" />, onClick: goHome },
      { label: 'Exécuter…', shortcut: '⌘K', icon: <Icon name="run" />, onClick: () => runMenu('palette') },
      { label: 'Tâches & notes', shortcut: '⌘J', checked: ui.sideOpen, onClick: () => runMenu('toggle-side') },
      {
        label: 'Mode sombre',
        checked: document.documentElement.dataset.theme === 'dark',
        onClick: () =>
          updateData((d) => ({
            ...d,
            settings: { ...d.settings, appearance: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }
          }))
      },
      { sep: true },
      { label: 'Session précédente', shortcut: '⌘⇧[', onClick: () => cycle(-1) },
      { label: 'Session suivante', shortcut: '⌘⇧]', onClick: () => cycle(1) },
      { label: 'Prochaine session en attente', shortcut: '⌘⇧A', icon: <Icon name="bell" />, onClick: nextAttention },
      { sep: true },
      { heading: 'Disposition' },
      ...([1, 2, 3, 4] as const).map<MenuItem>((n) => ({
        label: ['Une session', 'Deux sessions côte à côte', 'Trois sessions', 'Quatre sessions'][n - 1],
        shortcut: `⌥⌘${n}`,
        icon: <Icon name={`layout${n}`} />,
        checked: ui.view === 'project' && (split ?? 1) === n,
        onClick: () => runMenu(`split-${n}`)
      }))
    ],
    Outils: [{ label: 'Paramètres…', shortcut: '⌘,', icon: <Icon name="gear" />, onClick: () => runMenu('settings') }],
    '?': [{ label: 'Aide et raccourcis', icon: <Icon name="help" />, onClick: () => setUI({ dialog: { kind: 'shortcuts' } }) }]
  }

  const title = ui.view === 'project' && projectName ? `${projectName} - SlashCode` : 'Poste de travail - SlashCode'

  return (
    <div className="desktop">
      <div className={'xp-window main-window' + (ui.focused ? '' : ' inactive')}>
        <div className="title-bar" onDoubleClick={() => api.maximize()}>
          <Icon name={ui.view === 'project' ? 'folderOpen' : 'computer'} size={16} />
          <span className="title-text">{title}</span>
          <div className="title-controls">
            <button className="wbtn min" aria-label="Réduire" onClick={() => api.minimize()} />
            <button
              className={'wbtn ' + (ui.maximized ? 'restore' : 'max')}
              aria-label="Agrandir"
              onClick={() => api.maximize()}
            />
            <button className="wbtn close" aria-label="Fermer" onClick={() => api.close()} />
          </div>
        </div>
        <div className="menubar" ref={bar}>
          {Object.entries(menus).map(([name, items]) => (
            <button key={name} className="menu-title" onClick={(e) => menu.openBelow(e.currentTarget, items)}>
              {name}
            </button>
          ))}
          <span className="brand">
            <Icon name="logo" size={16} />
          </span>
        </div>
        <div className="main-body">
          <Sidebar />
          {ui.view === 'home' && (
            <div className="content">
              <div className="toolbar">
                <button className="tb" onClick={() => setUI({ dialog: { kind: 'palette' } })}>
                  <Icon name="search" size={22} /> Exécuter…
                </button>
                <span className="tb-sep" />
                <button className="tb" onClick={() => setUI({ dialog: { kind: 'project' } })}>
                  <Icon name="plus" size={22} /> Nouveau projet
                </button>
                <button className="tb" onClick={() => setUI({ dialog: { kind: 'import' } })}>
                  <Icon name="import" size={22} /> Importer
                </button>
                <span style={{ flex: 1 }} />
                <button className="tb" onClick={() => setUI({ dialog: { kind: 'settings' } })}>
                  <Icon name="gear" size={22} /> Paramètres
                </button>
              </div>
              <div className="addressbar">
                Adresse
                <div className="addr">
                  <Icon name="computer" size={16} />
                  <span>Poste de travail</span>
                </div>
              </div>
              <Home />
            </div>
          )}
          <ProjectView hidden={ui.view !== 'project'} />
        </div>
      </div>
      <Taskbar />
      <Dialogs />
      {menu.node}
    </div>
  )
}
