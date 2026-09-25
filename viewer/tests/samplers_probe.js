// count active sampler uniforms per linked program after an Alt+S; report GL limits; capture console errors
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT, DB, POSE, QUERY = ''] = process.argv.slice(2);
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = []; let cerr = 0;
  p.on('console', m => { const t = m.text(); L.push(t); if (m.type() === 'error' || /Shader Error|GL_INVALID|Context Lost|LINK_FAIL|GLERR/.test(t)) { cerr++; if (cerr <= 6) console.log('[console.' + m.type() + '] ' + t.slice(0, 300)); } });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB + QUERY, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 300000 });
  let n = -1, st = 0; for (let i = 0; i < 150 && st < 3; i++) { await sleep(2000); const k = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (k > 0 && k === n) st++; else st = 0; n = k; }
  const lim = await p.evaluate(() => { const gl = window.APP.renderer.getContext(); return { maxTexUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), maxCombined: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS), maxFragVec: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS), renderer: (gl.getExtension('WEBGL_debug_renderer_info') ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : '?') }; });
  console.log('loaded ' + n + ' limits ' + JSON.stringify(lim));
  await p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); }, JSON.parse(POSE));
  await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL|§STILL_REFINE done/.test(t)); i++) await sleep(1000);
  await sleep(2000);
  const r = await p.evaluate(() => { const A = window.APP, gl = A.renderer.getContext(); const ST = new Set([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D, gl.INT_SAMPLER_3D]);
    const rows = (A.renderer.info.programs || []).map(pr => { const P = pr.program; let s = 0, names = []; if (!gl.getProgramParameter(P, gl.LINK_STATUS)) return { name: pr.name, linked: false };
      const nu = gl.getProgramParameter(P, gl.ACTIVE_UNIFORMS); for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(P, i); if (ST.has(u.type)) { s += u.size; names.push(u.name + (u.size > 1 ? 'x' + u.size : '')); } } return { name: pr.name || pr.cacheKey.slice(0, 30), linked: true, samplers: s, names }; });
    rows.sort((a, b) => (b.samplers || 0) - (a.samplers || 0)); return { programs: rows.length, unlinked: rows.filter(x => !x.linked).length, top: rows.slice(0, 3), glErr: gl.getError() }; });
  console.log('SAMPLERS ' + JSON.stringify(r));
  console.log('consoleErrors=' + cerr + ' contextLost=' + L.some(t => /Context Lost/.test(t)));
  await b.close(); })().catch(e => { console.log('FATAL ' + e); process.exit(1); });
