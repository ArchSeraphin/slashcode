import { execFile } from 'child_process'
import { existsSync } from 'fs'
import type { CiState, GhJob, GhPull, GhRun, GhStatus } from '@shared/types'

// Started from the Finder, the app does not get the shell's PATH: look where Homebrew puts gh.
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => existsSync(p)) ?? 'gh'

class CliError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-gh' | 'no-auth' | 'error'
  ) {
    super(message)
  }
}

function cli(cmd: string, args: string[], cwd: string, timeout = 20_000): Promise<string> {
  const env = { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new CliError(`${cmd} introuvable`, 'no-gh'))
      const msg = (stderr || err.message).trim()
      if (/gh auth login|not logged in|authentication required|HTTP 401/i.test(msg)) return reject(new CliError(msg, 'no-auth'))
      reject(new CliError(msg.split('\n')[0] || 'Commande en échec', 'error'))
    })
  })
}

const gh = (args: string[], cwd: string, timeout?: number) => cli(GH, args, cwd, timeout)

/** owner/name from any GitHub remote URL (https, ssh or scp-like). */
export function parseGithubRemote(url: string): string | null {
  const m = url.trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

async function repoOf(path: string): Promise<{ repo: string; branch: string } | null> {
  if (!existsSync(path)) return null
  let remotes: string
  try {
    remotes = await cli('git', ['remote', '-v'], path)
  } catch {
    return null
  }
  const found = new Map<string, string>()
  for (const line of remotes.split('\n')) {
    const [name, url] = line.split(/\s+/)
    const repo = url ? parseGithubRemote(url) : null
    if (name && repo && !found.has(name)) found.set(name, repo)
  }
  const repo = found.get('origin') ?? found.get('upstream') ?? [...found.values()][0]
  if (!repo) return null
  const branch = (await cli('git', ['rev-parse', '--abbrev-ref', 'HEAD'], path).catch(() => '')).trim()
  return { repo, branch: branch === 'HEAD' ? '' : branch }
}

const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0)

/** Actions vocabulary (lowercase for runs, uppercase for checks) folded into four states. */
export function ciState(status: string | undefined, conclusion: string | undefined): CiState {
  const s = (status ?? '').toLowerCase()
  const c = (conclusion ?? '').toLowerCase()
  if (s && s !== 'completed') return 'pending'
  if (c === 'success') return 'success'
  if (c === 'failure' || c === 'timed_out' || c === 'startup_failure' || c === 'error') return 'failure'
  return 'neutral'
}

interface RollupItem {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

function rollup(items: RollupItem[] | null | undefined): { checks: CiState | null; failing: string[] } {
  if (!items?.length) return { checks: null, failing: [] }
  const states = items.map((i) => {
    // Commit statuses (from outside Actions) only have a state.
    if (i.__typename === 'StatusContext' || (i.state && !i.status)) {
      const st = (i.state ?? '').toLowerCase()
      return st === 'pending' || st === 'expected' ? 'pending' : ciState('completed', st)
    }
    return ciState(i.status, i.conclusion)
  })
  const failing = items.filter((_, k) => states[k] === 'failure').map((i) => i.name || i.context || '?')
  const checks: CiState = states.includes('failure')
    ? 'failure'
    : states.includes('pending')
      ? 'pending'
      : states.includes('success')
        ? 'success'
        : 'neutral'
  return { checks, failing }
}

const REVIEW: Record<string, GhPull['review']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes',
  REVIEW_REQUIRED: 'required'
}

async function fetchPulls(repo: string, cwd: string): Promise<GhPull[]> {
  const out = await gh(
    ['pr', 'list', '-R', repo, '--state', 'open', '--limit', '30', '--json',
      'number,title,author,headRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt,url'],
    cwd
  )
  return (JSON.parse(out) as Record<string, any>[]).map((p) => ({
    number: p.number,
    title: p.title,
    author: p.author?.login ?? '',
    branch: p.headRefName,
    draft: Boolean(p.isDraft),
    review: REVIEW[p.reviewDecision] ?? null,
    ...rollup(p.statusCheckRollup),
    url: p.url,
    updatedAt: time(p.updatedAt)
  }))
}

