import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import * as pty from 'node-pty'
import type { Effort, LiveSession, LiveStatus, ModelId, PermissionMode, Usage, UsageWindow } from '@shared/types'

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'] as const
type HookEvent = (typeof HOOK_EVENTS)[number]

const SCROLLBACK_LIMIT = 400_000 // characters kept per session to repaint a terminal

interface Live {
  info: LiveSession
  proc: pty.IPty
  buffer: string
  lastDataAt: number
  lastTool: string // what Claude was about to do, shown with permission requests
  turnStartedAt: number
}

/** One readable line describing a tool call: the command, the file, the URL… */
function describeTool(name: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const pick = (...keys: string[]) => keys.map((k) => i[k]).find((v) => typeof v === 'string' && v) as string | undefined
  const clip = (s: string) => {
    const one = s.replace(/\s+/g, ' ').trim()
    return one.length > 160 ? one.slice(0, 157) + '…' : one
  }
  const home = homedir()
  const short = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)
  const detail = pick('command') ?? (pick('file_path', 'notebook_path', 'path') && short(pick('file_path', 'notebook_path', 'path')!)) ?? pick('url', 'description', 'prompt', 'pattern', 'query')
  return detail ? `${name} : ${clip(detail)}` : name
}

// Claude's spinner repaints constantly while it works, so a long silence means
// the turn ended without a Stop hook (interrupted with Esc, for instance).
const SILENCE_MS = 20_000

export interface SpawnRequest {
  id: string
  projectId: string
  cwd: string
  claudePath: string
  model: ModelId
  permission: PermissionMode
  effort: Effort
  resume: boolean
  prompt?: string
  cols: number
  rows: number
}

export interface SessionEvents {
  onData(id: string, data: string): void
  onUpdate(info: LiveSession): void
  onHook(info: LiveSession, event: HookEvent, payload: Record<string, unknown>): void
  onUsage(usage: Usage): void
}

