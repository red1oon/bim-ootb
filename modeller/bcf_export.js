// bcf_export.js — §Q3 (prompts/RESUME_MODELLER_POLISH2.md — Witness: W-E2E-BCF): real BCF 2.1 EXPORT-ONLY MVP.
// Produces a genuine .bcfzip (bcf.version + <TopicGuid>/markup.bcf + viewpoint.bcfv + snapshot.png) that
// Navisworks/Solibri/BIMcollab can open — user-greenlit 2026-07-03 ("global professional important"), import
// deliberately out of scope. Self-contained by necessity (verified by repo grep): no zip lib is exposed
// anywhere (ExcelJS/SheetJS bundle theirs privately) → a minimal STORE-method writer + CRC32 below; no XML
// serializer exists → template strings + xmlEsc. NON-INVENT: Component IfcGuids come ONLY from the real
// fid→guid bridge (window.__arcGuidByFid — extracted-building guids) or a §Q2 instance pick's real guid;
// an authored fid with no real guid is listed by AuthoringToolId alone — never a fabricated IfcGuid.
// (Aligning authored-only fids with bonsai_ifc.js's synthesized export guids is a follow-up, not MVP.)
(function () {
  'use strict';
  var TAG = '§BCF';

  // ── CRC32, polynomial 0xEDB88320 (the zip standard) ────────────────────────────────────────────
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // ── minimal STORE-method zip (no compression — BCF permits it, and it keeps this dependency-free).
  // Fixed DOS timestamp 1980-01-01 00:00 (0x21/0) → deterministic bytes for identical inputs.
  function zipStore(files) {                 // files: [{name:String, bytes:Uint8Array}] → Uint8Array
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    files.forEach(function (f) {
      var nb = enc.encode(f.name), b = f.bytes, crc = crc32(b);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, b.length, true); lh.setUint32(22, b.length, true);
      lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, b);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, b.length, true); ch.setUint32(24, b.length, true);
      ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + b.length;
    });
    var cdLen = cd.reduce(function (s, a) { return s + a.length; }, 0);
    var eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, cdLen, true); eo.setUint32(16, off, true);
    var out = new Uint8Array(off + cdLen + 22), p = 0;
    parts.concat(cd, [new Uint8Array(eo.buffer)]).forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function n6(v) { return (+v).toFixed(6); }

  // ── pure builder: everything is passed in, nothing read from globals (unit-witnessable) ─────────
  function buildBcfzip(o) {   // {topicGuid, vpGuid, title, author, dateIso, filename, components:[{ifcGuid?,authoringToolId}], camera:{pos,dir,up,fov}, snapshot:Uint8Array}
    var enc = new TextEncoder();
    var version = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Version VersionId="2.1" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <DetailedVersion>2.1</DetailedVersion>\n</Version>\n';
    var markup = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Markup xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <Header>\n    <File>\n      <Filename>' + xmlEsc(o.filename) + '</Filename>\n      <Date>' + xmlEsc(o.dateIso) + '</Date>\n    </File>\n  </Header>\n' +
      '  <Topic Guid="' + xmlEsc(o.topicGuid) + '" TopicType="Issue" TopicStatus="Open">\n' +
      '    <Title>' + xmlEsc(o.title) + '</Title>\n' +
      '    <CreationDate>' + xmlEsc(o.dateIso) + '</CreationDate>\n' +
      '    <CreationAuthor>' + xmlEsc(o.author) + '</CreationAuthor>\n' +
      '  </Topic>\n' +
      '  <Viewpoints Guid="' + xmlEsc(o.vpGuid) + '">\n' +
      '    <Viewpoint>viewpoint.bcfv</Viewpoint>\n    <Snapshot>snapshot.png</Snapshot>\n  </Viewpoints>\n' +
      '</Markup>\n';
    var comps = (o.components || []).map(function (c) {
      return '        <Component' + (c.ifcGuid ? ' IfcGuid="' + xmlEsc(c.ifcGuid) + '"' : '') + '>\n' +
        '          <AuthoringToolId>' + xmlEsc(c.authoringToolId) + '</AuthoringToolId>\n        </Component>';
    }).join('\n');
    var cam = o.camera;
    var vp = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<VisualizationInfo Guid="' + xmlEsc(o.vpGuid) + '" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <Components>\n' +
      ((o.components || []).length ? '    <Selection>\n' + comps + '\n    </Selection>\n' : '') +
      '    <Visibility DefaultVisibility="true" />\n' +
      '  </Components>\n' +
      '  <PerspectiveCamera>\n' +
      '    <CameraViewPoint><X>' + n6(cam.pos[0]) + '</X><Y>' + n6(cam.pos[1]) + '</Y><Z>' + n6(cam.pos[2]) + '</Z></CameraViewPoint>\n' +
      '    <CameraDirection><X>' + n6(cam.dir[0]) + '</X><Y>' + n6(cam.dir[1]) + '</Y><Z>' + n6(cam.dir[2]) + '</Z></CameraDirection>\n' +
      '    <CameraUpVector><X>' + n6(cam.up[0]) + '</X><Y>' + n6(cam.up[1]) + '</Y><Z>' + n6(cam.up[2]) + '</Z></CameraUpVector>\n' +
      '    <FieldOfView>' + n6(cam.fov) + '</FieldOfView>\n' +
      '  </PerspectiveCamera>\n' +
      '</VisualizationInfo>\n';
    return zipStore([
      { name: 'bcf.version', bytes: enc.encode(version) },
      { name: o.topicGuid + '/markup.bcf', bytes: enc.encode(markup) },
      { name: o.topicGuid + '/viewpoint.bcfv', bytes: enc.encode(vp) },
      { name: o.topicGuid + '/snapshot.png', bytes: o.snapshot }
    ]);
  }

  // ── browser side: collect live state → build → download ────────────────────────────────────────
  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function _snapshotPng() {
    var A = window.A;
    A.renderer.render(A.scene, A.camera);   // renderer has NO preserveDrawingBuffer → render-then-read same tick (viewer/tools.js idiom)
    var durl = A.renderer.domElement.toDataURL('image/png');
    var bin = atob(durl.slice(durl.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function exportBcf(opts) {
    opts = opts || {};
    var A = window.A;
    if (!A || !A.camera || !A.controls) throw new Error('no scene/camera');
    var ids = (window.Bonsai && window.Bonsai._selSet && window.Bonsai._selSet.size) ? Array.from(window.Bonsai._selSet) : [];
    var gb = window.__arcGuidByFid || {};
    var components = ids.map(function (fid) { return { ifcGuid: gb[fid] || null, authoringToolId: 'fid:' + fid }; });
    var ip = window.__instPickActive;        // §Q2: an actively-picked walked/assembly instance with a REAL guid
    if (ip && ip.guid) components.push({ ifcGuid: ip.guid, authoringToolId: 'inst:' + ip.disc + ':' + ip.i });
    var pos = A.camera.position, tg = A.controls.target, up = A.camera.up;
    var d = { x: tg.x - pos.x, y: tg.y - pos.y, z: tg.z - pos.z };
    var dl = Math.hypot(d.x, d.y, d.z) || 1;
    var name = opts.title || ((window.__dwName || 'model') + ' — DAGeVu issue');
    var o = {
      topicGuid: _uuid(), vpGuid: _uuid(), title: name,
      author: opts.author || 'DAGeVu Modeller', dateIso: new Date().toISOString(),
      filename: (window.__dwName || 'model') + '.ifc',
      components: components,
      camera: { pos: [pos.x, pos.y, pos.z], dir: [d.x / dl, d.y / dl, d.z / dl], up: [up.x, up.y, up.z], fov: A.camera.fov },
      snapshot: _snapshotPng()
    };
    var bytes = buildBcfzip(o);
    console.log(TAG + ' export topic=' + o.topicGuid + ' components=' + components.length +
      ' withGuid=' + components.filter(function (c) { return c.ifcGuid; }).length +
      ' snapshotB=' + o.snapshot.length + ' zipB=' + bytes.length + ' cam=(' + n6(pos.x) + ',' + n6(pos.y) + ',' + n6(pos.z) + ') fov=' + n6(A.camera.fov));
    if (opts.download !== false) {
      try {
        var blob = new Blob([bytes], { type: 'application/octet-stream' });   // same download idiom as bonsai_ifc.js
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = (window.__dwName || 'model') + '.bcfzip'; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { console.warn(TAG + ' download failed ' + e); }
    }
    return { bytes: bytes, topicGuid: o.topicGuid, vpGuid: o.vpGuid, components: components, camera: o.camera, title: name };
  }

  var Bcf = { exportBcf: exportBcf, buildBcfzip: buildBcfzip, crc32: crc32, zipStore: zipStore, xmlEsc: xmlEsc };
  if (typeof window !== 'undefined') { window.Bonsai = window.Bonsai || {}; window.Bonsai.bcf = Bcf; }
  if (typeof module !== 'undefined' && module.exports) module.exports = Bcf;   // node witnesses can unit-drive the pure builders
})();
