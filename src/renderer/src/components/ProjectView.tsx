import { useEffect, useRef, useState } from 'react'
import { MODELS, PERMISSIONS, type ModelId, type PermissionMode, type Project } from '@shared/types'
import {
  api,
  closeSession,
  goHome,
  newSession,
  patchProject,
  renameSession,
  setUI,
  shortPath,
  useStore
} from '../store'
import { Icon } from './Icon'
import { useMenu, type MenuItem } from './Menu'
import { SidePanel } from './SidePanel'
import { Stage } from './Stage'
import { StatusIcon, statusLabel } from './StatusIcon'

export function ProjectView({ hidden }: { hidden: boolean }) {
  const project = useStore((s) => s.data!.projects.find((p) => p.id === s.ui.projectId))
  const activeId = useStore((s) => (s.ui.projectId ? s.ui.activeSession[s.ui.projectId] : undefined))
  const sessions = useStore((s) => s.data!.sessions)
  const sideOpen = useStore((s) => s.ui.sideOpen)
  const tabs = project ? sessions.filter((s) => s.projectId === project.id && s.open) : []
  const visibleId = !hidden && activeId && tabs.some((t) => t.id === activeId) ? activeId : null

  // Fall back to the last tab when the remembered one was closed.
  useEffect(() => {
    if (project && tabs.length && !tabs.some((t) => t.id === activeId)) {
      setUI((ui) => ({ activeSession: { ...ui.activeSession, [project.id]: tabs[tabs.length - 1].id } }))
    }
  }, [project, tabs, activeId])

  useEffect(() => {
    api.setVisible(visibleId)
  }, [visibleId])

  return (
    <div className="content" style={{ display: hidden ? 'none' : 'flex' }}>
      {project && <ProjectChrome project={project} />}
      <div className="workspace">
        <div className="center">
          {project && <SessionTabs project={project} activeId={visibleId} />}
          <div className="stage-frame">
            <Stage visibleId={visibleId} />
            {project && !tabs.length && <Launcher project={project} />}
          </div>
        </div>
        {project && sideOpen && <SidePanel project={project} />}
      </div>
    </div>
  )
}

