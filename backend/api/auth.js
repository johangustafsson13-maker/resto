const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/auth/signup
 * Register new user with email/password
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signup = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await db.one(
      `INSERT INTO users (id, email, password_hash, searches_remaining, searches_reset_at)
       VALUES ($1, $2, $3, 3, NOW() + INTERVAL '1 day')
       RETURNING id, email, subscription_status`,
      [uuidv4(), email, hashedPassword]
    );

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscription_status: user.subscription_status
      },
      token
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Login with email/password
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await db.oneOrNone(
      'SELECT id, email, password_hash, subscription_status, searches_remaining FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscription_status: user.subscription_status,
        searches_remaining: user.searches_remaining
      },
      token
    });

  } catch (error) {
    next(error);
  }
};

module.exports = async (req, res, next) => {
  if (req.path.includes('signup')) {
    return signup(req, res, next);
  } else if (req.path.includes('login')) {
    return login(req, res, next);
  }
  res.status(404).json({ error: 'Not found' });
};
