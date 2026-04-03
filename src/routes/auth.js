const { Router } = require('express');
const {
  getSecret,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookieHeader,
  COOKIE_NAME,
} = require('../lib/session');

const router = Router();

router.post('/login', (req, res) => {
  if (!getSecret()) {
    return res.status(500).json({ error: 'Server misconfigured: SESSION_SECRET missing' });
  }
  const password = req.body && req.body.password;
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = createSessionToken();
  if (!token) {
    return res.status(500).json({ error: 'Could not create session' });
  }
  res.setHeader('Set-Cookie', sessionCookieHeader(token, false));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', sessionCookieHeader('', true));
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies[COOKIE_NAME]);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ ok: true });
});

module.exports = router;
