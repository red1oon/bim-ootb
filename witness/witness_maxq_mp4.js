// WITNESS — §MAXQ_MP4 mp4/H.264 export (PHOTOREAL_STILL_RENDER.md §MAXQ_MP4 SPEC 2026-07-19).
// ISSUE PROVEN/DISPROVEN: the MaxQ movie shipped as webm/VP9, which does NOT play on iPhone or in
// WhatsApp — the sharing blocker for the outreach audience. Does a real in-app bake now produce a
// VALID, PLAYABLE mp4/H.264, and does the webm path still work when mp4 is unavailable?
//   CASE A (mp4): a short bake must log §MAXQ_MP4 configured + §MAXQ_DONE type=video/mp4 and the
//                 DOWNLOADED FILE must pass ffprobe as container=mp4 codec=h264 with the right
//                 frame count. A file that downloads but does not play is a FAIL.
//   CASE B (fallback): with mp4 forced off, the untouched MediaRecorder path must still reach
//                 §MAXQ_DONE with a webm — this feature is additive, it must not break the old one.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const URL = 'http://localhost:8477/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const DL = '/tmp/maxq_mp4_witness_dl';
const FRAMES = 6, FPS = 15;

function ffprobe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams',
    '-count_frames', '-select_streams', 'v:0', '-of', 'default=noprint_wrappers=1', file],
    { encoding: 'utf8' });
  const g = k => (out.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1];
  return { codec: g('codec_name'), fmt: g('format_name'), w: g('width'), h: g('height'),
           frames: g('nb_read_frames'), dur: g('duration'), profile: g('profile'),
           fps: g('r_frame_rate'), start: g('start_time'), raw: out };
}
function ffdecode(file) {
  try { execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return ''; }
  catch (e) { return (e.stderr || '').trim(); }
}
function newestIn(dir, ext) {
  const f = fs.readdirSync(dir).filter(n => n.endsWith(ext)).map(n => path.join(dir, n));
  if (!f.length) return null;
  return f.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

(async () => {
  fs.rmSync(DL, { recursive: true, force: true });
  fs.mkdirSync(DL, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push(t); if (/§MAXQ/.test(t)) console.log('  [page] ' + t); });
  page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); console.log('  [pageerror] ' + e.message); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startMaxQualityOrbit && window.APP.camera, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 8000));
  console.log('LOADED. ' + (logs.find(l => l.startsWith('§MAXQ_LOADED')) || '§MAXQ_LOADED MISSING'));
  const muxLoaded = await page.evaluate(() => !!(window.MP4Mux && window.MP4Mux.mux));
  console.log('window.MP4Mux present: ' + muxLoaded);

  async function bake(opts, label, timeoutMs) {
    const n0 = logs.length, t0 = Date.now();
    await page.evaluate(o => { window.APP.startMaxQualityOrbit(o); }, opts);
    while (Date.now() - t0 < timeoutMs) {
      const tail = logs.slice(n0);
      if (tail.some(l => l.includes('§MAXQ_DONE'))) break;
      if (tail.some(l => l.includes('§MAXQ_FAIL'))) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 3000));   // let the download land
    console.log('  ' + label + ' elapsed=' + (Date.now() - t0) + 'ms');
    return logs.slice(n0);
  }

  // ---------- CASE A: mp4 ----------
  console.log('\n=== CASE A — mp4/H.264, ' + FRAMES + ' frames @ ' + FPS + 'fps ===');
  const tailA = await bake({ frames: FRAMES, fps: FPS, preview: false }, 'CASE A', 240000);
  const doneA = tailA.find(l => l.includes('§MAXQ_DONE')) || '';
  const cfgA = tailA.find(l => l.includes('§MAXQ_MP4 configured')) || '';
  const encA = tailA.find(l => l.includes('§MAXQ_MP4 encoded')) || '';
  const muxA = tailA.find(l => l.includes('§MAXQ_MP4 mux ')) || '';
  const fbA = tailA.find(l => l.includes('§MAXQ_MP4_FALLBACK')) || '';
  console.log('  §MAXQ_MP4 configured : ' + (cfgA || 'NONE'));
  console.log('  §MAXQ_MP4 encoded    : ' + (encA || 'NONE'));
  console.log('  §MAXQ_MP4 mux        : ' + (muxA || 'NONE'));
  console.log('  §MAXQ_MP4_FALLBACK   : ' + (fbA || 'none (good)'));
  console.log('  §MAXQ_DONE           : ' + (doneA || 'NONE'));

  const mp4File = newestIn(DL, '.mp4');
  let probeA = null, decA = 'no file';
  if (mp4File) {
    probeA = ffprobe(mp4File);
    decA = ffdecode(mp4File);
    console.log('  FILE: ' + mp4File + '  ' + fs.statSync(mp4File).size + ' bytes');
    console.log('  ffprobe: container=' + probeA.fmt + ' codec=' + probeA.codec + ' profile=' + probeA.profile +
      ' ' + probeA.w + 'x' + probeA.h + ' fps=' + probeA.fps + ' frames=' + probeA.frames +
      ' dur=' + probeA.dur + ' start=' + probeA.start);
    console.log('  full-decode stderr: ' + (decA || '(clean)'));
  } else {
    console.log('  FILE: NONE DOWNLOADED');
  }
  const passA = !!mp4File && !!probeA &&
    /mp4/.test(probeA.fmt || '') && probeA.codec === 'h264' &&
    Number(probeA.frames) === FRAMES && decA === '' &&
    /type=video\/mp4/.test(doneA) && !fbA;
  console.log('  CASE A: ' + (passA ? 'PASS' : 'FAIL'));

  // ---------- CASE B: webm fallback still works ----------
  console.log('\n=== CASE B — forced webm fallback (the untouched MediaRecorder path) ===');
  const tailB = await bake({ frames: FRAMES, fps: FPS, preview: false, forceWebm: true }, 'CASE B', 240000);
  const doneB = tailB.find(l => l.includes('§MAXQ_DONE')) || '';
  const fbB = tailB.find(l => l.includes('§MAXQ_MP4_FALLBACK')) || '';
  const stitchB = tailB.find(l => l.includes('§MAXQ_STITCH')) || '';
  console.log('  §MAXQ_MP4_FALLBACK : ' + (fbB || 'NONE'));
  console.log('  §MAXQ_STITCH       : ' + (stitchB || 'NONE'));
  console.log('  §MAXQ_DONE         : ' + (doneB || 'NONE'));
  const webmFile = newestIn(DL, '.webm');
  if (webmFile) console.log('  FILE: ' + webmFile + '  ' + fs.statSync(webmFile).size + ' bytes');
  const passB = /type=video\/webm/.test(doneB) && !!stitchB && !!webmFile;
  console.log('  CASE B: ' + (passB ? 'PASS' : 'FAIL'));

  const errs = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('\npageerrors: ' + errs.length + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  const ok = passA && passB && !errs.length;
  console.log('\nVERDICT: ' + (ok ? 'PASS — valid playable mp4/H.264, webm fallback intact' : 'FAIL'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
