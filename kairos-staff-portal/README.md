# Kairos Central Staff Portal

A centralized, role-based administration portal built with **React 19**, **Vite**, and **Bootstrap 5** for managing English and French student registrations, payments, and analytics in the Kairos WhatsApp Learning Platform.

---

## 🌟 Key Features

* **Unified Portal, Dual Dashboards:**
  * **Payment Dashboard (`/payments`):** For `payment_staff`. View bilingual registrations, search students, update payment status (`Pending` → `Contacted` → `Confirmed` → `Paid` → `Cancelled`), and trigger manual WhatsApp confirmations.
  * **Report Dashboard (`/reports`):** For `report_staff`. View high-level KPIs, daily trends line chart, status distribution doughnut chart, profession breakdown doughnut chart, and multi-sheet Excel (`.xlsx`) export.
* **Strict Role-Based Access Control (RBAC):** Backend-enforced route guarding and API authorization. Payment staff cannot access report endpoints; report staff cannot update payment statuses or send notifications.
* **Real-time Language Filtering:** Seamlessly filter data across `All`, `English (EN)`, and `French (FR)` backed by the common Node.js / Express API.
* **Zero Disruption to Existing Apps:** Runs independently on Vite; does not modify the public registration frontends or the live WhatsApp bot.

---

## 📁 Folder Structure

```
kairos-staff-portal/
├── public/
├── src/
│   ├── api/
│   │   ├── axiosInstance.js     # Axios client with JWT interceptor & 401 handler
│   │   ├── authApi.js           # Login & session verification APIs
│   │   ├── paymentApi.js        # Payment listing, status updates & WhatsApp triggers
│   │   └── reportApi.js         # Report analytics & raw export APIs
│   ├── assets/
│   │   └── logo.png             # Official Sprout / Kairos branding
│   ├── components/
│   │   ├── LanguageFilter.jsx   # All / English / French filter pills
│   │   └── ProtectedRoute.jsx   # Role-guarded route wrapper
│   ├── context/
│   │   └── AuthContext.jsx      # Authentication state, login, logout, & JWT management
│   ├── pages/
│   │   ├── Login.jsx            # Reused, branded staff login view
│   │   ├── PaymentDashboard.jsx # Comprehensive payment management view
│   │   ├── ReportDashboard.jsx  # Chart.js analytics & Excel export view
│   │   ├── Unauthorized.jsx     # 403 Access Denied view
│   │   └── NotFound.jsx         # 404 Route Not Found view
│   ├── styles/
│   │   └── custom.css           # Sprout typography, colors, and layout styles
│   ├── App.jsx                  # Main routing container
│   └── main.jsx                 # Vite application mount
├── .env.example                 # Environment template
├── .gitignore                   # Git exclusion rules
├── package.json                 # NPM package scripts & dependencies
└── README.md                    # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Installation
```bash
cd kairos-staff-portal
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `VITE_API_BASE_URL` points to your running backend:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## 🔑 Default Staff Credentials (Development & Testing)

| Module | Email | Password | Role | Redirect Route |
|---|---|---|---|---|
| **Payment Staff** | `payment@sprout.com` | `sprout123` | `payment_staff` | `/payments` |
| **Report Staff** | `report@sprout.com` | `sprout123` | `report_staff` | `/reports` |

---

## 📡 API Endpoint Mapping

| Portal Action | Backend Route | Method | Required Role |
|---|---|---|---|
| Staff Login | `/api/auth/login` | `POST` | Public (Rate-limited) |
| Current Session | `/api/auth/me` | `GET` | Authenticated Staff |
| Load Payments | `/api/staff/payments?language=all\|en\|fr` | `GET` | `payment_staff` |
| Update Status | `/api/staff/payments/:paymentId/status` | `PATCH` | `payment_staff` |
| Send WhatsApp | `/api/staff/payments/:paymentId/send-whatsapp` | `POST` | `payment_staff` |
| Load Analytics | `/api/staff/reports/summary?language=all\|en\|fr` | `GET` | `report_staff` |
| Export Excel Records | `/api/staff/reports/records?language=all\|en\|fr` | `GET` | `report_staff` |

---

## 🔒 Security Architecture

1. **Token Storage:** Tokens are maintained in browser `localStorage` and dispatched via standard `Authorization: Bearer <token>` headers.
2. **Expired Token Invalidation:** When the backend returns HTTP 401, the Axios interceptor immediately purges cached authentication tokens and redirects the user to `/login?expired=true`.
3. **Defense in Depth:** Even if a user manually tampers with client-side routing, the backend enforces `403 Forbidden` on all cross-role requests.
4. **No Secrets Exposed:** Zero database credentials, AWS keys, or Meta tokens are present in client code.
