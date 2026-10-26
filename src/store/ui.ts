import { create } from 'zustand'

interface UiState {
  importOpen: boolean
  importSeed: string
  paletteOpen: boolean
  /** 拖进来的图片，交给 AI 扒谱页面 */
  pendingImages: File[]
  openImport: (seed?: string) => void
  closeImport: () => void
  setPalette: (v: boolean) => void
  setPendingImages: (f: File[]) => void
}

export const useUi = create<UiState>((set) => ({
  importOpen: false,
  importSeed: '',
  paletteOpen: false,
  pendingImages: [],
  openImport: (seed = '') => set({ importOpen: true, importSeed: seed }),
  closeImport: () => set({ importOpen: false, importSeed: '' }),
  setPalette: (v) => set({ paletteOpen: v }),
  setPendingImages: (f) => set({ pendingImages: f }),
}))
