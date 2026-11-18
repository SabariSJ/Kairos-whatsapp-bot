const express = require('express');
const router = express.Router();
const { checkConnection } = require('../config/db');

/**
 * Server basic health
 * GET /api/health
 */
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'Kairos Backend API'
  });
});

/**
 * Database connectivity health
 * GET /api/health/db
 */
router.get('/db', async (req, res) => {
  const health = await checkConnection();
  if (health.connected) {
    return res.status(200).json({
      success: true,
      database: 'connected',
      details: {
        dbName: health.details.database,
        schema: health.details.schema,
        serverTime: health.details.serverTime
      }
    });
  } else {
    // Return meaningful error without exposing credentials or host secrets
    return res.status(503).json({
      success: false,
      database: 'disconnected',
      error: 'Unable to connect to PostgreSQL database. Service unavailable.'
    });
  }
});

module.exports = router;
