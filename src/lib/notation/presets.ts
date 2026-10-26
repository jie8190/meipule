// 常用节奏型预设
import type { PatternDef, SongDoc } from './types'

export interface PatternPreset extends PatternDef {
  id: string
  name: string
  time: string
  kind: 'arpeggio' | 'strum'
  desc: string
}

export const PATTERN_PRESETS: PatternPreset[] = [
  { id: '分解8', name: '八分分解', time: '4/4', kind: 'arpeggio', steps: 'T 3 2 3 1 3 2 3', desc: '最常用的弹唱分解，适合抒情慢歌' },
  { id: '交替低音', name: '交替低音分解', time: '4/4', kind: 'arpeggio', steps: 'T 3 2 3 T2 3 2 3', desc: '第三拍换到交替低音，层次更丰富' },
  { id: '分解4', name: '简单分解', time: '4/4', kind: 'arpeggio', steps: 'T/8 3 2 3', desc: '每两拍循环，新手友好' },
  { id: '琶音', name: '上行琶音', time: '4/4', kind: 'arpeggio', steps: 'T 3 2 1 2 3 2 3', desc: '先上行再下行，流动感强' },
  { id: '分解16', name: '十六分分解', time: '4/4', kind: 'arpeggio', steps: 'T 3 2 3 1 3 2 3 T2 3 2 3 1 3 2 3', desc: '快歌分解，可配合击弦' },
  { id: '拨扫', name: '低音 + 扫弦', time: '4/4', kind: 'strum', steps: 'T/4 d/8 u T2/4 d/8 u', desc: '先拨低音再轻扫，乡村/民谣常用' },
  { id: '民谣扫弦', name: '民谣扫弦', time: '4/4', kind: 'strum', steps: 'D - D U - U D U', desc: '下 空下上 空上下上，万能节奏型' },
  { id: '切音扫弦', name: '切音扫弦', time: '4/4', kind: 'strum', steps: 'D - X U - U X U', desc: '二四拍切音，流行快歌' },
  { id: '十六分扫弦', name: '十六分扫弦', time: '4/4', kind: 'strum', steps: 'D - D U - U D U D - D U - U D U', desc: '每拍四下，更密集的律动' },
  { id: '四分扫弦', name: '四分扫弦', time: '4/4', kind: 'strum', steps: 'D/4 D D D', desc: '每拍一下，最基础的扫弦' },
  { id: '摇滚八分', name: '摇滚八分', time: '4/4', kind: 'strum', steps: 'D> d D d D> d D d', desc: '全下扫，重音在 1、3 拍' },
  { id: '分解3', name: '三拍子分解', time: '3/4', kind: 'arpeggio', steps: 'T 3 2 1 2 3', desc: '华尔兹、圆舞曲' },
  { id: '扫弦3', name: '三拍子扫弦', time: '3/4', kind: 'strum', steps: 'D/4 D/8 U D U', desc: '下 下上 下上' },
  { id: '分解68', name: '6/8 分解', time: '6/8', kind: 'arpeggio', steps: 'T 3 2 1 2 3', desc: '6/8 拍抒情' },
  { id: '扫弦68', name: '6/8 扫弦', time: '6/8', kind: 'strum', steps: 'D - U D - U', desc: '强 弱 弱 次强 弱 弱' },
]

export function newSongTemplate(): SongDoc {
  return {
    format: 'meipule/2',
    title: '新曲谱',
    artist: '',
    key: 'C',
    capo: 0,
    tempo: 80,
    time: '4/4',
    tags: [],
    patterns: {
      分解: { name: '八分分解', steps: 'T 3 2 3 1 3 2 3' },
      扫弦: { name: '民谣扫弦', steps: 'D - D U - U D U' },
    },
    sections: [
      { name: '前奏', pattern: '分解', progression: 'C | G | Am | F' },
      {
        name: '主歌',
        pattern: '扫弦',
        measures: [{ chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' }],
      },
    ],
  }
}
