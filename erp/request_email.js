// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// request_email.js - the email -> Request intake (bim-compiler prompts/SQLiteIDEMPIERE.md §EMAIL-REQ-R3 SPEC; Witness: W-EMAILREQ erp/tests/witness_request_email.js).
//   Port of legacy RequestEMailProcessor (org.adempiere.base.process/src/org/compiere/process/RequestEMailProcessor.java) over EmailSrv (org.adempiere.base/src/org/compiere/util/EmailSrv.java),
//   WITHOUT the IMAP part (R4, not built): one raw RFC 822 message in, a plan out.
//   parseEmail(raw)                    -> EmailContent  (EmailSrv.processMessage :418-452 + analysisEmailStructure :477-541), plain JS MIME, no dependency
//   parseEmailToRequestOps(raw, ctx)   -> plan          (createRequest :279-488 / updateRequest :490-498 decisions; READS only, writes nothing)
//   applyRequestOps(kernel, session, plan) -> Promise   (one Trx through ModelLayer.save: R_Request (+ R_RequestUpdate by the registered rules) + AD_Attachment)
//   Witness-level only: no oracle run against legacy this round (owner 2026-11-26). Nothing here claims parity.
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  function dep(g, p) { if (NODE) return require(p); return root[g]; }

  // ── bytes / text ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function binStr(raw) {   // the message as a binary string (one char per byte), so base64 / 8bit parts keep their bytes
    if (typeof raw === 'string') return raw;
    var b = raw instanceof Uint8Array ? raw : new Uint8Array(raw), s = '', C = 0x8000;
    for (var i = 0; i < b.length; i += C) s += String.fromCharCode.apply(null, b.subarray(i, i + C));
    return s;
  }
  function strBytes(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }
  function decodeB64(s) { s = String(s).replace(/[^A-Za-z0-9+/=]/g, ''); if (NODE) return new Uint8Array(Buffer.from(s, 'base64')); return strBytes(atob(s)); }
  function decodeQP(s) {
    s = String(s).replace(/=\r?\n/g, ''); var out = [];
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i);
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; } else out.push(s.charCodeAt(i) & 255); }
    return new Uint8Array(out);
  }
  function decodeText(bytes, charset) {
    var cs = String(charset || 'us-ascii').toLowerCase().replace(/^"|"$/g, ''); if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
    try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }
  function b64(bytes) { if (NODE) return Buffer.from(bytes).toString('base64'); return btoa(binStr(bytes)); }

  // RFC 2047 encoded words (javax MimeUtility.decodeText, as Message.getSubject returns it); whitespace between two encoded words is dropped
  function decodeWords(s) {
    if (s == null) return s;
    return String(s).replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?[^?]+\?[bBqQ]\?[^?]*\?=)/g, '$1').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function (m, cs, enc, txt) {
      var by = /b/i.test(enc) ? decodeB64(txt) : decodeQP(txt.replace(/_/g, ' '));
      return decodeText(by, cs.replace(/\*.*$/, ''));
    });
  }

  // ── headers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function splitHeadBody(s) {
    var m = /\r?\n\r?\n/.exec(s);
    if (!m) return { head: s, body: '' };
    return { head: s.slice(0, m.index), body: s.slice(m.index + m[0].length) };
  }
  function parseHeaders(head) {   // unfolded, in order; names lower-cased
    var out = [];
    head.split(/\r?\n/).forEach(function (ln) {
      if (/^[ \t]/.test(ln) && out.length) out[out.length - 1].value += ' ' + ln.replace(/^[ \t]+/, '');
      else { var i = ln.indexOf(':'); if (i > 0) out.push({ name: ln.slice(0, i).trim().toLowerCase(), value: ln.slice(i + 1).trim() }); }
    });
    return out;
  }
  function hdr(hs, n) { for (var i = 0; i < hs.length; i++) if (hs[i].name === n) return hs[i].value; return null; }
  function hdrAll(hs, n) { return hs.filter(function (h) { return h.name === n; }).map(function (h) { return h.value; }); }
  // "type/sub; a=b; c*=utf-8''x%20y" -> { value, params } (RFC 2045 + RFC 2231 continuations/charset)
  function parseParams(v) {
    var parts = [], cur = '', q = false;
    String(v || '').split('').forEach(function (c) { if (c === '"') q = !q; if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c; });
    parts.push(cur);
    var value = parts.shift().trim().toLowerCase(), params = {}, ext = {};
    parts.forEach(function (p) {
      var i = p.indexOf('='); if (i < 0) return;
      var k = p.slice(0, i).trim().toLowerCase(), val = p.slice(i + 1).trim();
      if (/^".*"$/.test(val)) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
      var m = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
      if (m) { (ext[m[1]] = ext[m[1]] || []).push({ n: Number(m[2] || 0), enc: !!m[3] || (!m[2] && /\*$/.test(k)), v: val }); }
      else params[k] = val;
    });
    Object.keys(ext).forEach(function (k) {
      var segs = ext[k].sort(function (a, b) { return a.n - b.n; }), cs = 'utf-8', s = '';
      segs.forEach(function (sg, i) {
        var v = sg.v;
        if (sg.enc) { if (i === 0) { var mm = /^([^']*)'[^']*'(.*)$/.exec(v); if (mm) { cs = mm[1] || cs; v = mm[2]; } } s += binStr(decodeQP(v.replace(/%([0-9A-Fa-f]{2})/g, '=$1'))); }
        else s += v;
      });
      params[k] = decodeText(strBytes(s), cs);
    });
    return { value: value, params: params };
  }
  // javax InternetAddress.parse + toString (the string RequestEMailProcessor uses): 'phrase <addr>' when a personal name is present (quoted if it holds specials), else the address
  function splitAddrList(v) {
    var out = [], cur = '', q = false, a = 0;
    String(v || '').split('').forEach(function (c) { if (c === '"') q = !q; else if (!q && c === '<') a++; else if (!q && c === '>') a--; if (c === ',' && !q && a <= 0) { out.push(cur); cur = ''; } else cur += c; });
    out.push(cur); return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function quotePhrase(p) { return /[()<>@,;:\\".[\]\x00-\x1f\x7f-\uffff]/.test(p) ? '"' + p.replace(/(["\\])/g, '\\$1') + '"' : p; }
  function addrToString(a) {
    var m = /^(.*?)<([^>]*)>\s*$/.exec(a), personal = null, addr;
    if (m) { addr = m[2].trim(); personal = m[1].trim(); if (/^".*"$/.test(personal)) personal = personal.slice(1, -1).replace(/\\(.)/g, '$1'); if (!personal) personal = null; }
    else { addr = a.replace(/\(.*?\)/g, '').trim(); var cm = /\((.*)\)/.exec(a); if (cm && cm[1].trim()) personal = cm[1].trim(); }
    return personal != null ? quotePhrase(personal) + ' <' + addr + '>' : addr;
  }

  // ── MIME tree ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function parsePart(s) {
    var hb = splitHeadBody(s), hs = parseHeaders(hb.head), ct = parseParams(hdr(hs, 'content-type') || 'text/plain; charset=us-ascii');
    var cd = hdr(hs, 'content-disposition'), disp = cd ? parseParams(cd) : null;
    var part = { headers: hs, type: ct.value || 'text/plain', params: ct.params, disposition: disp ? disp.value : null, dispParams: disp ? disp.params : {},
      cte: String(hdr(hs, 'content-transfer-encoding') || '7bit').trim().toLowerCase(), raw: hb.body, parts: null };
    if (/^multipart\//.test(part.type) && part.params.boundary) {
      var bd = '--' + part.params.boundary, lines = hb.body.split(/\r?\n/), cur = null, kids = [];
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (ln === bd + '--' || ln.replace(/\s+$/, '') === bd + '--') { if (cur) kids.push(cur.join('\r\n')); cur = null; break; }
        if (ln === bd || ln.replace(/\s+$/, '') === bd) { if (cur) kids.push(cur.join('\r\n')); cur = []; continue; }
        if (cur) cur.push(ln);
      }
      if (cur) kids.push(cur.join('\r\n'));
      part.parts = kids.map(parsePart);
    }
    return part;
  }
  function partBytes(p) { if (p.cte === 'base64') return decodeB64(p.raw); if (p.cte === 'quoted-printable') return decodeQP(p.raw); return strBytes(p.raw); }
  function partText(p) { return decodeText(partBytes(p), p.params.charset); }
  function isType(p, pat) { var a = pat.split('/'), b = p.type.split('/'); return a[0] === b[0] && (a[1] === '*' || a[1] === b[1]); }
  // BodyPart.getFileName: Content-Disposition filename, else Content-Type name (RFC 2231 decoded; RFC 2047 in a filename stays as sent - mail.mime.decodefilename defaults false)
  function fileName(p) { var n = p.dispParams.filename != null ? p.dispParams.filename : p.params.name; return n == null ? null : n; }
  // EmailSrv.getContentID :805-850: Content-Id without <>, else X-Attachment-Id
  function contentId(p) { var c = hdr(p.headers, 'content-id'); if (c != null && c.trim()) { c = c.trim(); if (/^<.*>$/.test(c)) c = c.slice(1, -1); return c; } var x = hdr(p.headers, 'x-attachment-id'); return x != null && x.trim() ? x.trim() : null; }

  // EmailSrv.analysisEmailStructure :477-541
  function analyse(p, ec, isRoot) {
    var unknown = false;
    if (isType(p, 'text/*')) {
      if (p.disposition === 'attachment') { if (!isRoot) ec.attach.push(p); else ec.log.push('§EMAILREQ-PART root text part is an attachment: dropped (not a BodyPart, :487-491)'); return; }
      if (p.type === 'text/html') ec.html += partText(p); else ec.text += partText(p);
    } else if (p.type === 'message/rfc822') ec.text += p.raw;   // :500-504 msg.getContent() appended (TODO in legacy)
    else if (/^multipart\//.test(p.type)) (p.parts || []).forEach(function (k) { analyse(k, ec, false); });
    else if (isType(p, 'application/*') || isType(p, 'image/*')) {   // isBinaryPart :792-794
      if (isRoot) { ec.log.push('§EMAILREQ-PART root binary part dropped (not a BodyPart, :533-535)'); }
      else if (p.disposition == null || p.disposition === 'inline') ec.embed.push(p);
      else if (p.disposition === 'attachment') ec.attach.push(p);
      else unknown = true;
    } else unknown = true;
    if (unknown) { ec.unknown.push(p); ec.log.push('§EMAILREQ-PART unknown part type=' + p.type + ' name=' + fileName(p) + ' - dropped as legacy does ("this content will miss", :538-541)'); }
  }
  // EmailSrv.processMessage :418-452 -> EmailContent
  function parseEmail(raw) {
    var root0 = parsePart(binStr(raw)), hs = root0.headers, ec = { fromAddress: [], messageID: null, subject: null, sentMs: null, text: '', html: '', attach: [], embed: [], unknown: [], log: [] };
    hdrAll(hs, 'from').forEach(function (v) { splitAddrList(decodeWords(v)).forEach(function (a) { var s = addrToString(a); if (s) ec.fromAddress.push(s); }); });
    var mid = hdr(hs, 'message-id'); if (mid != null) ec.messageID = mid;
    var sub = hdr(hs, 'subject'); ec.subject = sub == null ? null : decodeWords(sub);
    var dt = hdr(hs, 'date'); if (dt != null) { var ms = Date.parse(dt.replace(/\s*\([^)]*\)\s*$/, '')); ec.sentMs = isNaN(ms) ? null : ms; }
    ec._root = root0;
    return ec;
  }
  function analyseBody(ec) { analyse(ec._root, ec, true); return ec; }
  // EmailContent.getHtmlContent(true) via embedImgToEmail :668-735, and getHTMLImageBodyParts via getEmbededImages :747-780
  var EMBED_RX = /\s+src\s*=\s*(?:3D)?\s*"cid:(.*?)"/g;
  function embedFor(ec, id) { for (var i = 0; i < ec.embed.length; i++) { var c = contentId(ec.embed[i]); if (c != null && String(c).toLowerCase() === String(id).toLowerCase()) return ec.embed[i]; } return null; }
  function htmlWithImages(ec) {
    if (!ec.html) return null;
    return ec.html.replace(EMBED_RX, function (m, id) {
      var p = embedFor(ec, id.trim()); if (!p) { ec.log.push('§EMAILREQ-CID missing image id=' + id + ' (legacy keeps the tag without src, :720-726)'); return ''; }
      return ' alt="inline_image_' + id.trim() + '" src="data:image/jpeg;base64,' + b64(partBytes(p)) + '"';
    });
  }
  function htmlImageParts(ec) { var out = []; if (!ec.html) return out; var m, rx = new RegExp(EMBED_RX.source, 'g'); while ((m = rx.exec(ec.html))) { var p = embedFor(ec, m[1].trim()); if (p) out.push(p); } return out; }

  // ── Postgres LIKE (case-sensitive, % _ wildcards, \ escape) - the reply match runs on legacy's database ──
  function pgLike(s, pat) {
    if (s == null || pat == null) return false;
    var rx = '^', p = String(pat);
    for (var i = 0; i < p.length; i++) { var c = p.charAt(i);
      if (c === '\\' && i + 1 < p.length) { rx += p.charAt(++i).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
      else if (c === '%') rx += '[\\s\\S]*'; else if (c === '_') rx += '[\\s\\S]'; else rx += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
    return new RegExp(rx + '$').test(String(s));
  }
  function pgSubstr(s, from) { return from <= 1 ? s : s.slice(from - 1); }   // SUBSTR(s, n) with no length: n <= 1 -> the whole string
  function jstr(v) { return v == null ? 'null' : String(v); }                  // StringBuilder.append((String) null) -> "null"

  // ── the plan: RequestEMailProcessor.createRequest :279-488 / updateRequest :490-498 ─────────────────────────────────────────────
  // ctx: { q(sql, params) -> rows (lower-case keys), clientId, stamp(ms) -> 'YYYY-MM-DD HH:MM:SS', idSet(v), params: { R_RequestType_ID, SalesRep_ID, AD_Role_ID, AD_User_ID, C_BPartner_ID,
  //        p_DefaultPriority, p_DefaultConfidentiality, HTMLAttachmentType }, mutant: { noDedupe } (witness only) }
  function parseEmailToRequestOps(raw, ctx) {
    var P = ctx.params || {}, q = ctx.q, client = ctx.clientId, idSet = ctx.idSet || function (v) { return (Number(v) || 0) !== 0; }, log = [];
    var ec = parseEmail(raw), plan = { route: null, reason: null, from: ec.fromAddress[0] || null, subject: ec.subject, messageID: ec.messageID, log: log, entries: [] };
    function done(route, reason) { plan.route = route; plan.reason = reason; log.push('§EMAILREQ-PLAN route=' + route + ' reason=' + reason + ' from=' + plan.from + ' subject=' + JSON.stringify(ec.subject) + ' docno=' + plan.documentNo); return plan; }
    if (!ec.fromAddress.length) return done('error', 'no From address (checkEmailHeader :221-229 -> Error folder, not deleted from the Inbox)');
    analyseBody(ec); ec.log.forEach(function (l) { log.push(l); });
    if (ec.messageID == null) return done('error', 'no Message-ID (createRequest :286 NullPointerException -> processEmailError, EmailSrv :362-371)');
    if (ec.sentMs == null) return done('error', 'no Date (createRequest :302 NullPointerException -> processEmailError, EmailSrv :362-371)');
    var from = ec.fromAddress[0], maxlen = 30;
    try { var fl = q("SELECT c.fieldlength AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='r_request' AND lower(c.columnname)='documentno'", [])[0]; if (fl && fl.n) maxlen = Number(fl.n); } catch (e) { /* the column length default */ }
    var docNo = ec.messageID; if (docNo.length > maxlen) docNo = docNo.substring(0, 30);   // :283-287 (the literal 30)
    var start = ctx.stamp(ec.sentMs);
    plan.documentNo = docNo; plan.startDate = start;
    // dedupe :289-318
    var dup = q('SELECT r_request_id AS id FROM r_request WHERE ad_client_id=? AND documentno=? AND startdate=?', [client, docNo, start])[0];
    if (dup && !(ctx.mutant && ctx.mutant.noDedupe)) { plan.requestId = dup.id; return done('duplicate', 'Request ' + dup.id + ' has DocumentNo+StartDate already (:315-318); the mail still moves to the Request folder'); }
    if (dup) log.push('§EMAILREQ-MUTANT dedupe disabled: Request ' + dup.id + ' ignored');
    // reply :320-371 (no ORDER BY in legacy: the first row by key here)
    var subj = ec.subject, cands = q("SELECT r_request_id AS id, summary, documentno FROM r_request WHERE ad_client_id=? ORDER BY r_request_id", [client]), hit = null;
    for (var i = 0; i < cands.length && !hit; i++) {
      var c = cands[i];
      if (!pgLike(c.summary, 'FROM: ' + from + '%')) continue;
      var byDoc = subj != null && c.documentno === pgSubstr(subj, subj.indexOf('<') + 1);
      var byRe = subj != null && pgLike(subj, 'Re: %') && c.summary === 'FROM: ' + from + '\n' + pgSubstr(subj, 5);
      if (byDoc || byRe) hit = c;
    }
    var text = ec.text;
    if (hit) { plan.requestId = hit.id; plan.fields = { result: 'FROM: ' + from + '\n' + text }; return done('update', 'answer for Request ' + hit.id + ' (:367-371 -> updateRequest :490-498)'); }
    // new :373-456
    var f = { summary: 'FROM: ' + from + '\n' + jstr(subj), result: 'FROM: ' + from + '\n' + text, documentno: docNo };
    if (idSet(P.R_RequestType_ID)) f.r_requesttype_id = Number(P.R_RequestType_ID);
    else {   // MRequest.setR_RequestType_ID() :190-197 -> MRequestType.getDefault :109-123
      var dt0 = q('SELECT r_requesttype_id AS id, isdefault FROM r_requesttype WHERE ad_client_id IN (0,?) ORDER BY isdefault DESC, ad_client_id DESC', [client])[0];
      if (dt0 && dt0.isdefault === 'Y') f.r_requesttype_id = dt0.id; else return done('error', 'no request type: no parameter and no default (checkInputParameter :209-212 refuses the whole run)');
    }
    if (idSet(P.SalesRep_ID)) f.salesrep_id = Number(P.SalesRep_ID);
    if (idSet(P.AD_Role_ID)) f.ad_role_id = Number(P.AD_Role_ID);
    var u = q('SELECT ad_user_id AS id FROM ad_user WHERE UPPER(email)=UPPER(?) AND ad_client_id=?', [from, client])[0];
    if (u && idSet(u.id)) { f.ad_user_id = u.id; plan.userBy = 'email'; } else if (idSet(P.AD_User_ID)) { f.ad_user_id = Number(P.AD_User_ID); plan.userBy = 'parameter'; } else plan.userBy = 'none';
    if (idSet(f.ad_user_id)) { var ub = q('SELECT c_bpartner_id AS bp FROM ad_user WHERE ad_user_id=?', [f.ad_user_id])[0]; if (ub && idSet(ub.bp)) { f.c_bpartner_id = ub.bp; plan.bpBy = 'user'; } }
    if (!idSet(f.c_bpartner_id) && idSet(P.C_BPartner_ID)) { f.c_bpartner_id = Number(P.C_BPartner_ID); plan.bpBy = 'parameter'; }
    f.startdate = start;
    if (P.p_DefaultConfidentiality != null) { f.confidentialtype = P.p_DefaultConfidentiality; f.confidentialtypeentry = P.p_DefaultConfidentiality; }
    if (P.p_DefaultPriority != null) { f.priority = P.p_DefaultPriority; f.priorityuser = P.p_DefaultPriority; }
    plan.fields = f;
    // attachments :462-486 - one AD_Attachment, entries in legacy order, a same-named entry replaced (MAttachment.addEntry)
    var mode = P.HTMLAttachmentType == null ? 'H' : P.HTMLAttachmentType, AA = dep('AdAttachment', './ad_attachment.js');
    function add(name, data) { if (name == null || data == null) { log.push('§EMAILREQ-ATT entry without a name skipped (MAttachment.addEntry :411-412 returns false)'); return; } AA.addEntry(plan.entries, name, data); }
    if (mode === 'H') { var h = htmlWithImages(ec); if (h != null) add(jstr(subj) + '.html', new TextEncoder().encode(h)); }
    else if (mode === 'I') htmlImageParts(ec).forEach(function (p) { add(fileName(p), partBytes(p)); });
    ec.attach.forEach(function (p) { add(fileName(p), partBytes(p)); });
    ec.embed.filter(function (p) { return htmlImageParts(ec).indexOf(p) < 0; }).forEach(function (p) { log.push('§EMAILREQ-ATT inline part not referenced from the HTML dropped as legacy does name=' + fileName(p) + ' cid=' + contentId(p)); });
    return done('create', 'new Request (:373-488) user=' + plan.userBy + ' bp=' + (plan.bpBy || 'none') + ' entries=' + plan.entries.length);
  }

  // PO.set_Value :1074-1083 - a String (column class String: String/Text/Memo/TextLong references) longer than the column is cut (the model layer does not do it generically yet; named in the SPEC)
  function cutToColumns(q, table, f) {
    var lens = {}; try { q("SELECT lower(c.columnname) AS c, c.fieldlength AS n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.ad_reference_id IN (10,14,34,36)", [table]).forEach(function (r) { lens[r.c] = Number(r.n || 0); }); } catch (e) { /* none */ }
    Object.keys(f).forEach(function (k) { if (typeof f[k] === 'string' && lens[k] > 0 && f[k].length > lens[k]) f[k] = f[k].substring(0, lens[k]); });
    return f;
  }

  // applyRequestOps(kernel, session, plan): kernel = ws_kernel.js build() ({ q, inTrx, ML }); ONE Trx like legacy's trxRequest (processEmailContent :233-268) -> Promise<{ ok, route, requestId, attachmentId, log }>
  function applyRequestOps(k, session, plan) {
    if (plan.route !== 'create' && plan.route !== 'update') return Promise.resolve({ ok: true, route: plan.route, written: 0, log: ['§EMAILREQ-APPLY route=' + plan.route + ' nothing written'] });
    var AA = dep('AdAttachment', './ad_attachment.js');
    var zipP = plan.route === 'create' && plan.entries.length ? AA.zipBuild(plan.entries) : Promise.resolve(null);
    return zipP.then(function (zip) {
      if (zip && zip.length > AA.MAX_BYTES) return { ok: false, route: 'error', reason: 'attachment zip ' + zip.length + ' bytes over the DB cap ' + AA.MAX_BYTES + ' (the file store is browser-only; named divergence)', log: [] };
      var tableId = (k.q("SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)='r_request'", [])[0] || {}).id;
      var r = k.inTrx(session, { process: 'RequestEMailProcessor', documentNo: plan.documentNo }, function (trx, ML) {
        var res;
        if (plan.route === 'update') {
          var row = trx.get('r_request', plan.requestId); if (!row) return { ok: false, error: 'Request ' + plan.requestId + ' not found' };
          res = ML.save(trx, 'r_request', row, cutToColumns(trx.q, 'r_request', Object.assign({}, plan.fields)));
          if (!res.ok) return { ok: false, error: res.error };
          trx.say('§EMAILREQ-APPLY update request=' + plan.requestId);
          return { ok: true, route: 'update', reqRow: res.row };
        }
        var nf = cutToColumns(trx.q, 'r_request', Object.assign({}, plan.fields));
        // PO.saveNew :3546-3556 gives the row its <Table>_UU BEFORE the insert, so createAttachment (:5397) reads it; this kernel's applier stamps it only at commit, too late for Record_UU
        if (nf.r_request_uu == null && trx.env.uuid) nf.r_request_uu = trx.env.uuid();
        res = ML.save(trx, 'r_request', null, ML.newPO(trx, 'r_request', nf));
        if (!res.ok) return { ok: false, error: res.error };
        var req = res.row, att = null;
        if (zip) {   // PO.createAttachment :5393-5399 -> new MAttachment(ctx, AD_Table_ID, get_ID(), get_UUID(), null); AttachmentDBSystem: Title 'zip', BinaryData = the zip
          var ar = ML.save(trx, 'ad_attachment', null, ML.newPO(trx, 'ad_attachment', { ad_table_id: tableId, record_id: req.r_request_id, record_uu: req.r_request_uu || null, title: AA.ZIP, binarydata: AA.b64(zip), textmsg: null }));
          if (!ar.ok) return { ok: false, error: 'attachment: ' + ar.error };
          att = ar.row;
        }
        trx.say('§EMAILREQ-APPLY create docno=' + req.documentno + ' entries=' + plan.entries.length + ' zipBytes=' + (zip ? zip.length : 0));
        return { ok: true, route: 'create', reqRow: req, attRow: att };
      });
      var out = { ok: r.ok, route: r.ok ? r.route : 'error', reason: r.ok ? null : r.error, log: r.log || [] };
      if (r.ok) {   // the committed keys: ids[i] of the op group (ws_kernel apply)
        var idOf = function (table) { for (var i = 0; i < r.ops.length; i++) if (r.ops[i].table === table && r.ops[i].op_type === 'CRUD_CREATE') return r.ids[i]; return null; };
        out.requestId = plan.route === 'update' ? plan.requestId : idOf('r_request');
        out.attachmentId = idOf('ad_attachment');
        out.updateRows = r.ops.filter(function (o) { return o.table === 'r_requestupdate'; }).length;
      }
      return out;
    });
  }

  // processMailbox(kernel, session, emails[{name, raw}], ctx): the folder stand-in for EmailSrv.readEmailFolder :302-399 (IMAP = R4). Sequential; one Trx per mail; an error never stops the run
  //   before the 6th consecutive one (:378-382). Returns { total, requests, errors, results[] } (legacy's return text counts noRequest / noError; noProcessed is never incremented in legacy).
  function processMailbox(k, session, emails, ctx) {
    var out = { total: 0, requests: 0, errors: 0, results: [] }, consecutive = 0;
    return emails.reduce(function (p, m) {
      return p.then(function () {
        if (consecutive > 5) return;
        var plan; try { plan = parseEmailToRequestOps(m.raw, ctx); } catch (e) { plan = { route: 'error', reason: 'threw ' + (e && e.message), log: [] }; }
        return applyRequestOps(k, session, plan).then(function (r) {
          var route = r.ok ? plan.route : 'error'; out.total++;
          if (route === 'error') { out.errors++; consecutive++; } else { out.requests++; consecutive = 0; }
          out.results.push({ name: m.name, route: route, folder: route === 'error' ? 'Error' : 'Request', reason: r.ok ? plan.reason : r.reason, requestId: r.requestId || plan.requestId || null, attachmentId: r.attachmentId || null, updateRows: r.updateRows || 0, plan: plan, log: plan.log.concat(r.log || []) });
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  var api = { parseEmail: function (raw) { return analyseBody(parseEmail(raw)); }, parseEmailToRequestOps: parseEmailToRequestOps, applyRequestOps: applyRequestOps, processMailbox: processMailbox,
    pgLike: pgLike, decodeWords: decodeWords, partBytes: partBytes, fileName: fileName, contentId: contentId };
  if (NODE) module.exports = api; else root.RequestEmail = api;
})(typeof window !== 'undefined' ? window : globalThis);
