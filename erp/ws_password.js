// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_password.js - org.compiere.util.Secure.getPasswordHash / SecureEngine.isMatchHash (node only; the browser twin has no web-service host).
//   algorithm null      -> SHA-512 over (salt, then password), then 1000 rounds of SHA-512 (Secure.getSHA512Hash :409-422, "backward compatibility, legacy default")
//   'SHA-512'           -> the same with 310000 rounds
//   'PBKDF2'            -> PBKDF2WithHmacSHA256, 600000 iterations, 128 bit key (hex)         ('Argon2' is NOT ported: reported, never faked)
//   isMatchHash always computes (no early exit on a missing hash/salt: Secure.java :317-334).
'use strict';
const crypto = require('crypto');
function passwordHash(algorithm, password, hexSalt) {
  const salt = hexSalt ? Buffer.from(hexSalt, 'hex') : Buffer.alloc(0);
  const sha = (rounds) => { let d = crypto.createHash('sha512').update(salt).update(Buffer.from(password, 'utf8')).digest(); for (let i = 0; i < rounds; i++) d = crypto.createHash('sha512').update(d).digest(); return d.toString('hex'); };
  if (algorithm == null || algorithm === '') return sha(1000);
  if (/^SHA-512$/i.test(algorithm)) return sha(310000);
  if (/^PBKDF2$/i.test(algorithm)) return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, 600000, 16, 'sha256').toString('hex');
  throw new Error('password hash algorithm ' + algorithm + ' is not ported');
}
function isMatchHash(algorithm, hashed, hexSalt, plain) {
  try { return passwordHash(algorithm, plain, hexSalt || '0000000000000000') === (hashed == null ? '0000000000000000' : hashed); } catch (e) { return false; }
}
module.exports = { passwordHash, isMatchHash };
