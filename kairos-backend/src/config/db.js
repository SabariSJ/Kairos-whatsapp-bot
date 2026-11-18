const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const isSslEnabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === true;

const poolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT_MS || '10000', 10),
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err.message);
});

/**
 * Execute parameterized SQL query safely
 * @param {string} text 
 * @param {Array} params 
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    // Log query execution time without leaking data
    console.debug(`[DB Query] executed in ${duration}ms, rows: ${res.rowCount}`);
  }
  return res;
}

/**
 * Get client for multi-statement transactions
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Check database connection health
 * @returns {Promise<{ connected: boolean, details?: object, error?: string }>}
 */
async function checkConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS current_time, current_database() AS db_name, current_schema() AS schema_name');
    return {
      connected: true,
      details: {
        database: result.rows[0].db_name,
        schema: result.rows[0].schema_name,
        serverTime: result.rows[0].current_time
      }
    };
  } catch (err) {
    console.error('[DB Health Check Failed]:', err.message);
    return {
      connected: false,
      error: 'Database connection failed. Check host, port and network accessibility.'
    };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  checkConnection
};
