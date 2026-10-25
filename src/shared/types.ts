export type ModelId = 'default' | 'fable' | 'opus' | 'sonnet' | 'haiku'
export type PermissionMode = 'default' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions'
export type Effort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const MODELS: { id: ModelId; label: string; hint: string }[] = [
  { id: 'default', label: 'Par défaut', hint: 'Modèle configuré dans Claude Code' },
  { id: 'fable', label: 'Fable', hint: 'Le plus puissant' },
  { id: 'opus', label: 'Opus', hint: 'Exécution sensible, code' },
  { id: 'sonnet', label: 'Sonnet', hint: 'Rapide et polyvalent' },
  { id: 'haiku', label: 'Haiku', hint: 'Tâches mécaniques' }
]

export const PERMISSIONS: { id: PermissionMode; label: string }[] = [
  { id: 'default', label: 'Par défaut' },
  { id: 'auto', label: 'Auto' },
  { id: 'acceptEdits', label: 'Accepter les modifs' },
  { id: 'plan', label: 'Plan' },
  { id: 'bypassPermissions', label: 'Sans autorisation' }
]

export const EFFORTS: Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

export interface Group {
  id: string
  name: string
  collapsed: boolean
}

export interface Project {
  id: string
  name: string
  path: string
  groupId: string | null
  favorite: boolean
  archived: boolean
  color: string
  model: ModelId
  permission: PermissionMode
  createdAt: number
  lastOpenedAt: number
  split?: SplitCount // sessions shown side by side (1 when missing)
}

export type SplitCount = 1 | 2 | 3 | 4

export interface Note {
  id: string
  projectId: string
  title: string
  body: string
  updatedAt: number
}

export interface Task {
  id: string
  projectId: string
  text: string
  done: boolean
  createdAt: number
  doneAt: number | null
}

export type Appearance = 'light' | 'dark' | 'system'

export interface Settings {
  defaultModel: ModelId
  defaultPermission: PermissionMode
  effort: Effort
  claudePath: string
  notifyNative: boolean
  notifySound: boolean
  notifyOnFinish: boolean
  fontSize: number
  consoleTheme: 'xp' | 'luna'
  appearance: Appearance
  phoneEnabled: boolean
  phoneProvider: 'bark' | 'ntfy'
  barkServer: string
  barkKey: string
  phoneServer: string
  phoneTopic: string
  phoneWhen: 'away' | 'always'
  dictationLang: string
  notifyCi: boolean
}

export interface NotifyTestResult {
  native: boolean
  phone: 'off' | 'ok' | string
}

/** A session known to the app: open (live pty) or closed but resumable. */
export interface SessionRecord {
  id: string // also the Claude Code session id (--session-id / --resume)
  projectId: string
  title: string
  model: ModelId
  permission: PermissionMode
  createdAt: number
  lastActiveAt: number
  open: boolean // was open in a tab (used to restore after a restart)
}

export interface AppData {
  version: 1
  groups: Group[]
  projects: Project[]
  notes: Note[]
  tasks: Task[]
  sessions: SessionRecord[]
  settings: Settings
}

/**
 * starting: pty launched, Claude booting
 * ready: Claude waiting for a first prompt
 * working: Claude is thinking / running tools
 * permission: Claude asks for an authorisation
 * done: Claude finished its turn, your move
 * exited: the process ended
 */
export type LiveStatus = 'starting' | 'ready' | 'working' | 'permission' | 'done' | 'exited'

export interface LiveSession {
  id: string
  projectId: string
  status: LiveStatus
  attention: boolean // needs the user and has not been looked at yet
  message: string
  pid: number
  exitCode: number | null
  startedAt: number
  model: ModelId
  detail: string // permission: the pending tool call; done: start of Claude's last reply
  turnMs: number | null
  contextPercent: number | null // from Claude's status line
  costUsd: number | null
}

export interface UsageWindow {
  percent: number
  resetsAt: number | null // ms
}

/** Plan limits as last reported by any session's status line (they are shared by the whole account). */
export interface Usage {
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  updatedAt: number
}

export interface HistoryEntry {
  id: string
  title: string
  firstPrompt: string
  updatedAt: number
  sizeKb: number
}

export interface DiscoveredFolder {
  path: string
  name: string
  sessions: number
  lastUsedAt: number
  exists: boolean
  known: boolean
}

export interface LaunchOptions {
  projectId: string
  model?: ModelId
  permission?: PermissionMode
  effort?: Effort
  resumeId?: string
  prompt?: string
  title?: string
}

export const DICTATION_LANGS: { id: string; label: string }[] = [
  { id: 'fr-FR', label: 'Français' },
  { id: 'en-US', label: 'Anglais (États-Unis)' },
  { id: 'en-GB', label: 'Anglais (Royaume-Uni)' },
  { id: 'es-ES', label: 'Espagnol' },
  { id: 'de-DE', label: 'Allemand' },
  { id: 'it-IT', label: 'Italien' }
]

export type DictationEvent =
  | { type: 'installing' }
  | { type: 'ready'; engine?: string }
  | { type: 'level'; value: number }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; code: string; message: string }

/** A check, a workflow run or a job, reduced to what the UI draws. */
export type CiState = 'success' | 'failure' | 'pending' | 'neutral'

export interface GhPull {
  number: number
  title: string
  author: string
  branch: string
  draft: boolean
  review: 'approved' | 'changes' | 'required' | null
  checks: CiState | null // null: no checks on this PR
  failing: string[] // names of the failing checks
  url: string
  updatedAt: number
}

export interface GhRun {
  id: number
  workflow: string
  title: string
  branch: string
  event: string
  state: CiState
  running: boolean // queued or in progress
  url: string
  startedAt: number
  updatedAt: number
}

export interface GhJob {
  id: number
  name: string
  state: CiState
  running: boolean
  url: string
  failedSteps: string[]
}

/**
 * no-gh: the GitHub CLI is not installed; no-auth: it is not logged in;
 * no-repo: the folder has no GitHub remote (the panel tab is hidden).
 */
export interface GhStatus {
  state: 'loading' | 'ok' | 'no-gh' | 'no-auth' | 'no-repo' | 'error'
  repo: string // owner/name
  branch: string // the local branch checked out in the folder
  prs: GhPull[]
  runs: GhRun[]
  error: string
  updatedAt: number
}

export const ATTENTION_STATUSES: LiveStatus[] = ['permission', 'done']
