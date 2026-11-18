# Kairos Common Backend API

Production-ready Node.js + Express backend providing unified REST APIs for the Kairos WhatsApp Learning Platform, connected to AWS RDS PostgreSQL (`devdb`).

---

## 🌟 Key Features

* **Multi-language Student Registration:** Supports both English (`en`) and French (`fr`) registration flows into `wa_registrations`.
* **Zero Schema Disruptions:** Connects directly to the 4 existing PostgreSQL tables (`wa_courses`, `wa_registrations`, `wa_payments`, `wa_enrollments`) without altering any existing database structures or constraints.
* **Role-Based Staff Access (RBAC):** Strict separation between `payment_staff` and `report_staff` using secure JSON Web Tokens (JWT) and bcrypt password hashing.
* **Transactional Payment & Enrollment Flow:** Atomic updates (`BEGIN` ... `COMMIT` / `ROLLBACK`) that automatically activate student enrollment upon `status = 'Paid'`.
* **Language Filtering:** Centralized filtering (`all`, `en`, `fr`) across all payment and reporting endpoints.
* **Chart.js & Excel Ready Analytics:** Pre-aggregated metrics for Daily Trends, Status Distributions, and Occupations, plus complete row sets formatted for SheetJS (`xlsx`) export.
* **Enterprise Security:** Parameterized queries (SQL injection prevention), CORS allowlisting, login brute-force rate limiting, and zero credential logging.

---

## 📁 Project Structure

```
kairos-backend/
├── src/
│   ├── config/
│   │   ├── db.js                     # PostgreSQL connection pool with SSL (AWS RDS)
│   │   └── verify-db-schema.js       # Read-only schema verification tool
│   ├── controllers/
│   │   ├── authController.js         # Staff login and JWT verification
│   │   ├── courseController.js       # Course retrieval controller
│   │   ├── paymentController.js      # Payment staff operations
│   │   ├── registrationController.js # Student registration ingestion
│   │   └── reportController.js       # Report staff analytics controller
│   ├── middleware/
│   │   ├── authMiddleware.js         # JWT Bearer token authentication
│   │   ├── errorMiddleware.js        # Centralized error and 404 handlers
│   │   └── roleMiddleware.js         # Strict RBAC role enforcement
│   ├── routes/
│   │   ├── authRoutes.js             # /api/auth/*
│   │   ├── courseRoutes.js           # /api/courses/*
│   │   ├── healthRoutes.js           # /api/health/*
│   │   ├── paymentRoutes.js          # /api/staff/payments/*
│   │   ├── registrationRoutes.js     # /api/registrations/*
│   │   └── reportRoutes.js           # /api/staff/reports/*
│   ├── services/
│   │   ├── courseService.js          # Course data access
│   │   ├── paymentService.js         # Transactional payment & enrollment service
│   │   ├── registrationService.js    # Registration validation & deduplication
│   │   ├── reportService.js          # SQL aggregation & reporting engine
│   │   └── staffAuthStore.js         # Secure environment-backed staff credentials store
│   ├── app.js                        # Express app configuration & middlewares
│   └── server.js                     # HTTP server startup & graceful shutdown
├── scripts/
│   └── seed-courses.js               # Helper to seed default courses if empty
├── tests/
│   ├── postman_collection.json       # Importable Postman API collection
│   └── run-all-tests.js              # Automated 15-test integration & security suite
├── .env.example                      # Configuration template
├── .gitignore                        # Git exclusion rules
├── package.json                      # NPM dependencies & scripts
└── README.md                         # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Installation
```bash
cd kairos-backend
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

### 3. Verify Database Connectivity & Schema
```bash
npm run verify-db
```

### 4. Run Automated Test Suite (15/15 Tests)
```bash
npm test
```

### 5. Start Server
```bash
# Development (with file watcher)
npm run dev

# Production
npm start
```

---

## 📡 API Endpoint Reference

### Health
* `GET /api/health` - Basic uptime & status check
* `GET /api/health/db` - PostgreSQL RDS connection health check

### Courses
* `GET /api/courses?language=en` - Active English courses
* `GET /api/courses?language=fr` - Active French courses
* `GET /api/courses` - All active courses

### Registrations
* `POST /api/registrations` - Register a student (English or French)

### Staff Authentication
* `POST /api/auth/login` - Authenticate staff member (Rate-limited, returns JWT)
* `GET /api/auth/me` - Get current staff profile & role

### Payment Staff (Requires `payment_staff` Role)
* `GET /api/staff/payments?language=all|en|fr` - List registrations & payment statuses
* `PATCH /api/staff/payments/:paymentId/status` - Update payment status (`Pending`, `Contacted`, `Confirmed`, `Paid`, `Cancelled`)
  * *Note: Updating status to `Paid` automatically triggers transactional activation in `wa_enrollments`.*

### Report Staff (Requires `report_staff` Role)
* `GET /api/staff/reports/summary?language=all|en|fr` - Aggregate KPI metrics, time-series line data, occupation & status doughnut charts
* `GET /api/staff/reports/records?language=all|en|fr` - Raw data rows optimized for Excel (`xlsx`) export

---

## 🔒 Default Test Staff Credentials

| Role | Email | Password |
|---|---|---|
| Payment Staff | `admin@sprout.app` | `sprout` |
| Report Staff | `data@sprout.app` | `sprout` |

*(Stored securely in environment variables as bcrypt salted hashes, never in plain text).*
