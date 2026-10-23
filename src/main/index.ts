import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell } from 'electron'
import { execFile } from 'child_process'
import { closeSync, existsSync, openSync, readSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Store } from './store'
import { SessionManager } from './sessions'
import { discoverFolders, encodeProjectDir, lastReply, listHistory } from './history'
import { pushPhone } from './push'
import type { AppData, LaunchOptions, LiveSession, NotifyTestResult } from '@shared/types'

app.setName('SlashCode')
// Lets tests run against a throwaway data folder.
if (process.env.SLASHCODE_USERDATA) app.setPath('userData', process.env.SLASHCODE_USERDATA)

let win: BrowserWindow | null = null
let store: Store
let quitting = false
// What the user is looking at right now, to avoid notifying about it.
let visibleSessionId: string | null = null

const sessions = new SessionManager({
  onData(id, data) {
    win?.webContents.send('session:data', id, data)
  },
  onUpdate(info) {
    win?.webContents.send('session:update', info)
    refreshBadge()
  },
  onHook(info, event, payload) {
    if (info.status === 'permission' || (info.status === 'done' && event === 'Stop')) notify(info, payload)
  }
})

function projectOf(info: LiveSession) {
  return store.data.projects.find((p) => p.id === info.projectId)
}

let screenLocked = false
const AWAY_IDLE_SECONDS = 120

/** Away from the Mac: screen locked, or no keyboard/mouse activity for two minutes. */
function isAway(): boolean {
  return screenLocked || powerMonitor.getSystemIdleTime() >= AWAY_IDLE_SECONDS
}

