// 格式说明：同时用于「格式文档」页面和 AI 扒谱提示词
import JSON5 from 'json5'
import type { SongDoc } from './types'

export const FORMAT_SPEC = `# 「没谱了」吉他谱 JSON 格式（meipule/2）

一首曲子是一个 JSON 对象。核心思想是**参数化**：大多数弹唱伴奏只需要写「和弦 + 节奏型」，六线谱由程序自动生成；只有前奏、间奏、solo 等特殊段落才需要逐音写六线谱。

## 1. 顶层字段

| 字段 | 说明 | 示例 |
|---|---|---|
| title | 曲名（必填） | "晴天" |
| artist | 歌手/作者 | "周杰伦" |
| key | **原调**，即实际发声的调；小调写 "Am" | "A" |
| capo | 变调夹品位，默认 0 | 2 |
| tempo | 速度 BPM（以拍号分母为一拍） | 72 |
| time | 拍号 | "4/4"、"3/4"、"6/8" |
| tuning | 调弦，默认标准；可写 "dropD"、"DADGAD"、"openG"、"halfDown" 或 6 个音名数组（低音弦在前） | "dropD" |
| difficulty | 难度 1-5 | 2 |
| tags | 标签数组 | ["流行","弹唱"] |
| notes | 演奏说明 | "副歌扫弦加重" |
| chords | 自定义和弦指法（可选），6 位从 6 弦到 1 弦，x 表示不弹 | {"G": "320033", "Cadd9": "x32033"} |
| patterns | 节奏型定义（见第 3 节） | |
| pattern | 全曲默认节奏型 id | "p1" |
| tracks | 多轨（可选，见第 9 节）：多把吉他、鼓分轨写 | [{"id": "G1"}, {"id": "kick", "type": "drums"}] |
| sections | 段落数组（必填） | |

**关于调与变调夹**：谱面上写的和弦是「指法」（按的形状）。例如谱上写「原调 A，选调 G，变调夹 2 品」，就写 \`"key": "A", "capo": 2\`，和弦按 G 调指法写（G、D、Em、C…）。

## 2. 段落 sections

每个段落是一个对象，三选一：

- \`measures\`：小节数组（六线谱/简谱/歌词，最常用）
- \`progression\`：和弦进行速记，如 \`"C | G | Am | F"\`，一个 \`|\` 分隔一个小节，配合 pattern 使用
- \`lines\`：和弦歌词谱（没有节奏信息时用），如 \`"[C]好一朵美丽的[Am]茉莉花"\`

段落其它字段：\`name\`（前奏/主歌/副歌/间奏/尾奏…）、\`repeat\`（整段重复次数）、\`pattern\`（本段默认节奏型）、\`time\`（本段拍号）、\`note\`（备注）。

## 3. 节奏型 patterns（参数化的核心）

\`\`\`json
"patterns": {
  "分解": { "name": "4/4 分解", "steps": "T 3 2 3 1 3 2 3" },
  "扫弦": { "steps": "D - D U - U D U" },
  "切音": { "steps": "D - X U - U X U" }
}
\`\`\`

步骤记号（空格分隔，每个记号一步）：

| 记号 | 含义 |
|---|---|
| T | 当前和弦的根音低音弦（C 和弦是 5 弦，G 是 6 弦，D 是 4 弦） |
| T2 | 交替低音（如 G 和弦的 4 弦、C 和弦的 4 弦） |
| 1-6 | 弹第几弦（1 弦最细），品位自动取当前和弦指法 |
| 2+3 | 加号表示同时弹 |
| D / U | 下扫 / 上扫（D=从低音弦扫到 1 弦，U=扫高音几根弦） |
| d / u | 轻扫（只扫高音弦） |
| D(4-1) | 指定扫弦范围（4 弦到 1 弦） |
| X | 切音（扫弦并闷音） |
| - | 延音：本步不弹，前一个音继续响 |
| r | 休止（止音） |

**时值**：在记号后加 \`/4\` \`/8\` \`/16\`（四分/八分/十六分），\`/4.\` 为附点，\`/8t\` 为三连音；不写则沿用上一步的时值。如果整串都不写时值，会按小节长度平均分配（8 步 → 八分音符，16 步 → 十六分音符）。也可以用 \`"unit": 8\` 指定默认时值。节奏型比小节短时会自动重复填满小节，例如 "T 3 2 3"（四个八分音符）在 4/4 拍里会弹两遍。

## 4. 小节 measures

小节可以直接写成和弦字符串（如 \`"G"\`、\`"Em C"\`），也可以写成对象：

| 字段 | 说明 |
|---|---|
| chord | 整小节一个和弦 |
| chords | 多个和弦："F C"（平分小节）、"C - - G"（每个记号占等分，- 表示延续），或 [{"name":"G/B","beat":3}]（beat 从 1 开始） |
| pattern | 节奏型 id；写 null 表示本小节不弹伴奏 |
| tab | 精确六线谱（覆盖节奏型），见第 5 节 |
| melody | 简谱旋律，见第 6 节 |
| lyrics | 歌词；多段歌词用数组 ["第一段","第二段"] |
| text | 小节上方的文字标注（如「渐慢」） |
| time | 本小节拍号 |
| pickup | true 表示弱起小节（时值按实际内容） |

## 5. 精确六线谱 tab

记号格式 \`弦:品/时值\`，空格分隔：

- \`6:3/8\`：6 弦 3 品，八分音符
- \`5:3+2:1\`：同时弹 5 弦 3 品和 2 弦 1 品（也可写作 \`(5:3 2:1)\`）
- \`3\`：只写弦号时，品位取当前和弦指法；\`T\` 同理
- 技巧后缀（写在目标音上）：\`h\` 击弦、\`p\` 勾弦、\`s\` 滑音、\`b\` 推弦、\`~\` 揉弦、\`*\` 泛音、\`>\` 重音；\`3:x\` 为闷音（死音）
- 扫弦记号 D/U/X、延音 -、休止 r 同样可用

示例：\`"tab": "6:3/8 3:0 2:0 3:0 4:0+1:3 3:0 2:0 3:0"\`；击弦：\`"3:2/8 3:4h"\`。

## 6. 简谱旋律 melody

- \`1\`-\`7\` 为唱名，\`0\` 为休止；\`1'\` 高八度，\`5,\` 低八度（可叠加 \`1''\`）
- \`#4\` 升号，\`b7\` 降号
- 时值后缀同上：默认四分音符；\`3/8\` 八分，\`3/16\` 十六分，\`3/2\` 二分；不写时值沿用前一个音；\`5.\` 或 \`5/4.\` 为附点
- \`-\` 延长一拍（简谱的延长线）
- 小调歌曲按国内习惯用关系大调的 do（Am 的歌 1=C）

## 7. 歌词 lyrics

歌词按顺序对应旋律中的音（休止符和 - 不占字）：中文一个字对应一个音，英文一个单词一个音（用连字符拆音节：\`"A-ma-zing"\`）。\`_\` 表示这个音不唱新字（拖腔）。标点会自动跟在前一个字后面。没有旋律时歌词会平均排在小节下方。

## 8. 校验规则

- 每小节的六线谱、旋律时值合计应等于拍号（4/4 = 4 拍），弱起小节加 \`"pickup": true\`
- 和弦名使用标准写法：C、Cm、C7、Cmaj7、Cm7、Csus4、Cadd9、Cdim、C/E、F#m7b5 等

## 9. 多轨 tracks

一首曲子有几把吉他、或者有鼓/拍琴板这类打击乐时，在顶层用 \`tracks\` 列出音轨，\`"format"\` 写 \`"meipule/2"\`。只有一把吉他时不需要 tracks。

| 音轨字段 | 说明 |
|---|---|
| id | 唯一标识（必填），小节里用它引用，如 "G1"、"G2"、"kick" |
| name | 显示名，如 "吉他 2"、"底鼓" |
| type | "guitar"（默认）或 "drums" |
| tuning | 本轨调弦，不写同全曲 |
| capo | 本轨变调夹，不写同全曲 |
| pattern | 本轨默认节奏型 |
| hidden | true 表示谱面上默认隐藏（仍会播放） |

**第一条吉他轨是主轨**：小节顶层的 tab / pattern 属于它，全曲的 key、capo 也以它为准。其它轨写在小节的 \`tracks\` 里，键是音轨 id：

- 字符串是简写：吉他轨当作 tab，鼓轨当作 hits，如 \`"tracks": {"G2": "1:5/4 1:4/8 1:2/8 1:0/2", "kick": "K/4 K K K"}\`
- 对象写法：\`{"tab": "...", "pattern": "扫弦", "chord": "G", "text": "第二轨 Loop"}\`（鼓轨用 \`hits\`）；\`text\` 显示在这一轨上方
- \`"%"\` 表示和上一小节一样，\`"%4"\` 表示和 4 小节之前一样：用来写 Loop 循环、反复演奏的声部
- 本小节没写的轨就是不弹（休止）；段落里用 \`"tracks": {"G2": {"pattern": "扫弦"}}\` 可以给某轨设本段默认节奏型

**鼓轨记号 hits**（空格分隔，时值规则与六线谱相同）：

| 记号 | 含义 |
|---|---|
| K | 底鼓（拍琴面板） |
| S | 军鼓（拍侧板） |
| H / O | 闭镲 / 开镲 |
| C | 吊镲 |
| T | 通鼓 |
| X | 拍弦、闷击 |
| 小写 | 轻击，如 s |
| > | 重音，如 S> |
| K+H | 同时击打（也可写作 (K H)） |
| r / - | 休止 / 延长 |

\`\`\`json
"tracks": [
  { "id": "G1", "name": "吉他 1", "tuning": "DADGAD" },
  { "id": "kick", "name": "底鼓", "type": "drums" },
  { "id": "G2", "name": "吉他 2", "capo": 5 }
],
"sections": [{ "name": "Loop", "measures": [
  { "tab": "6:12*/8 4:12*/8 3:12*/4 2:12*/4 1:12*/4", "text": "录第一轨 Loop" },
  { "tracks": { "G1": "%", "kick": "K/4 K K K" } },
  { "tracks": { "G1": "%", "kick": "%", "G2": "1:5/4 1:4/8 1:2/8 1:0/2" } }
]}]
\`\`\`
`

