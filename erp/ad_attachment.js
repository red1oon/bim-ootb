// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_attachment.js - the window toolbar Attachment, ONE generic module (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §ATT, phase 1; W-ATTACH).
//   Port of: GridTab.canHaveAttachment :2168 / hasAttachment / getAD_AttachmentID :2188, AbstractADWindowContent.onAttachment :1259-1278,
//   WAttachment (the dialog: Load, Delete entry, Save, Save as zip | entry select + size | text | preview | Delete all, Preview, OK, Cancel),
//   MAttachment (one row per AD_Table_ID + Record_ID/Record_UU; Title 'zip'; addEntry replaces a same-named entry; an empty attachment is deleted),
//   AttachmentDBSystem (BinaryData = a java.util.zip archive, one DEFLATED entry per file named by the file, archive comment "iDempiere"; Title<>'zip' = old single-file format).
//   Store = the DB method (phase 1) AND, above the DB cap, the browser file store (phase 2, ERP_IDEMPIERE_UX_PARITY §BIMDOC-OPEN: the twin of AttachmentFileSystem + MStorageProvider; bytes in common/file_store.js
//   OPFS bim_files/<sha256>, the row keeps name/size/sha256 as a JSON index in BinaryData with Title 'fs', as legacy's file-system provider keeps an index of paths). No table is named: the host passes the tab's table id and record.
//   Loaded on first use by idempiere.html (nothing at open needs it). Host contract: { rows(sql)->[{col:val}], commit(ops)->Promise<bool>, msg(value,en), std }.
(function (root) {
  'use strict';
  var ZIP = 'zip', FSX = 'fs', ZIP_COMMENT = 'iDempiere', HEX64 = /^[0-9a-f]{64}$/;
  var MAX_BYTES = 16 * 1024 * 1024;   // §ATT size cap of the DB method: the whole BinaryData (zip) may not exceed this. MEASURED (tests/witness_attach_cap_probe.txt): the kernel commit holds a 64 MB zip (heap ~15x the payload, 954 MB) and fails at 128 MB ("Invalid array length"); 16 MB keeps the transient heap near 250 MB, inside a phone tab's ~0.6 GB (CLAUDE.md PERF BUDGET)

  // ── GridTab.canHaveAttachment :2168: key column ends _ID/_UU, or the table has its <Table>_UU column among the tab's fields ──
  function keyColumn(tab) { var k = ''; (tab.fields || []).forEach(function (f) { if (f.isKey) k = f.columnName; }); return k; }
  function hasUuidField(tab) { var u = String(tab.tableName || '').toLowerCase() + '_uu'; return (tab.fields || []).some(function (f) { return String(f.columnName).toLowerCase() === u; }); }
  // case-insensitive: a model that carries its own dictionary names its key `<table>_uu` (lower case, as the physical column is), the ERP's dictionary `C_Order_UU`; legacy has one spelling, so the rule is the suffix, not the case
  function canHave(tab) { var k = keyColumn(tab); return !!tab && (/_ID$/i.test(k) || /_UU$/i.test(k) || hasUuidField(tab)); }
  function recVal(rec, col) { if (!rec) return ''; if (col in rec) return rec[col]; var lc = String(col).toLowerCase(); for (var k in rec) if (String(k).toLowerCase() === lc) return rec[k]; return ''; }
  // AbstractADWindowContent.onAttachment :1259-1278: Record_ID = the key value (-1/absent for a _UU key), Record_UU = the <Table>_UU column value; neither -> "No Key", null. A table keyed by its <Table>_UU
  // (MTable.isUUIDKeyTable, MTable.java:542-546) has no numeric id, so the key value IS the record's UU (MAttachment.get by Record_UU, MAttachment.java:98-111).
  function ctxFor(tab, rec) {
    var kc = keyColumn(tab), kv = recVal(rec, kc), uu = recVal(rec, String(tab.tableName) + '_UU');
    var rid = /_ID$/i.test(kc) && kv !== '' && kv != null ? Number(kv) : null, ruu = uu != null && uu !== '' ? String(uu) : (/_UU$/i.test(kc) && kv ? String(kv) : null);
    return (rid == null && !ruu) ? null : { tableId: tab.tableId, tableName: tab.tableName, recordId: rid, recordUU: ruu };
  }

  // ── zip (PKZIP) writer/reader over the browser's native deflate-raw; the layout AttachmentDBSystem.save writes ──
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function pipe(bytes, stream) { return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (a) { return new Uint8Array(a); }); }
  function dosTime(d) { return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
  function zipBuild(entries) {   // [{name, data:Uint8Array}] -> Promise<Uint8Array>
    var enc = new TextEncoder(), dt = dosTime(new Date()), parts = [], cds = [], off = 0;
    return entries.reduce(function (p, e) {
      return p.then(function () { return pipe(e.data, new CompressionStream('deflate-raw')); }).then(function (def) {
        var nm = enc.encode(e.name), crc = crc32(e.data), lh = new DataView(new ArrayBuffer(30)), flag = 0x0800;
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flag, true); lh.setUint16(8, 8, true); lh.setUint16(10, dt.t, true); lh.setUint16(12, dt.d, true);
        lh.setUint32(14, crc, true); lh.setUint32(18, def.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
        parts.push(new Uint8Array(lh.buffer), nm, def);
        var ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flag, true); ch.setUint16(10, 8, true); ch.setUint16(12, dt.t, true); ch.setUint16(14, dt.d, true);
        ch.setUint32(16, crc, true); ch.setUint32(20, def.length, true); ch.setUint32(24, e.data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
        cds.push(new Uint8Array(ch.buffer), nm);
        off += 30 + nm.length + def.length;
      });
    }, Promise.resolve()).then(function () {
      var cdLen = cds.reduce(function (s, x) { return s + x.length; }, 0), cm = enc.encode(ZIP_COMMENT), ed = new DataView(new ArrayBuffer(22));
      ed.setUint32(0, 0x06054b50, true); ed.setUint16(8, entries.length, true); ed.setUint16(10, entries.length, true); ed.setUint32(12, cdLen, true); ed.setUint32(16, off, true); ed.setUint16(20, cm.length, true);
      var all = parts.concat(cds, [new Uint8Array(ed.buffer), cm]), tot = all.reduce(function (s, x) { return s + x.length; }, 0), out = new Uint8Array(tot), o = 0;
      all.forEach(function (x) { out.set(x, o); o += x.length; }); return out;
    });
  }
  function zipParse(b) {   // Promise<[{name, data}]>; REJECTS on a damaged archive (never an empty list: a corrupted zip is refused, not shown as no files)
    var bad = function (why) { return Promise.reject(new Error('corrupt attachment zip: ' + why)); };
    if (!b || b.length < 22) return bad('too short');
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), e = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return bad('no end record');
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), list = [], dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return bad('central directory');
      var meth = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      var name = dec.decode(b.subarray(p + 46, p + 46 + nl));
      if (lo + 30 > b.length || dv.getUint32(lo, true) !== 0x04034b50) return bad('local header of ' + name);
      var ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      if (ds + cs > b.length) return bad('data of ' + name);
      list.push({ name: name, meth: meth, crc: crc, us: us, raw: b.subarray(ds, ds + cs) });
      p += 46 + nl + xl + cl;
    }
    return list.reduce(function (pr, it) {
      return pr.then(function (out) {
        var d = it.meth === 8 ? pipe(it.raw, new DecompressionStream('deflate-raw')) : it.meth === 0 ? Promise.resolve(it.raw) : Promise.reject(new Error('method ' + it.meth));
        return d.then(function (data) {
          if (data.length !== it.us || crc32(data) !== it.crc) throw new Error('corrupt attachment zip: crc/size of ' + it.name);
          out.push({ name: it.name, data: data }); return out;
        });
      });
    }, Promise.resolve([])).catch(function (er) { return bad(String(er && er.message || er).replace(/^corrupt attachment zip: /, '')); });
  }
  function b64(bytes) { var s = '', C = 0x8000; for (var i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C)); return btoa(s); }
  function unb64(s) { var bin = atob(s), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  function sha256(bytes) { return crypto.subtle.digest('SHA-256', bytes).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function bytesOf(v) { if (v == null || v === '') return new Uint8Array(0); if (v instanceof Uint8Array) return v; if (typeof v === 'string') return unb64(v); return new Uint8Array(v); }   // the seed holds a BLOB, a row written by the kernel holds base64 (the op-log is JSON)


  // ── phase 2: the shared browser file store, loaded lazily (nothing at open needs it) ──
  var _fsP = null;
  function fileStore() {
    if (root.FileStore) return Promise.resolve(root.FileStore);
    if (!_fsP) _fsP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../common/file_store.js?v=1';
      s.onload = function () { console.log('§ATT-STORE file_store.js loaded on first use'); res(root.FileStore); }; s.onerror = function () { _fsP = null; rej(new Error('the file store did not load')); }; document.head.appendChild(s); });
    return _fsP;
  }
  function entSize(e) { return e.size != null ? e.size : (e.data ? e.data.length : 0); }
  function bytes(e) {   // the entry's bytes: in memory (DB method / just added) or read back from the store, re-hashed (refused on absent or altered)
    if (e.data) return Promise.resolve(e.data);
    return fileStore().then(function (FS) { return FS.get(e.sha256, e.name); }).then(function (f) { return f.arrayBuffer(); }).then(function (a) { return new Uint8Array(a); });
  }
  function fsIndexEncode(entries) { return b64(new TextEncoder().encode(JSON.stringify({ v: 1, store: 'opfs:bim_files', entries: entries.map(function (e) { return { name: e.name, size: entSize(e), sha256: e.sha256 }; }) }))); }
  function fsIndexParse(binarydata) {   // throws on a damaged index (refused, never shown as empty)
    var j; try { j = JSON.parse(new TextDecoder().decode(bytesOf(binarydata))); } catch (e) { throw new Error('corrupt attachment index'); }
    if (!j || !Array.isArray(j.entries)) throw new Error('corrupt attachment index');
    return j.entries.map(function (x) { if (!x || typeof x.name !== 'string' || !HEX64.test(String(x.sha256)) || typeof x.size !== 'number') throw new Error('corrupt attachment index'); return { name: x.name, size: x.size, sha256: x.sha256, stored: true, data: null }; });
  }
  function packStore(entries) {   // every entry into the store (put hashes once, dedups); resolves the index; rejects {reason}
    return fileStore().then(function (FS) {
      return entries.reduce(function (p, e) {
        return p.then(function () {
          if (e.stored && e.sha256 && !e.data) return FS.has(e.sha256).then(function (h) { if (!h) { var er = new Error('store-missing'); er.reason = 'store-missing'; throw er; } });
          return FS.put(new Blob([e.data])).then(function (r) { e.sha256 = r.sha256; e.size = r.size; e.stored = true; });
        });
      }, Promise.resolve()).then(function () { return fsIndexEncode(entries); });
    }).catch(function (er) { var x = new Error(er && er.message); x.reason = er && er.reason || 'no-store'; throw x; });
  }
  function referencedShas(host) {   // every sha256 any 'fs' row points at; null = an index could not be read, so nothing may be swept
    var set = new Set(), ok = true;
    (host.rows("SELECT binarydata FROM ad_attachment WHERE title='" + FSX + "'") || []).forEach(function (r) { try { fsIndexParse(r.binarydata).forEach(function (e) { set.add(e.sha256); }); } catch (e) { ok = false; } });
    return ok ? set : null;
  }
  function sweepStore(host) {   // after a commit that touched an 'fs' row: remove bytes no row references any more (a hash another row uses stays)
    var refs = referencedShas(host);
    if (!refs) { console.log('§ATT-STORE sweep SKIPPED reason=unreadable-index'); return Promise.resolve(null); }
    return fileStore().then(function (FS) { return FS.sweep(refs).then(function (r) { console.log('§ATT-STORE sweep referenced=' + refs.size + ' entries=' + r.entries + ' kept=' + r.kept + ' removed=' + r.removed); return r; }); })
      .catch(function (er) { console.log('§ATT-STORE sweep SKIPPED reason=' + (er && er.message)); return null; });
  }

  // ── MAttachment lookup: getID(Table_ID, Record_ID, Record_UU) - by UU when the record has one, else by Record_ID ──
  function lookup(host, ctx) {
    var lit = function (v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
    var where = ctx.recordUU ? 'record_uu=' + lit(ctx.recordUU) : 'record_id=' + Number(ctx.recordId);
    return (host.rows('SELECT ad_attachment_id, title, binarydata, textmsg, record_uu FROM ad_attachment WHERE ad_table_id=' + Number(ctx.tableId) + ' AND ' + where + ' ORDER BY ad_attachment_id LIMIT 1') || [])[0] || null;
  }
  function hasAttachment(host, ctx) { return !!lookup(host, ctx); }   // GridTab.hasAttachment: getAD_AttachmentID() > 0
  function load(row) {   // AttachmentDBSystem.loadLOBData -> Promise<{entries, text}>
    if (!row) return Promise.resolve({ entries: [], text: '' });
    var data = bytesOf(row.binarydata), text = row.textmsg == null ? '' : String(row.textmsg);
    if (!data.length) return Promise.resolve({ entries: [], text: text });
    if (row.title === FSX) { try { return Promise.resolve({ entries: fsIndexParse(row.binarydata), text: text }); } catch (e) { return Promise.reject(e); } }   // phase 2: an index, the bytes stay in the store
    if (row.title !== ZIP) return Promise.resolve({ entries: [{ name: String(row.title), data: data, size: data.length }], text: text });   // old format - single file
    return zipParse(data).then(function (entries) { entries.forEach(function (e) { e.size = e.data.length; }); return { entries: entries, text: text }; });
  }
  // MAttachment.addEntry: a same-named entry is replaced in place, else appended
  function addEntry(entries, name, data) { for (var i = 0; i < entries.length; i++) if (entries[i].name === name) { entries[i] = { name: name, data: data, size: data.length }; return entries; } entries.push({ name: name, data: data, size: data.length }); return entries; }

  // ── save: create / update / delete the one ad_attachment row, as signed CRUD ops through the host (nothing else is written) ──
  //   Which store (phase 2): the DB zip (legacy AttachmentDBSystem) while the entries fit the cap; ABOVE it (raw total or the zip) the file store, all entries of the row, Title 'fs'.
  //   Why only above the cap and not always: everything the DB method can hold stays byte-comparable with a legacy row in the parallel run and readable as before; the store takes
  //   what the DB cannot. A row that is already 'fs' stays 'fs'. opts.store forces the store (the "Open in ..." action needs the bytes there).
  function save(host, ctx, row, entries, text, opts) {   // -> Promise<{ok, op, bytes, store, reason}>
    var empty = !entries.length && !text, wasFs = !!row && row.title === FSX;
    if (empty) {   // WAttachment OK: no text and no entries -> m_attachment.delete(true)
      if (!row) return Promise.resolve({ ok: true, op: 'none', bytes: 0 });
      return host.commit([{ key: 'ad_attachment', table: 'ad_attachment', verb: 'delete', op_type: 'CRUD_DELETE', op_uuid: null, id: row.ad_attachment_id, tombstone: true, reversible: true }])
        .then(function (ok) { return (ok && wasFs ? sweepStore(host) : Promise.resolve()).then(function () { return { ok: ok, op: 'delete', bytes: 0, store: wasFs }; }); });
    }
    var raw = entries.reduce(function (s, e) { return s + entSize(e); }, 0);
    var wantStore = !!(opts && opts.store) || wasFs || raw > MAX_BYTES || entries.some(function (e) { return e.stored; });
    var plan = wantStore || !entries.length ? Promise.resolve({ zip: null, idx: null }) : zipBuild(entries).then(function (zip) { return { zip: zip, idx: null }; });
    return plan.then(function (pl) {
      if (entries.length && (wantStore || pl.zip.length > MAX_BYTES)) return packStore(entries).then(function (idx) { return { zip: null, idx: idx }; });
      return pl;
    }).then(function (pl) {
      var toStore = !!pl.idx, bin = toStore ? pl.idx : (pl.zip ? b64(pl.zip) : null), title = toStore ? FSX : (pl.zip ? ZIP : 'None'), op;
      if (row) {
        op = { key: 'ad_attachment', table: 'ad_attachment', verb: 'update', op_type: 'CRUD_UPDATE', op_uuid: null, id: row.ad_attachment_id,
          changes: { title: { old: row.title, new: title }, binarydata: { old: null, new: bin }, textmsg: { old: row.textmsg == null ? null : row.textmsg, new: text || null } } };
        if (host.std && host.std.actor != null) op.actor = host.std.actor;
      } else {
        var f = { ad_table_id: Number(ctx.tableId), record_id: Number(ctx.recordId), title: title, binarydata: bin, textmsg: text || null, isactive: 'Y' };
        if (ctx.recordUU) f.record_uu = ctx.recordUU;
        op = { key: 'ad_attachment', table: 'ad_attachment', verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: f };
        if (host.std) op.stdDefaults = host.std;
      }
      var nbytes = toStore ? raw : (pl.zip ? pl.zip.length : 0);
      return host.commit([op]).then(function (ok) { return ((ok && (toStore || wasFs)) ? sweepStore(host) : Promise.resolve()).then(function () { return { ok: ok, op: row ? 'update' : 'create', bytes: nbytes, store: toStore }; }); });
    }).catch(function (er) { console.log('§ATT-STORE refused reason=' + (er && er.reason || er && er.message)); return { ok: false, op: 'refused', bytes: raw, reason: (er && er.reason) || 'no-store' }; });
  }
  // promote - the entry named `name` into the file store (the row becomes 'fs' if it was a DB zip) -> Promise<{ok, name, size, sha256, promoted}>; the "Open in ..." action uses this
  function promote(host, ctx, name) {
    var row = lookup(host, ctx); if (!row) return Promise.resolve({ ok: false, reason: 'no-attachment' });
    return load(row).then(function (st) {
      var e = st.entries.filter(function (x) { return x.name === name; })[0]; if (!e) return { ok: false, reason: 'no-entry' };
      if (e.stored) return { ok: true, name: e.name, size: e.size, sha256: e.sha256, promoted: false };
      return save(host, ctx, row, st.entries, st.text || '', { store: true }).then(function (r) {
        if (!r.ok) return { ok: false, reason: r.reason || 'not-saved' };
        console.log('§ATT-STORE promote name=' + e.name + ' size=' + e.size + ' sha256=' + e.sha256); return { ok: true, name: e.name, size: e.size, sha256: e.sha256, promoted: true };
      });
    }, function (er) { return { ok: false, reason: 'corrupt', detail: er && er.message }; });
  }

  // ── WAttachment look and feel ──
  var CSS = '#att-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:99990;display:flex;align-items:center;justify-content:center}' +
    '#att-win{background:#fff;border:1px solid #888;box-shadow:0 4px 18px rgba(0,0,0,.4);width:min(720px,94vw);height:min(560px,88vh);display:flex;flex-direction:column;font:13px sans-serif;color:#222}' +
    '#att-win .att-t{display:flex;justify-content:space-between;padding:6px 10px;background:#e8eef5;border-bottom:1px solid #b9c4d0;font-weight:600}' +
    '#att-win .att-bar{display:flex;gap:6px;align-items:center;padding:6px 10px}#att-win .att-bar button,#att-win .att-foot button{border:1px solid #bbb;background:#f6f6f6;border-radius:3px;padding:2px 6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}' +
    '#att-win button:disabled{opacity:.4;cursor:default}#att-win img.ic{width:20px;height:20px}#att-win textarea{margin:0 10px;height:54px;resize:none}' +
    '#att-win .att-pv{flex:1;margin:8px 10px;border:1px solid #ccc;overflow:auto;display:flex;align-items:center;justify-content:center;background:#fafafa}#att-win .att-pv img{max-width:100%;max-height:100%}#att-win .att-pv pre{align-self:flex-start;margin:6px;white-space:pre-wrap}' +
    '#att-win .att-foot{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #ddd;align-items:center}#att-win .att-sp{flex:1}#att-win .att-err{color:#b00;padding:0 10px;min-height:16px}' +
    '#att-ask{position:absolute;inset:0;background:rgba(255,255,255,.85);display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px}';
  var IMG = 'theme/default/images/';
  function el(tag, props, kids) { var e = document.createElement(tag); for (var k in (props || {})) { if (k === 'text') e.textContent = props[k]; else if (k === 'class') e.className = props[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); } (kids || []).forEach(function (c) { e.appendChild(c); }); return e; }
  function sizeLabel(n) { var kb = n / 1024, u = ' KB'; if (kb >= 1024) { kb /= 1024; u = ' MB'; } return (Math.round(kb * 100) / 100).toFixed(2) + u; }   // WAttachment.autoPreview :498-517: KB or MB, 2 decimals
  function mimeOf(n) { var x = (String(n).split('.').pop() || '').toLowerCase(); return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/plain', json: 'text/plain', xml: 'text/plain', md: 'text/plain' }[x] || 'application/octet-stream'; }
  function download(name, bytes) { var u = URL.createObjectURL(new Blob([bytes])), a = el('a', { href: u, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

  // open - AbstractADWindowContent.onAttachment: ctx {tableId, tableName, recordId, recordUU}; resolves {has, changed} when the dialog closes.
  function open(host, ctx) {
    if (ctx.recordId == null && !ctx.recordUU) return Promise.resolve({ has: false, changed: false });   // "No Key" -> return
    var T = function (v, en) { return host.msg ? host.msg(v, en) : en; };
    return new Promise(function (done) {
      var row = lookup(host, ctx);
      load(row).then(function (st) {
        var entries = st.entries, changed = false, sel = 0, pvUrl = null;
        console.log('§ATT open table=' + ctx.tableId + ' record=' + (ctx.recordUU || ctx.recordId) + ' attachment=' + (row ? row.ad_attachment_id : 0) + ' entries=' + entries.length);
        if (!document.getElementById('att-css')) document.head.appendChild(el('style', { id: 'att-css', text: CSS }));
        var cb = el('select', { 'data-att': 'entries' }), lbl = el('span', { 'data-att': 'size' }), txt = el('textarea', { 'data-att': 'text', title: T('TextMsg', 'Text Message') }), pv = el('div', { class: 'att-pv', 'data-att': 'preview' }), err = el('div', { class: 'att-err', 'data-att': 'error' });
        var file = el('input', { type: 'file', multiple: 'multiple', style: 'display:none', 'data-att': 'file' });
        var ask = el('div', { id: 'att-ask' });
        function ibtn(a, ic, tip, fn) { var b = el('button', { 'data-att': a, title: tip, onclick: fn }, [el('img', { class: 'ic', src: IMG + ic, alt: '' })]); return b; }
        var bLoad = ibtn('load', 'Import24.png', T('Load', 'Load Attachment'), function () { file.click(); });
        var bDel = ibtn('delete', 'Delete24.png', T('Delete', 'Delete'), function () { confirm_(T('AttachmentDeleteEntry?', 'Delete this attachment entry?'), function () {
          var n = entries[sel] && entries[sel].name; if (n == null) return; entries.splice(sel, 1); sel = 0; changed = true;
          commit_(function () { console.log('§ATT delete-entry name=' + n + ' left=' + entries.length); fill(); }); }); });
        var bSave = ibtn('export', 'Export24.png', T('AttachmentSave', 'Save Attachment'), function () { var e = entries[sel]; if (e) bytes(e).then(function (d) { download(e.name, d); }, function (er) { storeErr_(er); }); });
        var bZip = ibtn('zip', 'SaveAsZip24.png', T('ExportZIP', 'Export ZIP'), function () { Promise.all(entries.map(function (e) { return bytes(e).then(function (d) { return { name: e.name, data: d }; }); })).then(zipBuild).then(function (z) { download((ctx.tableName || 'attachment') + '_' + (ctx.recordUU || ctx.recordId) + '.zip', z); }, function (er) { storeErr_(er); }); });
        var bAll = ibtn('deleteall', 'Delete24.png', T('DeleteAll', 'Delete All'), function () { confirm_(T('AttachmentDelete?', 'Delete the entire attachment?'), function () {
          entries.length = 0; txt.value = ''; save(host, ctx, lookup(host, ctx), [], '').then(function (r) { console.log('§ATT delete-all ok=' + r.ok + ' op=' + r.op); close_(); }); }); });
        var bPv = ibtn('preview', 'Find24.png', T('Preview', 'Preview'), function () { preview(true); });
        var bOk = el('button', { 'data-att': 'ok', onclick: function () {
          var dirty = changed || txt.value !== (st.text || '');
          if (!dirty) return close_();
          save(host, ctx, lookup(host, ctx), entries, txt.value).then(function (r) { if (!r.ok) return msg_(r); console.log('§ATT save op=' + r.op + ' entries=' + entries.length + ' bytes=' + r.bytes + ' ok=' + r.ok + ' store=' + (r.store ? 1 : 0)); changed = false; close_(); });
        } }, [el('img', { class: 'ic', src: IMG + 'Ok24.png', alt: '' })]);
        var bCancel = el('button', { 'data-att': 'cancel', onclick: function () { close_(); } }, [el('img', { class: 'ic', src: IMG + 'Cancel24.png', alt: '' })]);
        var win = el('div', { id: 'att-win', style: 'position:relative' }, [
          el('div', { class: 'att-t' }, [el('span', { text: T('Attachment', 'Attachment') }), el('span', { text: '✕', style: 'cursor:pointer', onclick: function () { close_(); } })]),
          el('div', { class: 'att-bar' }, [bLoad, bDel, bSave, bZip, cb, lbl]), txt, pv, err,
          el('div', { class: 'att-foot' }, [bAll, bPv, el('span', { class: 'att-sp' }), bOk, bCancel]), file, ask]);
        var ov = el('div', { id: 'att-ov', 'data-att': 'dialog' }, [win]); document.body.appendChild(ov); txt.value = st.text || '';
        function msg_(r) { err.textContent = r.reason === 'too-big' ? T('AttachmentTooBig', 'Too big for the database store: ' + sizeLabel(r.bytes) + ' against a limit of ' + sizeLabel(MAX_BYTES) + '.') : (r.reason === 'no-store' || r.reason === 'store-missing') ? T('AttachmentNoStore', 'Too big for the database store (' + sizeLabel(r.bytes) + ', limit ' + sizeLabel(MAX_BYTES) + ') and the browser file store is not available.') : 'Not saved'; console.log('§ATT refused reason=' + r.reason + ' bytes=' + r.bytes + ' cap=' + MAX_BYTES); }
        function storeErr_(er) { err.textContent = T('AttachmentStoreRefused', 'This file cannot be read from the file store: ' + (er && (er.refused || er.message))); console.log('§ATT refused reason=store-read detail=' + (er && (er.refused || er.message))); }
        function confirm_(q, yes) { ask.style.display = 'flex'; ask.innerHTML = ''; ask.appendChild(el('div', { text: q })); ask.appendChild(el('div', {}, [
          el('button', { 'data-att': 'yes', text: T('Yes', 'Yes'), onclick: function () { ask.style.display = 'none'; yes(); } }), el('button', { 'data-att': 'no', text: T('No', 'No'), onclick: function () { ask.style.display = 'none'; } })])); }
        function commit_(after) { save(host, ctx, lookup(host, ctx), entries, txt.value).then(function (r) { if (!r.ok) msg_(r); else after(); }); }   // an entry delete saves at once (WAttachment.deleteAttachmentEntry)
        function fill() { cb.innerHTML = ''; entries.forEach(function (e, i) { cb.appendChild(el('option', { value: i, text: e.name })); }); if (entries.length) cb.value = String(sel); cur(); preview(false); }
        function cur() { var e = entries[sel]; lbl.textContent = e ? sizeLabel(entSize(e)) : ''; bDel.disabled = bSave.disabled = bPv.disabled = !e; bZip.disabled = !entries.length; }
        function preview(force) {
          if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } pv.innerHTML = ''; var e = entries[sel]; if (!e) return; var m = mimeOf(e.name), show = function (d) {
            if (entries[sel] !== e) return;   // the selection moved while the store was read
            if (/^image\//.test(m)) { pvUrl = URL.createObjectURL(new Blob([d], { type: m })); pv.appendChild(el('img', { src: pvUrl, alt: e.name })); }
            else if (m === 'text/plain') pv.appendChild(el('pre', { text: new TextDecoder().decode(d.subarray(0, 20000)) })); };
          if (/^image\//.test(m) || m === 'text/plain') { if (e.data || entSize(e) <= 8 * 1024 * 1024) bytes(e).then(show, storeErr_); else pv.appendChild(el('div', { text: T('NoPreview', 'No preview for this file type') })); }
          else if (force) pv.appendChild(el('div', { text: T('NoPreview', 'No preview for this file type') }));
        }
        function close_() { if (pvUrl) URL.revokeObjectURL(pvUrl); ov.remove(); var has = hasAttachment(host, ctx); console.log('§ATT close has=' + has); done({ has: has, changed: changed }); }
        cb.addEventListener('change', function () { sel = Number(cb.value) || 0; cur(); preview(false); });
        file.addEventListener('change', function () {
          var fs = Array.prototype.slice.call(file.files || []); err.textContent = '';
          fs.reduce(function (p, f) { return p.then(function () { return f.arrayBuffer().then(function (ab) { var d = new Uint8Array(ab); if (!d.length) return; addEntry(entries, f.name, d); changed = true; console.log('§ATT add name=' + f.name + ' bytes=' + d.length); return sha256(d).then(function (h) { console.log('§ATT hash name=' + f.name + ' sha256=' + h); }); }); }); }, Promise.resolve())
            .then(function () { file.value = ''; if (entries.length) sel = entries.length - 1; fill(); });   // no save yet: OK saves (WAttachment m_change), a zero-length file is skipped (processUploadMedia :794)
        });
        fill();
      }).catch(function (er) {
        console.log('§ATT refused reason=corrupt detail=' + (er && er.message));   // a damaged zip is refused, never shown as an empty attachment
        var m = el('div', { id: 'att-ov', 'data-att': 'dialog' }, [el('div', { id: 'att-win', style: 'height:auto;padding:14px' }, [el('div', { 'data-att': 'error', class: 'att-err', text: T('AttachmentCorrupt', 'This attachment cannot be read (damaged archive).') }), el('button', { 'data-att': 'cancel', text: 'OK', onclick: function () { m.remove(); done({ has: !!row, changed: false, refused: true }); } })])]);
        if (!document.getElementById('att-css')) document.head.appendChild(el('style', { id: 'att-css', text: CSS })); document.body.appendChild(m);
      });
    });
  }

  var api = { canHave: canHave, ctxFor: ctxFor, keyColumn: keyColumn, lookup: lookup, hasAttachment: hasAttachment, load: load, save: save, promote: promote, sweep: sweepStore, bytes: bytes, entSize: entSize, referencedShas: referencedShas, addEntry: addEntry, open: open,
    zipBuild: zipBuild, zipParse: zipParse, crc32: crc32, b64: b64, unb64: unb64, sha256: sha256, MAX_BYTES: MAX_BYTES, ZIP: ZIP, FS: FSX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AdAttachment = api;
})(typeof window !== 'undefined' ? window : globalThis);
