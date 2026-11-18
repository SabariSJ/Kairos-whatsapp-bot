const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

// Route Handlers
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const internalRoutes = require('./routes/internalRoutes');
const videoRoutes = require('./routes/videoRoutes');
const videoController = require('./controllers/videoController');

const app = express();

// ==============================================================================
// 1. CORS Allowlisting Configuration
// ==============================================================================
const rawOrigins = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:5000';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser requests (e.g. mobile apps, curl, postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// ==============================================================================
// 2. Request Parsing Middlewares
// ==============================================================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Basic request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.debug(`[HTTP] ${req.method} ${req.url}`);
    next();
  });
}

// ==============================================================================
// 3. API Route Mounts
// ==============================================================================
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/staff/payments', paymentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/staff/reports', reportRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/video', videoRoutes);

// Classroom Web Player
app.get('/classroom/:sessionId', (req, res, next) => videoController.renderClassroom(req, res, next));
app.post('/api/classroom/handshake', (req, res, next) => videoController.handleHandshake(req, res, next));

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Kairos Common Backend API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/api/health',
      databaseHealth: '/api/health/db',
      courses: '/api/courses?language=en|fr',
      registration: 'POST /api/registrations',
      staffAuth: 'POST /api/auth/login',
      staffPayments: '/api/staff/payments',
      staffReports: '/api/staff/reports/summary'
    }
  });
});

// ==============================================================================
// 4. Error & 404 Handlers
// ==============================================================================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
