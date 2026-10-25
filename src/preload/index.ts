import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppData,
  DictationEvent,
  DiscoveredFolder,
  GhJob,
  GhRun,
  GhStatus,
  HistoryEntry,
  LaunchOptions,
  LiveSession,
  NotifyTestResult,
  Usage
} from '@shared/types'

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  loadData: (): Promise<AppData> => ipcRenderer.invoke('data:load'),
  saveData: (data: AppData) => ipcRenderer.send('data:save', data),

  spawn: (opts: LaunchOptions & { id: string; cols: number; rows: number }): Promise<LiveSession> =>
    ipcRenderer.invoke('session:spawn', opts),
  write: (id: string, data: string) => ipcRenderer.send('session:write', id, data),
  resize: (id: string, cols: number, rows: number) => ipcRenderer.send('session:resize', id, cols, rows),
  buffer: (id: string): Promise<string> => ipcRenderer.invoke('session:buffer', id),
  listLive: (): Promise<LiveSession[]> => ipcRenderer.invoke('session:list'),
  usage: (): Promise<Usage | null> => ipcRenderer.invoke('usage:get'),
  kill: (id: string) => ipcRenderer.send('session:kill', id),
  ack: (id: string) => ipcRenderer.send('session:ack', id),
  setVisible: (id: string | null) => ipcRenderer.send('ui:visible', id),

  dictationStart: (lang: string) => ipcRenderer.send('dictation:start', lang),
  dictationStop: () => ipcRenderer.send('dictation:stop'),
  dictationCancel: () => ipcRenderer.send('dictation:cancel'),
  onDictation: (cb: (e: DictationEvent) => void) => on('dictation:event', cb),

  githubAll: (): Promise<Record<string, GhStatus>> => ipcRenderer.invoke('github:all'),
  githubWatch: (projectId: string | null) => ipcRenderer.send('github:watch', projectId),
  githubRefresh: (projectId: string): Promise<GhStatus> => ipcRenderer.invoke('github:refresh', projectId),
  githubJobs: (projectId: string, runId: number): Promise<GhJob[]> => ipcRenderer.invoke('github:jobs', projectId, runId),
  githubRerun: (projectId: string, run: GhRun): Promise<void> => ipcRenderer.invoke('github:rerun', projectId, run),
  githubCiPrompt: (projectId: string, runId: number): Promise<string> => ipcRenderer.invoke('github:ci-prompt', projectId, runId),
  githubPrPrompt: (projectId: string, num: number): Promise<string> => ipcRenderer.invoke('github:pr-prompt', projectId, num),
  onGithub: (cb: (projectId: string, status: GhStatus) => void) => on('github:status', cb),
  onGithubFinished: (cb: (projectId: string, run: GhRun) => void) => on('github:finished', cb),
  onGithubGoto: (cb: (projectId: string) => void) => on('ui:github', cb),

  history: (path: string): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list', path),
  discover: (): Promise<DiscoveredFolder[]> => ipcRenderer.invoke('history:discover'),

  pickFolders: (): Promise<string[]> => ipcRenderer.invoke('dialog:folder'),
  exists: (path: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', path),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  openFinder: (path: string) => ipcRenderer.send('open:finder', path),
  openApp: (appName: string, path: string) => ipcRenderer.send('open:app', appName, path),
  openUrl: (url: string) => ipcRenderer.send('open:url', url),
  openNotificationSettings: () => ipcRenderer.send('open:notification-settings'),
  testNotify: (phone: boolean): Promise<NotifyTestResult> => ipcRenderer.invoke('notify:test', phone),

  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  winState: (): Promise<{ maximized: boolean; focused: boolean }> => ipcRenderer.invoke('win:state'),

  onData: (cb: (id: string, data: string) => void) => on('session:data', cb),
  onUpdate: (cb: (info: LiveSession) => void) => on('session:update', cb),
  onTitle: (cb: (id: string, title: string) => void) => on('session:title', cb),
  onUsage: (cb: (usage: Usage) => void) => on('usage:update', cb),
  onBalloon: (cb: (info: LiveSession) => void) => on('ui:balloon', cb),
  onGoto: (cb: (id: string) => void) => on('ui:goto', cb),
  onMenu: (cb: (action: string) => void) => on('menu', cb),
  onMaximized: (cb: (v: boolean) => void) => on('win:maximized', cb),
  onFocus: (cb: (v: boolean) => void) => on('win:focus', cb)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
