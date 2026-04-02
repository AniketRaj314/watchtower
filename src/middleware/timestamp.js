function validateTimestamp(ts) {
  if (!ts) return { valid: false, value: null };

  // Strict ISO-8601 datetime: YYYY-MM-DDTHH:mm[:ss[.sss]][Z|±HH:mm]
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+\-]\d{2}:\d{2})?$/;
  if (typeof ts !== 'string' || !isoRegex.test(ts)) {
    return { valid: false, value: null, error: 'Invalid timestamp' };
  }

  const d = new Date(ts);
  if (isNaN(d.getTime())) return { valid: false, value: null, error: 'Invalid timestamp' };

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fiveMinFuture = now + 5 * 60 * 1000;

  if (d.getTime() < sevenDaysAgo || d.getTime() > fiveMinFuture) {
    return { valid: false, value: null, error: 'Invalid timestamp' };
  }

  return { valid: true, value: d.toISOString() };
}

module.exports = { validateTimestamp };
