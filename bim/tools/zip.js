// zip.js — minimal ZIP writer (STORE, no compression), deterministic, with Unix mode bits (so launchers keep their executable bit). No deps.
// Used by the page (Blob download) and by bim-cli.js (kit command). Spec: prompts/BIM_UTILITY_KNIFE.md §Installers / ZIP security notes.
(function (g) {
  'use strict';
  let CT = null;
  function crc32(b) {
    if (!CT) { CT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CT[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8'));
  // entries: [{name, data:Uint8Array, exec?:bool}] -> Uint8Array. Fixed timestamp 2026-01-01 00:00 so identical input => identical zip bytes.
  function build(entries) {
    const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const parts = [], central = []; let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const e of entries) {
      const name = enc(e.name), crc = crc32(e.data), sz = e.data.length;
      const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0)]);
      parts.push(lh, name, e.data);
      const mode = (e.exec ? 0o100755 : 0o100644) >>> 0;
      central.push({ hdr: new Uint8Array([...u32(0x02014b50), ...u16((3 << 8) | 20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(((mode << 16) >>> 0)), ...u32(off)]), name });
      off += lh.length + name.length + sz;
    }
    let csize = 0; for (const c of central) { parts.push(c.hdr, c.name); csize += c.hdr.length + c.name.length; }
    parts.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(csize), ...u32(off), ...u16(0)]));
    let tot = 0; for (const p of parts) tot += p.length; const out = new Uint8Array(tot); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  const api = { build, crc32 };
  g.BIM_ZIP = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
