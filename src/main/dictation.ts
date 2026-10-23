import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { DictationEvent } from '@shared/types'

// Built by `npm run build:native` next to the main bundle, unpacked from the asar in the app.
function helperPath(): string {
  return join(__dirname, '../native/SlashCodeDictee.app/Contents/MacOS/slashcode-dictate').replace('app.asar', 'app.asar.unpacked')
}

/** Drives the Swift helper that turns the microphone into text, one dictation at a time. */
export class Dictation {
  private proc: ChildProcessWithoutNullStreams | null = null

  constructor(private send: (e: DictationEvent) => void) {}

  start(lang: string): void {
    this.cancel()
    const bin = helperPath()
    if (!existsSync(bin)) {
      this.send({ type: 'error', code: 'missing', message: 'Le module de dictée n’est pas installé (npm run build:native).' })
      return
    }
    const args = ['--lang', lang]
    // Lets tests dictate a recording instead of the microphone.
    if (process.env.SLASHCODE_DICTATE_FILE) args.push('--file', process.env.SLASHCODE_DICTATE_FILE)
    const proc = spawn(bin, args)
    this.proc = proc
    let pending = ''
    let ended = false
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      pending += chunk
      let nl: number
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl).trim()
        pending = pending.slice(nl + 1)
        if (!line || this.proc !== proc) continue
        try {
          const e = JSON.parse(line) as DictationEvent
          if (e.type === 'final' || e.type === 'error') ended = true
          this.send(e)
        } catch {
          // not one of ours
        }
      }
    })
    proc.on('error', (err) => {
      if (this.proc !== proc) return
      ended = true
      this.send({ type: 'error', code: 'spawn', message: err.message })
    })
    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return
      this.proc = null
      if (!ended) {
        this.send({
          type: 'error',
          code: 'exit',
          message: signal === 'SIGABRT' ? 'macOS a refusé l’accès au micro ou à la reconnaissance vocale.' : `La dictée s’est arrêtée (code ${code ?? signal}).`
        })
      }
    })
  }

  /** Ends the recording; the final text arrives as a last event. */
  stop(): void {
    if (this.proc?.stdin.writable) this.proc.stdin.write('stop\n')
  }

  /** Drops the dictation without reporting anything. */
  cancel(): void {
    const proc = this.proc
    this.proc = null
    proc?.kill()
  }
}
