import { create } from 'zustand'

interface UiState {
  importOpen: boolean
  importSeed: string
  /** 导入内容是从乐谱文件转换来的：转换时略过的内容（可能为空数组） */
  importNotes: string[] | null
  paletteOpen: boolean
  /** 拖进来的图片，交给 AI 扒谱页面 */
  pendingImages: File[]
  openImport: (seed?: string, notes?: string[] | null) => void
  closeImport: () => void
  setPalette: (v: boolean) => void
  setPendingImages: (f: File[]) => void
}

export const useUi = create<UiState>((set) => ({
  importOpen: false,
  importSeed: '',
  importNotes: null,
  paletteOpen: false,
  pendingImages: [],
  openImport: (seed = '', notes = null) => set({ importOpen: true, importSeed: seed, importNotes: notes }),
  closeImport: () => set({ importOpen: false, importSeed: '', importNotes: null }),
  setPalette: (v) => set({ paletteOpen: v }),
  setPendingImages: (f) => set({ pendingImages: f }),
}))
