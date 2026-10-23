import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MODELS, type SessionRecord } from '@shared/types'
import {
  api,
  closeSession,
  focusSession,
  getState,
  pendingLaunches,
  resumeInPlace,
  timeAgo,
  toggleDictation,
  useStore
} from '../store'
import { attach, disposeTerminal, fitTerminal, focusTerminal, tryLaunch } from '../terminals'
import { DictationBar } from './DictationBar'
import { Icon } from './Icon'
import { StatusIcon, statusLabel } from './StatusIcon'

// Pane rectangles as fractions of the stage: x, y, width, height.
const RECTS: Record<number, [number, number, number, number][]> = {
  1: [[0, 0, 1, 1]],
  2: [
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 1]
  ],
  3: [
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5]
  ],
  4: [
    [0, 0, 0.5, 0.5],
    [0.5, 0, 0.5, 0.5],
    [0, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5]
  ]
}

const INSET = 4 // stage padding
const HALF_GAP = 3

export function paneStyle(slot: number, n: number): CSSProperties {
  const [x, y, w, h] = RECTS[n][slot]
  const axis = (start: number, size: number) => {
    const before = start > 0 ? HALF_GAP : 0
    const after = start + size < 1 ? HALF_GAP : 0
    return {
      pos: `calc(${INSET}px + (100% - ${2 * INSET}px) * ${start} + ${before}px)`,
      len: `calc((100% - ${2 * INSET}px) * ${size} - ${before + after}px)`
    }
  }
  const ax = axis(x, w)
  const ay = axis(y, h)
  return { left: ax.pos, top: ay.pos, width: ax.len, height: ay.len, right: 'auto', bottom: 'auto' }
}

/**
 * Every open session keeps its terminal mounted here, whatever project is on screen,
 * so switching never loses scrollback. Only the sessions in the panes are visible.
 */
export function Stage({ panes, split, focusedId }: { panes: string[]; split: number; focusedId: string | null }) {
  const sessions = useStore((s) => s.data!.sessions)
  const open = sessions.filter((s) => s.open)
  return (
    <>
      {open.map((s) => (
        <TerminalPane key={s.id} record={s} slot={panes.indexOf(s.id)} split={split} focused={s.id === focusedId} />
      ))}
    </>
  )
}

function quotePath(p: string): string {
  return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p
}

function TerminalPane({
  record,
  slot,
  split,
  focused
}: {
  record: SessionRecord
  slot: number
  split: number
  focused: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const live = useStore((s) => s.live[record.id])
  const theme = useStore((s) => s.data!.settings.consoleTheme)
  const dictating = useStore((s) => s.ui.dictation?.sessionId === record.id)
  const [dragging, setDragging] = useState(false)
  const visible = slot >= 0
  const multi = visible && split > 1

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
    const raf = requestAnimationFrame(run)
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

  useEffect(() => {
    if (!visible || !focused || getState().ui.dictation) return
    const raf = requestAnimationFrame(() => focusTerminal(record.id))
    return () => cancelAnimationFrame(raf)
  }, [visible, focused, record.id])

  // A relaunch (resume) happens while the pane is already visible.
  useEffect(() => {
    if (visible && !live && pendingLaunches.has(record.id)) requestAnimationFrame(() => void tryLaunch(record.id))
  }, [visible, live, record.id])

  const model = MODELS.find((m) => m.id === record.model)?.label ?? record.model
  const interrupted = !live && !pendingLaunches.has(record.id)
  const exited = live?.status === 'exited'

  return (
    <div
      className={
        `xp-console theme-${theme}` +
        (visible ? '' : ' hidden') +
        (multi ? ' pane' + (focused ? ' focused' : '') + (live?.attention && !focused ? ' attention' : '') : '')
      }
      style={visible ? paneStyle(slot, split) : undefined}
      onMouseDownCapture={() => {
        if (multi && !focused) focusSession(record.projectId, record.id)
      }}
      onFocusCapture={() => {
        if (multi && !focused) focusSession(record.projectId, record.id)
      }}
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
      {multi && (
        <div className="pane-bar" onDoubleClick={() => focusTerminal(record.id)}>
          <StatusIcon live={live} size={13} />
          <span className="pane-title">{record.title}</span>
          <span className="tmodel">{model}</span>
          <button
            className={'pane-btn' + (dictating ? ' on' : '')}
            title="Dicter un prompt (⌘D)"
            onClick={() => {
              focusSession(record.projectId, record.id)
              toggleDictation(record.id)
            }}
          >
            <Icon name="mic" size={13} />
          </button>
          <button className="pane-btn close" title="Fermer (⌘W)" onClick={() => closeSession(record.id)}>
            ×
          </button>
        </div>
      )}
      <div className="term-host" ref={host} />
      {dragging && <div className="drop-hint">Déposer pour insérer le chemin</div>}
      {dictating && visible && <DictationBar />}
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
                <div style={{ marginTop: 4, color: 'var(--muted)' }}>La conversation peut reprendre là où elle s’était arrêtée.</div>
              </div>
            </div>
          </div>
          <div className="dialog-foot">
            <button className="btn default" autoFocus={focused} onClick={() => resumeInPlace(record.id)}>
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
        {!multi && <span className="sfield">Modèle : {model}</span>}
        {live?.contextPercent != null && (
          <span
            className="sfield"
            title={live.costUsd != null ? `Coût estimé de la session : ${live.costUsd.toFixed(2).replace('.', ',')} $` : undefined}
          >
            Contexte : {Math.round(live.contextPercent)} %
          </span>
        )}
        <span className="sfield grow">{multi ? '' : record.title}</span>
        {!multi && (
          <button
            className={'sfield sbtn' + (dictating ? ' on' : '')}
            title="Dicter un prompt (⌘D)"
            onClick={() => toggleDictation(record.id)}
          >
            <Icon name="mic" size={13} /> Dicter
          </button>
        )}
        {!multi && <span className="sfield">⇧↩ nouvelle ligne</span>}
      </div>
    </div>
  )
}
