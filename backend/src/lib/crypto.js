const crypto = require('crypto');
const env = require('../config/env');

// 64 hex characters are used as the raw key; any other secret is stretched to 32 bytes with SHA-256.
const KEY = /^[0-9a-fA-F]{64}$/.test(env.DATA_ENCRYPTION_KEY)
  ? Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex')
  : crypto.createHash('sha256').update(env.DATA_ENCRYPTION_KEY, 'utf8').digest();

// ── Field encryption (AES-256-GCM) for sensitive records and MFA secrets ──
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join(':');
}

function decrypt(payload) {
  const [version, iv, tag, body] = String(payload).split(':');
  if (version !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

// ── National ID: keyed hash only, never stored in clear ──
function normaliseNationalId(id) {
  return String(id).replace(/\s+/g, '').toUpperCase();
}
function hashNationalId(id) {
  return crypto.createHmac('sha256', env.NATIONAL_ID_PEPPER).update(normaliseNationalId(id)).digest('hex');
}
function nationalIdMatches(id, storedHash) {
  const a = Buffer.from(hashNationalId(id), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── TOTP (RFC 6238) for officer two-factor sign-in ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpAt(secret, timeMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(timeMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// Accepts the current code and one step either side (clock drift).
function verifyTotp(secret, code, timeMs = Date.now()) {
  const given = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some((w) => {
    const expected = totpAt(secret, timeMs + w * 30000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  });
}

function totpUri(secret, accountName, issuer = 'TSC TMGS') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  encrypt,
  decrypt,
  hashNationalId,
  nationalIdMatches,
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpAt,
  verifyTotp,
  totpUri,
};
