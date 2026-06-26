require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy hop (Railway/Vercel) so req.ip reflects the real client
// and the rate limiter cannot be bypassed by spoofing X-Forwarded-For.
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3131', 'http://localhost:3000'],
}));
// Public endpoints exempt from rate limiting
app.get('/api/browse', require('./api/browse'));

app.use('/api/', require('./middleware/rateLimit'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
const authMiddleware = require('./middleware/auth');
app.post('/api/search', authMiddleware, require('./api/search'));
// NOTE: /api/parse-intent and /api/rank were removed — they were unauthenticated
// Claude-calling endpoints unused by the frontend (a cost-abuse vector). The real
// flow runs entirely inside /api/search. See claude/intent-parser.js + claude/ranker.js.

// Auth Routes (stub)
app.post('/api/auth/signup', require('./api/auth'));
app.post('/api/auth/login', require('./api/auth'));

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Resto backend running on http://localhost:${PORT}`);
  console.log(`✓ API available at http://localhost:${PORT}/api`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
