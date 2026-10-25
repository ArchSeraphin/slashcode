import { useEffect, useState } from 'react'
import type { CiState, GhJob, GhPull, GhRun, GhStatus, Project } from '@shared/types'
import { api, errorText, handToClaude, timeAgo, useStore } from '../store'
import { Icon, type IconName } from './Icon'

const CI_ICON: Record<CiState, IconName> = { success: 'check', failure: 'fail', pending: 'hourglass', neutral: 'neutral' }
const CI_LABEL: Record<CiState, string> = { success: 'réussie', failure: 'en échec', pending: 'en cours', neutral: 'annulée ou ignorée' }

export function CiIcon({ state, size = 16 }: { state: CiState; size?: number }) {
  return <Icon name={CI_ICON[state]} size={size} className={state === 'pending' ? 'spin' : ''} />
}

/**
 * What the sidebar shows next to a project: a run in progress, or else the last run of the
 * branch checked out (of any branch when it has none).
 */
export function ciSummary(status: GhStatus | undefined): { state: CiState; run: GhRun } | null {
  if (!status || status.state !== 'ok' || !status.runs.length) return null
  const running = status.runs.find((r) => r.running)
  if (running) return { state: 'pending', run: running }
  const run = status.runs.find((r) => r.branch === status.branch) ?? status.runs[0]
  return run.state === 'neutral' ? null : { state: run.state, run }
}

export function ciTooltip(s: { state: CiState; run: GhRun }): string {
  return `CI ${CI_LABEL[s.state]} : ${s.run.workflow} sur ${s.run.branch}`
}

