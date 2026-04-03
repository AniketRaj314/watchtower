const crypto = require('crypto');

const COOKIE_NAME = 'wt_session';
const MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90 days

function getSecret() {
  return process.env.SESSION_SECRET || '';
}

function hashPassword(plain) {
  return crypto.createHash('sha256').update(String(plain), 'utf8').digest();
}

function verifyPassword(password) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !password) return false;
  const a = hashPassword(password);
  const b = hashPassword(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSessionToken() {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const payload = JSON.stringify({ exp });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(payload, 'utf8').toString('base64url') + '.' + sig;
}

function verifySessionToken(token) {
  const secret = getSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  let payloadStr;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  try {
    const a = Buffer.from(sigHex, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(payloadStr);
  } catch {
    return null;
  }
  if (!data.exp || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
  return data;
}

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    out[k] = v;
  });
  return out;
}

function sessionCookieHeader(token, clear) {
  let first;
  if (clear) {
    first = `${COOKIE_NAME}=; Max-Age=0`;
  } else {
    first = `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${MAX_AGE_SEC}`;
  }
  const parts = [first, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SEC,
  getSecret,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookieHeader,
};
