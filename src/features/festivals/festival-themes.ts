/**
 * How each festival looks and sounds (6 Nov 2026): the colours, the backdrop of
 * a full-screen celebration, the animation layers, the opening sound, the
 * melody, and the little thing Robi wears that day.
 */

import type { Layer } from './festival-effects'
import type { MusicSpec } from './festival-audio'

export type ThemeKey =
  | 'diwali' | 'nutanvarsh' | 'holi' | 'holika' | 'ganesh' | 'sankranti' | 'navratri' | 'dussehra'
  | 'janmashtami' | 'shivratri' | 'ramnavami' | 'hanuman' | 'rakhi' | 'bhaidooj' | 'gold' | 'spring'
  | 'onam' | 'harvest' | 'chhath' | 'karwa' | 'newyear' | 'guru' | 'tulsi' | 'tricolor' | 'celebration'

export type Accessory =
  | 'diya' | 'gulal' | 'garland' | 'kite' | 'dandiya' | 'feather' | 'crescent' | 'tilak' | 'rakhi'
  | 'coin' | 'flower' | 'sun' | 'moon' | 'leaf' | 'flag' | 'bow' | 'party' | 'flame'

export interface FestivalTheme {
  label: string
  palette: string[]
  /** Behind a full-screen celebration. */
  backdrop: string
  /** The backdrop is dark: light text on it. */
  dark: boolean
  /** The main colour for chips, garlands and buttons. */
  accent: string
  full: Layer[]
  /** Lighter: "Play animation" over the page, and the short burst on Robi's greeting. */
  ambient: Layer[]
  accessory: Accessory
  fanfare: 'fireworks' | 'gulal' | 'bells' | 'kites' | 'dandiya' | 'calm'
  music: MusicSpec
}

/* Scales (semitones above Sa) and short original phrases in them. */
const YAMAN = [0, 2, 4, 6, 7, 9, 11]
const BHUPALI = [0, 2, 4, 7, 9]
const KAFI = [0, 2, 3, 5, 7, 9, 10]
const SHIVRANJANI = [0, 2, 3, 7, 9]
const DURGA = [0, 2, 5, 7, 9]
const KHAMAJ = [0, 2, 4, 5, 7, 9, 10]

const P_YAMAN = [[2, 3, 4, -1, 5, 4, 3, 2], [1, 2, 1, 0, -1, 0, 1, 2], [3, 5, 6, 7, 6, 5, 4, -1], [2, 3, 2, 1, 0, -1, -1, -1]]
const P_BHUPALI = [[0, 1, 2, -1, 3, 2, 1, 0], [2, 3, 4, 5, 4, 3, 2, -1], [5, 4, 3, 2, 1, 2, 0, -1], [1, 2, 3, 4, 3, 2, 1, 0]]
const P_KAFI = [[0, 1, 2, 3, 4, -1, 3, 2], [4, 5, 6, 7, 6, 5, 4, -1], [3, 4, 3, 2, 1, 0, 1, -1], [2, 3, 4, 4, 3, 2, 1, 0]]
const P_SHIVRANJANI = [[0, 1, 2, -1, 1, 0, -1, -1], [2, 3, 4, 3, 2, 1, 0, -1], [3, 4, 5, 4, 3, 2, 1, -1], [1, 2, 1, 0, -1, -1, -1, -1]]
const P_DURGA = [[0, 1, 2, 3, 4, 3, 2, 1], [2, 3, 4, 5, 4, 3, -1, -1], [4, 3, 2, 1, 2, 0, -1, -1], [1, 2, 3, 2, 1, 0, -1, -1]]
const P_KHAMAJ = [[2, 3, 4, 5, 4, 3, 2, -1], [4, 5, 6, 7, 6, 5, 4, -1], [5, 4, 3, 2, 1, 0, 1, -1], [2, 1, 0, -1, -1, -1, -1, -1]]