function shq(s: string): string {
  return "'" + s.replace(/'/g, `'\\''`) + "'"
}

/** The user's own status line, so SlashCode can relay its input without replacing it. */
function userStatusLine(): Record<string, unknown> | null {
  try {
    const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const s = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))?.statusLine
    return s && s.type === 'command' && typeof s.command === 'string' ? s : null
  } catch {
    return null
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Claude reports resets_at as epoch seconds or as an ISO date depending on the source. */
function usageWindow(v: unknown): UsageWindow | null {
  const w = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null
  const percent = num(w?.used_percentage)
  if (percent === null) return null
  const r = w!.resets_at
  let resetsAt: number | null = null
  if (typeof r === 'number') resetsAt = r < 1e12 ? r * 1000 : r
  else if (typeof r === 'string' && !Number.isNaN(Date.parse(r))) resetsAt = Date.parse(r)
  return { percent, resetsAt }
}

export class SessionManager {
  private sessions = new Map<string, Live>()
  private server: Server | null = null
  private port = 0
  private token = randomBytes(16).toString('hex')
  private usage: Usage | null = null

  constructor(private events: SessionEvents) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const match = url.pathname.match(/^\/hook\/([A-Za-z]+)$/)
      const status = url.pathname === '/status'
      if (req.method !== 'POST' || (!match && !status) || url.searchParams.get('t') !== this.token) {
        res.writeHead(404).end()
        return
      }
      let body = ''
      req.on('data', (c) => {
        body += c
        if (body.length > 1_000_000) req.destroy()
      })
      req.on('end', () => {
        res.writeHead(204).end()
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(body || '{}')
        } catch {
          // Claude always sends JSON, ignore anything else
        }
        const sid = url.searchParams.get('sid') ?? ''
        if (status) this.handleStatus(sid, payload)
        else this.handleHook(sid, match![1] as HookEvent, payload)
      })
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    const addr = this.server.address()
    this.port = typeof addr === 'object' && addr ? addr.port : 0
    setInterval(() => this.checkSilence(), 5_000).unref()
  }

  private checkSilence(): void {
    const now = Date.now()
    for (const live of this.sessions.values()) {
      if (live.info.status === 'working' && now - live.lastDataAt > SILENCE_MS) {
        live.info.status = 'ready'
        live.info.message = 'En pause'
        this.events.onUpdate({ ...live.info })
      }
    }
  }

  private hookSettings(): string {
    const hooks: Record<string, unknown[]> = {}
    for (const ev of HOOK_EVENTS) {
      const command =
        `[ -n "$SLASHCODE_PORT" ] && curl -s -m 2 -o /dev/null -X POST -H 'Content-Type: application/json' ` +
        `--data-binary @- "http://127.0.0.1:$SLASHCODE_PORT/hook/${ev}?sid=$SLASHCODE_SID&t=$SLASHCODE_TOKEN"; exit 0`
      const matcher = ev === 'PreToolUse' || ev === 'PostToolUse' ? { matcher: '*' } : {}
      hooks[ev] = [{ ...matcher, hooks: [{ type: 'command', command, timeout: 5 }] }]
    }
    // Claude feeds the status line a JSON with the plan limits and the context fill: send a copy
    // to SlashCode in the background, then hand it to the user's own status line, if any.
    const relay =
      `input=$(cat); [ -n "$SLASHCODE_PORT" ] && printf '%s' "$input" | curl -s -m 2 -o /dev/null -X POST ` +
      `-H 'Content-Type: application/json' --data-binary @- ` +
      `"http://127.0.0.1:$SLASHCODE_PORT/status?sid=$SLASHCODE_SID&t=$SLASHCODE_TOKEN" >/dev/null 2>&1 &`
    const own = userStatusLine()
    const command = own ? `${relay} printf '%s' "$input" | /bin/sh -c ${shq(own.command as string)}` : `${relay} exit 0`
    return JSON.stringify({ hooks, statusLine: { ...own, type: 'command', command } })
  }

  private handleStatus(sid: string, payload: Record<string, unknown>): void {
    const live = this.sessions.get(sid)
    if (live) {
      const ctx = payload.context_window as Record<string, unknown> | undefined
      const cost = payload.cost as Record<string, unknown> | undefined
      const contextPercent = num(ctx?.used_percentage)
      const costUsd = num(cost?.total_cost_usd)
      if (contextPercent !== live.info.contextPercent || costUsd !== live.info.costUsd) {
        live.info.contextPercent = contextPercent
        live.info.costUsd = costUsd
        this.events.onUpdate({ ...live.info })
      }
    }
    const limits = payload.rate_limits as Record<string, unknown> | undefined
    const fiveHour = usageWindow(limits?.five_hour)
    const sevenDay = usageWindow(limits?.seven_day)
    if (!fiveHour && !sevenDay) return
    const same = (a: UsageWindow | null | undefined, b: UsageWindow | null) =>
      a?.percent === b?.percent && a?.resetsAt === b?.resetsAt
    const unchanged = same(this.usage?.fiveHour, fiveHour) && same(this.usage?.sevenDay, sevenDay)
    // The status line refreshes often: only pass on changes, plus a heartbeat for "updated at".
    if (unchanged && Date.now() - this.usage!.updatedAt < 60_000) return
    this.usage = { fiveHour, sevenDay, updatedAt: Date.now() }
    this.events.onUsage(this.usage)
  }

  private handleHook(sid: string, event: HookEvent, payload: Record<string, unknown>): void {
    const live = this.sessions.get(sid)
    if (!live) return
    const info = live.info
    let status: LiveStatus = info.status
    let message = info.message
    switch (event) {
      case 'SessionStart':
        if (info.status === 'starting') status = 'ready'
        message = 'Prête'
        break
      case 'UserPromptSubmit':
        status = 'working'
        message = 'Claude travaille…'
        live.turnStartedAt = Date.now()
        break
      case 'PreToolUse':
        live.lastTool = describeTool(String(payload.tool_name ?? 'Outil'), payload.tool_input)
        break
      case 'PostToolUse':
        if (info.status !== 'working') {
          status = 'working'
          message = 'Claude travaille…'
        }
        break
      case 'Notification': {
        const text = String(payload.message ?? '')
        const kind = String(payload.notification_type ?? '')
        if (kind === 'idle_prompt' || /waiting for your input/i.test(text)) {
          // Claude already said it was done; only escalate if we missed the Stop.
          if (info.status === 'working') status = 'done'
          message = 'Attend ta réponse'
        } else {
          status = 'permission'
          message = text ? frenchNotification(text) : 'Demande une autorisation'
          info.detail = live.lastTool
        }
        break
      }
      case 'Stop':
        status = 'done'
        message = 'Terminé, à toi de jouer'
        info.turnMs = live.turnStartedAt ? Date.now() - live.turnStartedAt : null
        info.detail = ''
        break
      case 'SessionEnd':
        break
    }
    const changed = status !== info.status
    info.status = status
    info.message = message
    if (changed && (status === 'permission' || status === 'done')) info.attention = true
    if (status === 'working') info.attention = false
    this.events.onUpdate({ ...info })
    if (changed) this.events.onHook({ ...info }, event, payload)
  }

  spawn(req: SpawnRequest): LiveSession {
    this.kill(req.id)
    const args: string[] = []
    if (req.resume) args.push('--resume', req.id)
    else args.push('--session-id', req.id)
    if (req.model !== 'default') args.push('--model', req.model)
    if (req.permission !== 'default') args.push('--permission-mode', req.permission)
    if (req.effort !== 'default') args.push('--effort', req.effort)
    args.push('--settings', this.hookSettings())
    if (req.prompt) args.push(req.prompt)

    const shell = process.env.SHELL || '/bin/zsh'
    const cmd = `exec ${shq(req.claudePath || 'claude')} ${args.map(shq).join(' ')}`
    const cwd = existsSync(req.cwd) ? req.cwd : homedir()
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v
    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'SlashCode',
      LANG: env.LANG || 'fr_FR.UTF-8',
      SLASHCODE_SID: req.id,
      SLASHCODE_PORT: String(this.port),
      SLASHCODE_TOKEN: this.token
    })
    delete env.ELECTRON_RUN_AS_NODE
    // When SlashCode itself was started from a Claude session, Claude's markers would leak into the
    // child and make it think it is a sub-agent. The login shell re-exports anything set in ~/.zshrc.
    for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k]

    const proc = pty.spawn(shell, ['-l', '-i', '-c', cmd], {
      name: 'xterm-256color',
      cols: Math.max(20, req.cols),
      rows: Math.max(5, req.rows),
      cwd,
      env
    })
    const info: LiveSession = {
      id: req.id,
      projectId: req.projectId,
      status: 'starting',
      attention: false,
      message: 'Démarrage…',
      pid: proc.pid,
      exitCode: null,
      startedAt: Date.now(),
      model: req.model,
      detail: '',
      turnMs: null,
      contextPercent: null,
      costUsd: null
    }
    const live: Live = { info, proc, buffer: '', lastDataAt: Date.now(), lastTool: '', turnStartedAt: 0 }
    this.sessions.set(req.id, live)

    proc.onData((data) => {
      live.lastDataAt = Date.now()
      live.buffer += data
      if (live.buffer.length > SCROLLBACK_LIMIT) live.buffer = live.buffer.slice(-SCROLLBACK_LIMIT * 0.8)
      this.events.onData(req.id, data)
    })
    proc.onExit(({ exitCode }) => {
      if (this.sessions.get(req.id) !== live) return
      info.status = 'exited'
      info.exitCode = exitCode
      info.attention = false
      info.message = exitCode === 0 ? 'Session fermée' : `Arrêtée (code ${exitCode})`
      this.events.onUpdate({ ...info })
    })
    this.events.onUpdate({ ...info })
    return { ...info }
  }

  write(id: string, data: string): void {
    const live = this.sessions.get(id)
    if (live && live.info.status !== 'exited') live.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const live = this.sessions.get(id)
    if (!live || live.info.status === 'exited') return
    try {
      live.proc.resize(Math.max(20, cols), Math.max(5, rows))
    } catch {
      // the process may have just exited
    }
  }

  buffer(id: string): string {
    return this.sessions.get(id)?.buffer ?? ''
  }

  acknowledge(id: string): void {
    const live = this.sessions.get(id)
    if (!live || !live.info.attention) return
    live.info.attention = false
    this.events.onUpdate({ ...live.info })
  }

  kill(id: string): void {
    const live = this.sessions.get(id)
    if (!live) return
    this.sessions.delete(id)
    if (live.info.status !== 'exited') {
      try {
        live.proc.kill()
      } catch {
        // already gone
      }
    }
  }

  forget(id: string): void {
    this.kill(id)
  }

  list(): LiveSession[] {
    return [...this.sessions.values()].map((l) => ({ ...l.info }))
  }

  runningCount(): number {
    return [...this.sessions.values()].filter((l) => l.info.status !== 'exited').length
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
    this.server?.close()
  }
}

function frenchNotification(text: string): string {
  const m = text.match(/permission to use (.+)$/i)
  if (m) return `Demande l'autorisation : ${m[1]}`
  return text
}
