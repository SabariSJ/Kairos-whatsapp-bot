const app = require('./app');
const { checkConnection } = require('./config/db');

const PORT = process.env.PORT || 5000;

async function startServer() {
  console.log('================================================================');
  console.log('🚀 Starting Kairos Common Backend API...');
  console.log('================================================================');

  // Verify database connectivity on startup
  const dbHealth = await checkConnection();
  if (dbHealth.connected) {
    console.log(`✅ AWS RDS PostgreSQL (${dbHealth.details.database}) is connected!`);
  } else {
    console.error(`⚠️ Database connection warning: ${dbHealth.error}`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Server listening on: http://localhost:${PORT}`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🩺 Healthcheck: http://localhost:${PORT}/api/health`);
    console.log(`🩺 DB Health:   http://localhost:${PORT}/api/health/db`);
    console.log('================================================================');
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('\n🛑 Gracefully shutting down Kairos Backend...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
