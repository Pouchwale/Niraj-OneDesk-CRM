/**
 * Robi's festival sounds, made in the browser with the Web Audio API (6 Nov
 * 2026): firecracker pops and crackles, a temple bell, a gulal whoosh,
 * dandiya clacks, and short original melodies in a raga's scale (flute,
 * santoor or shehnai over a tanpura drone, with tabla or dhol). Nothing is a
 * recording, so there is nothing to download and nothing copied.
 *
 * Browsers only allow sound after the person has clicked something, so an
 * automatic celebration starts silent and offers a sound button; every sound
 * respects the mute switch.
 */

import type { SoundCue } from './festival-effects'

export type Instrument = 'flute' | 'santoor' | 'shehnai'
export type Rhythm = 'keherwa' | 'dadra' | 'garba' | 'none'

export interface MusicSpec {
  /** Semitones above Sa for each note of the scale. */
  scale: number[]
  /** Phrases as scale-degree indices (an index past the end goes up an octave); -1 is a rest. */
  phrases: number[][]
  bpm: number
  instrument: Instrument
  rhythm: Rhythm
  drone: boolean
  /** Bells on the first beat of each cycle (devotional). */
  bells?: boolean
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let lastCue = 0

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.45
    master.connect(ctx.destination)
  }
  return ctx
}

/** Whether the browser will play sound now (it needs a click first). */
export function soundReady(): boolean {
  return ctx?.state === 'running'
}

/** Call from a click: lets the browser start sound. Resolves true once it plays. */
export async function unlockSound(): Promise<boolean> {
  // The voices list loads lazily in Chrome: ask early so Robi's first words use the right voice.
  try {
    window.speechSynthesis?.getVoices()
  } catch {
    /* no speech: sound still works */
  }
  const c = context()
  if (!c) return false
  try {
    if (c.state !== 'running') await c.resume()
  } catch {
    return false
  }
  return c.state === 'running'
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const buffer = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

function envGain(c: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  return g
}

function noiseBurst(c: AudioContext, at: number, opts: { type: BiquadFilterType; freq: number; q?: number; peak: number; decay: number; sweepTo?: number }) {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = opts.type
  f.frequency.setValueAtTime(opts.freq, at)
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + opts.decay)
  if (opts.q) f.Q.value = opts.q
  const g = envGain(c, at, opts.peak, 0.005, opts.decay)
  src.connect(f).connect(g).connect(master!)
  src.start(at, Math.random() * 0.5)
  src.stop(at + opts.decay + 0.05)
}

function tone(c: AudioContext, at: number, freq: number, type: OscillatorType, peak: number, attack: number, decay: number, endFreq?: number) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + attack + decay)
  const g = envGain(c, at, peak, attack, decay)
  o.connect(g).connect(master!)
  o.start(at)
  o.stop(at + attack + decay + 0.05)
}

/** A temple bell: inharmonic partials that ring and fade. */
function bell(c: AudioContext, at: number, base = 520, peak = 0.22) {
  for (const [ratio, amp, decay] of [[1, 1, 2.6], [2.76, 0.5, 1.8], [5.4, 0.25, 1.1], [8.93, 0.12, 0.7]] as const) {
    tone(c, at, base * ratio, 'sine', peak * amp, 0.004, decay)
  }
}

/** A short sound for a moment in the animation. Rate-limited so a crowd of bursts is not a roar. */
export function playCue(cue: SoundCue) {
  const c = context()
  if (!c || c.state !== 'running' || !master) return
  const now = c.currentTime
  if (now - lastCue < 0.07) return
  lastCue = now
  switch (cue) {
    case 'launch':
      tone(c, now, 500, 'sine', 0.035, 0.02, 0.5, 1500)
      break
    case 'boom':
      noiseBurst(c, now, { type: 'lowpass', freq: 900, peak: 0.5, decay: 0.9, sweepTo: 120 })
      tone(c, now, 70, 'sine', 0.35, 0.005, 0.5, 40)
      break
    case 'crackle':
      for (let i = 0; i < 12; i++) noiseBurst(c, now + 0.05 + Math.random() * 0.55, { type: 'highpass', freq: 2500, peak: 0.18, decay: 0.03 })
      noiseBurst(c, now, { type: 'lowpass', freq: 700, peak: 0.25, decay: 0.5, sweepTo: 150 })
      break
    case 'whoosh':
      noiseBurst(c, now, { type: 'bandpass', freq: 300, q: 1.2, peak: 0.2, decay: 0.7, sweepTo: 2400 })
      break
    case 'click':
      noiseBurst(c, now, { type: 'highpass', freq: 1800, peak: 0.28, decay: 0.05 })
      tone(c, now, 1650, 'triangle', 0.08, 0.002, 0.06)
      break
    case 'chime':
      tone(c, now, 1318.5, 'sine', 0.08, 0.004, 0.9)
      tone(c, now + 0.08, 1760, 'sine', 0.06, 0.004, 0.9)
      break
  }
}

