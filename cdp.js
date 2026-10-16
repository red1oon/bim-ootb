// Minimal Chrome DevTools Protocol client — no npm deps (this box has no registry access and
// Node 18 has no global WebSocket). Enough to: open a page, capture console, evaluate JS.
var net = require('net'), http = require('http'), crypto = require('crypto');

function httpJson(port, path) {
  return new Promise(function (res, rej) {
    http.get({ host: '127.0.0.1', port: port, path: path }, function (r) {
      var b = ''; r.on('data', function (d) { b += d; }); r.on('end', function () {
        try { res(JSON.parse(b)); } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}

function connect(wsUrl) {
  var u = new URL(wsUrl);
  return new Promise(function (resolve, reject) {
    var key = crypto.randomBytes(16).toString('base64');
    var sock = net.connect(parseInt(u.port, 10), u.hostname, function () {
      sock.write('GET ' + u.pathname + u.search + ' HTTP/1.1\r\n' +
        'Host: ' + u.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    var buf = Buffer.alloc(0), upgraded = false, id = 0, pending = {}, listeners = [];
    sock.on('error', reject);
    sock.on('data', function (d) {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        var i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        upgraded = true; buf = buf.slice(i + 4);
        resolve(api);
      }
      // decode server frames (unmasked)
      for (;;) {
        if (buf.length < 2) return;
        var op = buf[0] & 0x0f, len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        var payload = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (op === 0x8) { sock.end(); return; }
        if (op !== 0x1) continue;
        var msg; try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
        if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
        else listeners.forEach(function (fn) { fn(msg); });
      }
    });
    function frame(str) {
      var p = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4), head;
      if (p.length < 126) { head = Buffer.from([0x81, 0x80 | p.length]); }
      else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(p.length, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(p.length), 2); }
      var out = Buffer.alloc(p.length);
      for (var i = 0; i < p.length; i++) out[i] = p[i] ^ mask[i % 4];
      sock.write(Buffer.concat([head, mask, out]));
    }
    var api = {
      send: function (method, params) {
        return new Promise(function (ok) {
          var mid = ++id;
          pending[mid] = ok;
          frame(JSON.stringify({ id: mid, method: method, params: params || {} }));
        });
      },
      on: function (fn) { listeners.push(fn); },
      close: function () { try { sock.end(); } catch (e) {} }
    };
  });
}

module.exports = { httpJson: httpJson, connect: connect };
