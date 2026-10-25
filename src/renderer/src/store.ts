import { useSyncExternalStore } from 'react'
import type { Api } from '../../preload'
import type {
  AppData,
  DictationEvent,
  GhStatus,
  Group,
  LaunchOptions,
  LiveSession,
  Note,
  Project,
  SessionRecord,
  SplitCount,
  Task,
  Usage
} from '@shared/types'

declare global {
  interface Window {
    api: Api
  }
}
export const api = window.api

export type DialogState =
  | { kind: 'settings' }
  | { kind: 'import'; firstRun?: boolean }
  | { kind: 'project'; projectId?: string; path?: string }
  | { kind: 'group'; groupId?: string }
  | { kind: 'palette' }
  | { kind: 'shortcuts' }
  | {
      kind: 'confirm'
      title: string
      message: string
      detail?: string
      okLabel: string
      danger?: boolean
      onOk: () => void
    }

export type SideTab = 'tasks' | 'notes' | 'history' | 'github'

export interface Balloon {
  sessionId?: string
  projectId?: string // a finished CI run: the balloon opens the project's GitHub tab
  title: string
  body: string
  tone: 'warning' | 'done' | 'success' | 'error'
}

export interface Dictation {
  sessionId: string
  // starting: waiting for the microphone; listening: recording; stopping: flushing the last words;
  // editing: the text can be corrected before it goes into the prompt
  phase: 'starting' | 'listening' | 'stopping' | 'editing' | 'error'
  text: string
  level: number
  installing: boolean // the language model is being downloaded
  error: string
  then: 'insert' | 'send' | null // what to do once the final text arrives
}

export interface UIState {
  view: 'home' | 'project'
  projectId: string | null
  activeSession: Record<string, string> // projectId -> sessionId (the focused pane)
  panes: Record<string, string[]> // projectId -> sessions on screen, pane by pane
  sideTab: SideTab
  sideOpen: boolean
  dialog: DialogState | null
  startOpen: boolean
  balloon: Balloon | null
  focused: boolean
  maximized: boolean
  search: string
  dictation: Dictation | null
}

export interface State {
  data: AppData | null
  live: Record<string, LiveSession>
  usage: Usage | null
  github: Record<string, GhStatus> // projectId -> last status fetched this run
  ui: UIState
}

let state: State = {
  data: null,
  live: {},
  usage: null,
  github: {},
  ui: {
    view: 'home',
    projectId: null,
    activeSession: {},
    panes: {},
    sideTab: 'tasks',
    sideOpen: true,
    dialog: null,
    startOpen: false,
    balloon: null,
    focused: true,
    maximized: false,
    search: '',
    dictation: null
  }
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getState(): State {
  return state
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => select(state)
  )
}

export function setUI(patch: Partial<UIState> | ((ui: UIState) => Partial<UIState>)): void {
  const p = typeof patch === 'function' ? patch(state.ui) : patch
  state = { ...state, ui: { ...state.ui, ...p } }
  emit()
}

export function updateData(fn: (d: AppData) => AppData): void {
  if (!state.data) return
  const next = fn(state.data)
  state = { ...state, data: next }
  api.saveData(next)
  emit()
}

export function setLive(info: LiveSession): void {
  state = { ...state, live: { ...state.live, [info.id]: info } }
  emit()
}

export function setUsage(usage: Usage): void {
  state = { ...state, usage }
  emit()
}

export function setGithub(projectId: string, status: GhStatus): void {
  state = { ...state, github: { ...state.github, [projectId]: status } }
  emit()
}

export function dropLive(id: string): void {
  if (!state.live[id]) return
  const live = { ...state.live }
  delete live[id]
  state = { ...state, live }
  emit()
}

export async function init(): Promise<void> {
  const [data, live, win, usage, github] = await Promise.all([
    api.loadData(),
    api.listLive(),
    api.winState(),
    api.usage(),
    api.githubAll()
  ])
  const liveMap: Record<string, LiveSession> = {}
  for (const l of live) liveMap[l.id] = l
  state = { ...state, data, live: liveMap, usage, github, ui: { ...state.ui, maximized: win.maximized, focused: win.focused } }
  emit()
  if (!data.projects.length) setUI({ dialog: { kind: 'import', firstRun: true } })
}