function showNative(title: string, subtitle: string | undefined, body: string, sessionId?: string): boolean {
  if (!Notification.isSupported()) return false
  const n = new Notification({ title, subtitle, body, silent: true })
  n.on('click', () => {
    showWindow()
    if (sessionId) win?.webContents.send('ui:goto', sessionId)
  })
  n.show()
  return true
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 1000) return ''
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} s`
  const min = Math.floor(sec / 60)
  return min < 60 ? `${min} min ${String(sec % 60).padStart(2, '0')} s` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

const MODEL_LABEL: Record<string, string> = { default: '', fable: 'Fable', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }

function notify(info: LiveSession, payload: Record<string, unknown>): void {
  const settings = store.data.settings
  if (info.status === 'done' && !settings.notifyOnFinish) return
  const away = isAway()
  const looking = !away && win?.isFocused() && visibleSessionId === info.id
  if (looking) {
    sessions.acknowledge(info.id)
    return
  }
  const project = projectOf(info)
  const record = store.data.sessions.find((s) => s.id === info.id)
  const title = project ? project.name : 'SlashCode'
  const subtitle = record?.title ?? ''
  const permission = info.status === 'permission'

  // The transcript is written right after the Stop hook fires, so give it a moment.
  setTimeout(
    () => {
      const meta = [MODEL_LABEL[info.model], formatDuration(info.turnMs)].filter(Boolean).join(' · ')
      let body: string
      if (permission) {
        body = info.message + (info.detail ? `\n${info.detail}` : '')
      } else {
        const reply = typeof payload.transcript_path === 'string' ? lastReply(payload.transcript_path) : ''
        body = (reply || 'Claude a terminé, à toi de jouer.') + (meta ? `\n${meta}` : '')
      }
      win?.webContents.send('ui:balloon', { ...info, detail: body })
      if (settings.notifyNative) showNative(title, subtitle, body, info.id)
      if (settings.phoneEnabled && (settings.phoneWhen === 'always' || away)) {
        void pushPhone(settings, { kind: permission ? 'permission' : 'done', title, subtitle, body, group: title })
      }
    },
    permission ? 0 : 700
  )
}

function refreshBadge(): void {
  const count = sessions.list().filter((s) => s.attention).length
  if (process.platform === 'darwin') app.dock?.setBadge(count ? String(count) : '')
}

function showWindow(): void {
  if (!win) createWindow()
  if (win?.isMinimized()) win.restore()
  win?.show()
  win?.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#3a6ea5',
    title: 'SlashCode',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('maximize', () => win?.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win?.webContents.send('win:maximized', false))
  win.on('focus', () => {
    win?.webContents.send('win:focus', true)
    if (visibleSessionId) sessions.acknowledge(visibleSessionId)
  })
  win.on('blur', () => win?.webContents.send('win:focus', false))
  win.on('close', (e) => {
    if (quitting) return
    const running = sessions.runningCount()
    if (running > 0) {
      const choice = dialog.showMessageBoxSync(win!, {
        type: 'warning',
        buttons: ['Garder en arrière-plan', 'Quitter', 'Annuler'],
        defaultId: 0,
        cancelId: 2,
        title: 'Fermer SlashCode',
        message: `${running} session${running > 1 ? 's' : ''} Claude en cours.`,
        detail:
          'En arrière-plan, les sessions continuent et les notifications arrivent toujours (clic sur l’icône du Dock pour revenir). ' +
          'Si tu quittes, elles seront arrêtées et tu pourras les reprendre au prochain lancement.'
      })
      if (choice !== 1) {
        e.preventDefault()
        if (choice === 0) win?.hide()
        return
      }
    }
    quitting = true
    store.flush()
    sessions.killAll()
    app.quit()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildMenu(): void {
  const send = (channel: string) => () => win?.webContents.send('menu', channel)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'SlashCode',
        submenu: [
          { role: 'about', label: 'À propos de SlashCode' },
          { type: 'separator' },
          { label: 'Paramètres…', accelerator: 'Cmd+,', click: send('settings') },
          { type: 'separator' },
          { role: 'hide', label: 'Masquer SlashCode' },
          { role: 'hideOthers', label: 'Masquer les autres' },
          { type: 'separator' },
          { role: 'quit', label: 'Quitter SlashCode' }
        ]
      },
      {
        label: 'Fichier',
        submenu: [
          { label: 'Nouvelle session', accelerator: 'Cmd+T', click: send('new-session') },
          { label: 'Nouveau projet…', accelerator: 'Cmd+Shift+N', click: send('new-project') },
          { label: 'Importer depuis Claude…', accelerator: 'Cmd+I', click: send('import') },
          { type: 'separator' },
          { label: 'Fermer la session', accelerator: 'Cmd+W', click: send('close-session') }
        ]
      },
      {
        label: 'Édition',
        submenu: [
          { role: 'undo', label: 'Annuler' },
          { role: 'redo', label: 'Rétablir' },
          { type: 'separator' },
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { role: 'selectAll', label: 'Tout sélectionner' }
        ]
      },
      {
        label: 'Affichage',
        submenu: [
          { label: 'Exécuter… (aller à)', accelerator: 'Cmd+K', click: send('palette') },
          { label: 'Poste de travail', accelerator: 'Cmd+Shift+H', click: send('home') },
          { label: 'Afficher/masquer le volet Notes', accelerator: 'Cmd+J', click: send('toggle-side') },
          { type: 'separator' },
          { label: 'Session précédente', accelerator: 'Cmd+Shift+[', click: send('prev-session') },
          { label: 'Session suivante', accelerator: 'Cmd+Shift+]', click: send('next-session') },
          { label: 'Prochaine session en attente', accelerator: 'Cmd+Shift+A', click: send('next-attention') },
          { type: 'separator' },
          { role: 'zoomIn', label: 'Agrandir' },
          { role: 'zoomOut', label: 'Réduire' },
          { role: 'resetZoom', label: 'Taille réelle' },
          { role: 'togglefullscreen', label: 'Plein écran' },
          { role: 'toggleDevTools', label: 'Outils de développement' }
        ]
      },
      { role: 'windowMenu', label: 'Fenêtre' }
    ])
  )
}

function transcriptPath(cwd: string, id: string): string {
  return join(homedir(), '.claude', 'projects', encodeProjectDir(cwd), id + '.jsonl')
}

function transcriptTitle(cwd: string, id: string): string | null {
  const file = transcriptPath(cwd, id)
  if (!existsSync(file)) return null
  // Titles are rewritten as the conversation goes, so the newest one sits near the end.
  const size = statSync(file).size
  const fd = openSync(file, 'r')
  const len = Math.min(size, 256 * 1024)
  const buf = Buffer.alloc(len)
  readSync(fd, buf, 0, len, size - len)
  closeSync(fd)
  const text = buf.toString('utf8')
  let title: string | null = null
  for (const m of text.matchAll(/"(?:customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"/g)) title = m[1]
  if (!title) return null
  try {
    return JSON.parse('"' + title + '"')
  } catch {
    return title
  }
}

function pollTitles(): void {
  for (const live of sessions.list()) {
    const record = store.data.sessions.find((s) => s.id === live.id)
    const project = store.data.projects.find((p) => p.id === live.projectId)
    if (!record || !project) continue
    const title = transcriptTitle(project.path, live.id)
    if (title && title !== record.title) win?.webContents.send('session:title', live.id, title)
  }
}

function registerIpc(): void {
  ipcMain.handle('data:load', () => store.data)
  ipcMain.on('data:save', (_e, data: AppData) => store.replace(data))

  ipcMain.handle('session:spawn', (_e, opts: LaunchOptions & { id: string; cols: number; rows: number }) => {
    const project = store.data.projects.find((p) => p.id === opts.projectId)
    if (!project) throw new Error('Projet introuvable')
    const s = store.data.settings
    return sessions.spawn({
      id: opts.id,
      projectId: project.id,
      cwd: project.path,
      claudePath: s.claudePath,
      model: opts.model ?? project.model,
      permission: opts.permission ?? project.permission,
      effort: opts.effort ?? s.effort,
      // A session closed before its first prompt has no transcript: start it fresh with the same id.
      resume: Boolean(opts.resumeId) && existsSync(transcriptPath(project.path, opts.id)),
      prompt: opts.prompt,
      cols: opts.cols,
      rows: opts.rows
    })
  })
  ipcMain.on('session:write', (_e, id: string, data: string) => sessions.write(id, data))
  ipcMain.on('session:resize', (_e, id: string, cols: number, rows: number) => sessions.resize(id, cols, rows))
  ipcMain.handle('session:buffer', (_e, id: string) => sessions.buffer(id))
  ipcMain.handle('session:list', () => sessions.list())
  ipcMain.on('session:kill', (_e, id: string) => {
    sessions.kill(id)
    refreshBadge()
  })
  ipcMain.on('session:ack', (_e, id: string) => sessions.acknowledge(id))
  ipcMain.on('ui:visible', (_e, id: string | null) => {
    visibleSessionId = id
    if (id && win?.isFocused()) sessions.acknowledge(id)
  })

  ipcMain.handle('history:list', (_e, path: string) => listHistory(path))
  ipcMain.handle('history:discover', () => discoverFolders(new Set(store.data.projects.map((p) => p.path))))

  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Choisir un dossier de travail',
      buttonLabel: 'Ajouter',
      properties: ['openDirectory', 'createDirectory', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('fs:exists', (_e, path: string) => existsSync(path))
  ipcMain.on('open:finder', (_e, path: string) => shell.openPath(path))
  ipcMain.on('open:app', (_e, appName: string, path: string) => {
    execFile('open', ['-a', appName, path], (err) => {
      if (err) dialog.showErrorBox('Ouverture impossible', `${appName} n'a pas pu ouvrir ce dossier.`)
    })
  })
  ipcMain.on('open:url', (_e, url: string) => shell.openExternal(url))
  ipcMain.on('open:notification-settings', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
  )
  ipcMain.handle('notify:test', async (_e, phone: boolean): Promise<NotifyTestResult> => {
    const native = showNative('SlashCode', 'Notification de test', 'Les notifications fonctionnent sur ce Mac.')
    const result = phone
      ? await pushPhone(store.data.settings, {
          kind: 'test',
          title: 'SlashCode',
          subtitle: 'Notification de test',
          body: 'Les notifications arrivent bien sur ton iPhone.',
          group: 'SlashCode'
        })
      : 'off'
    return { native, phone: result }
  })

  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
  ipcMain.handle('win:state', () => ({ maximized: win?.isMaximized() ?? false, focused: win?.isFocused() ?? false }))
}

app.whenReady().then(async () => {
  store = new Store()
  await sessions.start()
  registerIpc()
  buildMenu()
  if (process.platform === 'darwin') {
    const icon = join(__dirname, '../../build/icon.png')
    if (existsSync(icon)) app.dock?.setIcon(nativeImage.createFromPath(icon))
  }
  powerMonitor.on('lock-screen', () => (screenLocked = true))
  powerMonitor.on('unlock-screen', () => (screenLocked = false))
  createWindow()
  setInterval(pollTitles, 12_000).unref()
  app.on('activate', showWindow)
})

// Cmd+Q closes the window first, so its close handler asks for confirmation.
app.on('window-all-closed', () => {
  if (quitting) app.quit()
})
