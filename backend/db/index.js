const pgp = require('pg-promise')();
const { DatabaseError } = require('pg-promise/lib/errors');

// Database connection
const db = pgp(process.env.DATABASE_URL || 'postgresql://postgres@localhost/resto_dev');

// Test connection
db.connect()
  .then(obj => {
    console.log('✓ PostgreSQL connected');
    obj.done(); // Release connection back to pool
  })
  .catch(error => {
    console.error('✗ PostgreSQL connection failed:', error.message);
    process.exit(1);
  });

module.exports = db;
