let ctx: AudioContext | null = null

/** A short two-note chime in the spirit of the XP balloon sound (synthesised, no sample). */
export function chime(kind: 'done' | 'warning'): void {
  try {
    ctx ??= new AudioContext()
    const notes = kind === 'warning' ? [880, 660] : [660, 990]
    notes.forEach((freq, i) => {
      const t = ctx!.currentTime + i * 0.13
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  } catch {
    // audio unavailable, stay silent
  }
}
