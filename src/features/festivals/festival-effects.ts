/**
 * Robi's festival animations: one canvas, one animation loop, everything drawn
 * live - fireworks, diyas, rangoli, gulal, kites, petals, peacock feathers,
 * garba lights, Om, moon and sun (6 Nov 2026).
 *
 * Kept light on purpose: particle counts scale with the screen and the
 * administrator's intensity, repeated shapes are drawn once into small sprites
 * and stamped, the loop pauses while the tab is hidden, and anyone who has
 * asked their system for reduced motion gets a single still frame instead.
 */

export type FallShape = 'petal' | 'marigold' | 'leaf' | 'feather' | 'coin' | 'modak' | 'rakhi' | 'confetti' | 'lotus'

export type Layer =
  | { kind: 'fireworks'; colors: string[]; rate: number }
  | { kind: 'sparkles'; colors: string[]; count: number }
  | { kind: 'diyas'; count?: number }
  | { kind: 'rangoli'; colors: string[]; flowers?: boolean }
  | { kind: 'gulal'; colors: string[]; rate: number }
  | { kind: 'fall'; shape: FallShape; colors: string[]; count: number; speed?: number }
  | { kind: 'kites'; colors: string[]; count: number }
  | { kind: 'clouds'; count: number }
  | { kind: 'lights'; colors: string[] }
  | { kind: 'bandhani'; color: string }
  | { kind: 'dandiya'; colors: string[]; count: number }
  | { kind: 'glyphs'; text: string; color: string; count: number }
  | { kind: 'moon'; color?: string }
  | { kind: 'stars'; count: number }
  | { kind: 'sun'; low?: boolean }
  | { kind: 'water'; diyas?: boolean }
  | { kind: 'embers'; count: number }
  | { kind: 'arrows'; color: string; rate: number }
  | { kind: 'chakra' }

export type SoundCue = 'launch' | 'boom' | 'crackle' | 'whoosh' | 'click' | 'chime'

export interface SceneOptions {
  /** 0.5 light, 1 normal, 1.6 rich: multiplies how much is on screen. */
  density: number
  /** Draw one still frame and stop. */
  reduced: boolean
  /** Asked for a sound at a moment in the animation (a burst, a clack). */
  onSound?: (cue: SoundCue) => void
}

interface Stage {
  w: number
  h: number
  /** Screen size relative to a laptop (1280 x 720), for speeds and sizes. */
  unit: number
  /** How many things to put on screen: intensity x screen area. */
  density: number
  t: number
  sound: (cue: SoundCue) => void
}

interface Runner {
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  /** A tap on the screen during a celebration. */
  burstAt?(x: number, y: number): void
  /** The screen changed size. */
  resize?(): void
}

/* ===================== Small helpers ===================== */

const TAU = Math.PI * 2
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Shapes drawn once per colour and size, then stamped: far cheaper than drawing each petal. */
const spriteCache = new Map<string, HTMLCanvasElement>()

function sprite(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const found = spriteCache.get(key)
  if (found) return found
  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const c = canvas.getContext('2d')!
  c.scale(scale, scale)
  paint(c, w, h)
  if (spriteCache.size > 300) spriteCache.clear()
  spriteCache.set(key, canvas)
  return canvas
}

function glowSprite(color: string, r: number) {
  return sprite(`glow:${color}:${r}`, r * 2, r * 2, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.25, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(0, 0, w, w)
  })
}

