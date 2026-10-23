import type { Project } from '@shared/types'
import {
  gotoSession,
  newSession,
  openProject,
  resumeInPlace,
  setUI,
  timeAgo,
  toggleTask,
  useStore
} from '../store'
import { Icon } from './Icon'
import { StatusIcon, statusLabel } from './StatusIcon'

export function Home() {
  const data = useStore((s) => s.data!)
  const live = useStore((s) => s.live)
  const open = data.sessions.filter((s) => s.open)
  const attention = open.filter((s) => live[s.id]?.attention)
  const working = open.filter((s) => live[s.id] && ['working', 'starting'].includes(live[s.id].status))
  const interrupted = open.filter((s) => !live[s.id])
  const projectsById = new Map(data.projects.map((p) => [p.id, p]))
  const active = data.projects.filter((p) => !p.archived)
  const recent = [...active].filter((p) => p.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 8)
  const tasksByProject = new Map<string, typeof data.tasks>()
  for (const t of data.tasks) {
    if (t.done || !projectsById.get(t.projectId) || projectsById.get(t.projectId)!.archived) continue
    tasksByProject.set(t.projectId, [...(tasksByProject.get(t.projectId) ?? []), t])
  }
  const openTasks = [...tasksByProject.values()].reduce((n, l) => n + l.length, 0)

  const bigIcon = (p: Project) => {
    const sessions = open.filter((s) => s.projectId === p.id)
    const liveCount = sessions.filter((s) => live[s.id] && live[s.id].status !== 'exited').length
    const attn = sessions.filter((s) => live[s.id]?.attention).length
    const tasks = tasksByProject.get(p.id)?.length ?? 0
    return (
      <button
        key={p.id}
        className="big-icon"
        onClick={() => openProject(p.id)}
        onDoubleClick={() => newSession(p.id)}
        title={`${p.path}\nDouble-clic : nouvelle session`}
      >
        <span className="corner">
          {attn > 0 && <span className="badge attn">{attn}</span>}
          {liveCount > 0 && <span className="badge live">{liveCount}</span>}
        </span>
        <Icon name={liveCount ? 'folderOpen' : 'folder'} size={44} />
        <span className="bname" style={{ borderBottom: `2px solid ${p.color}` }}>
          {p.name}
        </span>
        <span className="bsub">
          {tasks ? `${tasks} tâche${tasks > 1 ? 's' : ''}` : timeAgo(p.lastOpenedAt)}
        </span>
      </button>
    )
  }

  return (
    <div className="home">
      <div className="hero">
        <Icon name="logo" size={48} />
        <div>
          <h1>Poste de travail</h1>
          <p>
            {active.length} projet{active.length > 1 ? 's' : ''} · double-clic sur un dossier pour lancer Claude ·{' '}
            <b>⌘K</b> pour aller n’importe où
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{attention.length}</b>à traiter
          </div>
          <div className="stat">
            <b>{working.length}</b>en cours
          </div>
          <div className="stat">
            <b>{openTasks}</b>tâches
          </div>
        </div>
      </div>

      {attention.length > 0 && (
        <>
          <h2>Ces sessions t’attendent</h2>
          <div className="attn-list">
            {attention.map((s) => (
              <div key={s.id} className="attn-item">
                <StatusIcon live={live[s.id]} size={22} />
                <div className="grow">
                  <b>{projectsById.get(s.projectId)?.name}</b> · {s.title}
                  <div style={{ color: '#7a5a20' }}>{statusLabel(live[s.id])}</div>
                </div>
                <button className="btn default" onClick={() => gotoSession(s.id)}>
                  Y aller
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {interrupted.length > 0 && (
        <>
          <h2>Sessions interrompues à la fermeture</h2>
          <div className="attn-list">
            <div className="attn-item calm">
              <Icon name="pause" size={22} />
              <div className="grow">
                {interrupted.length} session{interrupted.length > 1 ? 's' : ''} ouverte
                {interrupted.length > 1 ? 's' : ''} la dernière fois :{' '}
                {interrupted
                  .slice(0, 4)
                  .map((s) => `${projectsById.get(s.projectId)?.name} (${s.title})`)
                  .join(', ')}
                {interrupted.length > 4 ? '…' : ''}
              </div>
              <button className="btn default" onClick={() => interrupted.forEach((s) => resumeInPlace(s.id))}>
                <Icon name="play" size={14} /> Tout reprendre
              </button>
            </div>
          </div>
        </>
      )}

      {working.length > 0 && (
        <>
          <h2>Claude travaille</h2>
          <div className="attn-list">
            {working.map((s) => (
              <div key={s.id} className="attn-item calm">
                <StatusIcon live={live[s.id]} size={22} />
                <div className="grow">
                  <b>{projectsById.get(s.projectId)?.name}</b> · {s.title}
                </div>
                <button className="btn" onClick={() => gotoSession(s.id)}>
                  Voir
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h2>Ouverts récemment</h2>
          <div className="icon-grid">{recent.map(bigIcon)}</div>
        </>
      )}

      {tasksByProject.size > 0 && (
        <>
          <h2>Tâches en cours</h2>
          <div className="home-tasks">
            {[...tasksByProject.entries()].map(([pid, tasks]) => {
              const p = projectsById.get(pid)!
              return (
                <div key={pid} className="home-task-card">
                  <header>
                    <Icon name="folder" size={14} />
                    <button className="link" style={{ fontWeight: 'bold' }} onClick={() => openProject(pid)}>
                      {p.name}
                    </button>
                    <span style={{ marginLeft: 'auto', fontWeight: 'normal', color: '#6a7fb8' }}>{tasks.length}</span>
                  </header>
                  {tasks.slice(0, 5).map((t) => (
                    <div key={t.id} className="task">
                      <input type="checkbox" checked={false} onChange={() => toggleTask(t.id)} />
                      <span className="ttext">{t.text}</span>
                      <button
                        className="mini"
                        title="Lancer dans une nouvelle session"
                        onClick={() => newSession(pid, { prompt: t.text })}
                      >
                        <Icon name="play" size={13} />
                      </button>
                    </div>
                  ))}
                  {tasks.length > 5 && (
                    <div style={{ padding: '2px 8px 6px', color: '#777' }}>
                      et {tasks.length - 5} autre{tasks.length - 5 > 1 ? 's' : ''}…
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {[...data.groups, { id: null, name: 'Sans groupe' }].map((g) => {
        const items = active
          .filter((p) => p.groupId === g.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
        if (!items.length) return null
        return (
          <section key={g.id ?? 'none'}>
            <h2>{g.name}</h2>
            <div className="icon-grid">{items.map(bigIcon)}</div>
          </section>
        )
      })}

      {!active.length && (
        <div className="empty" style={{ marginTop: 40 }}>
          <Icon name="folder" size={48} />
          <p>Aucun projet pour l’instant.</p>
          <p>
            <button className="btn default" onClick={() => setUI({ dialog: { kind: 'import' } })}>
              Importer depuis Claude
            </button>{' '}
            <button className="btn" onClick={() => setUI({ dialog: { kind: 'project' } })}>
              Ajouter un dossier
            </button>
          </p>
          <p style={{ color: '#999' }}>Astuce : glisse un dossier du Finder sur un groupe à gauche.</p>
        </div>
      )}
    </div>
  )
}