/* ---------------- helpers ---------------- */

export const uid = (): string => crypto.randomUUID()

export function projectById(id: string | null | undefined): Project | undefined {
  return state.data?.projects.find((p) => p.id === id)
}

export function openSessionsOf(projectId: string): SessionRecord[] {
  return (state.data?.sessions ?? []).filter((s) => s.projectId === projectId && s.open)
}

export function needsAttention(l: LiveSession | undefined): boolean {
  return Boolean(l && l.attention)
}

/* ---------------- navigation ---------------- */

export function openProject(projectId: string, sessionId?: string): void {
  updateData((d) => ({
    ...d,
    projects: d.projects.map((p) => (p.id === projectId ? { ...p, lastOpenedAt: Date.now() } : p))
  }))
  setUI((ui) => ({
    view: 'project',
    projectId,
    startOpen: false,
    activeSession: sessionId ? { ...ui.activeSession, [projectId]: sessionId } : ui.activeSession
  }))
}

export function openGithub(projectId: string): void {
  openProject(projectId)
  setUI({ sideTab: 'github', sideOpen: true })
}

export function goHome(): void {
  setUI({ view: 'home', startOpen: false })
}

export function gotoSession(sessionId: string): void {
  const rec = state.data?.sessions.find((s) => s.id === sessionId)
  if (!rec) return
  openProject(rec.projectId, sessionId)
  api.ack(sessionId)
}

/** Ordered list of every open session, project by project, for keyboard cycling. */
export function allOpenSessions(): SessionRecord[] {
  const d = state.data
  if (!d) return []
  const order = new Map(d.projects.map((p, i) => [p.id, i]))
  return d.sessions
    .filter((s) => s.open)
    .sort((a, b) => (order.get(a.projectId) ?? 0) - (order.get(b.projectId) ?? 0) || a.createdAt - b.createdAt)
}

/* ---------------- sessions ---------------- */

// Launches waiting for their terminal to be mounted (we need its size first).
export const pendingLaunches = new Map<string, LaunchOptions>()

export function newSession(projectId: string, opts: Omit<LaunchOptions, 'projectId'> = {}): string {
  const project = projectById(projectId)
  if (!project) return ''
  const id = opts.resumeId ?? uid()
  const now = Date.now()
  const model = opts.model ?? project.model
  const existing = state.data?.sessions.find((s) => s.id === id)
  if (existing?.open && state.live[id] && state.live[id].status !== 'exited') {
    openProject(projectId, id)
    return id
  }
  updateData((d) => {
    const rec: SessionRecord = {
      id,
      projectId,
      title: opts.title ?? existing?.title ?? defaultTitle(projectId, opts.prompt),
      model,
      permission: opts.permission ?? project.permission,
      createdAt: existing?.createdAt ?? now,
      lastActiveAt: now,
      open: true
    }
    const sessions = existing ? d.sessions.map((s) => (s.id === id ? rec : s)) : [...d.sessions, rec]
    return { ...d, sessions }
  })
  pendingLaunches.set(id, { ...opts, projectId, model })
  dropLive(id)
  openProject(projectId, id)
  return id
}

function defaultTitle(projectId: string, prompt?: string): string {
  if (prompt) return prompt.replace(/\s+/g, ' ').slice(0, 48)
  const n = (state.data?.sessions ?? []).filter((s) => s.projectId === projectId).length + 1
  return `Session ${n}`
}

/** Restart a closed or interrupted tab in place, resuming its conversation. */
export function resumeInPlace(sessionId: string): void {
  const rec = state.data?.sessions.find((s) => s.id === sessionId)
  if (!rec) return
  newSession(rec.projectId, { resumeId: rec.id, model: rec.model, permission: rec.permission, title: rec.title })
}