function shapeSprite(shape: FallShape, color: string, size: number): HTMLCanvasElement {
  const s = Math.round(size)
  switch (shape) {
    case 'petal':
      return sprite(`petal:${color}:${s}`, s, s * 1.4, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(255,255,255,0.55)')
        c.fillStyle = g
        c.beginPath()
        c.moveTo(w / 2, 0)
        c.bezierCurveTo(w, h * 0.3, w * 0.85, h * 0.85, w / 2, h)
        c.bezierCurveTo(w * 0.15, h * 0.85, 0, h * 0.3, w / 2, 0)
        c.fill()
      })
    case 'marigold':
      return sprite(`marigold:${color}:${s}`, s, s, (c, w) => {
        const r = w / 2
        for (let ring = 0; ring < 3; ring++) {
          const rr = r * (1 - ring * 0.28)
          const n = 12 - ring * 3
          c.fillStyle = ring === 1 ? shade(color, -0.12) : color
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + ring * 0.3
            c.beginPath()
            c.arc(r + Math.cos(a) * rr * 0.62, r + Math.sin(a) * rr * 0.62, rr * 0.36, 0, TAU)
            c.fill()
          }
        }
        c.fillStyle = shade(color, -0.3)
        c.beginPath()
        c.arc(r, r, r * 0.18, 0, TAU)
        c.fill()
      })
    case 'leaf':
      return sprite(`leaf:${color}:${s}`, s * 0.6, s * 1.5, (c, w, h) => {
        c.fillStyle = color
        c.beginPath()
        c.moveTo(w / 2, 0)
        c.quadraticCurveTo(w, h * 0.45, w / 2, h)
        c.quadraticCurveTo(0, h * 0.45, w / 2, 0)
        c.fill()
        c.strokeStyle = shade(color, 0.35)
        c.lineWidth = 0.8
        c.beginPath()
        c.moveTo(w / 2, h * 0.05)
        c.lineTo(w / 2, h * 0.95)
        c.stroke()
      })
    case 'feather':
      return sprite(`feather:${s}`, s * 0.7, s * 2.6, (c, w, h) => {
        // The stem.
        c.strokeStyle = '#8a9a5b'
        c.lineWidth = 1.2
        c.beginPath()
        c.moveTo(w / 2, h)
        c.quadraticCurveTo(w * 0.55, h * 0.5, w / 2, h * 0.08)
        c.stroke()
        // The vane: green-gold fronds.
        const vane = c.createLinearGradient(0, 0, 0, h)
        vane.addColorStop(0, 'rgba(46,139,87,0.95)')
        vane.addColorStop(0.6, 'rgba(85,160,60,0.7)')
        vane.addColorStop(1, 'rgba(120,150,60,0.15)')
        c.fillStyle = vane
        c.beginPath()
        c.ellipse(w / 2, h * 0.36, w * 0.48, h * 0.34, 0, 0, TAU)
        c.fill()
        // The eye: gold, green, deep blue, dark heart.
        const eye: [string, number, number][] = [
          ['#d4a017', 0.34, 0.2],
          ['#1f8a70', 0.27, 0.16],
          ['#123c9c', 0.19, 0.115],
          ['#0b1a4a', 0.1, 0.065],
        ]
        for (const [col, rx, ry] of eye) {
          c.fillStyle = col
          c.beginPath()
          c.ellipse(w / 2, h * 0.22, w * rx * 1.25, h * ry * 0.7, 0, 0, TAU)
          c.fill()
        }
      })
    case 'coin':
      return sprite(`coin:${s}`, s, s, (c, w) => {
        const r = w / 2
        const g = c.createRadialGradient(r * 0.7, r * 0.7, r * 0.1, r, r, r)
        g.addColorStop(0, '#fff3b0')
        g.addColorStop(0.5, '#f5c542')
        g.addColorStop(1, '#b8860b')
        c.fillStyle = g
        c.beginPath()
        c.arc(r, r, r * 0.95, 0, TAU)
        c.fill()
        c.strokeStyle = 'rgba(139,101,8,0.8)'
        c.lineWidth = Math.max(1, r * 0.1)
        c.beginPath()
        c.arc(r, r, r * 0.72, 0, TAU)
        c.stroke()
        c.fillStyle = 'rgba(120,80,0,0.85)'
        c.font = `bold ${Math.round(r * 0.95)}px sans-serif`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('₹', r, r * 1.04)
      })
    case 'modak':
      return sprite(`modak:${s}`, s, s * 1.15, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, '#fff8e7')
        g.addColorStop(1, '#f1d9a8')
        c.fillStyle = g
        c.beginPath()
        c.moveTo(w / 2, 0)
        c.bezierCurveTo(w * 1.05, h * 0.55, w * 0.95, h, w / 2, h)
        c.bezierCurveTo(w * 0.05, h, -w * 0.05, h * 0.55, w / 2, 0)
        c.fill()
        c.strokeStyle = 'rgba(190,150,90,0.7)'
        c.lineWidth = 0.9
        for (let i = -2; i <= 2; i++) {
          c.beginPath()
          c.moveTo(w / 2, h * 0.08)
          c.quadraticCurveTo(w / 2 + i * w * 0.16, h * 0.6, w / 2 + i * w * 0.2, h * 0.97)
          c.stroke()
        }
      })
    case 'rakhi':
      return sprite(`rakhi:${color}:${s}`, s * 2.2, s, (c, w, h) => {
        c.strokeStyle = '#d4a017'
        c.lineWidth = 1.4
        c.beginPath()
        c.moveTo(0, h / 2)
        c.lineTo(w, h / 2)
        c.stroke()
        const r = h * 0.45
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU
          c.fillStyle = i % 2 ? color : '#ffd54a'
          c.beginPath()
          c.arc(w / 2 + Math.cos(a) * r * 0.6, h / 2 + Math.sin(a) * r * 0.6, r * 0.38, 0, TAU)
          c.fill()
        }
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.arc(w / 2, h / 2, r * 0.32, 0, TAU)
        c.fill()
        c.fillStyle = color
        c.beginPath()
        c.arc(w / 2, h / 2, r * 0.18, 0, TAU)
        c.fill()
      })
    case 'lotus':
      return sprite(`lotus:${color}:${s}`, s * 1.4, s, (c, w, h) => {
        c.fillStyle = color
        for (const [dx, rot, sc] of [[0, 0, 1], [-0.22, -0.55, 0.85], [0.22, 0.55, 0.85], [-0.38, -1.0, 0.7], [0.38, 1.0, 0.7]] as const) {
          c.save()
          c.translate(w / 2 + dx * w, h)
          c.rotate(rot)
          c.scale(sc, sc)
          c.beginPath()
          c.moveTo(0, 0)
          c.bezierCurveTo(h * 0.35, -h * 0.4, h * 0.12, -h * 0.85, 0, -h)
          c.bezierCurveTo(-h * 0.12, -h * 0.85, -h * 0.35, -h * 0.4, 0, 0)
          c.globalAlpha = 0.9
          c.fill()
          c.restore()
        }
      })
    case 'confetti':
    default:
      return sprite(`confetti:${color}:${s}`, s * 0.5, s, (c, w, h) => {
        c.fillStyle = color
        c.fillRect(0, 0, w, h)
      })
  }
}

/** Lighter (amount > 0) or darker (< 0) version of a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const ch = (v: number) => clamp(Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)), 0, 255)
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/* ===================== The layers ===================== */

