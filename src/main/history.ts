import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import type { DiscoveredFolder, HistoryEntry } from '@shared/types'

const PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const CHUNK = 96 * 1024

/** Claude Code stores each folder's transcripts in ~/.claude/projects/<path with non-alphanumerics as "-">. */
export function encodeProjectDir(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '-')
}

function readSlice(file: string, start: number, length: number): string {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function headAndTail(file: string, size: number): { head: string; tail: string } {
  const head = readSlice(file, 0, Math.min(size, CHUNK))
  const tail = size > CHUNK ? readSlice(file, Math.max(0, size - CHUNK), CHUNK) : ''
  return { head, tail }
}

function lastMatch(text: string, re: RegExp): string | null {
  let found: string | null = null
  for (const m of text.matchAll(re)) found = m[1]
  return found
}

function unescapeJson(s: string): string {
  try {
    return JSON.parse('"' + s + '"')
  } catch {
    return s
  }
}

function firstUserPrompt(text: string): string {
  for (const line of text.split('\n')) {
    if (!line.includes('"type":"user"')) continue
    try {
      const obj = JSON.parse(line)
      const content = obj?.message?.content
      let str = ''
      if (typeof content === 'string') str = content
      else if (Array.isArray(content)) {
        const t = content.find((c: { type: string }) => c.type === 'text')
        str = t?.text ?? ''
      }
      str = str.trim()
      if (!str || str.startsWith('<') || str.startsWith('Caveat:')) continue
      return str.replace(/\s+/g, ' ').slice(0, 160)
    } catch {
      // partial line at the chunk boundary
    }
  }
  return ''
}

export function listHistory(projectPath: string, limit = 40): HistoryEntry[] {
  const dir = join(PROJECTS_DIR, encodeProjectDir(projectPath))
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = join(dir, f)
      const st = statSync(full)
      return { f, full, mtime: st.mtimeMs, size: st.size }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)

  const out: HistoryEntry[] = []
  for (const file of files) {
    try {
      const { head, tail } = headAndTail(file.full, file.size)
      const all = head + '\n' + tail
      // Skip transcripts that hold no conversation at all.
      if (!all.includes('"type":"user"') && !all.includes('"type":"assistant"')) continue
      const custom = lastMatch(all, /"customTitle":"((?:[^"\\]|\\.)*)"/g)
      const ai = lastMatch(all, /"aiTitle":"((?:[^"\\]|\\.)*)"/g)
      const summary = lastMatch(all, /"type":"summary","summary":"((?:[^"\\]|\\.)*)"/g)
      const prompt = firstUserPrompt(head)
      const title = unescapeJson(custom ?? ai ?? summary ?? '') || prompt || 'Session sans titre'
      out.push({
        id: basename(file.f, '.jsonl'),
        title,
        firstPrompt: prompt,
        updatedAt: file.mtime,
        sizeKb: Math.round(file.size / 1024)
      })
    } catch {
      // unreadable transcript, ignore
    }
  }
  return out
}

/** Every working folder Claude Code has been used in, newest first. */
export function discoverFolders(knownPaths: Set<string>): DiscoveredFolder[] {
  if (!existsSync(PROJECTS_DIR)) return []
  const byPath = new Map<string, DiscoveredFolder>()
  for (const entry of readdirSync(PROJECTS_DIR)) {
    const dir = join(PROJECTS_DIR, entry)
    let files: { full: string; mtime: number; size: number }[]
    try {
      files = readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const full = join(dir, f)
          const st = statSync(full)
          return { full, mtime: st.mtimeMs, size: st.size }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch {
      continue
    }
    if (!files.length) continue
    let cwd: string | null = null
    for (const file of files.slice(0, 3)) {
      const head = readSlice(file.full, 0, Math.min(file.size, CHUNK))
      const m = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/)
      if (m) {
        cwd = unescapeJson(m[1])
        break
      }
    }
    if (!cwd) continue
    if (cwd.startsWith('/private/var/') || cwd.startsWith('/var/folders/') || cwd.includes('/.ao/')) continue
    const prev = byPath.get(cwd)
    const lastUsedAt = files[0].mtime
    if (prev) {
      prev.sessions += files.length
      prev.lastUsedAt = Math.max(prev.lastUsedAt, lastUsedAt)
    } else {
      byPath.set(cwd, {
        path: cwd,
        name: basename(cwd),
        sessions: files.length,
        lastUsedAt,
        exists: existsSync(cwd),
        known: knownPaths.has(cwd)
      })
    }
  }
  return [...byPath.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

/** The start of Claude's last written answer in a transcript, for "done" notifications. */
export function lastReply(transcriptPath: string, max = 220): string {
  try {
    const size = statSync(transcriptPath).size
    // Request blobs of a hundred kilobytes or more often follow the answer, so read generously.
    const span = Math.min(size, 4 * 1024 * 1024)
    const text = readSlice(transcriptPath, size - span, span)
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line.includes('"type":"assistant"')) continue
      try {
        const content = JSON.parse(line)?.message?.content
        const parts = Array.isArray(content) ? content.filter((c: { type: string }) => c.type === 'text') : []
        const str = parts.map((c: { text: string }) => c.text).join(' ').replace(/[#*`>_]+/g, '').replace(/\s+/g, ' ').trim()
        if (str) return str.length > max ? str.slice(0, max - 1) + '…' : str
      } catch {
        // partial first line of the slice
      }
    }
  } catch {
    // transcript missing or unreadable
  }
  return ''
}