async function fetchRuns(repo: string, cwd: string): Promise<GhRun[]> {
  const out = await gh(
    ['run', 'list', '-R', repo, '--limit', '20', '--json',
      'databaseId,workflowName,displayTitle,headBranch,event,status,conclusion,url,startedAt,createdAt,updatedAt'],
    cwd
  )
  return (JSON.parse(out) as Record<string, any>[]).map((r) => {
    const state = ciState(r.status, r.conclusion)
    return {
      id: r.databaseId,
      workflow: r.workflowName,
      title: r.displayTitle,
      branch: r.headBranch,
      event: r.event,
      state,
      running: state === 'pending',
      url: r.url,
      startedAt: time(r.startedAt) || time(r.createdAt),
      updatedAt: time(r.updatedAt)
    }
  })
}

export function emptyStatus(state: GhStatus['state'] = 'loading'): GhStatus {
  return { state, repo: '', branch: '', prs: [], runs: [], error: '', updatedAt: Date.now() }
}

export async function fetchStatus(path: string): Promise<GhStatus> {
  const where = await repoOf(path)
  if (!where) return emptyStatus('no-repo')
  try {
    const [prs, runs] = await Promise.all([fetchPulls(where.repo, path), fetchRuns(where.repo, path)])
    return { ...emptyStatus('ok'), ...where, prs, runs }
  } catch (err) {
    const e = err as CliError
    return { ...emptyStatus(e.kind ?? 'error'), ...where, error: e.message }
  }
}

async function needRepo(path: string): Promise<string> {
  const where = await repoOf(path)
  if (!where) throw new Error('Ce dossier n’est pas relié à un dépôt GitHub.')
  return where.repo
}

export async function fetchJobs(path: string, runId: number): Promise<GhJob[]> {
  const repo = await needRepo(path)
  const out = await gh(['run', 'view', String(runId), '-R', repo, '--json', 'jobs'], path)
  return ((JSON.parse(out).jobs ?? []) as Record<string, any>[]).map((j) => {
    const state = ciState(j.status, j.conclusion)
    return {
      id: j.databaseId,
      name: j.name,
      state,
      running: state === 'pending',
      url: j.url,
      failedSteps: ((j.steps ?? []) as Record<string, any>[])
        .filter((s) => ciState(s.status, s.conclusion) === 'failure')
        .map((s) => s.name)
    }
  })
}

/** Reruns only the failed jobs of a failed run; a cancelled one is rerun whole. */
export async function rerun(path: string, run: GhRun): Promise<void> {
  const repo = await needRepo(path)
  const args = ['run', 'rerun', String(run.id), '-R', repo]
  if (run.state === 'failure') args.push('--failed')
  await gh(args, path)
}