function fireworks(L: Extract<Layer, { kind: 'fireworks' }>, S: Stage): Runner {
  type Rocket = { x: number; y: number; vy: number; ty: number; color: string }
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }
  const rockets: Rocket[] = []
  const sparks: Spark[] = []
  let acc = 0.6
  const launch = () => {
    rockets.push({ x: rand(S.w * 0.12, S.w * 0.88), y: S.h + 8, vy: -rand(0.95, 1.25) * S.h, ty: rand(S.h * 0.12, S.h * 0.45), color: pick(L.colors) })
    S.sound('launch')
  }
  const explode = (x: number, y: number, color: string) => {
    const n = Math.round(rand(48, 84) * clamp(S.density, 0.5, 1.4))
    const second = pick(L.colors)
    const power = rand(150, 260) * S.unit
    const ring = Math.random() < 0.3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.06, 0.06)
      const speed = ring ? power : power * rand(0.35, 1)
      sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: rand(1.0, 1.7), color: i % 3 === 0 ? second : color })
    }
    if (sparks.length > 1400) sparks.splice(0, sparks.length - 1400)
    S.sound(Math.random() < 0.35 ? 'crackle' : 'boom')
  }
  return {
    update(dt) {
      acc += dt * L.rate * clamp(S.density, 0.4, 1.6)
      while (acc >= 1) {
        acc -= 1
        launch()
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.y += r.vy * dt
        r.vy += S.h * 0.55 * dt
        if (r.y <= r.ty || r.vy > -S.h * 0.08) {
          explode(r.x, r.y, r.color)
          rockets.splice(i, 1)
        }
      }
      const drag = Math.pow(0.28, dt)
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        p.vx *= drag
        p.vy = p.vy * drag + 70 * S.unit * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life += dt
        if (p.life > p.max) sparks.splice(i, 1)
      }
    },
    draw(ctx) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      for (const r of rockets) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = '#ffe6a0'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(r.x, r.y)
        ctx.lineTo(r.x, r.y - r.vy * 0.05)
        ctx.stroke()
      }
      ctx.lineWidth = 2 * Math.max(0.8, S.unit)
      for (const p of sparks) {
        const a = 1 - p.life / p.max
        ctx.globalAlpha = a * (0.75 + 0.25 * Math.sin(p.life * 40))
        ctx.strokeStyle = p.color
        ctx.beginPath()
        ctx.moveTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      ctx.restore()
    },
    burstAt(x, y) {
      explode(x, y, pick(L.colors))
    },
  }
}

function sparkles(L: Extract<Layer, { kind: 'sparkles' }>, S: Stage): Runner {
  type P = { x: number; y: number; vy: number; vx: number; r: number; ph: number; color: string }
  const make = (y?: number): P => ({
    x: rand(0, S.w),
    y: y ?? rand(0, S.h),
    vy: -rand(12, 40) * S.unit,
    vx: rand(-8, 8) * S.unit,
    r: rand(3, 7) * Math.max(0.7, S.unit),
    ph: rand(0, TAU),
    color: pick(L.colors),
  })
  let list: P[] = []
  const fill = () => {
    list = Array.from({ length: Math.round(L.count * S.density) }, () => make())
  }
  fill()
  return {
    resize: fill,
    update(dt) {
      for (const p of list) {
        p.y += p.vy * dt
        p.x += p.vx * dt
        if (p.y < -10) Object.assign(p, make(S.h + 10))
      }
    },
    draw(ctx) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const p of list) {
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(S.t * 2.2 + p.ph))
        ctx.globalAlpha = tw
        const img = glowSprite(p.color, Math.round(p.r * 2))
        ctx.drawImage(img, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4)
      }
      ctx.restore()
    },
  }
}

function drawDiya(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number, ph: number) {
  const flick = 1 + 0.12 * Math.sin(t * 13 + ph) + 0.06 * Math.sin(t * 29 + ph * 2)
  // Glow first, so the bowl sits in its own light.
  const glow = ctx.createRadialGradient(x, y - size * 0.55, 0, x, y - size * 0.55, size * 2.4 * flick)
  glow.addColorStop(0, 'rgba(255,190,80,0.45)')
  glow.addColorStop(1, 'rgba(255,140,0,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y - size * 0.55, size * 2.4 * flick, 0, TAU)
  ctx.fill()
  // The clay bowl.
  const bowl = ctx.createLinearGradient(x, y - size * 0.3, x, y + size * 0.4)
  bowl.addColorStop(0, '#d9772b')
  bowl.addColorStop(1, '#8a3b12')
  ctx.fillStyle = bowl
  ctx.beginPath()
  ctx.moveTo(x - size, y - size * 0.25)
  ctx.quadraticCurveTo(x, y + size * 0.65, x + size, y - size * 0.25)
  ctx.quadraticCurveTo(x + size * 0.55, y - size * 0.05, x + size * 1.15, y - size * 0.42)
  ctx.lineTo(x - size, y - size * 0.25)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,220,150,0.5)'
  ctx.fillRect(x - size * 0.7, y - size * 0.27, size * 1.4, size * 0.06)
  // The flame.
  const fh = size * 1.05 * flick
  const fx = x + size * 0.82
  const fy = y - size * 0.42
  const flame = ctx.createLinearGradient(fx, fy, fx, fy - fh)
  flame.addColorStop(0, '#fff7d6')
  flame.addColorStop(0.45, '#ffd34d')
  flame.addColorStop(1, 'rgba(255,120,0,0.85)')
  ctx.fillStyle = flame
  ctx.beginPath()
  ctx.moveTo(fx, fy)
  ctx.bezierCurveTo(fx + size * 0.32, fy - fh * 0.35, fx + size * 0.08 + Math.sin(t * 9 + ph) * size * 0.08, fy - fh * 0.8, fx, fy - fh)
  ctx.bezierCurveTo(fx - size * 0.1, fy - fh * 0.8, fx - size * 0.32, fy - fh * 0.35, fx, fy)
  ctx.fill()
}

function diyas(L: Extract<Layer, { kind: 'diyas' }>, S: Stage): Runner {
  let spots: { x: number; ph: number }[] = []
  const place = () => {
    const n = L.count ?? clamp(Math.round(S.w / 120), 4, 14)
    spots = Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n) * S.w, ph: rand(0, TAU) }))
  }
  place()
  return {
    resize: place,
    update() {},
    draw(ctx) {
      const size = clamp(16 * S.unit, 11, 26)
      for (const s of spots) drawDiya(ctx, s.x, S.h - size * 0.9, size, S.t, s.ph)
    },
  }
}

