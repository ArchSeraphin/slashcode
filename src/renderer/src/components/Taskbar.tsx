import { useEffect, useState } from 'react'
import {
  allOpenSessions,
  gotoSession,
  openGithub,
  goHome,
  newSession,
  openProject,
  setUI,
  shortPath,
  useStore
} from '../store'
import type { UsageWindow } from '@shared/types'
import { Icon } from './Icon'
import { StatusIcon, statusLabel } from './StatusIcon'

export function Taskbar() {
  const ui = useStore((s) => s.ui)
  const data = useStore((s) => s.data!)
  const live = useStore((s) => s.live)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  const open = allOpenSessions()
  const activeId = ui.view === 'project' && ui.projectId ? ui.activeSession[ui.projectId] : null
  const attention = open.filter((s) => live[s.id]?.attention).length
  const running = open.filter((s) => live[s.id] && live[s.id].status !== 'exited').length

  return (
    <>
      {ui.startOpen && <StartMenu />}
      {ui.balloon && <BalloonTip />}
      <footer className="taskbar">
        <button
          className={'start' + (ui.startOpen ? ' open' : '')}
          onClick={() => setUI({ startOpen: !ui.startOpen })}
          title="Démarrer"
        >
          <Icon name="logo" size={20} />
          démarrer
        </button>
        <div className="task-buttons">
          {open.map((s) => {
            const l = live[s.id]
            const p = data.projects.find((x) => x.id === s.projectId)
            return (
              <button
                key={s.id}
                className={'task-btn' + (s.id === activeId ? ' active' : '') + (l?.attention ? ' flash' : '')}
                onClick={() => gotoSession(s.id)}
                title={`${p?.name} · ${s.title}\n${statusLabel(l)}`}
              >
                <StatusIcon live={l} size={16} />
                <span>
                  {p?.name} · {s.title}
                </span>
              </button>
            )
          })}
        </div>
        <div className="tray">
          <UsageMeters now={now} />
          <button onClick={() => setUI({ dialog: { kind: 'settings' } })} title="Notifications et paramètres">
            <Icon name="bell" size={16} />
            {attention > 0 && <b>{attention}</b>}
          </button>
          <span title={`${running} session(s) Claude en cours`} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Icon name="console" size={16} />
            {running}
          </span>
          <span className="clock">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </footer>
    </>
  )
}

function resetLabel(at: number, now: Date): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `à ${time}`
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${time}`
}

function UsageMeter({ label, name, w, now }: { label: string; name: string; w: UsageWindow | null; now: Date }) {
  if (!w) return null
  // Past its reset time, the last known value no longer holds.
  const reset = w.resetsAt !== null && w.resetsAt <= now.getTime()
  const pct = reset ? 0 : Math.max(0, Math.min(100, Math.round(w.percent)))
  const level = pct >= 90 ? ' high' : pct >= 70 ? ' mid' : ''
  const when = reset ? 'remise à zéro depuis la dernière mesure' : w.resetsAt ? `remise à zéro ${resetLabel(w.resetsAt, now)}` : ''
  return (
    <span className="usage" title={`${name} : ${pct} % utilisés${when ? `\n${when}` : ''}`}>
      {label}
      <span className={'usage-bar' + level}>
        <i style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  )
}

/** Plan limits relayed by the sessions' status line. */
function UsageMeters({ now }: { now: Date }) {
  const usage = useStore((s) => s.usage)
  if (!usage) return null
  return (
    <>
      <UsageMeter label="5 h" name="Limite sur 5 heures" w={usage.fiveHour} now={now} />
      <UsageMeter label="7 j" name="Limite hebdomadaire" w={usage.sevenDay} now={now} />
    </>
  )
}

function StartMenu() {
  const data = useStore((s) => s.data!)
  const recent = [...data.projects]
    .filter((p) => !p.archived)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, 12)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUI({ startOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const action = (fn: () => void) => () => {
    setUI({ startOpen: false })
    fn()
  }

  return (
    <>
      <div className="ctx-backdrop" style={{ zIndex: 55 }} onMouseDown={() => setUI({ startOpen: false })} />
      <div className="start-menu">
        <div className="start-head">
          <span className="avatar">
            <Icon name="logo" size={30} />
          </span>
          SlashCode
        </div>
        <div className="start-cols">
          <div className="start-left">
            {recent.length === 0 && <div className="empty">Aucun projet</div>}
            {recent.map((p) => (
              <button
                key={p.id}
                className="sitem"
                onClick={action(() => openProject(p.id))}
                onDoubleClick={action(() => newSession(p.id))}
              >
                <Icon name="folder" size={24} />
                <span className="stexts">
                  <b>
                    {p.favorite && '★ '}
                    {p.name}
                  </b>
                  <span className="ssub">{shortPath(p.path)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="start-right">
            <button className="sitem" onClick={action(goHome)}>
              <Icon name="computer" size={22} />
              <b>Poste de travail</b>
            </button>
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'palette' } }))}>
              <Icon name="run" size={22} />
              <span>Exécuter… ⌘K</span>
            </button>
            <div className="start-sep" />
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'project' } }))}>
              <Icon name="plus" size={22} />
              <span>Nouveau projet</span>
            </button>
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'import' } }))}>
              <Icon name="import" size={22} />
              <span>Importer depuis Claude</span>
            </button>
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'group' } }))}>
              <Icon name="folder" size={22} />
              <span>Nouveau groupe</span>
            </button>
            <div className="start-sep" />
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'settings' } }))}>
              <Icon name="gear" size={22} />
              <span>Paramètres</span>
            </button>
            <button className="sitem" onClick={action(() => setUI({ dialog: { kind: 'shortcuts' } }))}>
              <Icon name="help" size={22} />
              <span>Aide et raccourcis</span>
            </button>
          </div>
        </div>
        <div className="start-foot">
          <button onClick={action(() => window.api.close())}>
            <Icon name="power" size={20} /> Quitter SlashCode
          </button>
        </div>
      </div>
    </>
  )
}

const BALLOON_ICON = { warning: 'warning', done: 'info', success: 'check', error: 'fail' } as const

function BalloonTip() {
  const b = useStore((s) => s.ui.balloon!)
  useEffect(() => {
    const t = setTimeout(() => setUI({ balloon: null }), 9000)
    return () => clearTimeout(t)
  }, [b])
  return (
    <div
      className="balloon"
      onClick={() => {
        if (b.sessionId) gotoSession(b.sessionId)
        else if (b.projectId) openGithub(b.projectId)
        setUI({ balloon: null })
      }}
    >
      <div className="bhead">
        <Icon name={BALLOON_ICON[b.tone]} size={16} />
        {b.title}
        <button
          className="x"
          onClick={(e) => {
            e.stopPropagation()
            setUI({ balloon: null })
          }}
        >
          ×
        </button>
      </div>
      <div className="bbody">{b.body}</div>
    </div>
  )
}