/** The opening sound of a celebration. */
export function playFanfare(kind: 'fireworks' | 'gulal' | 'bells' | 'kites' | 'dandiya' | 'calm') {
  const c = context()
  if (!c || c.state !== 'running' || !master) return
  const now = c.currentTime
  if (kind === 'bells' || kind === 'calm') {
    bell(c, now, kind === 'calm' ? 392 : 523.25)
    bell(c, now + 1.1, kind === 'calm' ? 392 : 659.25, 0.16)
  } else if (kind === 'fireworks') {
    playCue('launch')
    window.setTimeout(() => playCue('boom'), 550)
    window.setTimeout(() => playCue('crackle'), 900)
  } else if (kind === 'gulal' || kind === 'kites') {
    playCue('whoosh')
    tone(c, now + 0.25, 880, 'triangle', 0.08, 0.01, 0.4)
    tone(c, now + 0.4, 1174.66, 'triangle', 0.07, 0.01, 0.5)
  } else if (kind === 'dandiya') {
    for (let i = 0; i < 4; i++) window.setTimeout(() => playCue('click'), i * 260)
  }
}

/* ===================== Music ===================== */

function note(c: AudioContext, at: number, freq: number, dur: number, inst: Instrument) {
  if (!master) return
  if (inst === 'santoor') {
    // Struck strings: three slightly detuned plucks that ring out.
    for (const detune of [-4, 0, 4]) {
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = freq
      o.detune.value = detune
      const g = envGain(c, at, 0.07, 0.003, Math.max(0.6, dur * 1.6))
      o.connect(g).connect(master)
      o.start(at)
      o.stop(at + dur * 1.6 + 0.7)
    }
    return
  }
  const o = c.createOscillator()
  o.type = inst === 'shehnai' ? 'sawtooth' : 'sine'
  o.frequency.value = freq
  // Vibrato after the note settles: the breath of a flute, the waver of a shehnai.
  const lfo = c.createOscillator()
  lfo.frequency.value = inst === 'shehnai' ? 6 : 5.2
  const depth = c.createGain()
  depth.gain.setValueAtTime(0, at)
  depth.gain.linearRampToValueAtTime(freq * (inst === 'shehnai' ? 0.012 : 0.007), at + Math.min(0.25, dur * 0.5))
  lfo.connect(depth).connect(o.frequency)
  const g = c.createGain()
  const peak = inst === 'shehnai' ? 0.05 : 0.13
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.06)
  g.gain.setValueAtTime(peak, at + Math.max(0.07, dur - 0.08))
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.12)
  let out: AudioNode = o
  if (inst === 'shehnai') {
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1300
    f.Q.value = 1.4
    o.connect(f)
    out = f
  }
  out.connect(g).connect(master)
  o.start(at)
  lfo.start(at)
  o.stop(at + dur + 0.2)
  lfo.stop(at + dur + 0.2)
  if (inst === 'flute') noiseBurst(c, at, { type: 'bandpass', freq: freq * 2, q: 2, peak: 0.012, decay: Math.min(0.3, dur) })
}

function drone(c: AudioContext, at: number, sa: number) {
  // Tanpura: Pa (low), Sa, Sa, Sa (low), each pluck humming out.
  const strings = [sa * 0.75, sa, sa, sa * 0.5]
  strings.forEach((f, i) => {
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    const g = envGain(c, at + i * 0.45, 0.025, 0.02, 1.8)
    o.connect(lp).connect(g).connect(master!)
    o.start(at + i * 0.45)
    o.stop(at + i * 0.45 + 1.9)
  })
}

