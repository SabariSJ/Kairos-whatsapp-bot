const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isSslEnabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === true || !process.env.DB_HOST || process.env.DB_HOST.includes('rds.amazonaws.com');

const poolConfig = {
  host: process.env.DB_HOST || 'kairos-dev-db.cstyogquglrh.us-east-1.rds.amazonaws.com',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'devdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Kairos$123',
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  min: parseInt(process.env.DB_POOL_MIN || '1', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT_MS || '10000', 10),
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[DB Query] executed in ${duration}ms, rows: ${res.rowCount}`);
  }
  return res;
}

async function checkConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS current_time, current_database() AS db_name');
    return {
      connected: true,
      database: result.rows[0].db_name,
      serverTime: result.rows[0].current_time
    };
  } catch (err) {
    console.warn('[DB Connection Check]:', err.message);
    return {
      connected: false,
      error: err.message
    };
  }
}

module.exports = {
  pool,
  query,
  checkConnection
};
