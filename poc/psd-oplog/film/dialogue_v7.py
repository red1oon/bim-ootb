# ⚠ DO NOT REMOVE — Scope: the OplogPic v7 (design kit) dialogue, two voices (F and M), generated from timeline.json (build_v7.py). Row = id, cue, end, source, SHORT, DETAIL; every row's source names what is on screen or the test verdict / facts-file key it rests on.
# Rules kept: no claim about another editor except what its own page / manual says (the prior-art row repeats the v6 wording); no phone number; no "first". Every number below is read from poster_facts.tsv / qr_facts.tsv, never typed. usage: python3 dialogue_v7.py > dialogue_v7.tsv
import json, os, csv, re
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v7'); W = json.load(open(V + '/timeline.json'))['windows']
def facts(t): return {r[0]: r[1] for r in list(csv.reader(open(f'{V}/{t}_facts.tsv'), delimiter='\t'))[1:]}
P, Q = facts('poster'), facts('qr')
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(); TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split()
def words(n):
    n = int(round(n))
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ('' if n % 10 == 0 else '-' + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' and ' + words(n % 100))
    return str(n)
b = lambda k: int(P[k]); kb = lambda m: int(re.search(r'\((\d+) KB\)', m).group(1))
g1, g2, panel, ell, line, blur_b, shadow_b = b('gradient1_bytes'), b('gradient2_bytes'), b('panel_bytes'), b('ellipse_bytes'), b('line_bytes'), b('blur_entry_bytes'), b('shadow_bytes')
ver = re.search(r'Verified: (\d+) entries .*\((\d+) ms\)', P['verify_message']); n_ver, s_ver = int(ver.group(1)), round(int(ver.group(2)) / 1000)
save_kb, jpeg_kb, png_kb, qr_bytes = round(json.loads(P['save_last'])['bytes'] / 1024), kb(P['jpeg_msg']), kb(P['png_msg']), json.loads(Q['qr_info'])['bytes']
assert P['caption_entries'] == '2' and P['edit_text_entries'] == '2' and P['shadow_entries'] == '1' and P['page_errors'] == '0' and Q['page_errors'] == '0'
assert 'photos and captions' in P['poster_qr_message'] and P['poster_qr_overlay_hidden'] == 'true'
R = [
 ('cover', 'cover card: OplogPic (working name)', 'F: OplogPic.', 'F: OplogPic. | M: A poster, from a blank canvas.'),
 ('c1', 'card 1; op-log design (HYPOTHESES Level 2i GD4, 2k SP4: one entry per drag)', 'M: Every drag is one line in a log.', 'F: What are we making? | M: A poster, from a blank canvas. Every drag is one line in the log.'),
 ('P1', f'Gradient tool, one linear drag; entry of {g1} bytes (poster_facts gradient1_bytes)', 'M: One drag, one gradient.', f'M: The gradient tool. One drag, and the background is done. That is one entry, {words(g1)} bytes.'),
 ('P2', f'Gradient tool, Radial and To clear; entry of {g2} bytes (gradient2_bytes)', 'M: A glow, fading out.', f'M: A second drag, radial, fading to clear. A warm glow. {words(g2)} bytes.'),
 ('P3', f'Add layer, Shape tool, Rounded, outline; panel entry {panel} bytes (panel_bytes); suite editor_shapes', 'M: A new layer, and a panel.', f'F: And shapes? | M: A new layer, and the shape tool. A rounded panel, half see-through, with an outline. {words(panel)} bytes.'),
 ('P4', f'Ellipse ({ell} bytes) and Line ({line} bytes), poster_facts ellipse_bytes, line_bytes', 'M: A sun, and a line.', 'M: An ellipse for the sun. A line for a divider. Each is one entry, about a hundred bytes.'),
 ('c2', 'card 2', 'M: Words you can change.', 'M: Words you can change.'),
 ('T1', 'Add text panel: title typed, size, outline, middle; caption_entries 2 (suite editor_textedit TE3)', 'M: Add text.', 'M: Add text. A title, bigger, with an outline, in the middle. That is two entries.'),
 ('T2', 'Edit text opens with the stored settings; Apply (edit_text_entries 2; TE3)', 'M: Edit text.', 'F: Can I change it later? | M: Edit text opens it again with the same settings. New words, a new size. Apply.'),
 ('T3', 'Undo twice then Redo twice (TE3: undo restores the previous pixels exactly, sha256)', 'M: Undo, and the old title is back.', 'M: Undo twice, and the old title is back, pixel for pixel. Redo, and the new one returns.'),
 ('c3', 'card 3', 'M: A live blur.', 'M: A live blur.'),
 ('B1', 'Select tool, rectangle over the panel', 'M: Select the panel.', 'M: Select the panel area.'),
 ('B2', f'Add adjustment, Gaussian blur ({blur_b} bytes), moved down below the panel layer, mask from selection; suite editor_filters FL8, FL3', 'M: A blur, below the panel.', 'M: Add a Gaussian blur layer. Move it below the panel, and limit it to the selection. The panel is see-through, so now it looks frosted.'),
 ('B3', 'Radius slider dragged; coarse preview while dragging, exact on release (HYPOTHESES FL9: coarse preview <= 400 ms, commit exact == refold)', 'M: Drag the radius.', 'F: Is that slow? | M: While you drag, the preview is quick and rough. Let go, and the exact picture appears. One drag, one entry.'),
 ('B4', f'Layer 2 selected, Effects, Drop shadow, Apply: one entry of {shadow_b} bytes (shadow_bytes, shadow_entries 1; suite editor_fx FX4)', 'M: And a drop shadow.', f'M: Then a drop shadow on the panel layer. One apply, one entry, {words(shadow_b)} bytes.'),
 ('c4', 'card 4', 'M: History proves it.', 'M: History proves it.'),
 ('H1', 'the History list in the side panel (suite editor_history)', 'M: The whole poster, as a list.', 'M: Here is the whole poster, entry by entry.'),
 ('H2', 'tap an early entry: preview (editor_history)', 'M: Tap any step.', 'M: Tap an early step, and the picture goes back to how it looked then.'),
 ('H3', f'Back to now; Verify message "Verified: {n_ver} entries replay from scratch to the same picture" ({s_ver} s on this laptop; the dead time is sped up on purpose, build_v7.py)', 'M: Verify checks it.', f'F: Can I trust it? | M: Verify replays all {words(n_ver)} entries from scratch and checks the picture is the same. It took about {words(s_ver)} seconds here.'),
 ('c5', 'card 5', 'M: A QR for a small document.', 'M: A QR for a small document.'),
 ('R1', f'qr take: a small document, one gradient, one ellipse (qr_facts small_entries {Q["small_entries"]})', 'M: A small document.', 'M: A small document. One gradient, one shape.'),
 ('R2', f'Show QR: "{Q["qr_text"]}"; link design in history_ops.js; QR decoded by two independent decoders (Level 1m CF10); a real phone scan is NOT shown', 'M: Show QR.', f'M: Show QR. The link carries the edit list, {words(qr_bytes)} bytes. A phone that scans it rebuilds the picture. No server.'),
 ('Q1', 'the poster (has a caption): Show QR says "' + P['poster_qr_message'] + '" (poster_qr_message; captions are pixel blobs, Level 1m)', 'M: A caption is too big.', 'M: This poster has a caption, and a caption is stored as a picture. Too big for a link, and the page says so.'),
 ('Q2', f'Save file: status "{P["save_status"]}" (save_status, save_last)', 'M: Save file instead.', f'F: So how do I move it? | M: Save file. One file with everything, {words(save_kb)} kilobytes. On a phone it opens the share sheet.'),
 ('c6', 'card 6 (states: recorded on a local build)', 'M: Export.', 'M: Export.'),
 ('X1', f'Export image JPEG 512 px: "{P["jpeg_msg"]}" (jpeg_msg); suite editor_imgexport', 'M: JPEG, at the size you choose.', f'M: Export image. JPEG, at the size you choose. Here, {words(jpeg_kb)} kilobytes.'),
 ('X2', f'the same poster as PNG 512 px: "{P["png_msg"]}" (png_msg)', 'M: The PNG is bigger.', f'M: As a PNG, {words(png_kb)} kilobytes.'),
 ('end', 'prior-art card: Photopea own page, miniPaint README, GIMP manual (verified 2026-10-12; wording identical to v6)', 'M: We do not claim to be first.', 'M: Prior art. Photopea and miniPaint already run layered editors in a browser. We do not claim to be first. | F: So what does this show? | M: One thing. The saved file is the edit history.'),
]
cap = lambda t: re.sub(r'([.?!] )([a-z])', lambda m: m.group(1) + m.group(2).upper(), t)   # a number word that opens a sentence is capitalised in the captions
for i, src, short, det in R:
    a, b2 = W[i]; print('\t'.join([i, '%.2f' % a, '%.2f' % b2, src, cap(short), cap(det)]))