export function closeSession(sessionId: string, force = false): void {
  const live = state.live[sessionId]
  const running = live && live.status !== 'exited'
  const doClose = () => {
    if (state.ui.dictation?.sessionId === sessionId) cancelDictation()
    api.kill(sessionId)
    dropLive(sessionId)
    const rec = state.data?.sessions.find((s) => s.id === sessionId)
    updateData((d) => ({
      ...d,
      sessions: d.sessions.map((s) => (s.id === sessionId ? { ...s, open: false, lastActiveAt: Date.now() } : s))
    }))
    if (rec) {
      const remaining = openSessionsOf(rec.projectId)
      setUI((ui) => {
        const activeSession = { ...ui.activeSession }
        if (activeSession[rec.projectId] === sessionId) {
          if (remaining.length) activeSession[rec.projectId] = remaining[remaining.length - 1].id
          else delete activeSession[rec.projectId]
        }
        return { activeSession }
      })
    }
  }
  if (running && live.status === 'working' && !force) {
    setUI({
      dialog: {
        kind: 'confirm',
        title: 'Fermer la session',
        message: 'Claude est en train de travailler dans cette session.',
        detail: 'Elle sera arrêtée. Tu pourras la reprendre depuis l’onglet Historique.',
        okLabel: 'Arrêter et fermer',
        danger: true,
        onOk: doClose
      }
    })
    return
  }
  doClose()
}

export function renameSession(sessionId: string, title: string): void {
  const clean = title.trim()
  if (!clean) return
  updateData((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === sessionId ? { ...s, title: clean } : s)) }))
}

/* ---------------- split view ---------------- */

export function splitOf(project: Project | undefined): SplitCount {
  return project?.split ?? 1
}

export function setSplit(projectId: string, n: SplitCount): void {
  patchProject(projectId, { split: n })
}

/**
 * Which session goes in which pane. Panes keep their session while it stays open, and a
 * closed one is replaced in place; a session brought forward from a hidden tab takes the
 * pane that had the focus. When the layout grows, panes follow the order of the tabs.
 */
export function layoutPanes(
  prev: string[] | undefined,
  tabs: string[],
  active: string | undefined,
  n: number,
  prevActive: string | undefined
): string[] {
  const before = (prev ?? []).slice(0, n)
  const panes: (string | null)[] = before.map((id) => (tabs.includes(id) ? id : null))
  if (active && tabs.includes(active) && !panes.includes(active)) {
    const i = prevActive ? before.indexOf(prevActive) : -1
    const hole = panes.indexOf(null)
    if (i >= 0) panes[i] = active
    else if (hole >= 0) panes[hole] = active
    else if (panes.length < n) panes.push(active)
    else panes[panes.length - 1] = active
  }
  const rest = tabs.filter((id) => !panes.includes(id))
  for (let i = 0; i < panes.length && rest.length; i++) if (!panes[i]) panes[i] = rest.shift()!
  while (panes.length < n && rest.length) panes.push(rest.shift()!)
  const out = panes.filter((id): id is string => Boolean(id))
  if (before.length < n) out.sort((a, b) => tabs.indexOf(a) - tabs.indexOf(b))
  return out
}

export function focusSession(projectId: string, sessionId: string): void {
  if (state.ui.activeSession[projectId] !== sessionId) {
    setUI((ui) => ({ activeSession: { ...ui.activeSession, [projectId]: sessionId } }))
  }
  if (state.live[sessionId]?.attention) api.ack(sessionId)
}

/* ---------------- dictation ---------------- */

/** ⌘D: starts dictating into the focused session, or finishes the dictation under way. */
export function toggleDictation(sessionId?: string): void {
  const d = state.ui.dictation
  if (d) {
    if (d.phase === 'editing') return commitDictation(false)
    if (d.phase === 'error') return cancelDictation()
    return stopDictation('insert')
  }
  const pid = state.ui.view === 'project' ? state.ui.projectId : null
  const sid = sessionId ?? (pid ? state.ui.activeSession[pid] : undefined)
  if (!sid || !state.data) return
  setUI({ dictation: { sessionId: sid, phase: 'starting', text: '', level: 0, installing: false, error: '', then: null } })
  api.dictationStart(state.data.settings.dictationLang)
}

