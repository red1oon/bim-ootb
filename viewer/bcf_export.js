// bcf_export.js — real BCF 2.1 EXPORT-ONLY (bcf.version + {topicGuid}/markup.bcf + viewpoint.bcfv +
// snapshot.png per topic), openable by Navisworks/Solibri/BIMcollab. One BCF Topic per saved Issue
// (A._getAllIssues(), viewer/issues.js) — clashes AND freeform notes both export, not just clashes.
//
// EXTRACTED, not invented: the zip-writer (STORE method, CRC32) and XML templates are ported verbatim
// from modeller/bcf_export.js's exportBcf (same repo, already-shipped BCF 2.1 writer — Q3/W-E2E-BCF).
// The per-clash domain mapping (status→BCF-status, severity→BCF-priority, description/title shape) is
// ported from ~/IfcOpenShell/src/bonsai/bonsai/bim/module/federation/bcf/bcf_generator.py's
// BCFGenerator (the real "old IfcOpenShell/Federation python" BCF exporter, user-cited 2026-07-06),
// re-sourced from the Viewer's OWN real fields instead of that module's SQLite clash_status schema:
//   status   ← A._clashStatuses[A._clashPairKey(guid_a,guid_b)] (viewer/measure.js's real lifecycle:
//              '' / 'Reviewed' / 'Resolved' / 'Accepted' — not the Python's NEW/ACTIVE/REVIEWED/RESOLVED)
//   priority ← the issue's own stored `severity` label ('Hard clash'/'Soft clash'/'Clearance violation',
//              viewer/clash_rules.json) — not the Python's discipline-pair guess, since the Viewer
//              already computes a precise overlap-based severity per clash.
//   viewpoint← the issue's own REAL captured camera_pos/camera_target (viewer/clash_snag.js already
//              stores these per issue) — falls back to the Python's isometric-from-bbox-center math
//              (viewpoint_manager.generate_clash_viewpoint) only when a stored camera is missing.
//   snapshot ← the issue's own REAL stored PNG blob (issues.js `jpeg_blob` field — actually PNG bytes
//              despite the name, confirmed via its `canvas.toBlob(..., 'image/png')` call) — never
//              synthesized; topics with no stored snapshot simply omit <Snapshot> (BCF-valid, optional).
function setupBcfExport(A) {

  // ── CRC32 + minimal STORE-method zip — verbatim port of modeller/bcf_export.js (no zip lib is
  // exposed anywhere in this codebase; ExcelJS/SheetJS bundle theirs privately). ──────────────────
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
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
  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ── domain mapping, ported from bcf_generator.py's _map_status_to_bcf/_calculate_priority,
  // re-keyed onto the Viewer's REAL status/severity vocabulary (see file header). ──────────────────
  function _statusToBcf(status) {
    if (status === 'Resolved') return 'Resolved';
    if (status === 'Accepted') return 'Closed';
    return 'Open';                                  // '' or 'Reviewed' — still open in the Viewer's cycle
  }
  function _priorityFromSeverity(label) {
    if (label === 'Hard clash') return 'Critical';
    if (label === 'Soft clash') return 'Major';
    if (label === 'Clearance violation') return 'Minor';
    return 'Normal';
  }
  function _friendlyClass(ifcClass) { return (ifcClass || '?').replace('Ifc', '').replace('StandardCase', ''); }

  // Isometric camera fallback for issues saved without a live viewpoint — pure port of
  // viewpoint_manager.py's generate_clash_viewpoint(angle='isometric') (bpy/mathutils dropped, the
  // actual math is plain vector arithmetic).
  function _isometricViewpoint(center, bboxSize) {
    var distance = (bboxSize || 5) * 1.5;
    var off = [1, -1, 1], ol = Math.hypot(off[0], off[1], off[2]);
    var offset = [off[0] / ol * distance, off[1] / ol * distance, off[2] / ol * distance];
    var pos = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
    var d = [center[0] - pos[0], center[1] - pos[1], center[2] - pos[2]];
    var dl = Math.hypot(d[0], d[1], d[2]) || 1;
    return { pos: pos, dir: [d[0] / dl, d[1] / dl, d[2] / dl], up: [0, 0, 1] };
  }

  // ── pure builder: one topic's markup.bcf + viewpoint.bcfv XML, given already-resolved fields. ────
  function _buildTopicXml(t) {
    var markup = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Markup xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <Header>\n    <File>\n      <Filename>' + xmlEsc(t.filename) + '</Filename>\n      <Date>' + xmlEsc(t.dateIso) + '</Date>\n    </File>\n  </Header>\n' +
      '  <Topic Guid="' + xmlEsc(t.topicGuid) + '" TopicType="' + xmlEsc(t.topicType) + '" TopicStatus="' + xmlEsc(t.bcfStatus) + '">\n' +
      '    <ReferenceLinks>\n' + t.refGuids.map(function (g) { return '      <ReferenceLink>' + xmlEsc(g) + '</ReferenceLink>'; }).join('\n') + '\n    </ReferenceLinks>\n' +
      '    <Title>' + xmlEsc(t.title) + '</Title>\n' +
      '    <Priority>' + xmlEsc(t.priority) + '</Priority>\n' +
      '    <CreationDate>' + xmlEsc(t.dateIso) + '</CreationDate>\n' +
      '    <CreationAuthor>' + xmlEsc(t.author) + '</CreationAuthor>\n' +
      '    <Description>' + xmlEsc(t.description) + '</Description>\n' +
      '    <Labels>\n' + t.labels.map(function (l) { return '      <Label>' + xmlEsc(l) + '</Label>'; }).join('\n') + '\n    </Labels>\n' +
      '  </Topic>\n' +
      (t.comment ? '  <Comment Guid="' + xmlEsc(_uuid()) + '">\n    <Date>' + xmlEsc(t.dateIso) + '</Date>\n    <Author>' + xmlEsc(t.author) + '</Author>\n    <Comment>' + xmlEsc(t.comment) + '</Comment>\n  </Comment>\n' : '') +
      '  <Viewpoints Guid="' + xmlEsc(t.vpGuid) + '">\n' +
      '    <Viewpoint>viewpoint.bcfv</Viewpoint>\n' + (t.hasSnapshot ? '    <Snapshot>snapshot.png</Snapshot>\n' : '') + '  </Viewpoints>\n' +
      '</Markup>\n';
    var cam = t.camera;
    var vp = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<VisualizationInfo Guid="' + xmlEsc(t.vpGuid) + '" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <Components>\n' +
      '    <Selection>\n' + t.refGuids.map(function (g) { return '      <Component IfcGuid="' + xmlEsc(g) + '" />'; }).join('\n') + '\n    </Selection>\n' +
      '    <Visibility DefaultVisibility="true" />\n' +
      '  </Components>\n' +
      '  <PerspectiveCamera>\n' +
      '    <CameraViewPoint><X>' + n6(cam.pos[0]) + '</X><Y>' + n6(cam.pos[1]) + '</Y><Z>' + n6(cam.pos[2]) + '</Z></CameraViewPoint>\n' +
      '    <CameraDirection><X>' + n6(cam.dir[0]) + '</X><Y>' + n6(cam.dir[1]) + '</Y><Z>' + n6(cam.dir[2]) + '</Z></CameraDirection>\n' +
      '    <CameraUpVector><X>' + n6(cam.up[0]) + '</X><Y>' + n6(cam.up[1]) + '</Y><Z>' + n6(cam.up[2]) + '</Z></CameraUpVector>\n' +
      '    <FieldOfView>' + n6(cam.fov || 60) + '</FieldOfView>\n' +
      '  </PerspectiveCamera>\n' +
      '</VisualizationInfo>\n';
    return { markup: markup, vp: vp };
  }

  // ── one Issue record (viewer/issues.js schema) → one resolved topic-fields object. ────────────────
  function _issueToTopic(issue) {
    var isClash = issue.type === 'clash';
    var dateIso = issue.timestamp || new Date().toISOString();
    var refGuids = isClash ? [issue.element_guid, issue.element_b_guid].filter(Boolean) : [issue.element_guid].filter(Boolean);

    var status = '';
    if (isClash && A._clashPairKey && A._clashStatuses) {
      status = A._clashStatuses[A._clashPairKey(issue.element_guid, issue.element_b_guid)] || '';
    }

    var title, description, labels;
    if (isClash) {
      var nameA = issue.element_name || _friendlyClass(issue.element_class);
      var nameB = issue.element_b_name || _friendlyClass(issue.element_b_class);
      title = 'Clash: ' + nameA + ' vs ' + nameB;
      description = 'Element A: ' + nameA + ' (' + (issue.element_class || '?') + ')\n' +
        'Element B: ' + nameB + ' (' + (issue.element_b_class || '?') + ')\n' +
        'Disciplines: ' + (issue.discipline_pair || '').replace('|', ' vs ') + '\n' +
        'Overlap: ' + (issue.overlap_mm != null ? issue.overlap_mm + 'mm' : 'n/a') + '\n' +
        'Storey: ' + (issue.storey || '?') + '\n' +
        'Status: ' + (status || 'Open');
      labels = [issue.discipline_pair || '', issue.element_class || '', issue.element_b_class || ''].filter(Boolean);
    } else {
      title = issue.notes ? issue.notes.slice(0, 80) : ('Site note — ' + (issue.element_name || issue.element_class || issue.element_guid || 'unlabeled'));
      description = (issue.notes || '') + '\nElement: ' + (issue.element_name || issue.element_guid || '?') +
        (issue.storey ? ('\nStorey: ' + issue.storey) : '');
      labels = [issue.discipline || ''].filter(Boolean);
    }

    var camera;
    try {
      var pos = typeof issue.camera_pos === 'string' ? JSON.parse(issue.camera_pos) : issue.camera_pos;
      var tgt = typeof issue.camera_target === 'string' ? JSON.parse(issue.camera_target) : issue.camera_target;
      if (pos && tgt) {
        var d = [tgt.x - pos.x, tgt.y - pos.y, tgt.z - pos.z], dl = Math.hypot(d[0], d[1], d[2]) || 1;
        camera = { pos: [pos.x, pos.y, pos.z], dir: [d[0] / dl, d[1] / dl, d[2] / dl], up: [0, 0, 1], fov: 60 };
      }
    } catch (e) {}
    if (!camera) {
      // No stored viewpoint — fall back to the Federation module's isometric-from-position math.
      var c0 = refGuids.length && A.dbQuery ? A.dbQuery('SELECT cx, cy, cz FROM element_transforms WHERE guid = ?', [refGuids[0]]) : [];
      var center = c0.length ? [c0[0][0], c0[0][1], c0[0][2]] : [0, 0, 0];
      var iso = _isometricViewpoint(center, 5);
      camera = { pos: iso.pos, dir: iso.dir, up: iso.up, fov: 60 };
    }

    return {
      topicGuid: _uuid(), vpGuid: _uuid(),
      topicType: isClash ? 'Clash' : 'Comment',
      bcfStatus: _statusToBcf(status),
      priority: isClash ? _priorityFromSeverity(issue.severity) : 'Normal',
      title: title, description: description, labels: labels,
      comment: issue.notes && isClash ? issue.notes : null,
      refGuids: refGuids, camera: camera,
      dateIso: dateIso, author: 'BIM OOTB Viewer', filename: (A.activeBuilding || 'model') + '.ifc',
      hasSnapshot: !!(issue.jpeg_blob && issue.jpeg_blob.size)
    };
  }

  // ── browser side: collect real Issues → build multi-topic .bcfzip → download. ────────────────────
  A.exportBcf = async function (opts) {
    opts = opts || {};
    var allIssues = await A._getAllIssues();
    var issues = opts.ids ? allIssues.filter(function (i) { return opts.ids.indexOf(i.id) !== -1; }) : allIssues;
    if (!issues.length) { console.log('§BCF export skipped — no saved issues'); if (A.status) A.status.textContent = 'No issues to export as BCF'; return null; }

    var enc = new TextEncoder();
    var files = [{
      name: 'bcf.version',
      bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Version VersionId="2.1" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <DetailedVersion>2.1</DetailedVersion>\n</Version>\n')
    }];
    var withSnapshot = 0;
    for (var i = 0; i < issues.length; i++) {
      var t = _issueToTopic(issues[i]);
      var xml = _buildTopicXml(t);
      files.push({ name: t.topicGuid + '/markup.bcf', bytes: enc.encode(xml.markup) });
      files.push({ name: t.topicGuid + '/viewpoint.bcfv', bytes: enc.encode(xml.vp) });
      if (t.hasSnapshot) {
        var buf = await issues[i].jpeg_blob.arrayBuffer();
        files.push({ name: t.topicGuid + '/snapshot.png', bytes: new Uint8Array(buf) });
        withSnapshot++;
      }
    }
    var bytes = zipStore(files);
    console.log('§BCF export topics=' + issues.length + ' withSnapshot=' + withSnapshot + ' zipB=' + bytes.length);

    if (opts.download !== false) {
      var blob = new Blob([bytes], { type: 'application/octet-stream' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (A.activeBuilding || 'model') + '.bcfzip'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if (A.status) A.status.textContent = 'Exported ' + issues.length + ' issue(s) as BCF';
    }
    return { bytes: bytes, topicCount: issues.length };
  };

  // Exposed for node witnesses (pure builders only — no DOM/IDB dependency).
  A._bcf = { zipStore: zipStore, crc32: crc32, xmlEsc: xmlEsc, _statusToBcf: _statusToBcf, _priorityFromSeverity: _priorityFromSeverity, _issueToTopic: _issueToTopic, _buildTopicXml: _buildTopicXml };
  console.log('§BCF_EXPORT_MODULE loaded');
}
