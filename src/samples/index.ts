// 内置示例曲谱（公版曲目与原创练习曲）
import type { SongDoc } from '../lib/notation/types'

export const SAMPLE_TWINKLE: SongDoc = {
  format: 'meipule/1',
  title: '小星星',
  artist: '儿歌',
  composer: '法国民谣',
  transcriber: '没谱了 示例',
  key: 'C',
  capo: 0,
  tempo: 92,
  time: '4/4',
  difficulty: 1,
  tags: ['入门', '分解和弦', '儿歌'],
  notes: '右手用 T（低音）+ 3 2 3 的分解和弦，和弦变化时低音自动跟着换。',
  patterns: {
    分解: { name: '四分之二拍分解', unit: 8, steps: 'T 3 2 3' },
  },
  sections: [
    { name: '前奏', pattern: '分解', progression: 'C | F C | G | C' },
    {
      name: '主歌',
      pattern: '分解',
      measures: [
        { chord: 'C', melody: '1 1 5 5', lyrics: '一闪一闪' },
        { chords: 'F C', melody: '6 6 5 -', lyrics: '亮晶晶' },
        { chords: 'F C', melody: '4 4 3 3', lyrics: '满天都是' },
        { chords: 'G C', melody: '2 2 1 -', lyrics: '小星星' },
        { chords: 'C F', melody: '5 5 4 4', lyrics: '挂在天上' },
        { chords: 'C G', melody: '3 3 2 -', lyrics: '放光明' },
        { chords: 'C F', melody: '5 5 4 4', lyrics: '好像许多' },
        { chords: 'C G', melody: '3 3 2 -', lyrics: '小眼睛' },
        { chord: 'C', melody: '1 1 5 5', lyrics: '一闪一闪' },
        { chords: 'F C', melody: '6 6 5 -', lyrics: '亮晶晶' },
        { chords: 'F C', melody: '4 4 3 3', lyrics: '满天都是' },
        { chords: 'G C', melody: '2 2 1 -', lyrics: '小星星' },
      ],
    },
    {
      name: '尾奏',
      measures: [{ chord: 'C', tab: 'T/8 3 2 1 2+3+T/2' }],
    },
  ],
}

export const SAMPLE_AMAZING_GRACE: SongDoc = {
  format: 'meipule/1',
  title: 'Amazing Grace',
  artist: 'John Newton',
  composer: 'New Britain（美国民谣）',
  transcriber: '没谱了 示例',
  key: 'G',
  capo: 0,
  tempo: 76,
  time: '3/4',
  difficulty: 2,
  tags: ['三拍子', '弱起', '英文', '分解和弦'],
  notes: '三拍子分解：T 3 2 1 2 3。第二遍唱第二段歌词。',
  patterns: {
    '3/4分解': { unit: 8, steps: 'T 3 2 1 2 3' },
  },
  sections: [
    {
      name: '主歌',
      pattern: '3/4分解',
      repeat: 2,
      measures: [
        { pickup: true, pattern: null, melody: '5,', lyrics: ['A-', "'Twas"] },
        { chord: 'G', melody: '1/2 3/8 1', lyrics: ['ma- zing _', 'grace that _'] },
        { chord: 'G7', melody: '3/2 2/4', lyrics: ['grace how', 'taught my'] },
        { chord: 'C', melody: '1/2 6,/4', lyrics: ['sweet the', 'heart to'] },
        { chord: 'G', melody: '5,/2 5,/4', lyrics: ['sound that', 'fear, and'] },
        { chord: 'G', melody: '1/2 3/8 1', lyrics: ['saved a _', 'grace my _'] },
        { chord: 'Em', melody: '3/2 2/4', lyrics: ['wretch like', 'fears re-'] },
        { chord: 'D', melody: '5/2.', lyrics: ['me!', 'lieved;'] },
        { chord: 'D7', melody: '-/2 3/4', lyrics: ['I', 'How'] },
        { chord: 'G', melody: '5/2 3/8 1', lyrics: ['once was _', 'pre- cious _'] },
        { chord: 'G7', melody: '3/2 2/4', lyrics: ['lost but', 'did that'] },
        { chord: 'C', melody: '1/2 6,/4', lyrics: ['now am', 'grace ap-'] },
        { chord: 'G', melody: '5,/2 5,/4', lyrics: ['found, was', 'pear the'] },
        { chord: 'Em', melody: '1/2 3/8 1', lyrics: ['blind but _', 'hour I _'] },
        { chord: 'D', melody: '3/2 2/4', lyrics: ['now I', 'first be-'] },
        { chord: 'G', melody: '1/2.', lyrics: ['see.', 'lieved.'] },
        { chord: 'G', melody: '-/2.' },
      ],
    },
  ],
}

