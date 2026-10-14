# ⚠ DO NOT REMOVE — Scope: the caption file of the OplogPic v8 Mandarin cut. Takes the Mandarin fit's events (id#turn, times) and writes ONE .ass: the English caption of every turn at the bottom (as in the English film) and the Chinese line as BLACK text
# on a light rounded box at the TOP centre, over the app's own toolbar (the least important strip of the recordings); during the Save file / Open file / Export clips (k4-k6) the box is narrowed so the toolbar buttons being clicked stay visible.
# usage: python3 zh_ass_v8.py <native.ass> <captions_v8_en.json> <out.ass>
import sys, json, re
nat, capf, out = sys.argv[1:4]; CAP = json.load(open(capf)); H = 1080
head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: EF,DejaVu Sans,46,&H00B4F0FF,&H00FFFFFF,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2.6,0,2,260,260,26,1
Style: EM,DejaVu Sans,46,&H00FFE6B4,&H00FFFFFF,&H90000000,&H00000000,0,0,0,0,100,100,0,0,1,2.6,0,2,260,260,26,1
Style: ZH,Noto Sans CJK SC,54,&H00000000,&H00000000,&H10F6F6F6,&H00000000,1,0,0,0,100,100,0,0,3,9,0,8,40,40,3,1
Style: ZHN,Noto Sans CJK SC,54,&H00000000,&H00000000,&H10F6F6F6,&H00000000,1,0,0,0,100,100,0,0,3,9,0,8,470,450,3,1
Style: Credit,DejaVu Sans,28,&H00DDDDDD,&H00FFFFFF,&H90000000,&H00000000,0,1,0,0,100,100,0,0,1,2,0,2,200,200,170,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
ev = []; narrow = ('k4', 'k5', 'k6')
for l in open(nat).read().split('\n'):
    if not l.startswith('Dialogue:'): continue
    f = l.split(',', 9); st, en, who, name, zh = f[1], f[2], f[3], f[4], f[9]
    if who == 'Credit': continue
    i, j = name.split('#'); j = int(j); es = CAP[i]['D'][j]
    ev.append(f'Dialogue: 1,{st},{en},{"EF" if who == "F" else "EM"},{name},0,0,0,,{es}')
    if i in narrow and len(zh) > 22:   # Chinese has no spaces, so the renderer cannot wrap: break at the punctuation nearest the middle (narrow box ~ 27 characters per line)
        cuts = [k + 1 for k, c in enumerate(zh) if c in '，。：；、' and 5 < k < len(zh) - 5]; k = min(cuts, key=lambda q: abs(q - len(zh) / 2)) if cuts else len(zh) // 2; zh = zh[:k] + '\\N' + zh[k:]
    ev.append(f'Dialogue: 2,{st},{en},{"ZHN" if i in narrow else "ZH"},{name},0,0,0,,{zh}')
open(out, 'w').write(head + '\n'.join(ev) + '\n'); print('§ZH_ASS wrote', len(ev) // 2, 'turns ->', out)
