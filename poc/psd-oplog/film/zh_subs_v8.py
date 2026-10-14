# ⚠ DO NOT REMOVE — Scope: Mandarin (Simplified) subtitle track for the OplogPic v8 English-narrated film. English narration AND English captions stay; the Chinese is BLACK text on a light strip padded BELOW the picture, so it can never overlap anything on screen.
# Row i of ZH is the translation of caption event i of v8/fit/oplogpic.ass (same order, same times; checked by count). Translations are mine, unreviewed by a native speaker. usage: python3 zh_subs_v8.py <oplogpic.ass> <out_zh.ass>
import sys, re
src, out = sys.argv[1:3]; STRIP = 128; H = 1080 + STRIP
ZH = ['OplogPic。', '核心想法是什么？', '每一次编辑，都是日志里的一行。这个渐变只有一百四十三字节。图像只是日志的回放。', '图层和工具。', '图层可以隐藏、重新排序、调整不透明度，还有十种混合模式。',
 '工具包括：画笔、涂抹、橡皮擦、模糊、选择、魔棒和移动。一笔画笔，也是日志里的一行。', '设计工具包。', '渐变：拖一下，就是一条记录，一百四十三字节。', '径向渐变，渐隐到透明，形成光晕。', '在新图层上画形状：带描边的圆角面板、代表太阳的椭圆，还有一条线。',
 '文字可以加描边。编辑文字会用相同的设置重新打开。改字，应用。', '选中面板，在它下面加一个高斯模糊图层。面板就有了磨砂效果。', '拖动半径：预览又快又粗糙；松手后，精确的画面就出现了。', '给面板加投影。一次应用，一条记录，八十六字节。',
 '抠图与滤镜。', '两张照片：云和热气球。照片以图片形式存进日志。', '魔棒：点一下天空，它会选中与该颜色相近且相连的像素。再稍微扩大一点。', '羽化边缘，由选区创建蒙版，再反相。天空就被替换了。', '把云放进一个编组。',
 '一个剪贴到热气球上的颜色图层。看边缘：和天空蓝色相近的色块，跟着天空一起被选走了。这是魔棒的容差设置，不是故障。', '把容差调低，被选走的色块就更少。接着是色阶，一个实时图层。', '渐变映射和锐化，同样是实时图层。',
 '移动、缩放、重新着色。', '移动并缩放一个图层。它的抠图蒙版会一起走。', '这就是最终结果了吗？', '不是。用魔棒选一块色块，给它加一个蒙版限定的色相/饱和度图层。拖动色相，再拖一次。它始终是可调的实时设置。',
 '历史记录能自证。', '点一个旧步骤，画面就回到当时的样子。点“回到现在”即可返回。', '撤销和重做，走的是同一份列表。', '显示原始条目：这些就是真正的日志行。', '验证会从头回放全部十六条记录并比对：画面完全一致。',
 '带着它走。', '一个小文档，生成分享链接，共三百八十二个字符。', '打开链接，画作就出现了。仅可查看。', '改动其中一个字符，链接就会被拒绝。', '保存文件：整个热气球文档，包含照片，共二点六兆字节。',
 '打开文件时，会先核对日志和画面，之后才显示任何内容。验证通过：画面完全一致。', '导出为PSD，保留图层和蒙版。', '小文档可以放进二维码。三百八十二字节。', '可按你选的尺寸导出JPEG或PNG。同一张海报：三十千字节，对比一百一十四。',
 '测试过吗？', '四十五个测试套件全部通过。回放是确定性的，所以测试直接用哈希比对像素。', '试试看。链接就在屏幕上：无需安装，离线也能用。源码在GitHub上，采用MIT许可。', '为什么能做得这么小？',
 '因为文档就是日志。撤销、历史、验证、分享和保存，用的都是同一份数据。还因为它是本地优先：浏览器自己干活，自己保存日志，没有服务器。线上版目前还没有保存文件、打开文件和二维码。']
ev = [l for l in open(src).read().split('\n') if l.startswith('Dialogue:') and ',Credit,' not in l]
assert len(ev) == len(ZH), (len(ev), len(ZH))
ts = lambda x: x
rows = []
for l, zh in zip(ev, ZH):
    f = l.split(',', 9); rows.append([f[1], f[2], zh])
def sec(t): h, m, s = t.split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
def fmt(x): return '%d:%02d:%05.2f' % (int(x // 3600), int(x % 3600 // 60), x % 60)
for i in range(len(rows) - 1):   # no two Chinese lines on screen at once
    if sec(rows[i][1]) > sec(rows[i + 1][0]) - 0.05: rows[i][1] = fmt(sec(rows[i + 1][0]) - 0.05)
head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ZH,Noto Sans CJK SC,40,&H00000000,&H00000000,&H00F1F1F1,&H00F1F1F1,0,0,0,0,100,100,0,0,1,0,0,2,60,60,14,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
def brk(z):   # Chinese has no spaces, so the renderer cannot wrap: break at the punctuation nearest the middle of any line longer than 40 characters
    if len(z) <= 40: return z
    cuts = [i + 1 for i, c in enumerate(z) if c in '，。：；、！？' and 8 < i < len(z) - 8]; k = min(cuts, key=lambda i: abs(i - len(z) / 2)) if cuts else len(z) // 2; return z[:k] + '\\N' + z[k:]
open(out, 'w').write(head + ''.join(f'Dialogue: 0,{a},{b},ZH,,0,0,0,,{brk(z)}\n' for a, b, z in rows)); print('§ZH wrote', len(rows), 'lines ->', out)
