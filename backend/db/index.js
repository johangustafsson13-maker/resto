const pgp = require('pg-promise')();
const { DatabaseError } = require('pg-promise/lib/errors');

// Database connection
const db = pgp(process.env.DATABASE_URL || 'postgresql://postgres@localhost/resto_dev');

// Test connection (non-blocking for development/testing)
db.connect()
  .then(obj => {
    console.log('✓ PostgreSQL connected');
    obj.done(); // Release connection back to pool
  })
  .catch(error => {
    console.warn('⚠ PostgreSQL connection failed:', error.message);
    console.warn('   Server will continue running but database operations may fail');
    // Don't exit - allow server to start for frontend testing
  });

module.exports = db;
