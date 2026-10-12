# ⚠ DO NOT REMOVE — Scope: the OplogPic v6 dialogue (two voices, F and M) generated from timeline.json (build_v6.py). Row = id, cue, end, source, SHORT, DETAIL; every row's source names what is on screen or the measured/verified fact it rests on.
# Rules kept: no claim about another editor except what its own page / manual says; no phone number; no "first". usage: python3 dialogue_v6.py > dialogue_v6.tsv
import json, os
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v6'); W = json.load(open(V + '/timeline.json'))['windows']
R = [
 ('cover', 'cover card: OplogPic (working name)', 'F: OplogPic.', 'F: OplogPic. | M: A photo editor with history.'),
 ('c1', 'card 1 and the owner\'s line; op-log design; offline reload verified on the live build 2026-10-11', 'M: Every edit is one line in a log.', 'F: What is different? | M: Every edit is one line in a log. The picture is its replay. No server, no install.'),
 ('c2', 'chapter card 2: the finished file', 'M: A finished file.', 'M: Here is a finished file.'),
 ('T1', 'layers panel names from facts_showcase.tsv: Text, Paint, Balloon, Clouds, Background', 'M: Five layers.', 'F: What is in it? | M: Five layers. Clouds, balloon, caption, paint, and the background.'),
 ('T2', 'eye button on the caption layer, hide then show', 'M: Hide a layer.', 'M: Hide a layer. Show it again.'),
 ('T3', 'Balloon moved below Clouds and back (up / down arrows)', 'M: Reorder them.', 'M: Reorder them. The balloon goes under the clouds, and back.'),
 ('T4', 'opacity slider of the Clouds layer', 'M: Opacity.', 'M: Opacity, for each layer.'),
 ('T5', 'blend mode list on screen: normal multiply screen overlay soft-light hard-light darken lighten difference exclusion (10 options)', 'M: Ten of them.', 'F: Blend modes? | M: Ten of them.'),
 ('T6', 'tool bar: Hard Soft Smudge Erase Blur Select Wand Move Pick; wand bar (Tol slider) and move bar (Scale slider) shown', 'M: Brushes, and a wand.', 'M: Brush, smudge, blur and eraser. A selection, a magic wand, and a move tool. | F: And those bars? | M: The wand has a tolerance. The move tool has a scale slider.'),
 ('T7', 'one coral stroke on the Paint layer; counter 22 -> 23 ops in the log', 'M: One stroke, one entry.', 'F: And painting? | M: One stroke is one entry in the log.'),
 ('T8', 'Advanced ticked: mask and adjustment controls; Add text panel (suites editor_masks, editor_adjust, editor_text)', 'M: Masks, adjustments, text.', 'F: What is under Advanced? | M: Masks, adjustments, groups. And text is a layer too. | F: What does text ask for? | M: The words, the size, the colour and the position, with an optional shadow.'),
 ('c3', 'chapter card 3', 'M: The history is the file.', 'M: The history is the file.'),
 ('H1', 'History list in the side panel', 'M: Right here.', 'F: Where is the history? | M: Right here.'),
 ('H2', 'tap an old entry: preview (suite editor_history)', 'M: Tap any step.', 'M: Tap any step, and the picture goes back to how it looked then.'),
 ('H3', 'Back to now button', 'M: Back to now.', 'M: Back to now.'),
 ('H4', 'Undo x3, Redo x3 in the header; reopen + undo = suite editor_ckpt (desktop Chrome only, no phone)', 'M: Undo, and redo.', 'M: Undo, three times. Redo, three times. Each step is exact. | F: Even after closing the tab? | M: Reopen it, and undo still works.'),
 ('H5', 'Show raw entries: log lines with sizes such as 39 B, 48 B, 77 B; "14 entries, 0.8 KB"', 'M: One line per edit.', 'M: Or read the raw log. One line per edit, a few dozen bytes each.'),
 ('H6', 'Verify: replays the log from scratch and compares (editor_history); message on screen', 'M: Verify checks it.', 'F: Can I trust it? | M: Verify replays the whole log from scratch, and checks the picture matches.'),
 ('c4', 'chapter card 4', 'M: Two edits.', 'M: Two edits.'),
 ('E1', 'Balloon layer row selected, Move tool, Scale / Apply / Cancel bar', 'M: The move tool.', 'M: Pick the balloon layer, and the move tool.'),
 ('S2', 'splice: scale slider to 125 %; balloon pixels on the top row 0 -> 469 (splice_facts.tsv)', 'M: The top slips out.', 'M: Make it bigger, and the top slips out of frame. The layer still holds all of it.'),
 ('S3', 'splice: scale slider to 75 %; top row back to 0; nothing logged (entries_after_cancel 16)', 'M: Shrink it, and it returns.', 'M: Shrink it, and it comes back. Nothing is thrown away until you apply.'),
 ('E2', 'drag + scale 75 % + Apply: xform s 750, dx -90, dy 40 (edits_facts.tsv; suite editor_xform)', 'M: Place it, and apply.', 'M: Now place it. Drag, scale to seventy-five percent, apply. Its cut-out comes along.'),
 ('E3', 'Add adjustment menu: Hue / Saturation (suite editor_hsl)', 'M: Hue and saturation.', 'M: Add a hue and saturation adjustment.'),
 ('E4', 'Wand tool, tolerance 12, tap one yellow panel, Grow (suite editor_wand)', 'M: One panel.', 'F: Which part? | M: One panel. The wand picks it in a tap, at a tolerance of twelve.'),
 ('E5', 'Feather 2, Mask from selection on the adjustment row (suites editor_feather, editor_admask)', 'M: Feather, and mask.', 'M: Feather the edge, and mask the change to it.'),
 ('E6', 'Hue dragged to +150 then -90 on the adjustment row (adjset entries); adjustments re-editable (editor_adjust); admask suite', 'M: It stays a live setting.', 'M: Turn the hue. And turn it again. It stays a live setting. | F: Can I come back to it later? | M: Yes. It is an adjustment layer with its own mask.'),
 ('c5', 'cost card: film/measure_ram.js: 508-509 MB loaded vs 213 MB empty; own arrays 112.0 MB; phone NOT measured', 'M: Half a gigabyte on a laptop. Phones: not measured yet.', 'F: And the cost? | M: On a laptop, about half a gigabyte for this file. A hundred and twelve megabytes is our own layer data. | M: Phones are not measured yet. That is the roadmap.'),
 ('end', 'prior-art card: Photopea own page, miniPaint README, GIMP manual (verified 2026-10-12)', 'M: We do not claim to be first.', 'M: Prior art. Photopea and miniPaint already run layered editors in a browser. We do not claim to be first. | F: So what does this show? | M: One thing. The saved file is the edit history.'),
]
for i, src, short, det in R:
    a, b = W[i]; print('\t'.join([i, '%.2f' % a, '%.2f' % b, src, short, det]))