function patchDictation(patch: Partial<Dictation>): void {
  setUI((ui) => (ui.dictation ? { dictation: { ...ui.dictation, ...patch } } : {}))
}

/** Stops listening; the text is then inserted, sent, or left for corrections. */
export function stopDictation(then: Dictation['then'] = null): void {
  const d = state.ui.dictation
  if (!d) return
  if (d.phase === 'starting') return cancelDictation()
  if (d.phase === 'editing') return then ? commitDictation(then === 'send') : undefined
  patchDictation({ phase: 'stopping', then })
  api.dictationStop()
}

export function cancelDictation(): void {
  const d = state.ui.dictation
  if (!d) return
  api.dictationCancel()
  setUI({ dictation: null })
  refocus(d.sessionId)
}

export function editDictation(text: string): void {
  patchDictation({ text })
}

/** Types the dictated text into the session's prompt, and presses Enter when asked to. */
export function commitDictation(send: boolean): void {
  const d = state.ui.dictation
  if (!d) return
  api.dictationCancel()
  setUI({ dictation: null })
  const text = d.text.trim()
  const live = state.live[d.sessionId]
  if (text && live && live.status !== 'exited') {
    api.write(d.sessionId, `\x1b[200~${text}\x1b[201~`)
    // Claude reads a paste and the Enter that follows it as one chunk if they arrive together.
    if (send) setTimeout(() => api.write(d.sessionId, '\r'), 120)
  }
  refocus(d.sessionId)
}

export function onDictationEvent(e: DictationEvent): void {
  const d = state.ui.dictation
  if (!d) return
  switch (e.type) {
    case 'installing':
      return patchDictation({ installing: true })
    case 'ready':
      if (d.phase === 'starting') patchDictation({ phase: 'listening', installing: false })
      return
    case 'level':
      return patchDictation({ level: e.value })
    case 'partial':
      if (d.phase !== 'editing') patchDictation({ text: e.text })
      return
    case 'final':
      if (d.phase === 'editing') return
      patchDictation({ text: e.text, phase: 'editing', level: 0 })
      if (d.then) commitDictation(d.then === 'send')
      return
    case 'error':
      if (d.phase === 'editing') return
      return patchDictation({ phase: 'error', error: e.message, level: 0 })
  }
}

// Set by the terminal module, which imports this one.
let refocus: (sessionId: string) => void = () => {}
export function setRefocus(fn: (sessionId: string) => void): void {
  refocus = fn
}

/* ---------------- projects & groups ---------------- */

const COLORS = ['#2f6be6', '#3cb043', '#f7a537', '#e2552c', '#9b59b6', '#16a2b8', '#d63384', '#7a6f4c']
export const PROJECT_COLORS = COLORS

export function addProjects(paths: string[], groupId: string | null = null): Project[] {
  const d = state.data
  if (!d) return []
  const known = new Set(d.projects.map((p) => p.path))
  const created: Project[] = []
  for (const path of paths) {
    if (known.has(path)) continue
    known.add(path)
    created.push({
      id: uid(),
      name: path.split('/').filter(Boolean).pop() ?? path,
      path,
      groupId,
      favorite: false,
      archived: false,
      color: COLORS[(d.projects.length + created.length) % COLORS.length],
      model: d.settings.defaultModel,
      permission: d.settings.defaultPermission,
      createdAt: Date.now(),
      lastOpenedAt: 0
    })
  }
  if (created.length) updateData((dd) => ({ ...dd, projects: [...dd.projects, ...created] }))
  return created
}

export function patchProject(id: string, patch: Partial<Project>): void {
  updateData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
}

export function removeProject(id: string): void {
  for (const s of openSessionsOf(id)) closeSession(s.id, true)
  updateData((d) => ({
    ...d,
    projects: d.projects.filter((p) => p.id !== id),
    notes: d.notes.filter((n) => n.projectId !== id),
    tasks: d.tasks.filter((t) => t.projectId !== id),
    sessions: d.sessions.filter((s) => s.projectId !== id)
  }))
  if (state.ui.projectId === id) goHome()
}