export const SAMPLE_STRUM: SongDoc = {
  format: 'meipule/1',
  title: '万能和弦扫弦练习',
  artist: '没谱了 练习曲',
  transcriber: '没谱了 示例',
  key: 'C',
  tempo: 96,
  time: '4/4',
  difficulty: 2,
  tags: ['扫弦', '切音', '练习'],
  notes: '1-5-6-4 万能和弦进行。第一段民谣扫弦，第二段加入切音（X）。只需写和弦进行 + 节奏型，六线谱自动生成。',
  patterns: {
    民谣扫弦: { name: '下 空下上 空上下上', steps: 'D - D U - U D U' },
    切音扫弦: { name: '下 空切上 空上切上', steps: 'D - X U - U X U' },
  },
  sections: [
    { name: '民谣扫弦', pattern: '民谣扫弦', progression: 'C | G | Am | F', repeat: 2 },
    { name: '切音节奏', pattern: '切音扫弦', progression: 'C | G/B | Am | Em | F | C/E | Dm7 | G' },
    { name: '结尾', measures: [{ chord: 'C', tab: 'D/2 d(4-1)/4 r' }] },
  ],
}

export const SAMPLE_ETUDE: SongDoc = {
  format: 'meipule/1',
  title: '晨光练习曲',
  artist: '没谱了 原创',
  transcriber: '没谱了 示例',
  key: 'Am',
  tempo: 84,
  time: '4/4',
  difficulty: 3,
  tags: ['指弹', '六线谱', '技巧'],
  notes: '演示精确六线谱写法：弦:品，h 击弦、p 勾弦、s 滑音、~ 揉弦，+ 表示同时弹。',
  sections: [
    {
      name: 'A 段',
      measures: [
        { chord: 'Am', tab: '5:0/8 3:2 2:1 3:2 4:2+1:0 3:2 2:1 3:2' },
        { chord: 'F', tab: '4:3/8 3:2 2:1 3:2 4:3+1:1 3:2 2:1 3:2' },
        { chord: 'C', tab: '5:3/8 3:0 2:1 3:0 4:2+1:0 3:0 2:1 3:0' },
        { chord: 'G', tab: '6:3/8 3:0 2:0 3:0 4:0+1:3 3:0 2:0 3:0' },
      ],
    },
    {
      name: 'B 段',
      measures: [
        { chord: 'Am', tab: '5:0+1:0/8 3:2 1:3 3:2 4:2+1:5s 3:2 1:3 2:1' },
        { chord: 'F', tab: '4:3+1:1/8 3:2 2:1 2:3h 4:3+1:0 3:2 2:1 3:2' },
        { chord: 'E7', text: '注意勾弦', tab: '6:0+1:0/8 4:2 3:1 2:0 6:0+2:3/16 2:0p 3:1/8 4:2 3:1' },
        { chord: 'Am', tab: '5:0+1:5~/2 4:2+3:2+2:1+1:0/2' },
      ],
    },
  ],
}

export const SAMPLE_JASMINE: SongDoc = {
  format: 'meipule/1',
  title: '茉莉花',
  artist: '江苏民歌',
  transcriber: '没谱了 示例',
  key: 'C',
  tempo: 72,
  difficulty: 1,
  tags: ['和弦谱', '民歌'],
  notes: '和弦歌词谱（lines）写法：在歌词中用 [和弦] 标出换和弦的位置，适合快速记录弹唱。',
  sections: [
    { name: '前奏', lines: ['| C | Em | F | C |'] },
    {
      name: '主歌',
      lines: [
        '[C]好一朵美[Em]丽的[F]茉莉[C]花',
        '[C]好一朵美[Em]丽的[F]茉莉[C]花',
        '[Am]芬芳美[Em]丽满[F]枝[C]桠',
        '[F]又香又[C]白人[G]人[C]夸',
      ],
    },
    {
      name: '副歌',
      lines: ['[Am]让我来[Em]将你[F]摘[C]下', '[F]送给[G]别人[C]家', '[Am]茉莉[Em]花呀[F]茉莉[G]花[C]'],
    },
  ],
}

