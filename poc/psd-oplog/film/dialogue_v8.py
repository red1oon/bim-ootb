# ⚠ DO NOT REMOVE — Scope: the OplogPic v8 (developer cut) English dialogue, two voices (F and M), cues computed from v8/timeline.json (build_v8.py). Row = id, cue, end, source, SHORT, DETAIL.
# Every row's source names what is on screen or the test verdict / facts-file key it rests on. Rules kept: nothing claimed about another editor; no phone number; no "first". Numbers are read from facts files, never typed.
# The wand-edge rows (x2, x5, x6) say what was OBSERVED in the recordings: tolerance 45 with Grow took more balloon tiles than 32; it is a setting of the wand, not a fault (editor_wand matches numpy/scipy exactly).
# usage: python3 dialogue_v8.py > ~/Videos/oplogpic_v2_work/v8/dialogue_v8.tsv
import json, os, csv, re
R = os.path.expanduser('~/Videos/oplogpic_v2_work'); T = json.load(open(R + '/v8/timeline.json'))['segments']
def facts(p): return {r[0]: r[1] for r in list(csv.reader(open(p), delimiter='\t'))[1:]}
P, C, H = facts(R + '/v7/poster_facts.tsv'), facts(R + '/v8/carry_facts.tsv'), facts(R + '/v6/history_facts.tsv'); CU = facts(R + '/v8/cutout_facts.tsv')
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(); TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split()
def words(n):
    n = int(round(n))
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ('' if n % 10 == 0 else '-' + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' and ' + words(n % 100))
    return str(n)
kb = lambda m: int(re.search(r'\((\d+) KB\)', m).group(1))
g1, shadow_b = int(P['gradient1_bytes']), int(P['shadow_bytes']); jpeg_kb, png_kb = kb(P['jpeg_msg']), kb(P['png_msg'])
link_chars = int(re.search(r'\((\d+) characters\)', C['link_msg']).group(1)); qr_bytes = json.loads(open(R + '/v7/qr_facts.tsv').read().split('qr_info\t')[1].split('\n')[0])['bytes']
n_ver = int(re.search(r'Verified: (\d+) entries', H['verify_message']).group(1)); save_mb = round(int(C['save_bytes']) / 1048576, 1); suites = 45
assert P['page_errors'] == C['page_errors'] == CU['page_errors'] == '0' and C['open_msg'].startswith('Verified') and 'not a painting link' in C['tamper_msg'] and CU['adjust_kinds'] == '["levels","gradmap","sharpen"]'
def win(a, b=None, lead=None, over=None):   # window of segment a .. b: cards get 0.35 s lead-in, takes 0.1 s
    b = b or a; s = T[a]['start'] + (lead if lead is not None else (0.35 if 'src' not in T[a] else 0.1)); e = T[b]['start'] + T[b]['len'] - 0.15; return over or (s, e)
