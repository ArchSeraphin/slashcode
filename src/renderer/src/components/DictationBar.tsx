import { useEffect, useRef } from 'react'
import { cancelDictation, commitDictation, editDictation, stopDictation, useStore } from '../store'
import { Icon } from './Icon'

const BLOCKS = 14

/** Shown over the bottom of the session being dictated into. */
export function DictationBar() {
  const d = useStore((s) => s.ui.dictation)!
  const box = useRef<HTMLTextAreaElement>(null)
  const listening = d.phase === 'starting' || d.phase === 'listening'

  // Keep the keyboard here (Enter, Esc) instead of in the terminal.
  useEffect(() => {
    box.current?.focus()
  }, [d.phase])

  useEffect(() => {
    const el = box.current
    if (el && listening) el.scrollTop = el.scrollHeight
  }, [d.text, listening])

  const lit = Math.round(d.level * BLOCKS)
  const status =
    d.phase === 'starting'
      ? d.installing
        ? 'Téléchargement du modèle de langue (une seule fois)…'
        : 'Ouverture du micro…'
      : d.phase === 'listening'
        ? 'Parle, je t’écoute.'
        : d.phase === 'stopping'
          ? 'Derniers mots…'
          : d.phase === 'editing'
            ? 'Corrige si besoin, puis envoie.'
            : d.error

  return (
    <div
      className={'dictation' + (d.phase === 'error' ? ' failed' : '')}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelDictation()
        }
      }}
    >
      <div className="dictation-head">
        <span className={'rec' + (d.phase === 'listening' ? ' live' : '')}>
          <Icon name={d.phase === 'error' ? 'warning' : 'mic'} size={16} />
        </span>
        <b>Dictée</b>
        <span className="dictation-status">{status}</span>
        {d.phase !== 'error' && (
          <span className="vu" aria-hidden="true">
            {Array.from({ length: BLOCKS }, (_, i) => (
              <i key={i} className={i < lit ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>
      {d.phase !== 'error' && (
        <textarea
          ref={box}
          className="dictation-text"
          value={d.text}
          placeholder={listening ? 'Le texte s’affiche ici pendant que tu parles…' : ''}
          rows={3}
          readOnly={d.phase !== 'editing'}
          onChange={(e) => editDictation(e.target.value)}
          onMouseDown={() => {
            // Clicking in the text means "let me fix it": stop listening, keep what was heard.
            if (d.phase === 'listening') stopDictation()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
              e.preventDefault()
              if (d.phase === 'editing') commitDictation(true)
              else stopDictation('send')
            }
          }}
        />
      )}
      <div className="dictation-foot">
        <span className="hint">
          {d.phase === 'error' ? '' : '↩ envoyer · ⇧↩ nouvelle ligne · ⌘D insérer sans envoyer · Échap annuler'}
        </span>
        {d.phase !== 'error' && (
          <>
            <button className="btn" disabled={d.phase === 'stopping'} onClick={() => stopDictation('insert')}>
              Insérer
            </button>
            <button className="btn default" disabled={d.phase === 'stopping'} onClick={() => stopDictation('send')}>
              <Icon name="send" size={13} /> Envoyer
            </button>
          </>
        )}
        <button className="btn" autoFocus={d.phase === 'error'} onClick={cancelDictation}>
          {d.phase === 'error' ? 'Fermer' : 'Annuler'}
        </button>
      </div>
    </div>
  )
}
