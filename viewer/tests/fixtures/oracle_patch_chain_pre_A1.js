// ORACLE for viewer/tests/witness_patch_chain_single_open.js — VERBATIM copy of viewer/scene.js at a2026c89 (pre-§A1):
// _applyLightFieldPatch, _applyPendingPatch, _applyQtoPatch, _applyMainPatch (the 3-open/3-export chain). Do not edit.
  A._applyLightFieldPatch = async function(buf, dir, dbFile) {
    var u = dir + 'patches/' + dbFile + '.lightfield.bin';
    try { var r = await fetch(u); if (!r.ok) { console.log('§LIGHT_FIELD_PATCH none ' + dbFile + ' (' + r.status + ')'); return buf; }
      var ab = await r.arrayBuffer(), dv = new DataView(ab), SQLF = A._SQL || window.SQL || window._SQL_CACHED;
      if (ab.byteLength < 8 || String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'LFP1') { console.warn('§LIGHT_FIELD_PATCH_FAIL ' + dbFile + ' bad magic'); return buf; }
      if (!SQLF) { console.warn('§LIGHT_FIELD_PATCH_FAIL sql.js factory not loaded'); return buf; }
      var hl = dv.getUint32(4, true), H = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, hl))), blob = new Uint8Array(ab, 8 + hl);
      if (blob.byteLength !== H.bytes) { console.warn('§LIGHT_FIELD_PATCH_FAIL ' + dbFile + ' blob ' + blob.byteLength + ' != header ' + H.bytes); return buf; }
      var t0 = performance.now(), pdb = new SQLF.Database(new Uint8Array(buf));
      pdb.run("DROP TABLE IF EXISTS light_field_cache"); pdb.run("CREATE TABLE light_field_cache (key TEXT, bld TEXT, fp TEXT, bytes INTEGER, raw_bytes INTEGER, blob BLOB, created TEXT)");
      var st = pdb.prepare("INSERT INTO light_field_cache VALUES (?,?,?,?,?,?,?)"); st.run([H.key, H.bld, H.fp, H.bytes, H.raw_bytes, blob, H.created]); st.free();
      var out = pdb.export().buffer; pdb.close();
      console.log('§LIGHT_FIELD_PATCH applied ' + dbFile + ' key=' + H.key + ' bytes=' + H.bytes + ' raw=' + H.raw_bytes + ' created=' + H.created + ' ms=' + Math.round(performance.now() - t0) + ' from ' + u); return out;
    } catch (e) { console.warn('§LIGHT_FIELD_PATCH_FAIL ' + dbFile + ' — ' + (e && e.message)); return buf; }
  };
  A._applyPendingPatch = async function(buf, url) {
    var out = await A._applyMainPatch(buf, url);
    return A._applyQtoPatch(out, url);
  };
  A._applyQtoPatch = async function(buf, url) {
    try {
      var dir = url.slice(0, url.lastIndexOf('/') + 1);
      var dbFile = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
      var qUrl = dir + 'patches/' + dbFile + '.qto.sql';
      var r = await fetch(qUrl);
      if (!r.ok) { console.log('§PATCH_QTO_NONE ' + dbFile + ' (' + r.status + ')'); return buf; }
      var sql = await r.text();
      var SQLFactory = A._SQL || window.SQL || window._SQL_CACHED;
      if (!SQLFactory) { console.warn('§PATCH_QTO_FAIL ' + url + ' — sql.js factory not loaded yet'); return buf; }
      var pdb = new SQLFactory.Database(new Uint8Array(buf));
      var _ch = A._runSqlChunked(pdb, sql);
      var n = 0; try { n = pdb.exec('SELECT count(*) FROM qto_cache')[0].values[0][0]; } catch (e) { n = -1; }
      var out = pdb.export().buffer;
      pdb.close();
      console.log('§PATCH_QTO ' + dbFile + ' applied (' + _ch.statements + ' statements) qto_cache rows=' + n + ' from ' + qUrl);
      return out;
    } catch (e) {
      console.warn('§PATCH_QTO_FAIL ' + url + ' — using db without the cost patch', e && e.message);
      return buf;
    }
  };
  A._applyMainPatch = async function(buf, url) {
    try {
      var dir = url.slice(0, url.lastIndexOf('/') + 1);
      var dbFile = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
      var patchUrl = dir + 'patches/' + dbFile + '.sql';
      console.log('§DB_LOAD_STEP patch-fetch ' + patchUrl);
      var r = await fetch(patchUrl);
      console.log('§DB_LOAD_STEP patch-response status=' + r.status);
      if (!r.ok) { console.log(`[S203] §PATCH_NONE ${dbFile} (${r.status})`); return A._applyLightFieldPatch(buf, dir, dbFile); }
      var sql = await r.text();
      var SQLFactory = A._SQL || window.SQL || window._SQL_CACHED;   // viewer caches the sql.js factory as A._SQL (streaming.js)
      if (!SQLFactory) { console.warn(`[S203] §PATCH_APPLY_FAIL ${url} — sql.js factory not loaded yet`); return buf; }
      var pdb = new SQLFactory.Database(new Uint8Array(buf));
      var _ch = A._runSqlChunked(pdb, sql);   // §PATCH_CHUNK — see comment above _runSqlChunked
      var out = pdb.export().buffer;
      pdb.close();
      console.log(`[S203] §PATCH_APPLY ${dbFile} applied (${sql.length} bytes, ${_ch.statements} statements, ${_ch.chunks} chunk(s)) from ${patchUrl}`);
      return A._applyLightFieldPatch(out, dir, dbFile);
    } catch (e) {
      console.warn(`[S203] §PATCH_APPLY_FAIL ${url} — using unpatched db`, e && e.message);
      return buf;
    }
  };
