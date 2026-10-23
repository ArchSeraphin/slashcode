import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { api, getState, pendingLaunches, setLive, setRefocus } from './store'

interface Entry {
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  opened: boolean
}

const entries = new Map<string, Entry>()

export const THEMES: Record<'xp' | 'luna', ITheme> = {
  // The black Command Prompt, with a slightly softer palette for Claude's colours.
  xp: {
    background: '#0c0c0c',
    foreground: '#cccccc',
    cursor: '#cccccc',
    cursorAccent: '#0c0c0c',
    selectionBackground: '#316ac5',
    selectionForeground: '#ffffff',
    black: '#0c0c0c',
    red: '#e74856',
    green: '#16c60c',
    yellow: '#f9f1a5',
    blue: '#3b78ff',
    magenta: '#b4009e',
    cyan: '#61d6d6',
    white: '#cccccc',
    brightBlack: '#767676',
    brightRed: '#ff6b6b',
    brightGreen: '#6ee36a',
    brightYellow: '#ffe66d',
    brightBlue: '#7aa8ff',
    brightMagenta: '#d670d6',
    brightCyan: '#9ff0f0',
    brightWhite: '#f2f2f2'
  },
  luna: {
    background: '#fdfdf8',
    foreground: '#1e1e1e',
    cursor: '#0a246a',
    cursorAccent: '#fdfdf8',
    selectionBackground: '#316ac5',
    selectionForeground: '#ffffff',
    black: '#1e1e1e',
    red: '#c4311b',
    green: '#1d7a22',
    yellow: '#9a6b00',
    blue: '#1f4fbf',
    magenta: '#8b2a9c',
    cyan: '#0f7a86',
    white: '#5a5a5a',
    brightBlack: '#6b6b6b',
    brightRed: '#e2552c',
    brightGreen: '#2a8c2e',
    brightYellow: '#b07b00',
    brightBlue: '#2f6be6',
    brightMagenta: '#a43ab5',
    brightCyan: '#16a2b8',
    brightWhite: '#000000'
  }
}

api.onData((id, data) => entries.get(id)?.term.write(data))
setRefocus((id) => requestAnimationFrame(() => focusTerminal(id)))

function settings() {
  return getState().data!.settings
}

export function ensureTerminal(id: string): Entry {
  let e = entries.get(id)
  if (e) return e
  const s = settings()
  const term = new Terminal({
    fontFamily: "Menlo, 'SF Mono', Monaco, 'Lucida Console', monospace",
    fontSize: s.fontSize,
    lineHeight: 1.12,
    cursorBlink: true,
    scrollback: 8000,
    allowProposedApi: true,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    theme: THEMES[s.consoleTheme]
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_e, url) => api.openUrl(url)))
  const unicode = new Unicode11Addon()
  term.loadAddon(unicode)
  term.unicode.activeVersion = '11'
  term.onData((data) => api.write(id, data))
  term.attachCustomKeyEventHandler((ev) => {
    // Shift+Enter inserts a new line in Claude's prompt, like in iTerm2.
    if (ev.key === 'Enter' && ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
      if (ev.type === 'keydown') api.write(id, '\x1b\r')
      return false
    }
    // Leave Cmd shortcuts to the app menu.
    if (ev.metaKey && ev.key !== 'v' && ev.key !== 'c') return false
    return true
  })
  const el = document.createElement('div')
  el.className = 'term-el'
  el.style.height = '100%'
  e = { term, fit, el, opened: false }
  entries.set(id, e)
  return e
}

export function attach(id: string, host: HTMLElement, replay: boolean): void {
  const e = ensureTerminal(id)
  if (e.el.parentElement !== host) host.appendChild(e.el)
  if (!e.opened) {
    e.term.open(e.el)
    e.opened = true
    if (replay) {
      api.buffer(id).then((buf) => {
        if (buf) e.term.write(buf)
      })
    }
  }
}

/** Fits to the host size. Returns false when the terminal is not visible yet. */
export function fitTerminal(id: string): boolean {
  const e = entries.get(id)
  if (!e || !e.opened || !e.el.offsetWidth || !e.el.offsetHeight) return false
  try {
    e.fit.fit()
  } catch {
    return false
  }
  api.resize(id, e.term.cols, e.term.rows)
  return true
}

export function focusTerminal(id: string): void {
  entries.get(id)?.term.focus()
}

/** Starts the pty for a session once its terminal is on screen. */
export async function tryLaunch(id: string): Promise<void> {
  const opts = pendingLaunches.get(id)
  const e = entries.get(id)
  if (!opts || !e || !e.opened) return
  if (!fitTerminal(id)) return
  pendingLaunches.delete(id)
  e.term.reset()
  try {
    const info = await api.spawn({ ...opts, id, cols: e.term.cols, rows: e.term.rows })
    setLive(info)
    e.term.focus()
  } catch (err) {
    e.term.write(`\r\n\x1b[31mImpossible de lancer Claude : ${(err as Error).message}\x1b[0m\r\n`)
  }
}

export function disposeTerminal(id: string): void {
  const e = entries.get(id)
  if (!e) return
  e.term.dispose()
  e.el.remove()
  entries.delete(id)
}

export function applyTerminalSettings(): void {
  const s = settings()
  for (const [id, e] of entries) {
    e.term.options.fontSize = s.fontSize
    e.term.options.theme = THEMES[s.consoleTheme]
    fitTerminal(id)
  }
}

export function selectionOf(id: string): string {
  return entries.get(id)?.term.getSelection() ?? ''
}
