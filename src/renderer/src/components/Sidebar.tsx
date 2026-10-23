import { useMemo, useState, type DragEvent } from 'react'
import type { Project } from '@shared/types'
import {
  addProjects,
  api,
  gotoSession,
  moveGroup,
  newSession,
  openProject,
  patchGroup,
  patchProject,
  PROJECT_COLORS,
  removeGroup,
  removeProject,
  setUI,
  shortPath,
  useStore
} from '../store'
import { Icon } from './Icon'
import { useMenu, type MenuItem } from './Menu'
import { StatusIcon } from './StatusIcon'

const UNGROUPED = '__none'

export function Sidebar() {
  const data = useStore((s) => s.data!)
  const live = useStore((s) => s.live)
  const ui = useStore((s) => s.ui)
  const menu = useMenu()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const query = ui.search.trim().toLowerCase()
  const match = (p: Project) =>
    !query || p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)

  const stats = useMemo(() => {
    const m = new Map<string, { live: number; attention: number }>()
    for (const s of data.sessions) {
      if (!s.open) continue
      const l = live[s.id]
      const cur = m.get(s.projectId) ?? { live: 0, attention: 0 }
      if (l && l.status !== 'exited') cur.live++
      if (l?.attention) cur.attention++
      m.set(s.projectId, cur)
    }
    return m
  }, [data.sessions, live])

  const attentionSessions = data.sessions.filter((s) => s.open && live[s.id]?.attention)
  const visible = data.projects.filter((p) => !p.archived && match(p))
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  const favorites = visible.filter((p) => p.favorite).sort(byName)
  const archived = data.projects.filter((p) => p.archived && match(p)).sort(byName)

  const projectMenu = (p: Project): MenuItem[] => [
    { label: 'Ouvrir', icon: <Icon name="folderOpen" />, onClick: () => openProject(p.id) },
    { label: 'Nouvelle session', icon: <Icon name="plus" />, onClick: () => newSession(p.id) },
    { sep: true },
    {
      label: p.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      icon: <Icon name={p.favorite ? 'starEmpty' : 'star'} />,
      onClick: () => patchProject(p.id, { favorite: !p.favorite })
    },
    { label: 'Propriétés…', icon: <Icon name="gear" />, onClick: () => setUI({ dialog: { kind: 'project', projectId: p.id } }) },
    { heading: 'Déplacer vers' },
    ...data.groups.map<MenuItem>((g) => ({
      label: g.name,
      icon: <Icon name="folder" />,
      checked: p.groupId === g.id,
      onClick: () => patchProject(p.id, { groupId: g.id })
    })),
    { label: 'Sans groupe', checked: p.groupId === null, onClick: () => patchProject(p.id, { groupId: null }) },
    { heading: 'Couleur' },
    ...PROJECT_COLORS.map<MenuItem>((c) => ({
      label: '',
      icon: <span style={{ display: 'inline-block', width: 40, height: 10, background: c, border: '1px solid #555' }} />,
      checked: p.color === c,
      onClick: () => patchProject(p.id, { color: c })
    })),
    { sep: true },
    { label: 'Ouvrir dans le Finder', icon: <Icon name="finder" />, onClick: () => api.openFinder(p.path) },
    {
      label: p.archived ? 'Désarchiver' : 'Archiver',
      icon: <Icon name="archive" />,
      onClick: () => patchProject(p.id, { archived: !p.archived })
    },
    {
      label: 'Retirer de SlashCode…',
      icon: <Icon name="trash" />,
      onClick: () =>
        setUI({
          dialog: {
            kind: 'confirm',
            title: 'Retirer le projet',
            message: `Retirer « ${p.name} » de SlashCode ?`,
            detail: 'Ses notes et tâches seront supprimées. Le dossier sur le disque et l’historique Claude ne sont pas touchés.',
            okLabel: 'Retirer',
            danger: true,
            onOk: () => removeProject(p.id)
          }
        })
    }
  ]

  const onDrop = (groupKey: string) => (e: DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
    const groupId = groupKey === UNGROUPED ? null : groupKey
    const pid = e.dataTransfer.getData('application/x-slashcode-project')
    if (pid) {
      patchProject(pid, { groupId })
      return
    }
    // Folders dragged from the Finder become projects in this group.
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
    const created = addProjects(paths, groupId)
    if (created.length === 1) openProject(created[0].id)
  }

  const dropProps = (key: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDropTarget(key)
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: onDrop(key)
  })

  const row = (p: Project, showPath = false) => {
    const st = stats.get(p.id)
    const active = ui.view === 'project' && ui.projectId === p.id
    return (
      <button
        key={p.id}
        className={'prow' + (active ? ' active' : '') + (dragId === p.id ? ' dragging' : '')}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-slashcode-project', p.id)
          setDragId(p.id)
        }}
        onDragEnd={() => setDragId(null)}
        onClick={() => openProject(p.id)}
        onDoubleClick={() => newSession(p.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          menu.open(e, projectMenu(p))
        }}
        title={`${p.path}\nDouble-clic : nouvelle session`}
      >
        <span className="pcolor" style={{ background: p.color }} />
        <Icon name={st?.live ? 'folderOpen' : 'folder'} size={16} />
        <span className="pname">
          {p.name}
          {showPath && <span className="muted-path"> · {shortPath(p.path)}</span>}
        </span>
        <span className="badges">
          {p.favorite && !showPath && <Icon name="star" size={11} />}
          {st?.attention ? <span className="badge attn">{st.attention}</span> : null}
          {st?.live ? <span className="badge live">{st.live}</span> : null}
        </span>
      </button>
    )
  }

  const groups = [...data.groups.map((g) => ({ ...g, key: g.id })), { id: UNGROUPED, key: UNGROUPED, name: 'Sans groupe', collapsed: false }]

  return (
    <aside className="taskpane">
      <div className="taskpane-search">
        <div className="searchbox">
          <Icon name="search" size={14} />
          <input
            id="project-search"
            type="search"
            placeholder="Filtrer les projets"
            value={ui.search}
            onChange={(e) => setUI({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible.length) openProject(visible.sort(byName)[0].id)
              if (e.key === 'Escape') setUI({ search: '' })
            }}
          />
          <kbd>⌘K</kbd>
        </div>
      </div>
      <div className="taskpane-scroll">
        {attentionSessions.length > 0 && (
          <section className="pane attention">
            <div className="pane-head">
              <Icon name="bell" size={16} />
              <span className="label">À traiter</span>
              <span className="count" style={{ color: '#fff' }}>
                {attentionSessions.length}
              </span>
            </div>
            <div className="pane-body">
              {attentionSessions.map((s) => {
                const p = data.projects.find((x) => x.id === s.projectId)
                return (
                  <button key={s.id} className="prow" onClick={() => gotoSession(s.id)} title={live[s.id]?.message}>
                    <StatusIcon live={live[s.id]} />
                    <span className="pname">
                      <b>{p?.name}</b> · {s.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="pane special">
          <button className="pane-head" onClick={() => setUI({ view: 'home', startOpen: false })}>
            <Icon name="computer" size={16} />
            <span className="label">Poste de travail</span>
          </button>
          {favorites.length > 0 && <div className="pane-body">{favorites.map((p) => row(p))}</div>}
        </section>

        {groups.map((g) => {
          const items = visible.filter((p) => (p.groupId ?? UNGROUPED) === g.key).sort(byName)
          const isNone = g.key === UNGROUPED
          if (isNone && !items.length && !dragId) return null
          if (query && !items.length) return null
          const collapsed = g.collapsed && !query
          const groupMenu: MenuItem[] = isNone
            ? []
            : [
                { label: 'Renommer…', onClick: () => setUI({ dialog: { kind: 'group', groupId: g.id } }) },
                { label: 'Monter', onClick: () => moveGroup(g.id, -1) },
                { label: 'Descendre', onClick: () => moveGroup(g.id, 1) },
                { sep: true },
                {
                  label: 'Supprimer le groupe',
                  icon: <Icon name="trash" />,
                  onClick: () =>
                    setUI({
                      dialog: {
                        kind: 'confirm',
                        title: 'Supprimer le groupe',
                        message: `Supprimer le groupe « ${g.name} » ?`,
                        detail: 'Ses projets passent dans « Sans groupe ».',
                        okLabel: 'Supprimer',
                        danger: true,
                        onOk: () => removeGroup(g.id)
                      }
                    })
                }
              ]
          return (
            <section key={g.key} className={'pane' + (dropTarget === g.key ? ' drop-target' : '')} {...dropProps(g.key)}>
              <button
                className="pane-head"
                onClick={() => !isNone && patchGroup(g.id, { collapsed: !g.collapsed })}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (groupMenu.length) menu.open(e, groupMenu)
                }}
              >
                <span className="label">{g.name}</span>
                <span className="count">{items.length}</span>
                {!isNone && <span className={'chev' + (collapsed ? ' closed' : '')} />}
              </button>
              {!collapsed && (
                <div className="pane-body">
                  {items.length ? items.map((p) => row(p)) : <div className="pane-empty">Glisse un projet ou un dossier ici</div>}
                </div>
              )}
            </section>
          )
        })}

        {archived.length > 0 && (
          <section className="pane">
            <button className="pane-head" onClick={() => setShowArchived(!showArchived)}>
              <Icon name="archive" size={16} />
              <span className="label">Archives</span>
              <span className="count">{archived.length}</span>
              <span className={'chev' + (showArchived ? '' : ' closed')} />
            </button>
            {showArchived && <div className="pane-body">{archived.map((p) => row(p))}</div>}
          </section>
        )}
      </div>
      <div className="taskpane-foot">
        <button className="btn" onClick={() => setUI({ dialog: { kind: 'project' } })}>
          <Icon name="plus" size={14} /> Projet
        </button>
        <button className="btn" onClick={() => setUI({ dialog: { kind: 'group' } })}>
          <Icon name="folder" size={14} /> Groupe
        </button>
        <button className="btn" onClick={() => setUI({ dialog: { kind: 'import' } })} title="Importer depuis l’historique Claude">
          <Icon name="import" size={14} /> Importer
        </button>
      </div>
      {menu.node}
    </aside>
  )
}
