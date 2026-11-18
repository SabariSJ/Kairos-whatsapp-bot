# Kairos WhatsApp Bot & Student Ecosystem

A full-stack, multi-portal education ecosystem featuring WhatsApp Cloud API chatbot automation, bilingual registration portals, DRM-protected video streaming, and staff administration dashboards.

## System Architecture

- **`kairos-backend/`**: Node.js / Express REST API handling authentication, student records, payment verifications, dynamic DRM token generation, and database sync.
- **`kairos-staff-portal/`**: React + Vite admin dashboard for administrators to track student enrollment, revenue, and system reports.
- **`whatsapp-Kairos (final)/`**: WhatsApp bot application, webhook listeners, conversation state machine, and DRM-protected HLS/MP4 video streaming player.
- **`Reg_Sprout_english1/`**: React student registration and onboarding portal (English).
- **`Reg_Sprout_French1/`**: React student registration and onboarding portal (French).
- **`Kairos_Database_Handover/`**: PostgreSQL database schemas, migrations, and seed scripts.

## Setup & Getting Started

1. **Environment Configuration**:
   Copy `.env.example` to `.env` in each subfolder (`kairos-backend`, `kairos-staff-portal`, `Reg_Sprout_english1/Reg_Sprout_english`, `Reg_Sprout_French1/Reg_Sprout_French`, and `whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/backend`) and supply your credentials.

2. **Backend**:
   ```bash
   cd kairos-backend
   npm install
   npm run dev
   ```

3. **Staff Portal**:
   ```bash
   cd kairos-staff-portal
   npm install
   npm run dev
   ```

4. **WhatsApp Bot & DRM Server**:
   ```bash
   cd "whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/backend"
   npm install
   npm run dev
   ```

5. **Student Registration Portals**:
   ```bash
   cd Reg_Sprout_english1/Reg_Sprout_english
   npm install
   npm run dev

   cd ../../Reg_Sprout_French1/Reg_Sprout_French
   npm install
   npm run dev
   ```