/** 多轨示例（原创）：用 Loop 一层层叠起来的指弹 */
export const SAMPLE_LOOP: SongDoc = {
  format: 'meipule/2',
  title: 'Loop 练习曲',
  artist: '没谱了 原创',
  transcriber: '没谱了 示例',
  key: 'D',
  tempo: 96,
  time: '4/4',
  difficulty: 3,
  tags: ['多轨', '指弹', 'Loop'],
  notes: '多轨（meipule/2）写法：每条轨有自己的调弦和变调夹；"%4" 表示和 4 小节之前一样，用来写 Loop 循环。播放时可以在混音里单独静音或独奏某一轨。',
  tracks: [
    { id: 'G1', name: '吉他 1', tuning: 'DADGAD' },
    { id: 'kick', name: '底鼓', type: 'drums' },
    { id: 'snare', name: '军鼓', type: 'drums' },
    { id: 'G2', name: '吉他 2', capo: 5 },
  ],
  sections: [
    {
      name: 'Loop 1 · 泛音',
      measures: [
        { tracks: { G1: { tab: '6:12*/8 4:12*/8 3:12*/4 2:12*/4 1:12*/4', text: '录第一轨 Loop' } } },
        { tracks: { G1: '5:7*/4 4:7*/4 3:7*/4 2:7*/4' } },
        { tracks: { G1: '6:12*/8 4:12*/8 3:12*/4 2:5*/4 1:5*/4' } },
        { tracks: { G1: { tab: '5:7*/2 4:7*+3:7*/2', text: '结束录制，开始循环' } } },
      ],
    },
    {
      name: 'Loop 2 · 底鼓',
      measures: [
        { tracks: { G1: '%4', kick: { hits: 'K/4 K K K', text: '第二轨：大鱼际拍面板' } } },
        { tracks: { G1: '%4', kick: 'K/4 K K K' } },
        { tracks: { G1: '%4', kick: 'K/4 K K K' } },
        { tracks: { G1: '%4', kick: 'K/4 K K/8 K/8 K/4' } },
      ],
    },
    {
      name: 'Loop 3 · 军鼓',
      measures: [
        { tracks: { G1: '%4', kick: '%4', snare: { hits: 'r/4 S r S', text: '第三轨：拍右下方侧板' } } },
        { tracks: { G1: '%4', kick: '%4', snare: 'r/4 S r S' } },
        { tracks: { G1: '%4', kick: '%4', snare: 'r/4 S r S' } },
        { tracks: { G1: '%4', kick: '%4', snare: 'r/4 S r/8 s/8 S>/4' } },
      ],
    },
    {
      name: '旋律',
      measures: [
        { tracks: { G1: '%4', kick: '%4', snare: '%4', G2: { tab: '1:5/4 1:4/8 1:2/8 1:0/2', text: '吉他 2 加入旋律' } } },
        { tracks: { G1: '%4', kick: '%4', snare: '%4', G2: '2:3/4 1:0 1:2 1:4' } },
        { tracks: { G1: '%4', kick: '%4', snare: '%4', G2: '1:5/4. 1:4/8 1:2/4 1:0/4' } },
        { tracks: { G1: '%4', kick: '%4', snare: '%4', G2: '2:3/8 2:2/8 2:0/4 3:2/2' } },
      ],
    },
    {
      name: '尾声',
      measures: [{ tracks: { G1: { tab: '6:12*+4:12*+3:12*+2:12*/1', text: '停掉所有 Loop' } } }],
    },
  ],
}

export const SAMPLES: SongDoc[] = [SAMPLE_TWINKLE, SAMPLE_AMAZING_GRACE, SAMPLE_STRUM, SAMPLE_ETUDE, SAMPLE_JASMINE, SAMPLE_LOOP]
