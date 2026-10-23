import { useEffect, useRef, useState } from 'react'
import { MODELS, type SessionRecord } from '@shared/types'
import { api, closeSession, getState, pendingLaunches, resumeInPlace, timeAgo, useStore } from '../store'
import { attach, disposeTerminal, fitTerminal, focusTerminal, tryLaunch } from '../terminals'
import { Icon } from './Icon'
import { StatusIcon, statusLabel } from './StatusIcon'

/**
 * Every open session keeps its terminal mounted here, whatever project is on screen,
 * so switching never loses scrollback. Only the active one is visible.
 */
export function Stage({ visibleId }: { visibleId: string | null }) {
  const sessions = useStore((s) => s.data!.sessions)
  const open = sessions.filter((s) => s.open)
  return (
    <>
      {open.map((s) => (
        <TerminalPane key={s.id} record={s} visible={s.id === visibleId} />
      ))}
    </>
  )
}

function quotePath(p: string): string {
  return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p
}

function TerminalPane({ record, visible }: { record: SessionRecord; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useStore((s) => s.live[record.id])
  const theme = useStore((s) => s.data!.settings.consoleTheme)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    // Replay the main-process buffer when the session outlived a renderer reload.
    attach(record.id, host.current!, Boolean(getState().live[record.id]) && !pendingLaunches.has(record.id))
    return () => disposeTerminal(record.id)
  }, [record.id])

  useEffect(() => {
    if (!visible) return
    const run = () => {
      fitTerminal(record.id)
      void tryLaunch(record.id)
    }
    const raf = requestAnimationFrame(() => {
      run()
      focusTerminal(record.id)
    })
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(run, 60)
    })
    ro.observe(host.current!)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      ro.disconnect()
    }
  }, [visible, record.id])

  // A relaunch (resume) happens while the pane is already visible.
  useEffect(() => {
    if (visible && !live && pendingLaunches.has(record.id)) requestAnimationFrame(() => void tryLaunch(record.id))
  }, [visible, live, record.id])

  const model = MODELS.find((m) => m.id === record.model)?.label ?? record.model
  const interrupted = !live && !pendingLaunches.has(record.id)
  const exited = live?.status === 'exited'

  return (
    <div
      className={`xp-console theme-${theme}` + (visible ? '' : ' hidden')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
        if (paths.length) api.write(record.id, paths.map(quotePath).join(' ') + ' ')
        focusTerminal(record.id)
      }}
    >
      <div className="term-host" ref={host} />
      {dragging && <div className="drop-hint">Déposer pour insérer le chemin</div>}
      {(interrupted || exited) && (
        <div className="overlay-card xp-window dialog">
          <div className="title-bar">
            <Icon name="console" size={16} />
            <span className="title-text">{exited ? 'Session terminée' : 'Session interrompue'}</span>
          </div>
          <div className="dialog-body">
            <div className="message">
              <Icon name={exited ? 'info' : 'pause'} size={32} />
              <div>
                <b>{record.title}</b>
                <div style={{ marginTop: 4 }}>
                  {exited
                    ? live?.exitCode
                      ? `Claude s’est arrêté avec le code ${live.exitCode}.`
                      : 'Claude a été quitté.'
                    : `Cette session était ouverte quand SlashCode a été fermé (${timeAgo(record.lastActiveAt)}).`}
                </div>
                <div style={{ marginTop: 4, color: '#666' }}>La conversation peut reprendre là où elle s’était arrêtée.</div>
              </div>
            </div>
          </div>
          <div className="dialog-foot">
            <button className="btn default" autoFocus onClick={() => resumeInPlace(record.id)}>
              <Icon name="play" size={14} /> Reprendre
            </button>
            <button className="btn" onClick={() => closeSession(record.id, true)}>
              Fermer l’onglet
            </button>
          </div>
        </div>
      )}
      <div className="statusline">
        <span className="sfield">
          <StatusIcon live={live} size={13} />
          {live ? statusLabel(live) : 'Interrompue'}
        </span>
        <span className="sfield">Modèle : {model}</span>
        <span className="sfield grow">{record.title}</span>
        <span className="sfield">⇧↩ nouvelle ligne</span>
      </div>
    </div>
  )
}