export const EXAMPLE_DOC: SongDoc = {
  title: '示例：小星星',
  artist: '儿歌',
  key: 'C',
  capo: 0,
  tempo: 92,
  time: '4/4',
  tags: ['示例'],
  patterns: {
    分解: { steps: 'T/8 3 2 3' },
    扫弦: { steps: 'D - D U - U D U' },
  },
  sections: [
    { name: '前奏', pattern: '分解', progression: 'C | F C | G | C' },
    {
      name: '主歌',
      pattern: '分解',
      repeat: 2,
      measures: [
        { chord: 'C', melody: '1 1 5 5', lyrics: ['一闪一闪', '挂在天上'] },
        { chords: 'F C', melody: '6 6 5 -', lyrics: ['亮晶晶', '放光明'] },
        { chords: 'G C', melody: '2 2 1 -', lyrics: ['小星星', '小眼睛'] },
      ],
    },
    {
      name: '间奏',
      measures: [{ chord: 'C', tab: '5:3/8 3:0 2:1 3:0 4:2+1:0 3:0 2:1h 2:3' }, { chord: 'G', pattern: '扫弦' }],
    },
  ],
}

export type TranscribeMode = 'auto' | 'strum' | 'finger' | 'chords'

export function buildPrompt(opts: { mode: TranscribeMode; extra?: string; hasImages: boolean; text?: string; imageGuide?: string }): string {
  const modeHint: Record<TranscribeMode, string> = {
    auto: '根据曲谱内容自行判断最合适的写法。',
    strum: '这是弹唱谱：谱面给了节奏型（分解或扫弦）就用 patterns + 每小节的和弦来表达伴奏；前奏/间奏有六线谱就用 tab 精确记录；谱面有简谱就写 melody，没有就不要编。',
    finger: '这是指弹/独奏谱：每个小节都用 tab 精确记录六线谱上的每一个音和时值，包括技巧（h/p/s/b/~）。',
    chords: '这是和弦歌词谱（没有六线谱）：用 lines 写法，在歌词中用 [和弦] 标出换和弦的位置；有前奏和弦进行时写成 "| C | G | Am | F |" 这样的行。',
  }
  return `你是一位专业的吉他扒谱师。请把${opts.hasImages ? '图片中的吉他谱' : '下面提供的吉他谱内容'}转写成「没谱了」App 的 JSON 格式。

## 输出要求
1. 只输出一个 JSON 对象，放在 \`\`\`json 代码块中，不要输出任何其它解释文字。
2. 严格遵守下方的格式说明，字段名使用英文。
3. ${modeHint[opts.mode]}
4. 忠实于原谱是第一位的：原谱有什么就写什么，不要补出原谱没有的节奏、小节划分或旋律。原谱给了节奏型时，再用 patterns 参数化表达（定义节奏型，小节里只写和弦）。
5. 有小节的段落要核对每个小节的时值总和等于拍号；弱起小节标记 "pickup": true。
6. 和弦按谱面上的指法写；"key" 写原调（实际音高），"capo" 写变调夹品位。
7. 有小节的段落整段重复用 "repeat"；同一段旋律的多段歌词用 lyrics 数组。
8. 不要编造，也不要轻易放弃：照片有透视、反光、轻微模糊是常态，图片已经裁剪放大过，逐个数字认真读，能读出来的都要写进 tab。只有个别确实认不出的音才省略（用休止 r 占住时值），并在顶层 "notes" 里说明是哪几个小节。不能因为谱子长或部分模糊就只输出段落名。
9. 歌词与简谱一一对应：每个非休止的简谱音符对应一个字，拖腔用 _。
10. 原谱有多个音轨/声部（谱面左边标着 G1、G2、底鼓、军鼓等，几行谱线用括号连成一组）时，用 tracks 分轨转写（"format": "meipule/2"）：每条谱线一个音轨，按原谱从上到下的顺序；各轨的调弦、变调夹写在音轨里（谱头常写着「DADGAD Guitar」「Standard tuning」「Capo fret 5」）；鼓、拍琴板等打击乐写成鼓轨 hits；Loop 循环或反复演奏的内容用 "%N" 复制。不要把几个声部的音混写进同一轨。用户在补充说明里指定只扒某一轨时，就只写那一轨。贝斯等格式里没有的乐器，在顶层 "notes" 里说明。

## 读谱要点（务必遵守）
- 谱头信息：国内吉他谱 App（有谱么、吉他世界等）常写「G调 / 夹2品 / 原唱调 1=A」。其中「G调」是指法（和弦按 G 调的形状写），「夹2品」是 capo: 2，「原唱调 1=A」是 key: "A"，三者满足 指法调 + 变调夹 = 原调。只写了「X调」没写夹子时，key 就是 X、capo 为 0。拍速写进 tempo。
- 六线谱读弦：最上面一条线是 1 弦（最细的高音 E 弦），最下面一条是 6 弦。每个数字都要逐条数线确定在第几弦；同一竖列上下对齐的数字是同时弹，用 + 连接。
- 用和弦交叉检查六线谱：分解和弦伴奏里的音几乎都属于当前和弦，品位一般就是该和弦按法里那根弦的品位（例如 G 和弦下 4 弦 0 品、3 弦 0 品，C 和弦下 5 弦 3 品）。读出来的音如果大多不在和弦里，多半是弦号数错了，重新数线。
- 段落顺序：严格按原谱从上到下的顺序输出段落，段名用原谱上的写法（如「主歌 A」「桥段 A」）；不要把一个段落的内容并到另一个段落里。原谱里的每个段落标题都要对应一个段落，输出前逐个核对、一个都不能漏（只有和弦没有歌词的间奏也要写）。
- 只有「和弦图 + 歌词」、没有六线谱或节奏的段落（大多数弹唱谱的主歌、副歌），用 lines 写法：原谱的每一行（一排和弦图 + 下面那行歌词）对应 lines 里的一行，包括只有一个和弦图、下面没有字的行（写成 "[D]"），一行都不能漏。每个和弦图都要写出来（同一个和弦连续出现几次就写几次）。不要自己划分小节、不要编节奏型。
- 和弦写在哪个字前面：看和弦图正下方的那个字（通常带下划线），不一定是一句的第一个字。例如和弦图在「青」的正上方，就写「把[G]青春献给」而不是「[G]把青春献给」。歌词后面单独的下划线「_」表示在拖长的音上换和弦：和弦图在这个「_」上方时，[和弦] 写在最后一个字的后面、后面不跟字（写「辉煌的都市[C]」，不要写成「辉煌的都[C]市」）；下划线本身不写进歌词。歌词逐字照抄，不要改字、不要补字。
- 泛音：谱上写成 <12>、<7> 这样带尖括号的数字，记成 \`弦:品*\`，如 \`3:12*\`；「Harm.」「A.H.」等标记也是泛音。
- 谱面画了和弦图时，按图核对按法；和弦图里横跨几根弦的粗线是横按（一根手指按住这几根弦的同一品），例如标成 C9、1~3 弦第 3 品有横按，按法就是 x32333；和常见按法不同的（例如标成 C9 但图上是 x32033），把按法写进 chords（6 位，低音弦在前）。
- 「Repeat 桥段B 副歌」「重复副歌」这类标记：把要重复的段落按顺序再完整写一遍（段名后加「（重复）」），不要只留一个空段落。
- 鼓点、律动、演奏提示等格式无法表达的信息，写进顶层 notes 或对应段落的 note。

${FORMAT_SPEC}

## 完整示例
\`\`\`json
${formatSongJson(EXAMPLE_DOC)}
\`\`\`
${opts.imageGuide?.trim() ? `\n## 图片说明\n${opts.imageGuide.trim()}\n` : ''}${opts.extra?.trim() ? `\n## 补充说明（来自用户）\n${opts.extra.trim()}\n` : ''}${opts.text?.trim() ? `\n## 待转写的曲谱内容\n${opts.text.trim()}\n` : ''}
现在请输出 JSON：`
}

/**
 * 分页扒谱时附在提示词后面的说明。第 1 页读全曲信息；后面的页沿用第 1 页的全曲信息，
 * 只输出本页的段落，页首接着上一页的段落写「（接上页）」，由程序拼起来。
 */
export function pageInstructions(page: number, total: number, header?: unknown): string {
  if (page === 1)
    return `## 分页转写（第 1 页，共 ${total} 页）
这份曲谱很长，我会一页一页发给你，最后由程序把各页拼起来。现在发给你的是第 1 页：
- 输出全曲信息（title、artist、key、capo、tempo、time、tuning 等）。多轨谱要在 tracks 里列出谱面上所有的音轨，包括这一页还没有内容的轨，并写好各自的调弦、变调夹。
- sections 只写这一页上的小节，不要猜后面几页的内容。`
  return `## 分页转写（第 ${page} 页，共 ${total} 页）
这份曲谱很长，我会一页一页发给你，最后由程序把各页拼起来。现在发给你的是第 ${page} 页。
- 全曲信息已经从第 1 页读出来了，下面直接沿用，不要改动音轨 id；不需要再输出这些字段：
\`\`\`json
${JSON.stringify(header ?? {})}
\`\`\`
- 只输出这一页的内容：一个 JSON 对象，包含 "sections"（这一页上的段落，按从上到下的顺序）。这一页新出现的节奏型、和弦按法写在 "patterns" / "chords" 里；需要说明的写在 "notes" 里。
- 这一页开头如果没有段落标题（接着上一页的段落），第一个段落的 name 写「（接上页）」，程序会把它接到上一页的段落后面。
- "%N" 只能引用这一页之内的小节，这一页开头的小节要完整写出来。`
}