const LOG_TAIL = 60
const LINE_MAX = 300
// Each line of --log-failed reads "job<TAB>step<TAB>2026-10-24T21:23:02.1234567Z text".
const LOG_PREFIX = /^([^\t]*)\t[^\t]*\t﻿?(?:\d{4}-\d\d-\d\dT[\d:.]+Z ?)?/
// Colours come either as raw escapes or already spelled out as ^[[33m.
const ANSI = /(?:\x1b|\^\[)\[[0-9;?]*[A-Za-z]/g

/**
 * The end of each failed job's log, where the error almost always is: the runner's own
 * cleanup that follows is dropped, colours and timestamps are stripped.
 */
export function cleanFailedLog(raw: string): Map<string, string[]> {
  const jobs = new Map<string, { lines: string[]; done: boolean }>()
  for (const line of raw.split('\n')) {
    const m = line.match(LOG_PREFIX)
    if (!m) continue
    const job = jobs.get(m[1]) ?? { lines: [], done: false }
    jobs.set(m[1], job)
    if (job.done) continue
    const text = line.slice(m[0].length).replace(ANSI, '').trimEnd()
    if (text === 'Post job cleanup.') {
      job.done = true
      continue
    }
    if (/^##\[(?:end)?group\]/.test(text)) continue
    const clean = text.replace(/^##\[error\]/, 'Erreur : ')
    if (!clean && !job.lines[job.lines.length - 1]) continue
    job.lines.push(clean.length > LINE_MAX ? clean.slice(0, LINE_MAX) + '…' : clean)
  }
  const out = new Map<string, string[]>()
  for (const [name, job] of jobs) out.set(name, job.lines.slice(-LOG_TAIL))
  return out
}

/** A prompt that hands a failed run to Claude, with the end of each failed job's log. */
export async function ciPrompt(path: string, runId: number): Promise<string> {
  const repo = await needRepo(path)
  const id = String(runId)
  const [view, log] = await Promise.all([
    gh(['run', 'view', id, '-R', repo, '--json', 'workflowName,displayTitle,headBranch,url,jobs'], path),
    gh(['run', 'view', id, '-R', repo, '--log-failed'], path, 60_000).catch(() => '')
  ])
  const run = JSON.parse(view)
  const logs = cleanFailedLog(log)
  const parts = [
    `La CI GitHub a échoué : workflow « ${run.workflowName} », run ${id} sur la branche ${run.headBranch} (« ${run.displayTitle} »).`,
    run.url
  ]
  for (const j of (run.jobs ?? []) as Record<string, any>[]) {
    if (ciState(j.status, j.conclusion) !== 'failure') continue
    const steps = ((j.steps ?? []) as Record<string, any>[])
      .filter((s) => ciState(s.status, s.conclusion) === 'failure')
      .map((s) => `« ${s.name} »`)
    parts.push('', `Job « ${j.name} »${steps.length ? `, étape en échec : ${steps.join(', ')}` : ''}`)
    const lines = logs.get(j.name)
    if (lines?.length) parts.push('Fin du log :', '```', ...lines, '```')
  }
  parts.push('', `Trouve la cause de l’échec et corrige-la. Log complet : gh run view ${id} --log-failed`)
  return parts.join('\n')
}

const BODY_MAX = 1500
const isBot = (login: string | undefined, bot?: boolean) => Boolean(bot) || /\[bot\]$/.test(login ?? '')
const oneBody = (s: string | undefined) => {
  const t = (s ?? '').trim()
  return t.length > BODY_MAX ? t.slice(0, BODY_MAX) + '…' : t
}

const REVIEW_STATE: Record<string, string> = {
  APPROVED: 'approuvée',
  CHANGES_REQUESTED: 'changements demandés',
  COMMENTED: 'commentaire'
}

/** A prompt with the review feedback on a PR, or a request to review it when there is none. */
export async function prPrompt(path: string, num: number): Promise<string> {
  const repo = await needRepo(path)
  const n = String(num)
  const [view, inline] = await Promise.all([
    gh(['pr', 'view', n, '-R', repo, '--json', 'number,title,url,headRefName,reviews,comments,statusCheckRollup'], path),
    gh(['api', `repos/${repo}/pulls/${n}/comments?per_page=100`], path).catch(() => '[]')
  ])
  const pr = JSON.parse(view)
  const head = `la PR #${pr.number} « ${pr.title} » (branche ${pr.headRefName})`

  const code = (JSON.parse(inline) as Record<string, any>[])
    .filter((c) => !isBot(c.user?.login, c.user?.type === 'Bot') && oneBody(c.body))
    .map((c) => {
      const line = c.line ?? c.original_line
      return `- ${c.path}${line ? `:${line}` : ''} (${c.user?.login}) : ${oneBody(c.body)}`
    })
  const reviews = ((pr.reviews ?? []) as Record<string, any>[])
    .filter((r) => !isBot(r.author?.login) && (oneBody(r.body) || r.state === 'CHANGES_REQUESTED'))
    .map((r) => `- ${r.author?.login} (${REVIEW_STATE[r.state] ?? r.state.toLowerCase()}) : ${oneBody(r.body) || '(sans texte)'}`)
  const talk = ((pr.comments ?? []) as Record<string, any>[])
    .filter((c) => !isBot(c.author?.login) && oneBody(c.body))
    .map((c) => `- ${c.author?.login} : ${oneBody(c.body)}`)
  const { failing } = rollup(pr.statusCheckRollup)

  if (!code.length && !reviews.length && !talk.length && !failing.length) {
    return `Relis ${head} : ${pr.url}\nLe diff : gh pr diff ${n}. Signale les problèmes et propose des corrections.`
  }
  const parts = [`Retours sur ${head} :`, pr.url]
  if (code.length) parts.push('', 'Commentaires dans le code :', ...code)
  if (reviews.length) parts.push('', 'Revues :', ...reviews)
  if (talk.length) parts.push('', 'Discussion :', ...talk)
  if (failing.length) parts.push('', `Checks en échec : ${failing.join(', ')} (gh pr checks ${n})`)
  parts.push('', `Traite ces retours sur la branche ${pr.headRefName}.`)
  return parts.join('\n')
}

/* ---------------- polling ---------------- */

interface Entry {
  status: GhStatus
  fetchedAt: number
  inflight: Promise<GhStatus> | null
}

export interface WatchHooks {
  pathOf(projectId: string): string | null
  /** The project on screen, polled often, and the ones with a session open, polled now and then. */
  watched(): { visible: string | null; background: string[] }
  onStatus(projectId: string, status: GhStatus): void
  onFinished(projectId: string, run: GhRun): void
}

const MIN = 60_000

function interval(status: GhStatus, visible: boolean): number {
  if (status.state === 'no-repo') return 10 * MIN
  if (status.state !== 'ok') return visible ? MIN : 10 * MIN
  const busy = status.runs.some((r) => r.running) || status.prs.some((p) => p.checks === 'pending')
  if (visible) return busy ? 10_000 : MIN
  return busy ? 20_000 : 3 * MIN
}

/** Polls GitHub for the projects in use, faster while a run is going, and reports finished runs. */
export class GitHubWatcher {
  private entries = new Map<string, Entry>()
  private timer: NodeJS.Timeout | null = null

  constructor(private hooks: WatchHooks) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 5000)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  all(): Record<string, GhStatus> {
    const out: Record<string, GhStatus> = {}
    for (const [id, e] of this.entries) out[id] = e.status
    return out
  }

  /** Called when a project comes on screen: refresh it unless it is very fresh. */
  touch(projectId: string): void {
    const e = this.entries.get(projectId)
    if (!e || Date.now() - e.fetchedAt > 15_000) void this.refresh(projectId)
  }

  /** Soon after an action (a rerun), the run list has changed. */
  later(projectId: string, ms = 3000): void {
    setTimeout(() => void this.refresh(projectId), ms).unref()
  }

  refresh(projectId: string): Promise<GhStatus> {
    const path = this.hooks.pathOf(projectId)
    if (!path) return Promise.resolve(emptyStatus('no-repo'))
    const prev = this.entries.get(projectId)
    if (prev?.inflight) return prev.inflight
    const entry: Entry = prev ?? { status: emptyStatus(), fetchedAt: 0, inflight: null }
    this.entries.set(projectId, entry)
    if (!prev) this.hooks.onStatus(projectId, entry.status)
    const startedAt = Date.now()
    entry.inflight = fetchStatus(path)
      .then((next) => {
        // A transient network failure keeps the last good lists on screen.
        if (next.state === 'error' && entry.status.state === 'ok') next = { ...entry.status, error: next.error, updatedAt: Date.now() }
        this.reportFinished(projectId, entry, next)
        entry.status = next
        return next
      })
      .finally(() => {
        entry.inflight = null
        entry.fetchedAt = startedAt
        this.hooks.onStatus(projectId, entry.status)
      })
    return entry.inflight
  }

  private reportFinished(projectId: string, entry: Entry, next: GhStatus): void {
    const before = entry.status
    if (before.state !== 'ok' || next.state !== 'ok' || !entry.fetchedAt) return
    const old = new Map(before.runs.map((r) => [r.id, r]))
    for (const run of next.runs) {
      if (run.running) continue
      const was = old.get(run.id)
      // Seen running last time, or started and finished between two polls.
      if (was ? was.running : run.startedAt >= entry.fetchedAt) this.hooks.onFinished(projectId, run)
    }
  }

  private tick(): void {
    const { visible, background } = this.hooks.watched()
    const ids = [...new Set([visible, ...background].filter((x): x is string => Boolean(x)))]
    const now = Date.now()
    let started = 0
    for (const id of ids) {
      const e = this.entries.get(id)
      if (e?.inflight) continue
      if (e && now - e.fetchedAt < interval(e.status, id === visible)) continue
      void this.refresh(id)
      if (++started >= 3) break // the rest waits for the next tick
    }
  }
}