function duration(run: GhRun): string {
  if (!run.startedAt) return ''
  const end = run.running ? Date.now() : run.updatedAt
  const sec = Math.max(0, Math.round((end - run.startedAt) / 1000))
  if (sec < 60) return `${sec} s`
  const min = Math.floor(sec / 60)
  return min < 60 ? `${min} min ${String(sec % 60).padStart(2, '0')}` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

const EVENT: Record<string, string> = {
  push: 'push',
  pull_request: 'PR',
  workflow_dispatch: 'manuel',
  schedule: 'planifié',
  release: 'release'
}

function Problem({ status, onRetry }: { status: GhStatus; onRetry: () => void }) {
  const text =
    status.state === 'no-gh' ? (
      <>
        Le client GitHub (gh) est introuvable.
        <br />
        Installe-le avec <code>brew install gh</code>, puis connecte-le avec <code>gh auth login</code>.
      </>
    ) : status.state === 'no-auth' ? (
      <>
        gh n’est pas connecté à GitHub.
        <br />
        Lance <code>gh auth login</code> dans un terminal.
      </>
    ) : (
      <>
        GitHub ne répond pas pour {status.repo || 'ce dépôt'}.
        <br />
        <span className="gh-err">{status.error}</span>
      </>
    )
  return (
    <div className="empty">
      <Icon name="warning" size={32} />
      <p>{text}</p>
      <button className="btn" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  )
}

export function GitHubPanel({ project }: { project: Project }) {
  const status = useStore((s) => s.github[project.id])
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // the action waiting for GitHub
  const [error, setError] = useState('')
  const [showPrs, setShowPrs] = useState(true)
  const [showRuns, setShowRuns] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    setExpanded(null)
    setError('')
  }, [project.id])

  const refresh = () => {
    setRefreshing(true)
    setError('')
    api.githubRefresh(project.id).finally(() => setRefreshing(false))
  }

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  if (!status || (status.state === 'loading' && !status.repo)) return <div className="empty">Connexion à GitHub…</div>
  if (status.state === 'no-repo') return <div className="empty">Ce dossier n’est pas relié à un dépôt GitHub.</div>
  if (status.state !== 'ok' && status.state !== 'loading') return <Problem status={status} onRetry={refresh} />

  const sendPr = (p: GhPull) =>
    act(`pr-${p.number}`, async () => {
      handToClaude(project.id, await api.githubPrPrompt(project.id, p.number), `PR #${p.number}`)
    })
  const sendRun = (r: GhRun) =>
    act(`run-${r.id}`, async () => {
      handToClaude(project.id, await api.githubCiPrompt(project.id, r.id), `CI ${r.workflow}`)
    })
  const rerun = (r: GhRun) => act(`rerun-${r.id}`, () => api.githubRerun(project.id, r))

  return (
    <>
      <div className="note-bar">
        <Icon name="pr" size={16} />
        <button className="link gh-repo" title="Ouvrir le dépôt sur GitHub" onClick={() => api.openUrl(`https://github.com/${status.repo}`)}>
          {status.repo}
        </button>
        {status.branch && (
          <span className="gh-branch" title="Branche locale">
            {status.branch}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="mini" title="Actualiser" onClick={refresh} disabled={refreshing}>
          <Icon name="refresh" size={14} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
      <div className="list">
        <button className="list-sep" onClick={() => setShowPrs(!showPrs)}>
          {showPrs ? '▾' : '▸'} Pull requests ouvertes ({status.prs.length})
        </button>
        {showPrs && !status.prs.length && <div className="gh-none">Aucune PR ouverte.</div>}
        {showPrs &&
          status.prs.map((p) => (
            <div key={p.number} className="gh-row">
              {p.checks ? <CiIcon state={p.checks} /> : <Icon name="pr" size={16} />}
              <button className="gh-main" title="Ouvrir la PR sur GitHub" onClick={() => api.openUrl(p.url)}>
                <span className="htitle">{p.title}</span>
                <span className="hmeta">
                  #{p.number} · {p.branch} · {p.author} · {timeAgo(p.updatedAt)}
                </span>
                <span className="gh-tags">
                  {p.branch === status.branch && <span className="gh-tag local">Branche locale</span>}
                  {p.draft && <span className="gh-tag draft">Brouillon</span>}
                  {p.review === 'approved' && <span className="gh-tag ok">Approuvée</span>}
                  {p.review === 'changes' && <span className="gh-tag warn">Changements demandés</span>}
                  {p.review === 'required' && <span className="gh-tag info">Revue requise</span>}
                  {p.failing.map((f) => (
                    <span key={f} className="gh-tag ko" title="Check en échec">
                      {f}
                    </span>
                  ))}
                </span>
              </button>
              <span className="tactions">
                <button
                  className="mini"
                  title="Envoyer les retours de revue à Claude (ou lui demander de relire la PR)"
                  disabled={busy !== null}
                  onClick={() => sendPr(p)}
                >
                  <Icon name={busy === `pr-${p.number}` ? 'hourglass' : 'send'} size={13} className={busy === `pr-${p.number}` ? 'spin' : ''} />
                </button>
              </span>
            </div>
          ))}

        <button className="list-sep" onClick={() => setShowRuns(!showRuns)}>
          {showRuns ? '▾' : '▸'} Actions ({status.runs.filter((r) => r.running).length} en cours)
        </button>
        {showRuns && !status.runs.length && <div className="gh-none">Aucun workflow GitHub Actions.</div>}
        {showRuns &&
          status.runs.map((r) => (
            <div key={r.id} className={'gh-run' + (expanded === r.id ? ' open' : '')}>
              <div className="gh-row">
                <CiIcon state={r.state} />
                <button
                  className="gh-main"
                  title="Afficher les jobs"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <span className="htitle">{r.title}</span>
                  <span className="hmeta">
                    {r.workflow} · {r.branch} · {EVENT[r.event] ?? r.event} · {timeAgo(r.startedAt)}
                    {duration(r) && ` · ${duration(r)}`}
                  </span>
                </button>
                <span className="tactions">
                  {r.state === 'failure' && (
                    <button className="mini" title="Envoyer l’échec et la fin du log à Claude" disabled={busy !== null} onClick={() => sendRun(r)}>
                      <Icon name={busy === `run-${r.id}` ? 'hourglass' : 'send'} size={13} className={busy === `run-${r.id}` ? 'spin' : ''} />
                    </button>
                  )}
                  {(r.state === 'failure' || r.state === 'neutral') && (
                    <button
                      className="mini"
                      title={r.state === 'failure' ? 'Relancer les jobs en échec' : 'Relancer'}
                      disabled={busy !== null}
                      onClick={() => rerun(r)}
                    >
                      <Icon name="refresh" size={13} className={busy === `rerun-${r.id}` ? 'spin' : ''} />
                    </button>
                  )}
                  <button className="mini" title="Ouvrir sur GitHub" onClick={() => api.openUrl(r.url)}>
                    <Icon name="external" size={13} />
                  </button>
                </span>
              </div>
              {expanded === r.id && <Jobs projectId={project.id} run={r} />}
            </div>
          ))}
      </div>
      <div className="gh-foot">
        {error ? <span className="gh-err">{error}</span> : status.error ? <span className="gh-err">{status.error}</span> : `Actualisé ${timeAgo(status.updatedAt)}`}
      </div>
    </>
  )
}

function Jobs({ projectId, run }: { projectId: string; run: GhRun }) {
  const [jobs, setJobs] = useState<GhJob[] | null>(null)
  const [error, setError] = useState('')

  // Follows the run while it goes: its status is refreshed by the poller.
  useEffect(() => {
    let alive = true
    api
      .githubJobs(projectId, run.id)
      .then((j) => alive && setJobs(j))
      .catch((err) => alive && setError(errorText(err)))
    return () => {
      alive = false
    }
  }, [projectId, run.id, run.updatedAt, run.state])

  if (error) return <div className="gh-jobs gh-err">{error}</div>
  if (!jobs) return <div className="gh-jobs muted">Chargement des jobs…</div>
  if (!jobs.length) return <div className="gh-jobs muted">Aucun job.</div>
  return (
    <div className="gh-jobs">
      {jobs.map((j) => (
        <button key={j.id} className="gh-job" title="Ouvrir le job sur GitHub" onClick={() => api.openUrl(j.url)}>
          <CiIcon state={j.state} size={13} />
          <span className="jname">{j.name}</span>
          {j.failedSteps.length > 0 && <span className="jstep">{j.failedSteps.join(', ')}</span>}
        </button>
      ))}
    </div>
  )
}