function rangoli(L: Extract<Layer, { kind: 'rangoli' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      const cx = S.w / 2
      const cy = S.h * 0.46
      const R = Math.min(S.w, S.h) * 0.24
      const reveal = clamp(S.t / 2.6, 0, 1)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(S.t * 0.06)
      ctx.globalAlpha = 0.92
      const rings = L.flowers ? 5 : 4
      for (let k = rings - 1; k >= 0; k--) {
        const r = R * (0.25 + (k / rings) * 0.85)
        const n = L.flowers ? 0 : 8 * (k + 1)
        const color = L.colors[k % L.colors.length]
        if (L.flowers) {
          // A pookalam: concentric rings of flowers, each with a scalloped edge.
          const lobes = 24 + k * 6
          const shown = Math.floor(lobes * reveal)
          ctx.fillStyle = color
          ctx.beginPath()
          for (let i = 0; i <= shown; i++) {
            const a = (i / lobes) * TAU
            const rr = r * (1 + 0.06 * Math.sin(i * 2))
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          }
          ctx.lineTo(0, 0)
          ctx.closePath()
          ctx.fill()
          continue
        }
        const shown = Math.floor(n * reveal)
        for (let i = 0; i < shown; i++) {
          const a = (i / n) * TAU
          ctx.save()
          ctx.rotate(a)
          ctx.translate(r, 0)
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.ellipse(0, 0, R * 0.13, R * 0.05, 0, 0, TAU)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.beginPath()
          ctx.arc(R * 0.16, 0, R * 0.018, 0, TAU)
          ctx.fill()
          ctx.restore()
        }
      }
      // The heart of the rangoli.
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.22)
      core.addColorStop(0, '#fff3c4')
      core.addColorStop(1, L.colors[0])
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.22 * reveal, 0, TAU)
      ctx.fill()
      ctx.restore()
    },
  }
}

function gulal(L: Extract<Layer, { kind: 'gulal' }>, S: Stage): Runner {
  type Cloud = { x: number; y: number; R: number; t: number; color: string; puffs: { dx: number; dy: number; r: number }[] }
  type Dust = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number }
  const clouds: Cloud[] = []
  const dust: Dust[] = []
  let acc = 0.8
  const splash = (x: number, y: number) => {
    const color = pick(L.colors)
    const R = rand(70, 170) * S.unit
    clouds.push({ x, y, R, t: 0, color, puffs: Array.from({ length: 6 }, () => ({ dx: rand(-1, 1) * R * 0.8, dy: rand(-1, 1) * R * 0.6, r: rand(0.3, 0.6) * R })) })
    const n = Math.round(36 * clamp(S.density, 0.5, 1.4))
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU)
      const sp = rand(60, 320) * S.unit
      dust.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.8, 1.6), color, r: rand(1.5, 4) * Math.max(0.7, S.unit) })
    }
    if (clouds.length > 18) clouds.shift()
    if (dust.length > 900) dust.splice(0, dust.length - 900)
    S.sound('whoosh')
  }
  return {
    update(dt) {
      acc += dt * L.rate * clamp(S.density, 0.4, 1.6)
      while (acc >= 1) {
        acc -= 1
        splash(rand(S.w * 0.08, S.w * 0.92), rand(S.h * 0.1, S.h * 0.85))
      }
      for (let i = clouds.length - 1; i >= 0; i--) {
        clouds[i].t += dt
        if (clouds[i].t > 3.2) clouds.splice(i, 1)
      }
      const drag = Math.pow(0.1, dt)
      for (let i = dust.length - 1; i >= 0; i--) {
        const p = dust[i]
        p.vx *= drag
        p.vy = p.vy * drag + 30 * S.unit * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life += dt
        if (p.life > p.max) dust.splice(i, 1)
      }
    },
    draw(ctx) {
      ctx.save()
      for (const c of clouds) {
        const grow = clamp(c.t / 0.6, 0, 1)
        const fade = c.t < 1.6 ? 1 : clamp(1 - (c.t - 1.6) / 1.6, 0, 1)
        ctx.globalAlpha = 0.5 * fade
        for (const p of [{ dx: 0, dy: 0, r: c.R }, ...c.puffs]) {
          const r = p.r * (0.4 + 0.6 * grow)
          const g = ctx.createRadialGradient(c.x + p.dx * grow, c.y + p.dy * grow, 0, c.x + p.dx * grow, c.y + p.dy * grow, r)
          g.addColorStop(0, c.color)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(c.x + p.dx * grow, c.y + p.dy * grow, r, 0, TAU)
          ctx.fill()
        }
      }
      for (const p of dust) {
        ctx.globalAlpha = 0.8 * (1 - p.life / p.max)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    },
    burstAt(x, y) {
      splash(x, y)
    },
  }
}

function fall(L: Extract<Layer, { kind: 'fall' }>, S: Stage): Runner {
  type P = { x: number; y: number; vy: number; amp: number; freq: number; ph: number; rot: number; vr: number; size: number; color: string }
  const base = L.shape === 'feather' ? 16 : L.shape === 'coin' ? 20 : L.shape === 'modak' ? 22 : L.shape === 'rakhi' ? 18 : L.shape === 'lotus' ? 20 : 12
  const make = (top: boolean): P => ({
    x: rand(0, S.w),
    y: top ? rand(-S.h * 0.3, -20) : rand(-S.h, S.h),
    vy: rand(40, 90) * (L.speed ?? 1) * S.unit,
    amp: rand(15, 45) * S.unit,
    freq: rand(0.6, 1.6),
    ph: rand(0, TAU),
    rot: rand(0, TAU),
    vr: rand(-1.6, 1.6),
    size: base * rand(0.75, 1.3) * clamp(S.unit, 0.75, 1.4),
    color: pick(L.colors),
  })
  let list: P[] = []
  const fill = () => {
    list = Array.from({ length: Math.round(L.count * S.density) }, () => make(false))
  }
  fill()
  return {
    resize: fill,
    update(dt) {
      for (const p of list) {
        p.y += p.vy * dt
        p.x += Math.cos(S.t * p.freq + p.ph) * p.amp * dt
        p.rot += p.vr * dt
        if (p.y > S.h + 40) Object.assign(p, make(true))
      }
    },
    draw(ctx) {
      ctx.save()
      for (const p of list) {
        const img = shapeSprite(L.shape, p.color, p.size)
        const w = img.width / 2
        const h = img.height / 2
        ctx.save()
        ctx.translate(p.x, p.y)
        if (L.shape === 'feather') ctx.rotate(Math.sin(S.t * p.freq + p.ph) * 0.5)
        else ctx.rotate(p.rot)
        if (L.shape === 'coin') ctx.scale(Math.cos(p.rot * 2.2), 1)
        ctx.globalAlpha = 0.92
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
        ctx.restore()
      }
      ctx.restore()
    },
    burstAt(x, y) {
      for (let i = 0; i < 10; i++) {
        const p = make(false)
        p.x = x + rand(-40, 40)
        p.y = y + rand(-30, 10)
        list.push(p)
      }
      if (list.length > 260) list.splice(0, list.length - 260)
      S.sound('chime')
    },
  }
}

