import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DICTATION_LANGS, EFFORTS, MODELS, PERMISSIONS, type Appearance, type DiscoveredFolder, type Effort, type ModelId, type PermissionMode } from '@shared/types'
import {
  addGroup,
  addProjects,
  api,
  getState,
  gotoSession,
  newSession,
  openProject,
  patchGroup,
  patchProject,
  PROJECT_COLORS,
  setUI,
  shortPath,
  timeAgo,
  updateData,
  useStore,
  type DialogState
} from '../store'
import { applyTerminalSettings } from '../terminals'
import { Icon, type IconName } from './Icon'

const close = () => setUI({ dialog: null })

function Dialog({
  title,
  icon,
  width,
  className,
  children,
  footer
}: {
  title: string
  icon: IconName
  width?: number
  className?: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={'xp-window dialog ' + (className ?? '')} style={{ width }} role="dialog" aria-label={title}>
        <div className="title-bar">
          <Icon name={icon} size={16} />
          <span className="title-text">{title}</span>
          <div className="title-controls">
            <button className="wbtn close" aria-label="Fermer" onClick={close} />
          </div>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Dialogs() {
  const dialog = useStore((s) => s.ui.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'settings':
      return <SettingsDialog />
    case 'import':
      return <ImportDialog firstRun={dialog.firstRun} />
    case 'project':
      return <ProjectDialog dialog={dialog} />
    case 'group':
      return <GroupDialog groupId={dialog.groupId} />
    case 'palette':
      return <Palette />
    case 'shortcuts':
      return <Shortcuts />
    case 'confirm':
      return <Confirm dialog={dialog} />
  }
}

function Confirm({ dialog }: { dialog: Extract<DialogState, { kind: 'confirm' }> }) {
  return (
    <Dialog
      title={dialog.title}
      icon={dialog.danger ? 'warning' : 'info'}
      width={420}
      footer={
        <>
          <button
            className="btn default"
            autoFocus
            onClick={() => {
              close()
              dialog.onOk()
            }}
          >
            {dialog.okLabel}
          </button>
          <button className="btn" onClick={close}>
            Annuler
          </button>
        </>
      }
    >
      <div className="message">
        <Icon name={dialog.danger ? 'warning' : 'info'} size={32} />
        <div>
          <b>{dialog.message}</b>
          {dialog.detail && <p style={{ margin: '6px 0 0' }}>{dialog.detail}</p>}
        </div>
      </div>
    </Dialog>
  )
}

function SettingsDialog() {
  const settings = useStore((s) => s.data!.settings)
  const [testMsg, setTestMsg] = useState('')
  const [phoneMsg, setPhoneMsg] = useState('')
  const test = async (phone: boolean) => {
    if (phone) setPhoneMsg('Envoi…')
    const r = await api.testNotify(phone)
    if (phone) setPhoneMsg(r.phone === 'ok' ? 'Reçu par le serveur, regarde ton iPhone' : r.phone)
    else setTestMsg(r.native ? 'Envoyée. Rien vu ? Vérifie les réglages macOS.' : 'Notifications indisponibles sur ce Mac.')
  }
  const set = (patch: Partial<typeof settings>) => {
    updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
    if ('fontSize' in patch || 'consoleTheme' in patch) requestAnimationFrame(applyTerminalSettings)
  }
  return (
    <Dialog
      title="Paramètres de SlashCode"
      icon="gear"
      width={540}
      footer={
        <button className="btn default" onClick={close}>
          OK
        </button>
      }
    >
      <fieldset>
        <legend>Nouvelles sessions</legend>
        <div className="row">
          <label>Modèle par défaut</label>
          <select value={settings.defaultModel} onChange={(e) => set({ defaultModel: e.target.value as ModelId })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.hint}
              </option>
            ))}
          </select>
        </div>
        <div className="hint">Appliqué aux projets ajoutés ensuite. Chaque projet garde son propre choix.</div>
        <div className="row">
          <label>Autorisations</label>
          <select
            value={settings.defaultPermission}
            onChange={(e) => set({ defaultPermission: e.target.value as PermissionMode })}
          >
            {PERMISSIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <label>Effort de réflexion</label>
          <select value={settings.effort} onChange={(e) => set({ effort: e.target.value as Effort })}>
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e === 'default' ? 'Par défaut' : e}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <label>Commande Claude</label>
          <input type="text" value={settings.claudePath} onChange={(e) => set({ claudePath: e.target.value })} />
        </div>
        <div className="hint">Laisse « claude » sauf si le CLI est installé ailleurs.</div>
      </fieldset>
      <fieldset>
        <legend>Notifications</legend>
        <label className="check-row">
          <input type="checkbox" checked={settings.notifyNative} onChange={(e) => set({ notifyNative: e.target.checked })} />
          Notifications macOS quand une session a besoin de moi
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.notifyOnFinish} onChange={(e) => set({ notifyOnFinish: e.target.checked })} />
          Prévenir aussi quand Claude a fini de travailler (pas seulement pour les autorisations)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.notifySound} onChange={(e) => set({ notifySound: e.target.checked })} />
          Jouer un son
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.notifyCi} onChange={(e) => set({ notifyCi: e.target.checked })} />
          Prévenir quand un workflow GitHub Actions se termine (projets ouverts ou avec une session)
        </label>
        <div className="hint" style={{ margin: '4px 0 6px' }}>
          Rien n’est envoyé pour la session que tu as sous les yeux. macOS demande l’autorisation à la première
          notification ; si rien ne s’affiche, autorise SlashCode dans les réglages.
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn" onClick={() => test(false)}>
            <Icon name="bell" size={14} /> Tester
          </button>
          <button className="btn" onClick={() => api.openNotificationSettings()}>
            Réglages macOS…
          </button>
          {testMsg && <span style={{ color: 'var(--muted)' }}>{testMsg}</span>}
        </div>
      </fieldset>
      <fieldset>
        <legend>Sur l’iPhone</legend>
        <div className="row">
          <label>Service</label>
          <select value={settings.phoneProvider} onChange={(e) => set({ phoneProvider: e.target.value as 'bark' | 'ntfy' })}>
            <option value="bark">Bark (recommandé : icône SlashCode, regroupement par projet)</option>
            <option value="ntfy">ntfy</option>
          </select>
        </div>
        {settings.phoneProvider === 'bark' ? (
          <>
            <ol style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.6 }}>
              <li>
                Installe l’app gratuite{' '}
                <button className="link" onClick={() => api.openUrl('https://apps.apple.com/app/id1403753865')}>
                  Bark
                </button>{' '}
                et autorise ses notifications.
              </li>
              <li>
                Si tu utilises ton propre serveur Bark, ajoute <b className="selectable">{settings.barkServer}</b> dans
                l’onglet <b>Serveurs</b> de l’app (sinon, garde le serveur officiel <b>https://api.day.app</b>).
              </li>
              <li>Copie l’adresse affichée pour ce serveur et colle-la dans « Clé » (l’adresse entière convient).</li>
            </ol>
            <div className="row">
              <label>Serveur</label>
              <input type="text" value={settings.barkServer} onChange={(e) => set({ barkServer: e.target.value.trim() })} />
            </div>
            <div className="row">
              <label>Clé de l’appareil</label>
              <input
                type="text"
                value={settings.barkKey}
                placeholder="Colle l’adresse ou la clé donnée par Bark"
                onChange={(e) => set({ barkKey: e.target.value.trim() })}
              />
            </div>
          </>
        ) : (
          <>
            <ol style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.6 }}>
              <li>
                Installe l’app{' '}
                <button className="link" onClick={() => api.openUrl('https://apps.apple.com/app/ntfy/id1625396347')}>
                  ntfy
                </button>{' '}
                et abonne-toi au sujet ci-dessous. (ntfy ne permet pas de changer l’icône sur iPhone.)
              </li>
            </ol>
            <div className="row">
              <label>Sujet</label>
              <input type="text" className="selectable" readOnly value={settings.phoneTopic} />
              <button className="btn small" onClick={() => navigator.clipboard.writeText(settings.phoneTopic)}>
                Copier
              </button>
            </div>
            <div className="row">
              <label>Serveur</label>
              <input type="text" value={settings.phoneServer} onChange={(e) => set({ phoneServer: e.target.value.trim() })} />
            </div>
          </>
        )}
        <div className="row">
          <label>Quand</label>
          <select value={settings.phoneWhen} onChange={(e) => set({ phoneWhen: e.target.value as 'away' | 'always' })}>
            <option value="away">Seulement quand je ne suis pas devant le Mac</option>
            <option value="always">Toujours</option>
          </select>
        </div>
        <div className="hint">« Pas devant le Mac » : écran verrouillé ou aucune activité depuis 2 minutes.</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label className="check-row" style={{ marginRight: 8 }}>
            <input type="checkbox" checked={settings.phoneEnabled} onChange={(e) => set({ phoneEnabled: e.target.checked })} />
            <b>Activer</b>
          </label>
          <button className="btn" disabled={!settings.phoneEnabled} onClick={() => test(true)}>
            <Icon name="send" size={14} /> Envoyer un test
          </button>
          {phoneMsg && <span style={{ color: phoneMsg.startsWith('Reçu') ? 'var(--ok)' : 'var(--error)' }}>{phoneMsg}</span>}
        </div>
        <div className="hint" style={{ margin: '6px 0 0' }}>
          La notification contient le projet, la session, l’action demandée (commande ou fichier) ou le début de la
          réponse de Claude. Elle passe par ton serveur puis par Apple, comme toute notification iPhone.
        </div>
      </fieldset>
      <fieldset>
        <legend>Dictée</legend>
        <div className="row">
          <label>Langue</label>
          <select value={settings.dictationLang} onChange={(e) => set({ dictationLang: e.target.value })}>
            {DICTATION_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="hint">
          ⌘D ou le bouton micro d’une session : tu parles, le texte s’affiche, ↩ l’envoie à Claude. La reconnaissance
          vocale d’Apple tourne sur le Mac quand la langue y est installée. À la première dictée, macOS demande l’accès
          au micro et à la reconnaissance vocale.
        </div>
      </fieldset>
      <fieldset>
        <legend>Apparence</legend>
        <div className="row">
          <label>Thème des fenêtres</label>
          <select value={settings.appearance} onChange={(e) => set({ appearance: e.target.value as Appearance })}>
            <option value="light">Luna (clair)</option>
            <option value="dark">Royale Noir (sombre)</option>
            <option value="system">Comme macOS</option>
          </select>
        </div>
      </fieldset>
      <fieldset>
        <legend>Console</legend>
        <div className="row">
          <label>Thème</label>
          <select value={settings.consoleTheme} onChange={(e) => set({ consoleTheme: e.target.value as 'xp' | 'luna' })}>
            <option value="xp">Invite de commandes (noir)</option>
            <option value="luna">Luna (clair)</option>
          </select>
        </div>
        <div className="row">
          <label>Taille du texte</label>
          <select value={settings.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })}>
            {[11, 12, 13, 14, 15, 16, 18].map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    </Dialog>
  )
}

