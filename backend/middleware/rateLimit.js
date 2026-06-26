'use strict';

const rateLimit = require('express-rate-limit');

const enabled   = process.env.RATE_LIMIT_ENABLED === 'true';
const windowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS,   10) || 60_000;
const max       = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 5;

// No-op when disabled (e.g. during testing)
if (!enabled) {
  module.exports = (_req, _res, next) => next();
} else {
  module.exports = rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // populates req.rateLimit.resetTime
    legacyHeaders:   false,

    // Auth endpoints live under /api/auth/* — skip them so users can always
    // sign up or log in regardless of how many search requests they've made.
    // When mounted at /api/, req.path is relative: /auth/signup, /auth/login.
    skip: (req) => req.path.startsWith('/auth/'),

    // Key on req.ip. With `trust proxy` set in server.js, Express resolves req.ip
    // from the proxy-supplied X-Forwarded-For to the real client. Do NOT read the
    // raw XFF header here — clients can forge it and bypass the limit entirely.

    handler: (req, res) => {
      const resetTime  = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);

      console.warn(`[rate-limit] ${req.ip} exceeded limit – ${req.method} ${req.originalUrl}`);

      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests, please try again later',
        retryAfter,
      });
    },
  });
}
