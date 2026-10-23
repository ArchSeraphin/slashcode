import { useEffect, useState } from 'react'
import type { HistoryEntry, Project } from '@shared/types'
import {
  addNote,
  addTask,
  addTasks,
  api,
  newSession,
  patchNote,
  patchTask,
  removeNote,
  removeTask,
  sendToActiveSession,
  setUI,
  splitPastedTasks,
  timeAgo,
  toggleTask,
  useStore,
  type SideTab
} from '../store'
import { Icon } from './Icon'

export function SidePanel({ project }: { project: Project }) {
  const tab = useStore((s) => s.ui.sideTab)
  const tasks = useStore((s) => s.data!.tasks)
  const openCount = tasks.filter((t) => t.projectId === project.id && !t.done).length
  const tabs: { id: SideTab; label: string; icon: 'tasks' | 'notepad' | 'history' }[] = [
    { id: 'tasks', label: openCount ? `Tâches (${openCount})` : 'Tâches', icon: 'tasks' },
    { id: 'notes', label: 'Notes', icon: 'notepad' },
    { id: 'history', label: 'Historique', icon: 'history' }
  ]
  return (
    <aside className="side">
      <div className="side-tabs tabs" style={{ height: 'auto' }}>
        {tabs.map((t) => (
          <div key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setUI({ sideTab: t.id })}>
            <Icon name={t.icon} size={14} />
            <span className="tlabel">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="side-body">
        {tab === 'tasks' && <Tasks project={project} />}
        {tab === 'notes' && <Notes project={project} />}
        {tab === 'history' && <History project={project} />}
      </div>
    </aside>
  )
}

function Tasks({ project }: { project: Project }) {
  const all = useStore((s) => s.data!.tasks)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const tasks = all.filter((t) => t.projectId === project.id)
  const todo = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))

  const submit = () => {
    addTask(project.id, text)
    setText('')
  }

  const item = (t: (typeof tasks)[number]) => (
    <div key={t.id} className={'task' + (t.done ? ' done' : '')}>
      <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
      {editing === t.id ? (
        <textarea
          autoFocus
          defaultValue={t.text}
          rows={3}
          style={{ flex: 1 }}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) patchTask(t.id, { text: v })
            setEditing(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
            if (e.key === 'Escape') setEditing(null)
          }}
        />
      ) : (
        <span className="ttext selectable" onDoubleClick={() => setEditing(t.id)}>
          {t.text}
        </span>
      )}
      <span className="tactions">
        {!t.done && (
          <>
            <button
              className="mini"
              title="Lancer dans une nouvelle session Claude"
              onClick={() => newSession(project.id, { prompt: t.text })}
            >
              <Icon name="play" size={13} />
            </button>
            <button
              className="mini"
              title="Écrire dans la session active (sans valider)"
              onClick={() => sendToActiveSession(project.id, t.text)}
            >
              <Icon name="send" size={13} />
            </button>
          </>
        )}
        <button className="mini" title="Supprimer" onClick={() => removeTask(t.id)}>
          <Icon name="trash" size={13} />
        </button>
      </span>
    </div>
  )

  return (
    <>
      <div className="task-input">
        <input
          type="text"
          placeholder="Nouvelle tâche, puis Entrée"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          onPaste={(e) => {
            // A single-line input would flatten a pasted list into one task:
            // several lines become several tasks instead.
            const pasted = e.clipboardData.getData('text')
            if (!/[\r\n]/.test(pasted.trim())) return
            const lines = splitPastedTasks(pasted)
            if (!lines.length) return
            e.preventDefault()
            addTasks(project.id, lines)
          }}
        />
        <button className="btn small" onClick={submit} disabled={!text.trim()}>
          Ajouter
        </button>
      </div>
      <div className="list">
        {!todo.length && !done.length && (
          <div className="empty">
            Aucune tâche.
            <br />
            Le bouton <Icon name="play" size={12} /> d’une tâche la lance directement dans une nouvelle session.
          </div>
        )}
        {todo.map(item)}
        {done.length > 0 && (
          <button className="list-sep" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Terminées ({done.length})
          </button>
        )}
        {showDone && done.map(item)}
      </div>
    </>
  )
}