/** 宽松解析：去掉代码块围栏、注释、尾逗号；从一段文字中找出 JSON */
export function parseLenient(text: string): { value: unknown; error?: string } {
  let s = text.trim()
  const fence = /```(?:json|json5|javascript|js)?\s*\n([\s\S]*?)```/i.exec(s)
  if (fence) s = fence[1].trim()
  else {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) s = s.slice(start, end + 1)
  }
  // 依次尝试：标准 JSON → JSON5（注释、尾逗号）→ 把中文弯引号当作分隔符。
  // 弯引号替换必须放最后：合法 JSON 的字符串里常常就带着“”，提前替换反而会把它弄坏。
  const attempts: [string, (t: string) => unknown][] = [
    ['json', (t) => JSON.parse(t)],
    ['json5', (t) => JSON5.parse(t)],
    ['quotes', (t) => JSON5.parse(t.replace(/[“”]/g, '"'))],
  ]
  let firstError: unknown
  for (const [, parse] of attempts) {
    try {
      return { value: parse(s) }
    } catch (e) {
      firstError ??= e
    }
  }
  // 报告 JSON5 的错误（带行列号，更容易定位）
  let msg = firstError instanceof Error ? firstError.message : String(firstError)
  try {
    JSON5.parse(s)
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e)
  }
  const m = /at (\d+):(\d+)/.exec(msg)
  return { value: null, error: m ? `JSON 语法错误：第 ${m[1]} 行第 ${m[2]} 列附近（${msg.replace(/^JSON5:\s*/, '')}）` : `JSON 语法错误：${msg}` }
}

/** 紧凑美化：短对象/数组单行显示，便于阅读 */
export function formatSongJson(value: unknown, maxLine = 108): string {
  const inline = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
    if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']'
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
    if (!entries.length) return '{}'
    return '{ ' + entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ') + ' }'
  }
  const ser = (v: unknown, indent: string): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
    const one = inline(v)
    // 含多个对象的数组（如 measures）总是逐行展开
    const objArray = Array.isArray(v) && v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).length > 1
    if (indent.length + one.length <= maxLine && !objArray) return one
    const next = indent + '  '
    if (Array.isArray(v)) {
      if (!v.length) return '[]'
      return '[\n' + v.map((x) => next + ser(x, next)).join(',\n') + '\n' + indent + ']'
    }
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
    if (!entries.length) return '{}'
    return '{\n' + entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${ser(x, next)}`).join(',\n') + '\n' + indent + '}'
  }
  return ser(value, '')
}