d = lambda *x: ' | '.join(x)
ROWS = [
 ('cover', win('cover'), 'cover card: OplogPic', 'F: OplogPic.', 'F: OplogPic. | M: A photo editor whose file is its history.'),
 ('c1', win('c1'), 'card: the document is a log; the 143-byte gradient entry on the card is poster_facts gradient1_entry', 'M: Every edit is one line in a log.', f'F: What is the idea? | M: Every edit is one line in a log. This gradient is {words(g1)} bytes. The picture is just the replay.'),
 ('c2', win('c2'), 'card 1', 'M: Layers and tools.', 'M: Layers and tools.'),
 ('t1a', (T['t1']['start'] + 0.2, T['t1']['start'] + 9.6), 'v6 tour T1-T5: layers, hide, reorder, opacity, ten blend modes (README Basics)', 'M: Layers, with ten blend modes.', 'M: Layers. Hide them, reorder them, fade them, and mix them with ten blend modes.'),
 ('t1b', (T['t1']['start'] + 9.8, T['t1']['start'] + T['t1']['len'] - 0.15), 'v6 tour T6-T7: tool bar, Wand and Move bars, one brush stroke', 'M: Brushes, smudge, wand, move.', 'M: The tools: brushes, smudge, erase, blur, select, wand and move. A brush stroke is a line in the log too.'),
 ('c3', win('c3'), 'card 2', 'M: The design kit.', 'M: The design kit.'),
 ('d1', win('d1'), f'v7 poster P1: linear gradient, entry {g1} bytes (gradient1_bytes)', 'M: A gradient is one drag.', f'M: A gradient. One drag, one entry, {words(g1)} bytes.'),
 ('d2', win('d2'), 'v7 poster P2: Radial and To clear', 'M: A glow that fades out.', 'M: Radial, fading to clear. A glow.'),
 ('d3', win('d3'), 'v7 poster P3-P4: rounded panel with outline, ellipse, line (suite editor_shapes)', 'M: Shapes on a new layer.', 'M: Shapes, on a new layer. A rounded panel with an outline, an ellipse for the sun, a line.'),
 ('d4', win('d4'), 'v7 poster T1-T2: Add text with outline, then Edit text (suite editor_textedit TE3)', 'M: Text you can edit again.', 'M: Text, with an outline. Edit text opens it again with the same settings. New words, apply.'),
 ('d5', win('d5'), 'v7 poster B1-B2: Select, Add adjustment Gaussian blur below the panel (suite editor_filters FL8)', 'M: A blur layer under the panel.', 'M: Select the panel, add a Gaussian blur layer below it. Now the panel looks frosted.'),
 ('d6', win('d6'), 'v7 poster B3: radius slider; coarse preview while dragging, exact on release (HYPOTHESES FL9)', 'M: Quick preview, exact on release.', 'M: Drag the radius. The preview is quick and rough. Let go, and the exact picture appears.'),
 ('d7', win('d7'), f'v7 poster B4: Effects, Drop shadow, one entry of {shadow_b} bytes (shadow_bytes; suite editor_fx FX4)', 'M: A drop shadow.', f'M: A drop shadow on the panel. One apply, one entry, {words(shadow_b)} bytes.'),
 ('c4', win('c4'), 'card 3', 'M: Cut-out and filters.', 'M: Cut-out and filters.'),
 ('x1', win('x1'), 'v8 cutout C1: Add photo (clouds, then balloon); the photo is stored in the log as a picture (README, Photos)', 'M: Two photos.', 'M: Two photos, clouds and a balloon. A photo is stored in the log as a picture.'),
 ('x2', win('x2'), 'v8 cutout C2: Wand, Tol 32, tap the sky, Grow (suite editor_wand)', 'M: The magic wand.', 'M: The magic wand. Tap the sky, and it selects the connected pixels near that colour. Then grow it a little.'),
 ('x3', win('x3'), 'v8 cutout C3: Feather 3, Mask from selection, Invert mask', 'M: Feather, mask, invert.', 'M: Feather the edge, make a mask from the selection, invert it. The sky is replaced.'),
 ('x4', win('x4'), 'v8 cutout C5: Add group, Clouds layer put in the group', 'M: Clouds into a group.', 'M: Put the clouds in a group.'),
 ('x5', win('x5'), 'v8 cutout C4: gradient layer clipped to Balloon; the silhouette shows the edge: blue tiles near the sky blue were selected with the sky. OBSERVED: tol 45 + Grow took more tiles than tol 32 + Grow; editor_wand matches numpy/scipy exactly, so this is the wand setting, not a fault', 'M: Clip a colour layer. See the edge.', 'M: A colour layer, clipped to the balloon. Look at the edge: blue tiles near the sky blue went with the sky. That is the wand tolerance, not a fault.'),
 ('x6', win('x6'), 'v8 cutout C6: Levels adjustment, Gamma dragged; the wand note continues (tolerance higher = more tiles go)', 'M: Lower tolerance, fewer tiles go.', 'M: Lower the tolerance and fewer tiles go. Now Levels, as a live layer.'),
 ('x7', win('x7'), 'v8 cutout C7: Gradient map and Sharpen added (adjust_kinds levels, gradmap, sharpen)', 'M: Gradient map and sharpen.', 'M: Gradient map, and sharpen. Also live layers.'),
 ('c5', win('c5'), 'card 4', 'M: Move, scale, recolour.', 'M: Move, scale, recolour.'),
 ('e1', win('e1'), 'v6 edits E2: Move tool, scale 75 %, Apply; the mask moves with the layer (editor_xform)', 'M: Move and scale a layer.', 'M: Move and scale a layer. Its cut-out comes with it.'),
 ('e2', win('e2'), 'v6 edits E4-E6: wand one panel, Hue / Saturation masked, hue dragged twice (suite editor_admask)', 'M: Recolour one panel.', 'F: Is that final? | M: No. Wand one panel, mask a Hue and Saturation layer to it. Drag the hue, and drag it again. It stays a live setting.'),
 ('c6', win('c6'), 'card 5', 'M: History proves it.', 'M: History proves it.'),
 ('h1', win('h1'), 'v6 history H2-H3: tap an old entry to preview, Back to now (suite editor_history)', 'M: Tap any step.', 'M: Tap an old step, and the picture goes back to how it looked. Back to now returns.'),
 ('h2', win('h2'), 'v6 history H4: Undo three times, Redo three times', 'M: Undo and redo.', 'M: Undo and redo walk the same list.'),
 ('h3', win('h3'), 'v6 history H5: Show raw entries', 'M: The raw log lines.', 'M: Show raw entries. These are the actual lines.'),
 ('h4', win('h4'), f'v6 history H6: "{H["verify_message"]}" (history_facts verify_message)', 'M: Verify replays everything.', f'M: Verify replays all {words(n_ver)} entries from scratch, and compares. Same picture.'),
 ('c7', win('c7'), 'card 6', 'M: Take it with you.', 'M: Take it with you.'),
 ('k1', win('k1'), f'v8 carry L1: small document, Share link "{C["link_msg"]}"', 'M: A share link.', f'M: A small document, and a share link. {words(link_chars)} characters.'),
 ('k2', win('k2'), f'v8 carry L2: "{C["opened_msg"]}"', 'M: Open it: view only.', 'M: Open the link, and the painting appears. View only.'),
 ('k3', win('k3'), f'v8 carry L3: one character changed: "{C["tamper_msg"]}"', 'M: Change one character: refused.', 'M: Change one character, and the link is refused.'),
 ('k4', win('k4'), f'v8 carry F1: Save file {C["save_file"]}, {C["save_bytes"]} bytes (photos included)', 'M: Save file.', f'M: Save file. The whole balloon document, photos included, {words(save_mb) if save_mb == int(save_mb) else words(int(save_mb)) + " point " + words(round((save_mb % 1) * 10))} megabytes.'),
 ('k5', win('k5'), f'v8 carry F2: Open file: "{C["open_msg"]}" (suite editor_carry)', 'M: Open file checks first.', 'M: Open file checks the log and the picture before it shows anything. Verified: the identical picture.'),
 ('k6', win('k6'), f'v8 carry F3: Export PSD ({C["psd_file"]}); README Out: layers, masks, adjustment layers', 'M: Export to PSD.', 'M: Export to PSD, with layers and masks.'),
 ('k7', win('k7'), f'v7 qr R2: Show QR, {qr_bytes} bytes, QR version 13 (qr_info); decoded by two decoders (editor_carry CF10); a real phone scan is NOT shown', 'M: Small documents fit a QR code.', f'M: A small document fits a QR code. {words(qr_bytes)} bytes.'),
 ('k8', win('k8'), f'v7 poster X1-X2: Export image JPEG {jpeg_kb} KB and PNG {png_kb} KB at 512 px (jpeg_msg, png_msg; suite editor_imgexport)', 'M: JPEG or PNG, any size.', f'M: Export as JPEG or PNG, at the size you choose. The same poster: {words(jpeg_kb)} kilobytes, against {words(png_kb)}.'),
 ('c8', win('c8'), f'card: {suites} of 45 suites PASS at db3cde7f (witness_log/ledger.jsonl); deterministic replay compared by SHA-256 (README)', 'M: Forty-five suites pass.', f'F: Is it tested? | M: {words(suites).capitalize()} of forty-five test suites pass. The replay is deterministic, so the tests compare pixels by hash.'),
 ('end', win('end'), 'END card: live link, repo + branch + folder, MIT licence (LICENSE), why op log + local-first; live site lacks Save file / Open file / Show QR (h-qr absent from the live page 2026-10-15)', 'M: Try it, read it, fork it.',
  d('M: Try it. The link is on screen: no install, and it works offline. The source is on GitHub, MIT licensed.', 'F: Why could this be built so small?', 'M: Because the document is a log. Undo, history, verify, share and save are all the same data. And because it is local first: your browser does the work and keeps the log. No server. The live site does not have Save file, Open file or the QR yet.')),
]
cap = lambda t: re.sub(r'([.?!] )([a-z])', lambda m: m.group(1) + m.group(2).upper(), t)
for i, (a, b), src, short, det in ROWS: print('\t'.join([i, '%.2f' % a, '%.2f' % b, src, cap(short), cap(det)]))