function kites(L: Extract<Layer, { kind: 'kites' }>, S: Stage): Runner {
  type K = { x: number; y: number; vx: number; ph: number; size: number; c1: string; c2: string; anchor: number }
  const make = (x?: number): K => {
    const dir = Math.random() < 0.5 ? 1 : -1
    return {
      x: x ?? rand(0, S.w),
      y: rand(S.h * 0.08, S.h * 0.5),
      vx: dir * rand(14, 36) * S.unit,
      ph: rand(0, TAU),
      size: rand(26, 46) * clamp(S.unit, 0.7, 1.3),
      c1: pick(L.colors),
      c2: pick(L.colors),
      anchor: Math.random() < 0.5 ? -0.1 : 1.1,
    }
  }
  let list: K[] = []
  const fill = () => {
    list = Array.from({ length: Math.max(3, Math.round(L.count * S.density)) }, () => make())
  }
  fill()
  return {
    resize: fill,
    update(dt) {
      for (const k of list) {
        k.x += k.vx * dt
        if (k.x < -80) k.x = S.w + 60
        if (k.x > S.w + 80) k.x = -60
      }
    },
    draw(ctx) {
      ctx.save()
      for (const k of list) {
        const bob = Math.sin(S.t * 1.3 + k.ph) * 10 * S.unit
        const tilt = Math.sin(S.t * 0.9 + k.ph) * 0.25
        const x = k.x
        const y = k.y + bob
        const s = k.size
        // The string, curving down to a flyer below the screen.
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(x, y + s * 0.6)
        ctx.quadraticCurveTo(x + (k.anchor * S.w - x) * 0.3, y + (S.h - y) * 0.75, k.anchor * S.w, S.h + 20)
        ctx.stroke()
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(tilt)
        // A patang: a diamond in two colours, split down the middle.
        ctx.fillStyle = k.c1
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(s * 0.75, 0)
        ctx.lineTo(0, s * 0.8)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = k.c2
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(-s * 0.75, 0)
        ctx.lineTo(0, s * 0.8)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(80,50,20,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(0, s * 0.8)
        ctx.moveTo(-s * 0.75, 0)
        ctx.quadraticCurveTo(0, -s * 0.35, s * 0.75, 0)
        ctx.stroke()
        // The tail: a small triangle (the fumtu) on a wavy ribbon.
        ctx.strokeStyle = k.c1
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, s * 0.8)
        for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(S.t * 4 + i + k.ph) * s * 0.12, s * 0.8 + i * s * 0.12)
        ctx.stroke()
        ctx.fillStyle = k.c2
        ctx.beginPath()
        ctx.moveTo(0, s * 0.8)
        ctx.lineTo(s * 0.18, s * 1.05)
        ctx.lineTo(-s * 0.18, s * 1.05)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    },
    burstAt(x, y) {
      const k = make(x)
      k.y = y
      list.push(k)
      if (list.length > 24) list.shift()
      S.sound('whoosh')
    },
  }
}

function clouds(L: Extract<Layer, { kind: 'clouds' }>, S: Stage): Runner {
  let list: { x: number; y: number; s: number; v: number }[] = []
  const fill = () => {
    list = Array.from({ length: L.count }, () => ({ x: rand(0, S.w), y: rand(S.h * 0.05, S.h * 0.55), s: rand(50, 120) * S.unit, v: rand(6, 16) * S.unit }))
  }
  fill()
  return {
    resize: fill,
    update(dt) {
      for (const c of list) {
        c.x += c.v * dt
        if (c.x - c.s * 2 > S.w) c.x = -c.s * 2
      }
    },
    draw(ctx) {
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (const c of list) {
        ctx.beginPath()
        ctx.ellipse(c.x, c.y, c.s, c.s * 0.38, 0, 0, TAU)
        ctx.ellipse(c.x - c.s * 0.55, c.y + c.s * 0.08, c.s * 0.55, c.s * 0.3, 0, 0, TAU)
        ctx.ellipse(c.x + c.s * 0.6, c.y + c.s * 0.1, c.s * 0.6, c.s * 0.28, 0, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    },
  }
}

function lights(L: Extract<Layer, { kind: 'lights' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      ctx.save()
      for (let row = 0; row < 2; row++) {
        const y0 = 6 + row * 26 * S.unit
        const sag = (18 + row * 10) * S.unit
        const step = 30 * clamp(S.unit, 0.8, 1.2)
        ctx.strokeStyle = 'rgba(90,70,40,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, y0)
        ctx.quadraticCurveTo(S.w / 2, y0 + sag * 2, S.w, y0)
        ctx.stroke()
        let i = 0
        for (let x = step / 2; x < S.w; x += step, i++) {
          const u = x / S.w
          const y = y0 + 4 * sag * u * (1 - u)
          const n = L.colors.length
          const color = L.colors[(((i + Math.floor(S.t * 2) + row) % n) + n) % n]
          const on = 0.55 + 0.45 * Math.sin(S.t * 5 + i * 0.9 + row)
          ctx.globalAlpha = on
          const r = 9 * clamp(S.unit, 0.8, 1.2)
          ctx.drawImage(glowSprite(color, r), x - r, y + 2 - r * 0.4, r * 2, r * 2)
        }
      }
      ctx.restore()
    },
  }
}

function bandhani(L: Extract<Layer, { kind: 'bandhani' }>, S: Stage): Runner {
  // The tie-dye dots of a Gujarati chunari: groups of four around a centre, in bands top and bottom.
  return {
    update() {},
    draw(ctx) {
      ctx.save()
      ctx.globalAlpha = 0.55
      const step = 22 * clamp(S.unit, 0.8, 1.2)
      for (const band of [S.h - step * 1.6]) {
        ctx.fillStyle = L.color
        ctx.fillRect(0, band - step * 0.8, S.w, step * 1.8)
        ctx.fillStyle = '#fff6d6'
        for (let x = step / 2; x < S.w; x += step) {
          for (const [dx, dy] of [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]] as const) {
            ctx.beginPath()
            ctx.arc(x + dx * S.unit, band + dy * S.unit + 2, 1.6, 0, TAU)
            ctx.fill()
          }
        }
      }
      ctx.restore()
    },
  }
}

