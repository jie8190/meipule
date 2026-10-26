import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type Accent = 'amber' | 'coral' | 'mint' | 'violet' | 'sky'
export type AiProvider = 'anthropic' | 'openai'

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh'

export interface AiSettings {
  provider: AiProvider
  apiKey: string
  baseUrl: string
  model: string
  /** Claude 思考强度：越高越准，但越慢越贵 */
  effort?: AiEffort
}

export interface Settings {
  theme: ThemeMode
  accent: Accent
  scorePaper: boolean
  scale: number
  showTab: boolean
  showDiagrams: boolean
  showChordNames: boolean
  showMelody: boolean
  showLyrics: boolean
  playGuitar: boolean
  playMelody: boolean
  metronome: boolean
  countIn: boolean
  followCursor: boolean
  volumes: { master: number; guitar: number; melody: number; click: number }
  autoScrollSpeed: number
  ai: AiSettings
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
  setAi: (patch: Partial<AiSettings>) => void
}

export const DEFAULT_AI: AiSettings = {
  provider: 'anthropic',
  apiKey: '',
  baseUrl: '',
  model: 'claude-opus-5-5',
  effort: 'high',
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'dark',
      accent: 'amber',
      scorePaper: false,
      scale: 1,
      showTab: true,
      showDiagrams: true,
      showChordNames: true,
      showMelody: true,
      showLyrics: true,
      playGuitar: true,
      playMelody: true,
      metronome: false,
      countIn: false,
      followCursor: true,
      volumes: { master: 0.9, guitar: 0.9, melody: 0.5, click: 0.6 },
      autoScrollSpeed: 24,
      ai: DEFAULT_AI,
      set: (patch) => set(patch),
      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
    }),
    { name: 'meipule:settings', version: 1 },
  ),
)

export function resolvedTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
