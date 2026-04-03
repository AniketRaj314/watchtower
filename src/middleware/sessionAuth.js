const { COOKIE_NAME, verifySessionToken, parseCookies } = require('../lib/session');

function sessionAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  const session = verifySessionToken(raw);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = session;
  next();
}

module.exports = sessionAuth;