function dandiya(L: Extract<Layer, { kind: 'dandiya' }>, S: Stage): Runner {
  let pairs: { x: number; y: number; ph: number; c: string; last: number }[] = []
  const fill = () => {
    const n = Math.max(2, Math.round(L.count * clamp(S.density, 0.6, 1.4)))
    pairs = Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n) * S.w + rand(-30, 30), y: rand(S.h * 0.55, S.h * 0.78), ph: rand(0, TAU), c: pick(L.colors), last: 0 }))
  }
  fill()
  const stick = (ctx: CanvasRenderingContext2D, len: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(-3, -len, 6, len)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let y = -len + 6; y < -4; y += 10) ctx.fillRect(-3, y, 6, 3)
    ctx.fillStyle = '#ffd54a'
    ctx.beginPath()
    ctx.arc(0, -len, 4, 0, TAU)
    ctx.fill()
  }
  return {
    resize: fill,
    update() {
      for (const p of pairs) {
        const swing = Math.sin(S.t * 3.2 + p.ph)
        if (swing > 0.97 && S.t - p.last > 0.5) {
          p.last = S.t
          S.sound('click')
        }
      }
    },
    draw(ctx) {
      const len = 70 * clamp(S.unit, 0.75, 1.3)
      for (const p of pairs) {
        const swing = Math.sin(S.t * 3.2 + p.ph)
        const a = 0.15 + (1 - swing) * 0.5
        ctx.save()
        ctx.translate(p.x - 14, p.y)
        ctx.rotate(a)
        stick(ctx, len, p.c)
        ctx.restore()
        ctx.save()
        ctx.translate(p.x + 14, p.y)
        ctx.rotate(-a)
        stick(ctx, len, p.c)
        ctx.restore()
        if (swing > 0.9) {
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = (swing - 0.9) * 8
          const g = glowSprite('#ffd54a', 18)
          ctx.drawImage(g, p.x - 18, p.y - len * 0.95 - 18, 36, 36)
          ctx.restore()
        }
      }
    },
  }
}

function glyphs(L: Extract<Layer, { kind: 'glyphs' }>, S: Stage): Runner {
  type G = { x: number; y: number; vy: number; size: number; ph: number }
  const make = (y?: number): G => ({ x: rand(S.w * 0.05, S.w * 0.95), y: y ?? rand(0, S.h), vy: -rand(8, 20) * S.unit, size: rand(26, 64) * clamp(S.unit, 0.7, 1.3), ph: rand(0, TAU) })
  let list: G[] = []
  const fill = () => {
    list = Array.from({ length: Math.max(3, Math.round(L.count * S.density)) }, () => make())
  }
  fill()
  return {
    resize: fill,
    update(dt) {
      for (const g of list) {
        g.y += g.vy * dt
        if (g.y < -60) Object.assign(g, make(S.h + 40))
      }
    },
    draw(ctx) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = L.color
      ctx.shadowBlur = 18
      ctx.fillStyle = L.color
      for (const g of list) {
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(S.t * 0.8 + g.ph))
        ctx.font = `${Math.round(g.size)}px "Nirmala UI", "Noto Sans Devanagari", "Mangal", serif`
        ctx.fillText(L.text, g.x, g.y)
      }
      ctx.restore()
    },
  }
}

function moon(L: Extract<Layer, { kind: 'moon' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      const r = Math.min(S.w, S.h) * 0.09
      const x = S.w * 0.8
      const y = S.h * 0.2
      ctx.save()
      const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.2)
      glow.addColorStop(0, 'rgba(255,248,220,0.45)')
      glow.addColorStop(1, 'rgba(255,248,220,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r * 3.2, 0, TAU)
      ctx.fill()
      const face = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
      face.addColorStop(0, '#fffdf2')
      face.addColorStop(1, L.color ?? '#f3e6b8')
      ctx.fillStyle = face
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(200,185,140,0.35)'
      for (const [dx, dy, rr] of [[-0.3, -0.1, 0.18], [0.25, 0.25, 0.12], [0.1, -0.4, 0.09]] as const) {
        ctx.beginPath()
        ctx.arc(x + dx * r, y + dy * r, rr * r, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    },
  }
}

function stars(L: Extract<Layer, { kind: 'stars' }>, S: Stage): Runner {
  let list: { x: number; y: number; r: number; ph: number }[] = []
  const fill = () => {
    list = Array.from({ length: Math.round(L.count * clamp(S.density, 0.5, 1.5)) }, () => ({ x: rand(0, S.w), y: rand(0, S.h * 0.65), r: rand(0.6, 1.8), ph: rand(0, TAU) }))
  }
  fill()
  return {
    resize: fill,
    update() {},
    draw(ctx) {
      ctx.save()
      ctx.fillStyle = '#fffbe8'
      for (const s of list) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(S.t * 1.5 + s.ph))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    },
  }
}