function ImportDialog({ firstRun }: { firstRun?: boolean }) {
  const groups = useStore((s) => s.data!.groups)
  const [folders, setFolders] = useState<DiscoveredFolder[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.discover().then((list) => {
      setFolders(list)
      // Preselect folders used during the last two weeks, except the bare home folder.
      const recent = Date.now() - 14 * 86400_000
      const home = list.find((f) => f.path.split('/').length === 3 && f.path.startsWith('/Users/'))?.path
      setChecked(
        new Set(list.filter((f) => !f.known && f.exists && f.lastUsedAt > recent && f.path !== home).map((f) => f.path))
      )
    })
  }, [])

  const shown = (folders ?? []).filter(
    (f) => !filter || f.path.toLowerCase().includes(filter.toLowerCase())
  )
  const toggle = (path: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const doImport = () => {
    addProjects([...checked], groupId || null)
    close()
    setUI({ view: 'home' })
  }

  const addManual = async () => {
    const paths = await api.pickFolders()
    if (!paths.length) return
    addProjects(paths, groupId || null)
    close()
  }

  return (
    <Dialog
      title={firstRun ? 'Bienvenue dans SlashCode' : 'Importer depuis Claude Code'}
      icon="import"
      width={760}
      footer={
        <>
          <button className="btn" onClick={addManual} style={{ marginRight: 'auto' }}>
            <Icon name="folder" size={14} /> Choisir un dossier…
          </button>
          <button className="btn default" disabled={!checked.size} onClick={doImport}>
            Importer {checked.size || ''}
          </button>
          <button className="btn" onClick={close}>
            Annuler
          </button>
        </>
      }
    >
      {firstRun && (
        <div className="message">
          <Icon name="logo" size={32} />
          <div>
            <b>Retrouve tous tes dossiers de travail en un clic.</b>
            <p style={{ margin: '4px 0 0' }}>
              Voici les dossiers où tu as déjà utilisé Claude Code. Coche ceux à suivre dans SlashCode : chaque dossier
              devient un projet avec ses sessions, notes et tâches.
            </p>
          </div>
        </div>
      )}
      <div className="row">
        <label style={{ width: 'auto' }}>Ranger dans</label>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: 180 }}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="">Sans groupe</option>
        </select>
        <input type="search" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: 1 }} />
        <button className="btn small" onClick={() => setChecked(new Set(shown.filter((f) => !f.known && f.exists).map((f) => f.path)))}>
          Tout
        </button>
        <button className="btn small" onClick={() => setChecked(new Set())}>
          Aucun
        </button>
      </div>
      <div className="listview" style={{ height: 360 }}>
        <div className="lv-head">
          <span />
          <span>Nom</span>
          <span>Emplacement</span>
          <span>Utilisé</span>
          <span>Sessions</span>
        </div>
        {folders === null && <div className="empty">Analyse de ~/.claude/projects…</div>}
        {shown.map((f) => {
          const disabled = f.known || !f.exists
          return (
            <label key={f.path} className={'lv-row' + (disabled ? ' disabled' : '')} title={f.path}>
              <input type="checkbox" disabled={disabled} checked={checked.has(f.path)} onChange={() => toggle(f.path)} />
              <span className="ellipsis">
                <Icon name="folder" size={14} /> {f.name}
              </span>
              <span className="ellipsis">
                {f.known ? 'déjà dans SlashCode · ' : !f.exists ? 'dossier introuvable · ' : ''}
                {shortPath(f.path)}
              </span>
              <span>{timeAgo(f.lastUsedAt)}</span>
              <span>{f.sessions}</span>
            </label>
          )
        })}
      </div>
    </Dialog>
  )
}

function ProjectDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'project' }> }) {
  const data = useStore((s) => s.data!)
  const existing = data.projects.find((p) => p.id === dialog.projectId)
  const [name, setName] = useState(existing?.name ?? '')
  const [path, setPath] = useState(existing?.path ?? dialog.path ?? '')
  const [groupId, setGroupId] = useState<string>(existing ? existing.groupId ?? '' : data.groups[0]?.id ?? '')
  const [model, setModel] = useState<ModelId>(existing?.model ?? data.settings.defaultModel)
  const [permission, setPermission] = useState<PermissionMode>(existing?.permission ?? data.settings.defaultPermission)
  const [color, setColor] = useState(existing?.color ?? PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length])
  const [error, setError] = useState('')

  const browse = async () => {
    const [p] = await api.pickFolders()
    if (!p) return
    setPath(p)
    if (!name) setName(p.split('/').filter(Boolean).pop() ?? '')
  }

  const save = async () => {
    if (!path) return setError('Choisis un dossier.')
    if (!(await api.exists(path))) return setError('Ce dossier n’existe pas.')
    const other = data.projects.find((p) => p.path === path && p.id !== existing?.id)
    if (other) return setError(`Ce dossier est déjà le projet « ${other.name} ».`)
    const patch = {
      name: name.trim() || path.split('/').filter(Boolean).pop() || path,
      path,
      groupId: groupId || null,
      model,
      permission,
      color
    }
    if (existing) patchProject(existing.id, patch)
    else {
      const [p] = addProjects([path], groupId || null)
      if (p) {
        patchProject(p.id, patch)
        openProject(p.id)
      }
    }
    close()
  }

  return (
    <Dialog
      title={existing ? `Propriétés de ${existing.name}` : 'Nouveau projet'}
      icon="folder"
      width={520}
      footer={
        <>
          <button className="btn default" onClick={save}>
            OK
          </button>
          <button className="btn" onClick={close}>
            Annuler
          </button>
        </>
      }
    >
      <div className="row">
        <label>Dossier</label>
        <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/…" />
        <button className="btn small" onClick={browse}>
          Parcourir…
        </button>
      </div>
      <div className="row">
        <label>Nom</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus={Boolean(existing)} />
      </div>
      <div className="row">
        <label>Groupe</label>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="">Sans groupe</option>
        </select>
      </div>
      <div className="row">
        <label>Modèle par défaut</label>
        <select value={model} onChange={(e) => setModel(e.target.value as ModelId)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>Autorisations</label>
        <select value={permission} onChange={(e) => setPermission(e.target.value as PermissionMode)}>
          {PERMISSIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>Couleur</label>
        <div className="swatches">
          {PROJECT_COLORS.map((c) => (
            <button key={c} className={'swatch' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      {error && (
        <div className="message" style={{ color: 'var(--error)' }}>
          <Icon name="warning" size={16} /> {error}
        </div>
      )}
    </Dialog>
  )
}

function GroupDialog({ groupId }: { groupId?: string }) {
  const group = useStore((s) => s.data!.groups.find((g) => g.id === groupId))
  const [name, setName] = useState(group?.name ?? '')
  const save = () => {
    if (group) patchGroup(group.id, { name: name.trim() || group.name })
    else addGroup(name)
    close()
  }
  return (
    <Dialog
      title={group ? 'Renommer le groupe' : 'Nouveau groupe'}
      icon="folder"
      width={380}
      footer={
        <>
          <button className="btn default" onClick={save}>
            OK
          </button>
          <button className="btn" onClick={close}>
            Annuler
          </button>
        </>
      }
    >
      <div className="row">
        <label style={{ width: 60 }}>Nom</label>
        <input
          type="text"
          autoFocus
          value={name}
          placeholder="Clients, Perso, Produits…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
    </Dialog>
  )
}

interface PaletteItem {
  key: string
  icon: IconName
  label: string
  sub?: string
  run: (alt: boolean) => void
}

function fuzzy(text: string, q: string): number {
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i === 0) return 3
  if (i > 0) return t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '-' ? 2.5 : 2
  let pos = 0
  for (const ch of q) {
    pos = t.indexOf(ch, pos)
    if (pos < 0) return 0
    pos++
  }
  return 1
}

/** The "Run…" box: type a few letters, Enter to open, ⌘Enter to open and start a session. */
function Palette() {
  const data = useStore((s) => s.data!)
  const live = useStore((s) => s.live)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const items = useMemo<PaletteItem[]>(() => {
    const query = q.trim().toLowerCase()
    const out: (PaletteItem & { score: number })[] = []
    const projects = data.projects.filter((p) => !p.archived || query)
    for (const p of projects) {
      const score = query ? Math.max(fuzzy(p.name, query) * 2, fuzzy(p.path, query)) : 1 + p.lastOpenedAt / 1e14
      if (score > 0)
        out.push({
          key: 'p' + p.id,
          icon: 'folder',
          label: p.name,
          sub: shortPath(p.path),
          score: score + (p.favorite ? 0.3 : 0),
          run: (alt) => (alt ? newSession(p.id) : openProject(p.id))
        })
    }
    for (const s of data.sessions.filter((x) => x.open)) {
      const p = data.projects.find((x) => x.id === s.projectId)
      const text = `${p?.name ?? ''} ${s.title}`
      const score = query ? fuzzy(text, query) * 1.5 : live[s.id]?.attention ? 50 : 0.5
      if (score > 0)
        out.push({
          key: 's' + s.id,
          icon: live[s.id]?.attention ? 'warning' : 'console',
          label: `${p?.name} · ${s.title}`,
          sub: live[s.id]?.message ?? 'Interrompue',
          score,
          run: () => gotoSession(s.id)
        })
    }
    const actions: [IconName, string, () => void][] = [
      ['plus', 'Nouveau projet…', () => setUI({ dialog: { kind: 'project' } })],
      ['import', 'Importer depuis Claude…', () => setUI({ dialog: { kind: 'import' } })],
      ['gear', 'Paramètres', () => setUI({ dialog: { kind: 'settings' } })],
      ['computer', 'Poste de travail', () => setUI({ view: 'home' })]
    ]
    for (const [icon, label, run] of actions) {
      const score = query ? fuzzy(label, query) : 0.1
      if (score > 0) out.push({ key: 'a' + label, icon, label, score: score * 0.8, run })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 60)
  }, [q, data, live])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector('.res.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const run = (i: number, alt: boolean) => {
    const it = items[i]
    if (!it) return
    setUI({ dialog: null })
    it.run(alt)
  }

  return (
    <Dialog title="Exécuter" icon="run" className="palette">
      <div className="run-head">
        <Icon name="run" size={32} />
        <div style={{ flex: 1 }}>
          Tape le nom d’un projet ou d’une session.
          <input
            type="text"
            autoFocus
            value={q}
            style={{ width: '100%', marginTop: 5 }}
            placeholder="ex : site, boutique, api…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(items.length - 1, s + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(0, s - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(sel, e.metaKey)
              }
            }}
          />
        </div>
      </div>
      <div className="results" ref={list}>
        {items.map((it, i) => (
          <button
            key={it.key}
            className={'res' + (i === sel ? ' sel' : '')}
            onMouseMove={() => setSel(i)}
            onClick={(e) => run(i, e.metaKey)}
          >
            <Icon name={it.icon} size={16} />
            <span>{it.label}</span>
            {it.sub && <span className="rsub">{it.sub}</span>}
          </button>
        ))}
        {!items.length && <div className="empty">Rien trouvé.</div>}
      </div>
      <div className="keys">↩ ouvrir · ⌘↩ ouvrir et lancer une nouvelle session · Échap fermer</div>
    </Dialog>
  )
}

function Shortcuts() {
  const rows: [string, string][] = [
    ['⌘K', 'Exécuter… : aller à un projet ou une session'],
    ['⌘T', 'Nouvelle session dans le projet ouvert'],
    ['⌘W', 'Fermer la session active'],
    ['⌘⇧A', 'Aller à la prochaine session qui attend'],
    ['⌘⇧[ / ⌘⇧]', 'Session précédente / suivante'],
    ['⌘1 … ⌘9', 'Aller au n-ième onglet du projet'],
    ['⌘J', 'Afficher ou masquer Tâches & notes'],
    ['⌥⌘1 … ⌥⌘4', 'Afficher 1, 2, 3 ou 4 sessions à l’écran'],
    ['⌘D', 'Dicter un prompt (⌘D à nouveau pour l’insérer)'],
    ['⌘⇧H', 'Poste de travail'],
    ['⌘⇧N', 'Nouveau projet'],
    ['⌘I', 'Importer depuis Claude'],
    ['⇧↩', 'Nouvelle ligne dans le prompt Claude'],
    ['Double-clic', 'Sur un projet : lancer une session directement'],
    ['Glisser', 'Un fichier sur la console insère son chemin ; un dossier sur un groupe crée un projet']
  ]
  return (
    <Dialog
      title="Aide et raccourcis"
      icon="help"
      width={520}
      footer={
        <button className="btn default" onClick={close}>
          OK
        </button>
      }
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px dotted var(--line)' }}>
              <td style={{ padding: '4px 10px 4px 0', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{k}</td>
              <td style={{ padding: '4px 0' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: 'var(--muted)' }}>
        Les notifications viennent des hooks de Claude Code : SlashCode est prévenu quand Claude demande une autorisation
        ou a fini son tour, même si la fenêtre est cachée. Rien n’est modifié dans ta configuration Claude.
      </p>
    </Dialog>
  )
}

export function currentProjectId(): string | null {
  const ui = getState().ui
  return ui.view === 'project' ? ui.projectId : null
}