function drum(c: AudioContext, at: number, stroke: string) {
  // Tabla-ish: the bayan's low boom and the dayan's ringing tone; ti/ka a dry tap.
  if (stroke.includes('dha') || stroke.includes('ge') || stroke.includes('dhin')) tone(c, at, 95, 'sine', 0.3, 0.004, 0.45, 60)
  if (stroke.includes('dha') || stroke.includes('na') || stroke.includes('dhi') || stroke.includes('ta') || stroke.includes('dhin')) {
    tone(c, at, 420, 'sine', 0.12, 0.002, 0.22)
    tone(c, at, 840, 'sine', 0.04, 0.002, 0.12)
  }
  if (stroke === 'ti' || stroke === 'ka') noiseBurst(c, at, { type: 'highpass', freq: 3000, peak: 0.08, decay: 0.04 })
  if (stroke === 'clack') playCueAt(c, at)
}

function playCueAt(c: AudioContext, at: number) {
  noiseBurst(c, at, { type: 'highpass', freq: 1800, peak: 0.22, decay: 0.05 })
  tone(c, at, 1650, 'triangle', 0.06, 0.002, 0.06)
}

const RHYTHMS: Record<Exclude<Rhythm, 'none'>, string[]> = {
  keherwa: ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'],
  dadra: ['dha', 'dhi', 'na', 'dha', 'ti', 'na'],
  // Garba: the dhol's swing in six, with the dandiya clack on the off-beats.
  garba: ['dhin', 'clack', 'ta', 'dhin', 'clack', 'ta'],
}

/**
 * Plays a short piece until stop() is called (or about 40 seconds pass).
 * Returns stop. Silent if sound is not allowed yet.
 */
export function playMusic(spec: MusicSpec, sa = 261.63): () => void {
  const c = context()
  if (!c || c.state !== 'running' || !master) return () => {}
  const beat = 60 / spec.bpm
  const start = c.currentTime + 0.1
  let nextAt = start
  let step = 0
  let phrase = 0
  let pos = 0
  const melodyNotes = spec.phrases
  const freqOf = (degree: number) => {
    const n = spec.scale.length
    const octave = Math.floor(degree / n)
    const semis = spec.scale[((degree % n) + n) % n] + 12 * octave
    return sa * Math.pow(2, semis / 12)
  }
  const pattern = spec.rhythm === 'none' ? [] : RHYTHMS[spec.rhythm]
  let stopped = false
  const timer = window.setInterval(() => {
    if (stopped) return
    while (nextAt < c.currentTime + 0.25) {
      if (spec.drone && step % 8 === 0) drone(c, nextAt, sa / 2)
      if (pattern.length) drum(c, nextAt, pattern[step % pattern.length])
      if (spec.bells && step % 16 === 0) bell(c, nextAt, 1046.5, 0.08)
      const line = melodyNotes[phrase % melodyNotes.length]
      const d = line[pos]
      if (d !== undefined && d >= 0) note(c, nextAt, freqOf(d), beat * 0.95, spec.instrument)
      pos++
      if (pos >= line.length) {
        pos = 0
        phrase++
      }
      step++
      nextAt += beat
    }
    if (c.currentTime - start > 40) stop()
  }, 80)
  const stop = () => {
    stopped = true
    window.clearInterval(timer)
  }
  return stop
}

/* ===================== Robi's voice ===================== */

let speaking = false

/** Says the greeting aloud in an Indian English voice when one is installed. False when the browser will not. */
export function speak(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    // Emoji, flags and joiners are not read aloud.
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim())
    const voices = synth.getVoices()
    const english = voices.filter((v) => v.lang.replace('_', '-').startsWith('en'))
    const voice =
      english.find((v) => /en-IN/i.test(v.lang.replace('_', '-')) && /natural|neural|online/i.test(v.name)) ??
      english.find((v) => /en-IN/i.test(v.lang.replace('_', '-'))) ??
      english.find((v) => /en-GB/i.test(v.lang.replace('_', '-'))) ??
      english[0]
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-IN'
    u.rate = 0.98
    u.pitch = 1.15
    u.onend = () => (speaking = false)
    u.onerror = () => (speaking = false)
    speaking = true
    synth.speak(u)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  if (speaking) window.speechSynthesis.cancel()
  speaking = false
}