export function addGroup(name: string): Group {
  const g: Group = { id: uid(), name: name.trim() || 'Nouveau groupe', collapsed: false }
  updateData((d) => ({ ...d, groups: [...d.groups, g] }))
  return g
}

export function patchGroup(id: string, patch: Partial<Group>): void {
  updateData((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
}

export function removeGroup(id: string): void {
  updateData((d) => ({
    ...d,
    groups: d.groups.filter((g) => g.id !== id),
    projects: d.projects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p))
  }))
}

export function moveGroup(id: string, delta: number): void {
  updateData((d) => {
    const i = d.groups.findIndex((g) => g.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= d.groups.length) return d
    const groups = [...d.groups]
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
    return { ...d, groups }
  })
}

/* ---------------- tasks & notes ---------------- */

export function addTask(projectId: string, text: string): void {
  const clean = text.trim()
  if (!clean) return
  const t: Task = { id: uid(), projectId, text: clean, done: false, createdAt: Date.now(), doneAt: null }
  updateData((d) => ({ ...d, tasks: [...d.tasks, t] }))
}

/**
 * One task per non-empty line of pasted text. List markers ("- ", "* ", "• ",
 * "1. ", "[ ] ") are stripped, and lines already ticked ("[x] …", as in a
 * SlashTabs CSV checklist cell) are skipped: there is nothing left to do on them.
 */
export function splitPastedTasks(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '')
    if (/^\[[xX]\]/.test(line)) continue
    line = line.replace(/^\[ \]\s*/, '').trim()
    if (line) out.push(line)
  }
  return out
}

export function addTasks(projectId: string, texts: string[]): void {
  const now = Date.now()
  const added: Task[] = texts
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ id: uid(), projectId, text, done: false, createdAt: now, doneAt: null }))
  if (!added.length) return
  updateData((d) => ({ ...d, tasks: [...d.tasks, ...added] }))
}

export function patchTask(id: string, patch: Partial<Task>): void {
  updateData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

export function toggleTask(id: string): void {
  const t = state.data?.tasks.find((x) => x.id === id)
  if (t) patchTask(id, { done: !t.done, doneAt: t.done ? null : Date.now() })
}

export function removeTask(id: string): void {
  updateData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }))
}

export function addNote(projectId: string): Note {
  const n: Note = { id: uid(), projectId, title: 'Nouvelle note', body: '', updatedAt: Date.now() }
  updateData((d) => ({ ...d, notes: [...d.notes, n] }))
  return n
}

export function patchNote(id: string, patch: Partial<Note>): void {
  updateData((d) => ({
    ...d,
    notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
  }))
}

export function removeNote(id: string): void {
  updateData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }))
}

/** Types text into the active session of a project, without pressing Enter. */
export function sendToActiveSession(projectId: string, text: string): boolean {
  const sid = state.ui.activeSession[projectId]
  const live = sid ? state.live[sid] : undefined
  if (!sid || !live || live.status === 'exited') return false
  // Bracketed paste keeps multi-line text in one prompt instead of submitting each line.
  api.write(sid, `\x1b[200~${text}\x1b[201~`)
  return true
}

/**
 * Hands a prompt to Claude: typed into the project's active session for a last look,
 * or, when none is running, a new session started on it.
 */
export function handToClaude(projectId: string, text: string, title: string): void {
  if (sendToActiveSession(projectId, text)) {
    openProject(projectId)
    refocus(state.ui.activeSession[projectId])
    return
  }
  newSession(projectId, { prompt: text, title })
}

/** Errors thrown in the main process reach us wrapped in Electron's own sentence. */
export function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

/* ---------------- formatting ---------------- */

export function timeAgo(ts: number): string {
  if (!ts) return 'jamais'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.round(h / 24)
  if (days < 7) return `il y a ${days} j`
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function shortPath(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/~\/Library\/CloudStorage\/GoogleDrive-[^/]+\/Drive partagés/, 'Drive partagé')
    .replace(/~\/Library\/CloudStorage\/SynologyDrive-[^/]+/, 'Synology')
}