function ProjectChrome({ project }: { project: Project }) {
  const menu = useMenu()
  const sideOpen = useStore((s) => s.ui.sideOpen)
  const newBtn = useRef<HTMLButtonElement>(null)

  const launchMenu: MenuItem[] = [
    { heading: 'Nouvelle session avec…' },
    ...MODELS.map<MenuItem>((m) => ({
      label: `${m.label}  (${m.hint})`,
      icon: <Icon name="console" />,
      checked: m.id === project.model,
      onClick: () => newSession(project.id, { model: m.id })
    })),
    { sep: true },
    { heading: 'Mode plan (lecture seule)' },
    { label: 'Nouvelle session en mode plan', icon: <Icon name="notepad" />, onClick: () => newSession(project.id, { permission: 'plan' }) }
  ]

  return (
    <>
      <div className="toolbar">
        <button className="tb" onClick={goHome} title="Poste de travail (⌘⇧H)">
          <Icon name="computer" size={22} /> Poste de travail
        </button>
        <span className="tb-sep" />
        <button className="tb" onClick={() => newSession(project.id)} title="Nouvelle session (⌘T)">
          <Icon name="plus" size={22} /> Nouvelle session
        </button>
        <button ref={newBtn} className="tb" onClick={() => menu.openBelow(newBtn.current!, launchMenu)} title="Choisir le modèle">
          <span className="caret">▼</span>
        </button>
        <span className="tb-sep" />
        <label className="tb" style={{ gap: 4 }} title="Modèle par défaut des nouvelles sessions de ce projet">
          Modèle
          <select value={project.model} onChange={(e) => patchProject(project.id, { model: e.target.value as ModelId })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="tb" style={{ gap: 4 }} title="Mode d’autorisation des nouvelles sessions">
          Autorisations
          <select
            value={project.permission}
            onChange={(e) => patchProject(project.id, { permission: e.target.value as PermissionMode })}
          >
            {PERMISSIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <span className="tb-sep" />
        <button className="tb" onClick={() => api.openFinder(project.path)} title="Ouvrir dans le Finder">
          <Icon name="finder" size={22} />
        </button>
        <button className="tb" onClick={() => api.openApp('Visual Studio Code', project.path)} title="Ouvrir dans VS Code">
          <Icon name="code" size={22} />
        </button>
        <button className="tb" onClick={() => api.openApp('Terminal', project.path)} title="Ouvrir dans le Terminal">
          <Icon name="console" size={22} />
        </button>
        <span style={{ flex: 1 }} />
        <button className={'tb' + (sideOpen ? ' on' : '')} onClick={() => setUI({ sideOpen: !sideOpen })} title="Tâches et notes (⌘J)">
          <Icon name="tasks" size={22} /> Tâches & notes
        </button>
      </div>
      <div className="addressbar">
        Adresse
        <div className="addr selectable" title={project.path}>
          <Icon name="folderOpen" size={16} />
          <span>{project.path}</span>
        </div>
        <button className="btn small" onClick={() => setUI({ dialog: { kind: 'project', projectId: project.id } })}>
          <Icon name="gear" size={13} /> Propriétés
        </button>
      </div>
      {menu.node}
    </>
  )
}

function SessionTabs({ project, activeId }: { project: Project; activeId: string | null }) {
  const sessions = useStore((s) => s.data!.sessions)
  const live = useStore((s) => s.live)
  const tabs = sessions.filter((s) => s.projectId === project.id && s.open)
  const [editing, setEditing] = useState<string | null>(null)
  const menu = useMenu()

  return (
    <div className="tabs">
      {tabs.map((t) => {
        const l = live[t.id]
        const model = MODELS.find((m) => m.id === t.model)?.label ?? t.model
        return (
          <div
            key={t.id}
            className={'tab' + (t.id === activeId ? ' active' : '') + (l?.attention && t.id !== activeId ? ' attention' : '')}
            onMouseDown={(e) => {
              if (e.button === 1) closeSession(t.id)
            }}
            onClick={() => setUI((ui) => ({ activeSession: { ...ui.activeSession, [project.id]: t.id } }))}
            onDoubleClick={() => setEditing(t.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              menu.open(e, [
                { label: 'Renommer', onClick: () => setEditing(t.id) },
                { label: 'Fermer', shortcut: '⌘W', onClick: () => closeSession(t.id) }
              ])
            }}
            title={`${t.title}\n${statusLabel(l)}\nDouble-clic pour renommer`}
          >
            <StatusIcon live={l} size={14} />
            {editing === t.id ? (
              <input
                type="text"
                autoFocus
                defaultValue={t.title}
                style={{ height: 17, width: 150 }}
                onBlur={(e) => {
                  renameSession(t.id, e.target.value)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <span className="tlabel">{t.title}</span>
            )}
            <span className="tmodel">{model}</span>
            <button
              className="tclose"
              title="Fermer (⌘W)"
              onClick={(e) => {
                e.stopPropagation()
                closeSession(t.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button className="tab-add" onClick={() => newSession(project.id)} title="Nouvelle session (⌘T)">
        <Icon name="plus" size={12} /> Nouvelle
      </button>
      {menu.node}
    </div>
  )
}

function Launcher({ project }: { project: Project }) {
  const history = useStore((s) => s.ui.projectId)
  const [recent, setRecent] = useState<{ id: string; title: string; updatedAt: number }[]>([])
  useEffect(() => {
    api.history(project.path).then((h) => setRecent(h.slice(0, 6)))
  }, [project.path, history])

  return (
    <div className="launcher">
      <h1>{project.name}</h1>
      <div style={{ color: '#666' }}>{shortPath(project.path)}</div>
      <div className="model-cards">
        {MODELS.filter((m) => m.id !== 'default').map((m) => (
          <button key={m.id} className="model-card" onClick={() => newSession(project.id, { model: m.id })}>
            <Icon name="console" size={24} />
            <b>{m.label}</b>
            <span>{m.hint}</span>
            {m.id === project.model && <span className="kbd">Par défaut · ⌘T</span>}
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <h2 style={{ font: 'bold 12px Tahoma', margin: '0 0 6px' }}>Reprendre une conversation</h2>
          <div className="attn-list">
            {recent.map((h) => (
              <div key={h.id} className="attn-item calm">
                <Icon name="history" size={20} />
                <div className="grow">
                  <b>{h.title}</b>
                  <div style={{ color: '#777' }}>{new Date(h.updatedAt).toLocaleString('fr-FR')}</div>
                </div>
                <button className="btn" onClick={() => newSession(project.id, { resumeId: h.id, title: h.title })}>
                  <Icon name="play" size={14} /> Reprendre
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