const NIGHT_FIRE = ['#ffd700', '#ff9f1c', '#ff4e50', '#f9d423', '#ff6bd6', '#7cf9ff']
const MARIGOLD = ['#ff9933', '#ffb300', '#f57c00', '#ffd54a']
const GULAL = ['#ff2e93', '#ffd23f', '#2ecc71', '#2f80ed', '#9b51e0', '#ff7a1a']
const KITE = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff9500']
const GARBA = ['#ff2d55', '#ff9500', '#ffcc00', '#34c759', '#5856d6', '#af52de', '#00c7be']
const GOLD = ['#ffd700', '#f5c542', '#fff1a8', '#ffb347']

export const THEMES: Record<ThemeKey, FestivalTheme> = {
  diwali: {
    label: 'Diwali lights and fireworks',
    palette: NIGHT_FIRE,
    backdrop: 'radial-gradient(ellipse at 50% 115%, rgba(255,140,0,0.42), rgba(18,8,38,0.9) 62%)',
    dark: true,
    accent: '#f59e0b',
    full: [
      { kind: 'stars', count: 70 },
      { kind: 'rangoli', colors: ['#ff4e50', '#ffd700', '#ff9f1c', '#e040fb'] },
      { kind: 'fireworks', colors: NIGHT_FIRE, rate: 1.5 },
      { kind: 'sparkles', colors: GOLD, count: 45 },
      { kind: 'diyas' },
    ],
    ambient: [{ kind: 'fireworks', colors: NIGHT_FIRE, rate: 0.8 }, { kind: 'sparkles', colors: GOLD, count: 28 }, { kind: 'diyas' }],
    accessory: 'diya',
    fanfare: 'fireworks',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 96, instrument: 'santoor', rhythm: 'keherwa', drone: true, bells: true },
  },
  nutanvarsh: {
    label: 'New Year rangoli and lights',
    palette: NIGHT_FIRE,
    backdrop: 'radial-gradient(ellipse at 50% 110%, rgba(255,170,40,0.4), rgba(40,12,30,0.88) 62%)',
    dark: true,
    accent: '#f59e0b',
    full: [
      { kind: 'rangoli', colors: ['#e63946', '#ffd700', '#2a9d8f', '#ff9f1c'] },
      { kind: 'fireworks', colors: NIGHT_FIRE, rate: 1.1 },
      { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 26 },
      { kind: 'diyas' },
    ],
    ambient: [{ kind: 'sparkles', colors: GOLD, count: 26 }, { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 14 }, { kind: 'diyas' }],
    accessory: 'diya',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 112, instrument: 'shehnai', rhythm: 'keherwa', drone: true },
  },
  holi: {
    label: 'Holi colours',
    palette: GULAL,
    backdrop: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.78), rgba(255,236,248,0.86))',
    dark: false,
    accent: '#ec4899',
    full: [{ kind: 'gulal', colors: GULAL, rate: 2.6 }, { kind: 'fall', shape: 'confetti', colors: GULAL, count: 40 }],
    ambient: [{ kind: 'gulal', colors: GULAL, rate: 1.2 }],
    accessory: 'gulal',
    fanfare: 'gulal',
    music: { scale: KAFI, phrases: P_KAFI, bpm: 128, instrument: 'flute', rhythm: 'dadra', drone: false },
  },
  holika: {
    label: 'Holika Dahan fire',
    palette: ['#ff7a1a', '#ffd166', '#ef476f'],
    backdrop: 'radial-gradient(ellipse at 50% 120%, rgba(255,90,0,0.5), rgba(20,8,10,0.9) 60%)',
    dark: true,
    accent: '#f97316',
    full: [{ kind: 'stars', count: 50 }, { kind: 'embers', count: 120 }, { kind: 'sparkles', colors: ['#ffd166', '#ff7a1a'], count: 20 }],
    ambient: [{ kind: 'embers', count: 60 }],
    accessory: 'flame',
    fanfare: 'calm',
    music: { scale: KAFI, phrases: P_KAFI, bpm: 100, instrument: 'flute', rhythm: 'dadra', drone: true },
  },
  ganesh: {
    label: 'Ganesh Chaturthi flowers and modak',
    palette: MARIGOLD,
    backdrop: 'linear-gradient(180deg, rgba(120,25,10,0.82), rgba(230,110,0,0.6))',
    dark: true,
    accent: '#f97316',
    full: [
      { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 34 },
      { kind: 'fall', shape: 'modak', colors: ['#fff8e7'], count: 10, speed: 0.8 },
      { kind: 'fall', shape: 'petal', colors: ['#e53935', '#ff7043'], count: 22 },
      { kind: 'sparkles', colors: GOLD, count: 26 },
    ],
    ambient: [{ kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 18 }, { kind: 'fall', shape: 'modak', colors: ['#fff8e7'], count: 5, speed: 0.8 }],
    accessory: 'garland',
    fanfare: 'bells',
    music: { scale: BHUPALI, phrases: P_BHUPALI, bpm: 104, instrument: 'shehnai', rhythm: 'keherwa', drone: true, bells: true },
  },
  sankranti: {
    label: 'Uttarayan kites in a blue sky',
    palette: KITE,
    backdrop: 'linear-gradient(180deg, rgba(100,185,255,0.93), rgba(200,235,255,0.88))',
    dark: false,
    accent: '#0ea5e9',
    full: [{ kind: 'sun' }, { kind: 'clouds', count: 6 }, { kind: 'kites', colors: KITE, count: 9 }],
    ambient: [{ kind: 'kites', colors: KITE, count: 5 }],
    accessory: 'kite',
    fanfare: 'kites',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 118, instrument: 'flute', rhythm: 'keherwa', drone: false },
  },
  navratri: {
    label: 'Navratri garba lights',
    palette: GARBA,
    backdrop: 'radial-gradient(circle at 50% 30%, rgba(130,20,95,0.82), rgba(20,5,40,0.92))',
    dark: true,
    accent: '#db2777',
    full: [
      { kind: 'lights', colors: GARBA },
      { kind: 'rangoli', colors: ['#ff2d55', '#ffcc00', '#34c759', '#5856d6'] },
      { kind: 'dandiya', colors: GARBA, count: 4 },
      { kind: 'sparkles', colors: GARBA, count: 34 },
    ],
    ambient: [{ kind: 'lights', colors: GARBA }, { kind: 'sparkles', colors: GARBA, count: 20 }],
    accessory: 'dandiya',
    fanfare: 'dandiya',
    music: { scale: DURGA, phrases: P_DURGA, bpm: 150, instrument: 'flute', rhythm: 'garba', drone: false },
  },
  dussehra: {
    label: 'Vijayadashami gold and fireworks',
    palette: GOLD,
    backdrop: 'radial-gradient(ellipse at 50% 100%, rgba(255,120,0,0.48), rgba(40,10,0,0.9) 65%)',
    dark: true,
    accent: '#eab308',
    full: [{ kind: 'sparkles', colors: GOLD, count: 50 }, { kind: 'arrows', color: '#ffd700', rate: 0.7 }, { kind: 'fireworks', colors: [...GOLD, '#ff6f3c'], rate: 1.1 }],
    ambient: [{ kind: 'sparkles', colors: GOLD, count: 30 }, { kind: 'arrows', color: '#ffd700', rate: 0.4 }],
    accessory: 'bow',
    fanfare: 'fireworks',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 108, instrument: 'shehnai', rhythm: 'keherwa', drone: true },
  },
  janmashtami: {
    label: 'Janmashtami peacock feathers',
    palette: ['#1e3a8a', '#2563eb', '#fbbf24', '#10b981'],
    backdrop: 'linear-gradient(180deg, rgba(12,30,90,0.92), rgba(30,64,175,0.78))',
    dark: true,
    accent: '#2563eb',
    full: [
      { kind: 'stars', count: 50 },
      { kind: 'fall', shape: 'feather', colors: ['#10b981'], count: 14, speed: 0.6 },
      { kind: 'fall', shape: 'petal', colors: ['#fbbf24', '#ffffff', '#f59e0b'], count: 26 },
      { kind: 'sparkles', colors: ['#fbbf24', '#93c5fd'], count: 28 },
    ],
    ambient: [{ kind: 'fall', shape: 'feather', colors: ['#10b981'], count: 7, speed: 0.6 }, { kind: 'sparkles', colors: ['#fbbf24'], count: 18 }],
    accessory: 'feather',
    fanfare: 'bells',
    music: { scale: BHUPALI, phrases: P_BHUPALI, bpm: 92, instrument: 'flute', rhythm: 'dadra', drone: true },
  },
  shivratri: {
    label: 'Maha Shivratri calm',
    palette: ['#c7d2fe', '#93c5fd', '#ffffff'],
    backdrop: 'radial-gradient(circle at 50% 40%, rgba(30,41,90,0.88), rgba(5,8,25,0.95))',
    dark: true,
    accent: '#6366f1',
    full: [{ kind: 'stars', count: 90 }, { kind: 'moon', color: '#e0e7ff' }, { kind: 'glyphs', text: 'ॐ', color: '#e0e7ff', count: 7 }, { kind: 'sparkles', colors: ['#c7d2fe'], count: 18 }],
    ambient: [{ kind: 'glyphs', text: 'ॐ', color: '#a5b4fc', count: 4 }, { kind: 'sparkles', colors: ['#c7d2fe'], count: 12 }],
    accessory: 'crescent',
    fanfare: 'calm',
    music: { scale: SHIVRANJANI, phrases: P_SHIVRANJANI, bpm: 66, instrument: 'flute', rhythm: 'none', drone: true, bells: true },
  },
  ramnavami: {
    label: 'Ram Navami saffron and flowers',
    palette: ['#ff9933', '#ffb84d', '#ffd700', '#ff6f00'],
    backdrop: 'linear-gradient(180deg, rgba(255,140,30,0.82), rgba(255,210,80,0.62))',
    dark: false,
    accent: '#f97316',
    full: [
      { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 30 },
      { kind: 'fall', shape: 'petal', colors: ['#ff9933', '#ffd700', '#ffffff'], count: 28 },
      { kind: 'sparkles', colors: GOLD, count: 26 },
    ],
    ambient: [{ kind: 'fall', shape: 'petal', colors: ['#ff9933', '#ffd700'], count: 18 }],
    accessory: 'tilak',
    fanfare: 'bells',
    music: { scale: BHUPALI, phrases: P_BHUPALI, bpm: 92, instrument: 'santoor', rhythm: 'keherwa', drone: true, bells: true },
  },
  hanuman: {
    label: 'Hanuman Jayanti saffron',
    palette: ['#ff7f00', '#ff4500', '#ffd700'],
    backdrop: 'linear-gradient(180deg, rgba(200,60,0,0.8), rgba(255,160,40,0.6))',
    dark: true,
    accent: '#ea580c',
    full: [{ kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 26 }, { kind: 'sparkles', colors: GOLD, count: 34 }],
    ambient: [{ kind: 'sparkles', colors: GOLD, count: 20 }],
    accessory: 'tilak',
    fanfare: 'bells',
    music: { scale: DURGA, phrases: P_DURGA, bpm: 112, instrument: 'shehnai', rhythm: 'keherwa', drone: true, bells: true },
  },
  rakhi: {
    label: 'Raksha Bandhan rakhis',
    palette: ['#e91e63', '#ff9800', '#ffd54a', '#9c27b0', '#00bcd4'],
    backdrop: 'linear-gradient(135deg, rgba(255,182,193,0.88), rgba(255,236,179,0.86))',
    dark: false,
    accent: '#e11d48',
    full: [
      { kind: 'fall', shape: 'rakhi', colors: ['#e91e63', '#9c27b0', '#ff9800', '#00bcd4'], count: 16, speed: 0.7 },
      { kind: 'fall', shape: 'petal', colors: ['#f48fb1', '#ffd54a'], count: 22 },
      { kind: 'sparkles', colors: ['#ffd54a', '#f48fb1'], count: 20 },
    ],
    ambient: [{ kind: 'fall', shape: 'rakhi', colors: ['#e91e63', '#9c27b0', '#ff9800'], count: 8, speed: 0.7 }],
    accessory: 'rakhi',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 104, instrument: 'santoor', rhythm: 'dadra', drone: false },
  },
  bhaidooj: {
    label: 'Bhai Dooj diyas and flowers',
    palette: ['#ff8a00', '#e52e71', '#ffd700'],
    backdrop: 'radial-gradient(ellipse at 50% 110%, rgba(255,140,40,0.42), rgba(50,12,30,0.86) 62%)',
    dark: true,
    accent: '#f97316',
    full: [{ kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 24 }, { kind: 'sparkles', colors: GOLD, count: 30 }, { kind: 'diyas' }],
    ambient: [{ kind: 'sparkles', colors: GOLD, count: 18 }, { kind: 'diyas' }],
    accessory: 'tilak',
    fanfare: 'bells',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 92, instrument: 'santoor', rhythm: 'keherwa', drone: true },
  },
  gold: {
    label: 'Gold coins and lamps',
    palette: GOLD,
    backdrop: 'radial-gradient(circle at 50% 30%, rgba(90,55,0,0.8), rgba(20,10,0,0.92))',
    dark: true,
    accent: '#ca8a04',
    full: [{ kind: 'fall', shape: 'coin', colors: ['#ffd700'], count: 26, speed: 0.9 }, { kind: 'sparkles', colors: GOLD, count: 40 }, { kind: 'diyas' }],
    ambient: [{ kind: 'fall', shape: 'coin', colors: ['#ffd700'], count: 12, speed: 0.9 }, { kind: 'sparkles', colors: GOLD, count: 16 }],
    accessory: 'coin',
    fanfare: 'bells',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 96, instrument: 'santoor', rhythm: 'keherwa', drone: true, bells: true },
  },
  spring: {
    label: 'Vasant yellow',
    palette: ['#ffd60a', '#ffc300', '#fff3b0', '#90be6d'],
    backdrop: 'linear-gradient(180deg, rgba(255,236,130,0.9), rgba(255,253,220,0.88))',
    dark: false,
    accent: '#eab308',
    full: [{ kind: 'fall', shape: 'petal', colors: ['#ffd60a', '#ffc300', '#ffffff'], count: 40 }, { kind: 'kites', colors: ['#ffd60a', '#ff9500', '#34c759'], count: 4 }, { kind: 'sparkles', colors: ['#ffd60a'], count: 20 }],
    ambient: [{ kind: 'fall', shape: 'petal', colors: ['#ffd60a', '#ffc300'], count: 20 }],
    accessory: 'flower',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 100, instrument: 'flute', rhythm: 'dadra', drone: false },
  },
  onam: {
    label: 'Onam pookalam',
    palette: ['#ffb703', '#fb8500', '#d62828', '#2a9d8f', '#ffffff'],
    backdrop: 'linear-gradient(180deg, rgba(220,245,200,0.9), rgba(255,240,190,0.88))',
    dark: false,
    accent: '#16a34a',
    full: [{ kind: 'rangoli', colors: ['#d62828', '#fb8500', '#ffb703', '#2a9d8f', '#ffffff'], flowers: true }, { kind: 'fall', shape: 'petal', colors: ['#ffb703', '#fb8500', '#d62828'], count: 30 }],
    ambient: [{ kind: 'fall', shape: 'petal', colors: ['#ffb703', '#fb8500', '#d62828'], count: 18 }],
    accessory: 'flower',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 108, instrument: 'santoor', rhythm: 'keherwa', drone: false },
  },
  harvest: {
    label: 'Harvest sun and sugarcane',
    palette: ['#ffb703', '#e85d04', '#2a9d8f', '#e9c46a'],
    backdrop: 'linear-gradient(180deg, rgba(255,214,140,0.9), rgba(255,246,214,0.88))',
    dark: false,
    accent: '#d97706',
    full: [{ kind: 'sun' }, { kind: 'fall', shape: 'leaf', colors: ['#2a9d8f', '#52b788'], count: 22 }, { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 22 }],
    ambient: [{ kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 14 }],
    accessory: 'sun',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 132, instrument: 'shehnai', rhythm: 'keherwa', drone: false },
  },
  chhath: {
    label: 'Chhath at sunset over water',
    palette: ['#ff7a00', '#ffb703', '#ffd166'],
    backdrop: 'linear-gradient(180deg, rgba(255,120,40,0.86), rgba(80,40,90,0.9))',
    dark: true,
    accent: '#ea580c',
    full: [{ kind: 'sun', low: true }, { kind: 'water', diyas: true }, { kind: 'sparkles', colors: ['#ffd166'], count: 20 }],
    ambient: [{ kind: 'sparkles', colors: ['#ffd166', '#ff7a00'], count: 18 }],
    accessory: 'sun',
    fanfare: 'calm',
    music: { scale: BHUPALI, phrases: P_BHUPALI, bpm: 80, instrument: 'flute', rhythm: 'none', drone: true, bells: true },
  },
  karwa: {
    label: 'Karwa Chauth moonrise',
    palette: ['#fff3c4', '#ffd166', '#ef476f'],
    backdrop: 'linear-gradient(180deg, rgba(10,15,45,0.93), rgba(40,20,70,0.88))',
    dark: true,
    accent: '#e11d48',
    full: [{ kind: 'stars', count: 110 }, { kind: 'moon' }, { kind: 'sparkles', colors: ['#ffd166', '#ef476f'], count: 20 }],
    ambient: [{ kind: 'sparkles', colors: ['#ffd166'], count: 16 }],
    accessory: 'moon',
    fanfare: 'calm',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 80, instrument: 'flute', rhythm: 'none', drone: true },
  },
  newyear: {
    label: 'New Year toran and flowers',
    palette: ['#ff9933', '#2a9d8f', '#ffd60a', '#e63946'],
    backdrop: 'linear-gradient(180deg, rgba(255,230,180,0.9), rgba(220,245,220,0.88))',
    dark: false,
    accent: '#16a34a',
    full: [
      { kind: 'rangoli', colors: ['#e63946', '#ff9933', '#ffd60a', '#2a9d8f'] },
      { kind: 'fall', shape: 'leaf', colors: ['#2a9d8f', '#52b788'], count: 18 },
      { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 22 },
    ],
    ambient: [{ kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 14 }, { kind: 'fall', shape: 'leaf', colors: ['#2a9d8f'], count: 8 }],
    accessory: 'garland',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 112, instrument: 'shehnai', rhythm: 'keherwa', drone: true },
  },
  guru: {
    label: 'Guru Purnima full moon',
    palette: ['#fff8e1', '#ffe082', '#f48fb1'],
    backdrop: 'linear-gradient(180deg, rgba(20,25,60,0.92), rgba(55,40,90,0.86))',
    dark: true,
    accent: '#a855f7',
    full: [{ kind: 'stars', count: 80 }, { kind: 'moon' }, { kind: 'fall', shape: 'lotus', colors: ['#f48fb1', '#fce4ec'], count: 12, speed: 0.6 }],
    ambient: [{ kind: 'fall', shape: 'lotus', colors: ['#f48fb1'], count: 6, speed: 0.6 }],
    accessory: 'moon',
    fanfare: 'calm',
    music: { scale: BHUPALI, phrases: P_BHUPALI, bpm: 76, instrument: 'flute', rhythm: 'none', drone: true, bells: true },
  },
  tulsi: {
    label: 'Tulsi Vivah leaves and lamps',
    palette: ['#2d6a4f', '#52b788', '#ffd60a', '#e63946'],
    backdrop: 'linear-gradient(180deg, rgba(210,240,215,0.9), rgba(255,245,210,0.88))',
    dark: false,
    accent: '#15803d',
    full: [{ kind: 'fall', shape: 'leaf', colors: ['#2d6a4f', '#52b788'], count: 26 }, { kind: 'fall', shape: 'marigold', colors: MARIGOLD, count: 18 }, { kind: 'diyas' }],
    ambient: [{ kind: 'fall', shape: 'leaf', colors: ['#2d6a4f', '#52b788'], count: 14 }],
    accessory: 'leaf',
    fanfare: 'bells',
    music: { scale: YAMAN, phrases: P_YAMAN, bpm: 100, instrument: 'shehnai', rhythm: 'keherwa', drone: true },
  },
  tricolor: {
    label: 'Tiranga',
    palette: ['#ff9933', '#ffffff', '#138808'],
    backdrop: 'linear-gradient(180deg, rgba(255,153,51,0.62), rgba(255,255,255,0.8) 50%, rgba(19,136,8,0.62))',
    dark: false,
    accent: '#ea580c',
    full: [{ kind: 'chakra' }, { kind: 'fall', shape: 'confetti', colors: ['#ff9933', '#ffffff', '#138808'], count: 60 }, { kind: 'kites', colors: ['#ff9933', '#138808', '#ffffff'], count: 4 }],
    ambient: [{ kind: 'fall', shape: 'confetti', colors: ['#ff9933', '#ffffff', '#138808'], count: 34 }],
    accessory: 'flag',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 104, instrument: 'shehnai', rhythm: 'keherwa', drone: true },
  },
  celebration: {
    label: 'Celebration confetti',
    palette: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'],
    backdrop: 'radial-gradient(circle at 50% 35%, rgba(60,40,120,0.82), rgba(10,10,30,0.9))',
    dark: true,
    accent: '#6366f1',
    full: [{ kind: 'fall', shape: 'confetti', colors: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'], count: 70 }, { kind: 'fireworks', colors: ['#6366f1', '#ec4899', '#f59e0b', '#10b981'], rate: 0.9 }],
    ambient: [{ kind: 'fall', shape: 'confetti', colors: ['#6366f1', '#ec4899', '#f59e0b', '#10b981'], count: 36 }],
    accessory: 'party',
    fanfare: 'bells',
    music: { scale: KHAMAJ, phrases: P_KHAMAJ, bpm: 116, instrument: 'santoor', rhythm: 'keherwa', drone: false },
  },
}

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0.5
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The theme's first three colours for a title or a header band, with any very
 * light one (Shivratri's pale blue, the tricolour's white) swapped for the
 * accent, so the words never fade into a white card or white text.
 */
export function strongColours(theme: FestivalTheme): [string, string, string] {
  const pick = (c: string | undefined) => (!c || luminance(c) > 0.45 ? theme.accent : c)
  return [pick(theme.palette[0]), pick(theme.palette[1]), pick(theme.palette[2])]
}

/** Navratri: the colour of each night, by weekday (the Maharashtra tradition many offices follow). */
export const NAVRATRI_WEEKDAY_COLOURS: { name: string; hex: string }[] = [
  { name: 'Orange', hex: '#f97316' }, // Sunday
  { name: 'White', hex: '#f8fafc' }, // Monday
  { name: 'Red', hex: '#dc2626' }, // Tuesday
  { name: 'Royal blue', hex: '#1d4ed8' }, // Wednesday
  { name: 'Yellow', hex: '#facc15' }, // Thursday
  { name: 'Green', hex: '#16a34a' }, // Friday
  { name: 'Grey', hex: '#6b7280' }, // Saturday
]
