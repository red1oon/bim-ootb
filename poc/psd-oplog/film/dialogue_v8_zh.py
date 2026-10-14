# ⚠ DO NOT REMOVE — Scope: the OplogPic v8 MANDARIN narration script (Simplified), same ids / cues / sources as the English dialogue_v8.tsv, plus the English caption turns (captions_v8_en.json) shown beside it.
# Turn counts of SHORT and DETAIL match the English ones (asserted) so captions stay turn-for-turn. Wording is mine, unreviewed by a native speaker. usage: python3 dialogue_v8_zh.py   (writes v8/dialogue_v8_zh.tsv, v8/captions_v8_en.json)
import os, json, csv, re
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v8')
EN = {r[0]: r for r in csv.reader(open(V + '/dialogue_v8.tsv'), delimiter='\t')}
ZH = {
 'cover': ('F: OplogPic。', 'F: OplogPic。 | M: 历史即文件。'),
 'c1': ('M: 每次编辑，都是日志里的一行。', 'F: 核心想法是什么？ | M: 每一次编辑，都是日志里的一行。这个渐变只有一百四十三字节。画面只是日志的回放。'),
 'c2': ('M: 图层和工具。', 'M: 图层和工具。'),
 't1a': ('M: 图层，十种混合模式。', 'M: 图层可以隐藏、排序、调整透明度，还有十种混合模式。'),
 't1b': ('M: 画笔、涂抹、魔棒、移动。', 'M: 工具有画笔、涂抹、橡皮擦、选择、魔棒、移动，笔画也是日志。'),
 'c3': ('M: 设计工具包。', 'M: 设计工具包。'),
 'd1': ('M: 渐变，拖一下就行。', 'M: 渐变：拖一下，一条记录，一百四十三字节。'),
 'd2': ('M: 渐隐的光晕。', 'M: 径向渐变，渐隐到透明，就成了光晕。'),
 'd3': ('M: 新图层上画形状。', 'M: 在新图层上画形状：带描边的圆角面板，代表太阳的椭圆，还有一条线。'),
 'd4': ('M: 文字可以再编辑。', 'M: 文字带描边。编辑文字会用原来的设置重新打开。改字，应用。'),
 'd5': ('M: 面板下面放一个模糊层。', 'M: 选中面板，在它下面加一个高斯模糊图层。面板就有了磨砂的效果。'),
 'd6': ('M: 预览很快，松手后精确。', 'M: 拖动半径：预览又快又粗糙。松手后，精确的画面就出来了。'),
 'd7': ('M: 一个投影。', 'M: 给面板加投影。一次应用，一条记录，八十六字节。'),
 'c4': ('M: 抠图与滤镜。', 'M: 抠图与滤镜。'),
 'x1': ('M: 两张照片。', 'M: 两张照片，云和热气球。照片以图片的形式存进日志。'),
 'x2': ('M: 魔棒。', 'M: 魔棒：点一下天空，就会选中颜色相近、相连的像素。再稍微扩大一点。'),
 'x3': ('M: 羽化、蒙版、反相。', 'M: 羽化边缘，由选区建立蒙版，再反相。天空就被换掉了。'),
 'x4': ('M: 把云放进编组。', 'M: 把云放进一个编组。'),
 'x5': ('M: 看边缘，这是容差。', 'M: 颜色图层剪贴到气球上。看边缘：和天空相近的蓝色色块，也被一起选走了。这是魔棒容差，不是故障。'),
 'x6': ('M: 容差调低，被选走的更少。', 'M: 容差调低，被选走的色块更少。接着是色阶，实时图层。'),
 'x7': ('M: 渐变映射和锐化。', 'M: 渐变映射，还有锐化，同样是实时图层。'),
 'c5': ('M: 移动与缩放。', 'M: 移动与缩放。'),
 'e1': ('M: 移动和缩放图层。', 'M: 移动并缩放一个图层，它的抠图蒙版会一起跟着走。'),
 'e2': ('M: 给一块色块重新上色。', 'F: 这就是最终结果吗？ | M: 不是。魔棒选一块色块，配一个带蒙版的色相饱和度层。拖动色相，始终实时可改。'),
 'c6': ('M: 历史记录能自证。', 'M: 历史记录能自证。'),
 'h1': ('M: 点任何一步。', 'M: 点一个旧步骤，画面就回到当时的样子。点回到现在就能返回。'),
 'h2': ('M: 撤销和重做。', 'M: 撤销和重做，走的是同一份列表。'),
 'h3': ('M: 原始日志行。', 'M: 显示原始条目。这些就是真正的日志行。'),
 'h4': ('M: 验证，从头回放。', 'M: 验证会从头回放全部十六条记录并比对。画面完全一致。'),
 'c7': ('M: 带着它走。', 'M: 带着它走。'),
 'k1': ('M: 分享链接。', 'M: 一个小文档，生成分享链接，共三百八十二个字符。'),
 'k2': ('M: 打开链接，仅可查看。', 'M: 打开链接，画作就出现了。仅可查看。'),
 'k3': ('M: 改一个字符，被拒绝。', 'M: 改动其中一个字符，链接就会被拒绝。'),
 'k4': ('M: 保存文件。', 'M: 保存文件。整个热气球文档，包含照片，二点六兆字节。'),
 'k5': ('M: 打开文件，先验证。', 'M: 打开文件时，会先核对日志和画面，才显示任何内容。验证通过：画面完全一致。'),
 'k6': ('M: 导出PSD。', 'M: 导出PSD，含图层和蒙版。'),
 'k7': ('M: 小文档能放进二维码。', 'M: 小文档可以放进二维码。三百八十二字节。'),
 'k8': ('M: JPEG或PNG，尺寸自选。', 'M: 可按你选的尺寸导出JPEG或PNG。同一张海报：三十千字节，对比一百一十四。'),
 'c8': ('M: 四十五个套件通过。', 'F: 测试过吗？ | M: 四十五个测试套件全部通过。回放是确定性的，所以测试直接用哈希比对像素。'),
 'end': ('M: 试试看，读一读，改一改。', 'M: 来试试吧。链接就在屏幕上：无需安装，离线也能用。源码在GitHub上，采用MIT许可。 | F: 为什么能做得这么小？ | M: 因为文档就是日志。撤销、历史、验证、分享和保存，用的都是同一份数据。 | M: 还因为它是本地优先：浏览器自己干活，自己保存日志，没有服务器。 | M: 线上版目前还没有保存文件、打开文件和二维码。'),
}
END_EN = 'M: Try it. The link is on screen: no install, and it works offline. The source is on GitHub, MIT licensed. | F: Why could this be built so small? | M: Because the document is a log. Undo, history, verify, share and save are all the same data. | M: And because it is local first: your browser does the work and keeps the log. No server. | M: The live site does not have Save file, Open file or the QR yet.'
turns = lambda t: [x.strip()[2:].strip() for x in t.split(' | ')]
cap = {}; out = []
for i, r in EN.items():
    s, d = ZH[i]; es, ed = r[4], (END_EN if i == 'end' else r[5])
    assert len(turns(s)) == len(turns(es)) and len(turns(d)) == len(turns(ed)), (i, turns(s), turns(es), turns(d), turns(ed))
    cap[i] = {'S': turns(es), 'D': turns(ed)}; out.append('\t'.join([i, r[1], r[2], r[3], s, d]))
assert set(ZH) == set(EN)
open(V + '/dialogue_v8_zh.tsv', 'w').write('\n'.join(out) + '\n'); json.dump(cap, open(V + '/captions_v8_en.json', 'w'), ensure_ascii=False, indent=0); print('§ZH_DIALOGUE', len(out), 'rows')