function sun(L: Extract<Layer, { kind: 'sun' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      const r = Math.min(S.w, S.h) * (L.low ? 0.11 : 0.08)
      const x = L.low ? S.w / 2 : S.w * 0.18
      const y = L.low ? S.h * 0.74 : S.h * 0.2
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(S.t * 0.12)
      ctx.fillStyle = 'rgba(255,170,40,0.35)'
      for (let i = 0; i < 16; i++) {
        ctx.rotate(TAU / 16)
        ctx.beginPath()
        ctx.moveTo(r * 1.1, -r * 0.08)
        ctx.lineTo(r * 1.9 + Math.sin(S.t * 2 + i) * r * 0.1, 0)
        ctx.lineTo(r * 1.1, r * 0.08)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
      g.addColorStop(0, '#fff3c0')
      g.addColorStop(0.6, '#ffb52e')
      g.addColorStop(1, '#ff7a00')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    },
  }
}

function water(L: Extract<Layer, { kind: 'water' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      const top = S.h * 0.8
      ctx.save()
      const g = ctx.createLinearGradient(0, top, 0, S.h)
      g.addColorStop(0, 'rgba(255,140,60,0.35)')
      g.addColorStop(1, 'rgba(30,60,110,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, top, S.w, S.h - top)
      ctx.strokeStyle = 'rgba(255,220,160,0.55)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 9; i++) {
        const y = top + 8 + i * ((S.h - top) / 9)
        const w = S.w * (0.06 + 0.03 * Math.sin(S.t + i))
        const x = S.w / 2 + Math.sin(S.t * 0.8 + i * 1.7) * 30
        ctx.beginPath()
        ctx.moveTo(x - w, y)
        ctx.lineTo(x + w, y)
        ctx.stroke()
      }
      if (L.diyas) {
        const n = clamp(Math.round(S.w / 160), 3, 9)
        for (let i = 0; i < n; i++) {
          const x = ((i + 0.5) / n) * S.w + Math.sin(S.t * 0.6 + i) * 12
          const y = top + (S.h - top) * (0.45 + 0.3 * ((i % 3) / 3)) + Math.sin(S.t * 1.4 + i) * 3
          drawDiya(ctx, x, y, clamp(11 * S.unit, 8, 16), S.t, i)
        }
      }
      ctx.restore()
    },
  }
}

function embers(L: Extract<Layer, { kind: 'embers' }>, S: Stage): Runner {
  type E = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }
  const list: E[] = []
  return {
    update(dt) {
      const want = Math.round(L.count * clamp(S.density, 0.5, 1.5))
      while (list.length < want) {
        list.push({ x: S.w / 2 + rand(-S.w * 0.18, S.w * 0.18), y: S.h - rand(0, 30), vx: rand(-20, 20) * S.unit, vy: -rand(60, 160) * S.unit, life: 0, max: rand(1.2, 3), r: rand(1.2, 3.2) })
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]
        e.x += (e.vx + Math.sin(S.t * 3 + i) * 15) * dt
        e.y += e.vy * dt
        e.life += dt
        if (e.life > e.max) list.splice(i, 1)
      }
    },
    draw(ctx) {
      ctx.save()
      const g = ctx.createRadialGradient(S.w / 2, S.h, 0, S.w / 2, S.h, S.h * 0.45)
      g.addColorStop(0, `rgba(255,120,20,${0.45 + 0.08 * Math.sin(S.t * 8)})`)
      g.addColorStop(1, 'rgba(255,60,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, S.h * 0.5, S.w, S.h * 0.5)
      ctx.globalCompositeOperation = 'lighter'
      for (const e of list) {
        ctx.globalAlpha = 1 - e.life / e.max
        ctx.fillStyle = e.life < e.max * 0.4 ? '#ffd166' : '#ff7a1a'
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.r, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    },
  }
}

function arrows(L: Extract<Layer, { kind: 'arrows' }>, S: Stage): Runner {
  type A = { x: number; y: number; vx: number; vy: number; life: number }
  const list: A[] = []
  let acc = 0.5
  return {
    update(dt) {
      acc += dt * L.rate
      while (acc >= 1) {
        acc -= 1
        const sp = rand(700, 1000) * S.unit
        list.push({ x: -40, y: rand(S.h * 0.4, S.h * 0.9), vx: sp, vy: -sp * rand(0.25, 0.5), life: 0 })
        S.sound('whoosh')
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i]
        a.x += a.vx * dt
        a.y += a.vy * dt
        a.life += dt
        if (a.x > S.w + 60 || a.y < -60) list.splice(i, 1)
      }
    },
    draw(ctx) {
      ctx.save()
      for (const a of list) {
        const ang = Math.atan2(a.vy, a.vx)
        const len = 60 * clamp(S.unit, 0.8, 1.3)
        ctx.save()
        ctx.translate(a.x, a.y)
        ctx.rotate(ang)
        const trail = ctx.createLinearGradient(-len * 3, 0, 0, 0)
        trail.addColorStop(0, 'rgba(255,215,0,0)')
        trail.addColorStop(1, 'rgba(255,215,0,0.7)')
        ctx.strokeStyle = trail
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(-len * 3, 0)
        ctx.lineTo(-len, 0)
        ctx.stroke()
        ctx.strokeStyle = L.color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(-len, 0)
        ctx.lineTo(0, 0)
        ctx.stroke()
        ctx.fillStyle = L.color
        ctx.beginPath()
        ctx.moveTo(8, 0)
        ctx.lineTo(-6, -6)
        ctx.lineTo(-6, 6)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#c0392b'
        ctx.beginPath()
        ctx.moveTo(-len, 0)
        ctx.lineTo(-len - 10, -7)
        ctx.lineTo(-len + 4, 0)
        ctx.lineTo(-len - 10, 7)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    },
  }
}