function Notes({ project }: { project: Project }) {
  const all = useStore((s) => s.data!.notes)
  const notes = all.filter((n) => n.projectId === project.id).sort((a, b) => b.updatedAt - a.updatedAt)
  const [selected, setSelected] = useState<string | null>(null)
  const note = notes.find((n) => n.id === selected) ?? notes[0]

  useEffect(() => setSelected(null), [project.id])

  if (!note) {
    return (
      <div className="empty">
        <Icon name="notepad" size={32} />
        <p>Pas encore de note pour ce projet.</p>
        <button className="btn" onClick={() => setSelected(addNote(project.id).id)}>
          Créer une note
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="note-bar">
        <select value={note.id} onChange={(e) => setSelected(e.target.value)}>
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || 'Sans titre'}
            </option>
          ))}
        </select>
        <button className="mini" title="Nouvelle note" onClick={() => setSelected(addNote(project.id).id)}>
          <Icon name="plus" size={14} />
        </button>
        <button
          className="mini"
          title="Écrire la sélection ou la note dans la session active"
          onClick={() => {
            const ta = document.getElementById('note-area') as HTMLTextAreaElement | null
            const sel = ta && ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : note.body
            sendToActiveSession(project.id, sel)
          }}
        >
          <Icon name="send" size={14} />
        </button>
        <button
          className="mini"
          title="Supprimer la note"
          onClick={() =>
            setUI({
              dialog: {
                kind: 'confirm',
                title: 'Supprimer la note',
                message: `Supprimer « ${note.title || 'Sans titre'} » ?`,
                okLabel: 'Supprimer',
                danger: true,
                onOk: () => removeNote(note.id)
              }
            })
          }
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <input
        key={note.id + '-t'}
        className="note-title"
        type="text"
        defaultValue={note.title}
        placeholder="Titre"
        onChange={(e) => patchNote(note.id, { title: e.target.value })}
      />
      <textarea
        id="note-area"
        key={note.id}
        className="note-area"
        defaultValue={note.body}
        placeholder="Idées, liens, consignes à donner à Claude…"
        onChange={(e) => patchNote(note.id, { body: e.target.value })}
      />
      <div style={{ padding: '0 8px 6px', color: 'var(--faint)' }}>Enregistré automatiquement · modifié {timeAgo(note.updatedAt)}</div>
    </>
  )
}

function History({ project }: { project: Project }) {
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const sessions = useStore((s) => s.data!.sessions)
  const load = () => {
    setItems(null)
    api.history(project.path).then(setItems)
  }
  useEffect(load, [project.path])

  const openIds = new Set(sessions.filter((s) => s.open).map((s) => s.id))
  return (
    <>
      <div className="note-bar">
        <span style={{ flex: 1, color: 'var(--muted)' }}>Conversations Claude de ce dossier</span>
        <button className="mini" title="Actualiser" onClick={load}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      <div className="list">
        {items === null && <div className="empty">Lecture de l’historique…</div>}
        {items?.length === 0 && <div className="empty">Aucune conversation trouvée pour ce dossier.</div>}
        {items?.map((h) => {
          const known = sessions.find((s) => s.id === h.id)
          return (
            <button
              key={h.id}
              className="hist"
              title="Cliquer pour reprendre cette conversation"
              onClick={() => newSession(project.id, { resumeId: h.id, title: known?.title ?? h.title, model: known?.model })}
            >
              <Icon name={openIds.has(h.id) ? 'console' : 'history'} size={18} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="htitle">{known?.title ?? h.title}</div>
                <div className="hmeta">
                  {timeAgo(h.updatedAt)} · {h.sizeKb} Ko{openIds.has(h.id) ? ' · ouverte' : ''}
                </div>
                {h.firstPrompt && h.firstPrompt !== h.title && <div className="hprompt">« {h.firstPrompt} »</div>}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
