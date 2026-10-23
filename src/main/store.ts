import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { AppData, Settings } from '@shared/types'

const DEFAULT_SETTINGS: Settings = {
  defaultModel: 'opus',
  defaultPermission: 'default',
  effort: 'default',
  claudePath: 'claude',
  notifyNative: true,
  notifySound: true,
  notifyOnFinish: true,
  fontSize: 13,
  consoleTheme: 'xp',
  appearance: 'light',
  phoneEnabled: false,
  phoneProvider: 'bark',
  barkServer: 'https://api.day.app',
  barkKey: '',
  phoneServer: 'https://ntfy.sh',
  phoneTopic: '',
  phoneWhen: 'away',
  dictationLang: 'fr-FR'
}

// The topic name is the only secret on a public ntfy server, so make it unguessable.
function newTopic(): string {
  return 'slashcode-' + randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x')
}

function emptyData(): AppData {
  return {
    version: 1,
    groups: [
      { id: 'g-clients', name: 'Clients', collapsed: false },
      { id: 'g-perso', name: 'Perso', collapsed: false }
    ],
    projects: [],
    notes: [],
    tasks: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

export class Store {
  private file: string
  private timer: NodeJS.Timeout | null = null
  data: AppData

  constructor() {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'slashcode-data.json')
    this.data = this.load()
    if (!this.data.settings.phoneTopic) this.data.settings.phoneTopic = newTopic()
  }

  private load(): AppData {
    if (!existsSync(this.file)) return emptyData()
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppData>
      const base = emptyData()
      return {
        ...base,
        ...raw,
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
      }
    } catch (err) {
      // Keep the broken file aside instead of silently overwriting it.
      copyFileSync(this.file, this.file + '.corrompu-' + Date.now())
      console.error('Lecture des données impossible', err)
      return emptyData()
    }
  }

  replace(next: AppData): void {
    this.data = next
    this.scheduleSave()
  }

  scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }
}
