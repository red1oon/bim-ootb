// QR code for a share link (Level 1m, CF10): draws the link with the vendored qrcode-generator (MIT, vendor/qrcode-generator.js) when it fits; says so when it does not.
// Capacity: a version-40 QR code at error correction L holds 2,953 bytes in byte mode (ISO/IEC 18004); the link is checked against that number, not guessed.
(function (root) {
  const node = typeof require !== 'undefined', QR = node ? require('./vendor/qrcode-generator.js') : root.qrcode, MAX_BYTES = 2953;
  function encode(text) {
    const bytes = text.length; if (!/^[\x00-\xff]*$/.test(text)) return { ok: false, bytes, reason: 'needs-ascii' }; if (bytes > MAX_BYTES) return { ok: false, bytes, reason: 'too-long' };
    try { const q = QR(0, 'L'); q.addData(text, 'Byte'); q.make(); return { ok: true, bytes, q, n: q.getModuleCount() }; } catch (e) { return { ok: false, bytes, reason: 'too-long' }; }
  }
  // draw into a <canvas>: scale px per module and a 4-module quiet zone (the QR standard's), black on white
  function draw(canvas, enc, scale) { const s = scale || 6, n = enc.n, size = (n + 8) * s; canvas.width = canvas.height = size; const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000'; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (enc.q.isDark(r, c)) g.fillRect((c + 4) * s, (r + 4) * s, s, s); return size; }
  const api = { encode, draw, MAX_BYTES };
  if (node) module.exports = api; else root.QrView = api;
})(this);
