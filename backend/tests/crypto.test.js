const C = require('../src/lib/crypto');

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 Appendix B: SHA-1 secret "12345678901234567890"; at T=59s the 8-digit code is 94287082.
  const secret = C.base32Encode(Buffer.from('12345678901234567890'));

  test('base32 round-trips', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(C.base32Decode(secret).toString()).toBe('12345678901234567890');
  });
  test('matches the RFC test vector (last 6 digits)', () => {
    expect(C.totpAt(secret, 59 * 1000)).toBe('287082');
    expect(C.totpAt(secret, 1111111109 * 1000)).toBe('081804');
    expect(C.totpAt(secret, 1234567890 * 1000)).toBe('005924');
  });
  test('accepts the current code and one step of drift, rejects older ones', () => {
    const t = 1700000000000;
    expect(C.verifyTotp(secret, C.totpAt(secret, t), t)).toBe(true);
    expect(C.verifyTotp(secret, C.totpAt(secret, t - 30000), t)).toBe(true);
    expect(C.verifyTotp(secret, C.totpAt(secret, t - 90000), t)).toBe(false);
  });
  test('rejects malformed codes', () => {
    expect(C.verifyTotp(secret, 'abc123')).toBe(false);
    expect(C.verifyTotp(secret, '')).toBe(false);
    expect(C.verifyTotp(secret, undefined)).toBe(false);
  });
});

describe('field encryption', () => {
  test('round-trips and never stores plaintext', () => {
    const ct = C.encrypt('Medical note: example');
    expect(ct).not.toMatch(/Medical/);
    expect(C.decrypt(ct)).toBe('Medical note: example');
  });
  test('same plaintext encrypts differently each time', () => {
    expect(C.encrypt('x')).not.toBe(C.encrypt('x'));
  });
  test('tampered ciphertext is rejected', () => {
    const parts = C.encrypt('secret').split(':');
    const body = Buffer.from(parts[3], 'base64');
    body[0] ^= 1;
    parts[3] = body.toString('base64');
    expect(() => C.decrypt(parts.join(':'))).toThrow();
  });
});

describe('national ID handling', () => {
  test('hash is stable and ignores spacing/case', () => {
    expect(C.hashNationalId('12 345 678')).toBe(C.hashNationalId('12345678'));
    expect(C.nationalIdMatches('12345678', C.hashNationalId('12345678'))).toBe(true);
  });
  test('a different ID does not match', () => {
    expect(C.nationalIdMatches('12345679', C.hashNationalId('12345678'))).toBe(false);
  });
  test('the hash does not contain the ID', () => {
    expect(C.hashNationalId('12345678')).not.toMatch(/12345678/);
  });
});
