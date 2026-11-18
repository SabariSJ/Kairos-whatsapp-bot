# 🚀 Kairos WhatsApp Chatbot & DRM Backend (Phase 5 Common Backend Integration)

> **Phase 5 Integration Update:**  
> The WhatsApp Bot is now integrated with the **Kairos Common Backend API** (`GET /api/internal/students/by-phone`) connected to **AWS RDS PostgreSQL** (`devdb`).
> Authoritative student registration, course assignment, payment status, and enrolment activation are retrieved directly from the common backend while preserving all existing bot features (DRM video, interactive menus, sessions, and bilingual support).

### Configuration
- **Backend API Base:** `${BACKEND_API_BASE_URL}/internal/students/by-phone`
- **Internal Service Key:** Configured via `INTERNAL_SERVICE_KEY`
- **Port:** `5001` (local staging) / `10000` (Render production)
- **Database Tables:** `wa_registrations`, `wa_courses`, `wa_payments`, `wa_enrollments`

---

# 🚀 Kairos Lite - WhatsApp Cloud API Chatbot Backend

Official WhatsApp interactive chatbot backend for **Kairos Lite**, powered by the **Meta WhatsApp Cloud API (v26.0)**. Kairos Lite provides 100% free assistance to help candidates find jobs, internships, and courses.

---

## 📱 Conversational Flow (Interactive Buttons & Menus)

### Screen 1: Welcome & Consent
* **Trigger:** Customer sends `Hi` (or `Hello`, `Start`, etc.)
* **Responses (Sent in sequence next-to-next):**
  1. Text Message:
     > "Welcome to Kairos Lite. I help you find a job, an internship or a course, for free."
  2. Interactive Quick Reply Buttons:
     > "Do you agree that we use your answers to suggest suitable offers?"
     * Buttons: `[ I agree ]` | `[ More info ]`

### Screen 2: Looking For
* **Trigger:** Customer taps `[ I agree ]` (or types "I agree", "agree", "yes")
* **Response (Interactive Quick Reply Buttons):**
  > "Thank you! What are you looking for today?"
  * Buttons: `[ A job ]` | `[ An internship ]` | `[ A course ]`

### Screen 3: User Profile
* **Trigger:** Customer taps `[ A job ]`, `[ An internship ]`, or `[ A course ]`
* **Response (Interactive List Message):**
  > "You are:"
  * Profile Options:
    1. **A student**
    2. **A housewife**
    3. **A young woman**
    4. **A working professional**
    5. **A job seeker**

### Screen 4 & 5: Field of Interest & Location
* Ask for preferred field (`IT / Tech`, `Sales / Business`, `Admin / Other`)
* Ask for preferred location (`Chennai`, `Bangalore`, `Remote / Work From Home`, etc.)
* Saves lead into `data/leads.json` and delivers final confirmation summary.

---

## 🛠️ Architecture

```
whatsapp-new/
├── backend/
│   ├── controllers/
│   │   └── whatsappController.js   # Handles GET (verification) and POST (incoming text & button webhooks)
│   ├── data/
│   │   ├── kairosData.js           # Kairos Lite messages, questions, and buttons
│   │   └── leads.json              # Captured candidate leads
│   ├── routes/
│   │   └── webhook.js              # Express webhook routing
│   ├── services/
│   │   ├── chatbotService.js       # Conversation state machine for Kairos Lite
│   │   └── whatsappService.js      # Meta Graph API sender (Text, Buttons, Lists, Sequences)
│   ├── utils/
│   │   └── conversationState.js    # Per-phone state & deduplication cache
│   ├── server.js                   # Express application entrypoint
│   └── test-chatbot.js             # Automated simulation test suite
├── ecosystem.config.js             # PM2 configuration
└── package.json                    # Root npm scripts
```

---

## 🧪 Testing

Run automated chatbot simulation tests:
```bash
npm test --prefix backend
```

Run local HTTP webhook tests:
```bash
node backend/test-webhook-http.js
```

---

## 🌐 Endpoints

* `GET /` — Service health check and registered WhatsApp number info
* `GET /webhook` — Meta Webhook challenge verification
* `POST /webhook` — Meta Webhook event receiver for text and interactive button clicks
* `GET /leads` — View captured candidate leads