function chakra(_L: Extract<Layer, { kind: 'chakra' }>, S: Stage): Runner {
  return {
    update() {},
    draw(ctx) {
      const r = Math.min(S.w, S.h) * 0.12
      ctx.save()
      ctx.translate(S.w / 2, S.h * 0.42)
      ctx.rotate(S.t * 0.4)
      ctx.strokeStyle = '#1a3a8f'
      ctx.lineWidth = Math.max(2, r * 0.06)
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = Math.max(1, r * 0.025)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        ctx.stroke()
      }
      ctx.fillStyle = '#1a3a8f'
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.12, 0, TAU)
      ctx.fill()
      ctx.restore()
    },
  }
}

function runnerFor(layer: Layer, S: Stage): Runner {
  switch (layer.kind) {
    case 'fireworks': return fireworks(layer, S)
    case 'sparkles': return sparkles(layer, S)
    case 'diyas': return diyas(layer, S)
    case 'rangoli': return rangoli(layer, S)
    case 'gulal': return gulal(layer, S)
    case 'fall': return fall(layer, S)
    case 'kites': return kites(layer, S)
    case 'clouds': return clouds(layer, S)
    case 'lights': return lights(layer, S)
    case 'bandhani': return bandhani(layer, S)
    case 'dandiya': return dandiya(layer, S)
    case 'glyphs': return glyphs(layer, S)
    case 'moon': return moon(layer, S)
    case 'stars': return stars(layer, S)
    case 'sun': return sun(layer, S)
    case 'water': return water(layer, S)
    case 'embers': return embers(layer, S)
    case 'arrows': return arrows(layer, S)
    case 'chakra': return chakra(layer, S)
  }
}

/* ===================== The scene ===================== */

/**
 * A running celebration on one canvas. start() plays until stop() (or the
 * duration ends, which the caller times); the last second fades out.
 */
export class FestivalScene {
  private ctx: CanvasRenderingContext2D
  private stage: Stage
  private runners: Runner[]
  private raf = 0
  private last = 0
  private fadeFrom = -1
  private fadeMs = 900
  private stopped = false
  private onDone: (() => void) | null = null
  private readonly onResize = () => this.resize()
  private readonly onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf)
    else if (!this.stopped && !this.options.reduced) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  constructor(private canvas: HTMLCanvasElement, layers: Layer[], private options: SceneOptions) {
    this.ctx = canvas.getContext('2d')!
    this.stage = { w: 0, h: 0, unit: 1, density: options.density, t: 0, sound: (cue) => this.options.onSound?.(cue) }
    this.measure()
    this.runners = layers.map((layer) => runnerFor(layer, this.stage))
    this.resize()
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private measure() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width || window.innerWidth))
    const h = Math.max(1, Math.round(rect.height || window.innerHeight))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.stage.w = w
    this.stage.h = h
    this.stage.unit = clamp(Math.min(w / 1280, h / 720) * 1.1, 0.55, 1.4)
    this.stage.density = this.options.density * clamp((w * h) / (1280 * 720), 0.45, 1.35)
  }

  private resize() {
    this.measure()
    for (const r of this.runners ?? []) r.resize?.()
    if (this.options.reduced) this.still()
  }

  /** Reduced motion: let the scene settle for a moment off-screen, then paint one frame. */
  private still() {
    this.stage.t = 2.8
    for (let i = 0; i < 20; i++) for (const r of this.runners) r.update(0.05)
    this.paint(1)
  }

  private paint(alpha: number) {
    const { ctx } = this
    ctx.clearRect(0, 0, this.stage.w, this.stage.h)
    ctx.globalAlpha = 1
    ctx.save()
    ctx.globalAlpha = alpha
    for (const r of this.runners) {
      ctx.save()
      r.draw(ctx)
      ctx.restore()
    }
    ctx.restore()
  }

  private frame = (now: number) => {
    if (this.stopped) return
    // A frame's timestamp can be a little earlier than the moment start() ran: never let the clock run backwards.
    const dt = clamp((now - this.last) / 1000, 0, 0.05)
    this.last = Math.max(this.last, now)
    this.stage.t += dt
    let alpha = Math.min(1, this.stage.t / 0.5)
    if (this.fadeFrom >= 0) {
      const f = clamp((now - this.fadeFrom) / this.fadeMs, 0, 1)
      alpha *= 1 - f
      if (f >= 1) {
        this.finish()
        return
      }
    }
    try {
      for (const r of this.runners) r.update(dt)
      this.paint(alpha)
    } catch {
      // One bad frame must never freeze the celebration: reset the canvas and draw again next frame.
      this.measure()
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  start() {
    if (this.options.reduced) {
      this.still()
      return
    }
    this.stopped = false
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Fade out, then call back. */
  stop(onDone?: () => void, fadeMs = 900) {
    this.onDone = onDone ?? null
    if (this.options.reduced || this.stopped) {
      this.finish()
      return
    }
    this.fadeMs = fadeMs
    this.fadeFrom = performance.now()
  }

  /** A tap on the celebration: a burst where the finger is, from the first layer that can. */
  burstAt(x: number, y: number) {
    if (this.options.reduced) return
    const r = this.runners.find((x) => x.burstAt)
    r?.burstAt?.(x, y)
  }

  private finish() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.ctx.clearRect(0, 0, this.stage.w, this.stage.h)
    const done = this.onDone
    this.onDone = null
    done?.()
  }

  destroy() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

export const INTENSITY_DENSITY = { light: 0.55, normal: 1, rich: 1.5 } as const
