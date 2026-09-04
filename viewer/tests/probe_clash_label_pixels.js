#!/usr/bin/env node
// ⚠ DO NOT REMOVE — PROBE §CLASH_FILM_P2 end-of-chain (2026-09-05, bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P2)
// Scope: is the label actually IN THE EXPORTED BYTES of a baked film? The witness proves the selector
// and the layout; a DOM overlay would pass all of that and still be absent from the mp4 (the trap
// cpe_day_counter.js's header names). This probe reads the bake's own `§CLASH_LABELS frame=N …
// panels=[i@x,y,wxh:alpha]` lines, pulls frame N out of the mp4 with ffmpeg as raw RGB, and measures
// the panel rectangle for the label's signature: red text pixels concentrated in the TOP row band and
// blue text pixels in the BOTTOM row band. A marker glowing behind the plate would put red across
// both bands, so the band asymmetry is what separates "label" from "marker". Read the log after
// every run — the exit code is not evidence. INCONCLUSIVE when no frame has a panel at alpha ≥ 0.9.
// Usage: node probe_clash_label_pixels.js <bake.log> <bake.mp4> [maxFrames]
'use strict';
const fs = require('fs'), { execFileSync } = require('child_process');
const [LOGF, MP4, MAXF] = [process.argv[2], process.argv[3], +(process.argv[4] || 6)];
if (!LOGF || !MP4 || !fs.existsSync(LOGF) || !fs.existsSync(MP4)) { console.log('§CLL_PIXELS INCONCLUSIVE reason=usage: <bake.log> <bake.mp4>'); process.exit(2); }
const dims = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-count_frames', '-of', 'csv=p=0', MP4]).toString().trim().split(',').map(Number);
const [W, H, NF] = dims;
console.log(`§CLL_PIXELS_ENV mp4=${MP4} ${W}x${H} frames=${NF} log=${LOGF}`);
const lines = fs.readFileSync(LOGF, 'utf8').split('\n').filter(l => l.includes('§CLASH_LABELS frame='));
const frames = [];
for (const l of lines) {
  const fm = /§CLASH_LABELS frame=(\d+)/.exec(l), pm = /panels=\[([^\]]*)\]/.exec(l);
  if (!fm || !pm) continue;
  const panels = pm[1].split(' ').map(s => { const m = /^(\d+)@(-?\d+),(-?\d+),(\d+)x(\d+)(B?):([\d.]+)$/.exec(s); return m && { i: +m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5], behind: m[6] === 'B', alpha: +m[7] }; }).filter(p => p && p.alpha >= 0.9);
  if (panels.length && +fm[1] < NF) frames.push({ n: +fm[1], panels });
}
if (!frames.length) { console.log(`§CLL_PIXELS INCONCLUSIVE reason=no §CLASH_LABELS line with a panel at alpha≥0.9 within ${NF} frames — nothing to look for`); process.exit(2); }
// spread the sample over the film, up to MAXF frames
const pick = frames.length <= MAXF ? frames : Array.from({ length: MAXF }, (_, k) => frames[Math.floor(k * (frames.length - 1) / (MAXF - 1))]);
let ok = 0, bad = 0, checked = 0;
for (const f of pick) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', MP4, '-vf', `select=eq(n\\,${f.n})`, '-fps_mode', 'passthrough', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 3 + 1024 });
  if (raw.length !== W * H * 3) { console.log(`§CLL_PIXELS frame=${f.n} INCONCLUSIVE rawBytes=${raw.length} expected=${W * H * 3}`); continue; }
  for (const p of f.panels) {
    const x0 = Math.max(0, p.x), y0 = Math.max(0, p.y), x1 = Math.min(W, p.x + p.w), y1 = Math.min(H, p.y + p.h), ym = Math.round((y0 + y1) / 2);
    let redTop = 0, redBot = 0, bluTop = 0, bluBot = 0, lum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 3, r = raw[o], g = raw[o + 1], b = raw[o + 2]; n++; lum += (r + g + b) / 3;
      const red = r > 170 && g < 120 && b < 120, blu = b > 170 && r < 130 && g < 170;
      if (red) { if (y < ym) redTop++; else redBot++; }
      if (blu) { if (y < ym) bluTop++; else bluBot++; }
    }
    // signature: red text in the top band, blue in the bottom band, each dominating its own band
    const pass = redTop >= 15 && bluBot >= 15 && redTop > 2 * redBot && bluBot > 2 * bluTop;
    checked++; if (pass) ok++; else bad++;
    console.log(`§CLL_PIXELS frame=${f.n} pair=${p.i} rect=${p.x},${p.y},${p.w}x${p.h} alpha=${p.alpha} redTop=${redTop} redBot=${redBot} bluTop=${bluTop} bluBot=${bluBot} meanLum=${(lum / n).toFixed(1)} ${pass ? 'LABEL-IN-BYTES' : 'NOT-FOUND'}`);
  }
}
console.log(`§CLL_PIXELS_SUMMARY panelsChecked=${checked} found=${ok} notFound=${bad} framesSampled=${pick.length}/${frames.length} ${bad === 0 && ok > 0 ? 'PASS' : (ok === 0 ? 'FAIL' : 'PARTIAL')}`);
process.exitCode = (bad === 0 && ok > 0) ? 0 : 1;
