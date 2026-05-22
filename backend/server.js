require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors());
app.use('/api/', require('./middleware/rateLimit'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
const authMiddleware = require('./middleware/auth');
app.post('/api/search', authMiddleware, require('./api/search'));
app.post('/api/parse-intent', require('./api/parse-intent'));
app.post('/api/rank', require('./api/rank'));

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
