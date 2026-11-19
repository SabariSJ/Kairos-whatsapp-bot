const axios = require('axios');
const path = require('path');
const db = require('../config/db');
const googleSheetService = require('./googleSheetService');

/**
 * Backend Student Service
 * Connects the WhatsApp Bot to the authoritative Kairos Common Backend API (Node.js/Express)
 * Single Source of Truth: AWS RDS PostgreSQL (wa_registrations, wa_payments, wa_courses, wa_enrollments)
 */
class BackendStudentService {
  constructor() {
    this.backendBaseUrl = (process.env.BACKEND_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY || 'kairos_internal_service_key_2026_bot_auth_secret';
    this.studentMemoryCache = new Map();
    this.cacheTtlMs = 15000; // 15s in-memory TTL for high responsiveness
    this.processedEvents = new Set();
  }

  /**
   * Normalize incoming WhatsApp sender number
   * e.g. "919876540001" or "+919876540001" -> digits only
   * @param {string} rawPhone 
   * @returns {string}
   */
  normalizeWhatsAppPhone(rawPhone) {
    return String(rawPhone || '').replace(/\D/g, '').trim();
  }

  /**
   * Clear cache for a student or all students
   * @param {string} [phone] 
   */
  clearCache(phone) {
    if (phone) {
      this.studentMemoryCache.delete(this.normalizeWhatsAppPhone(phone));
    } else {
      this.studentMemoryCache.clear();
    }
  }

  /**
   * Retrieve authoritative student information from Kairos Common Backend
   * 
   * @param {string} rawFrom Full sender WhatsApp number (e.g. 919876540001)
   * @param {string} [phone10] Optional 10-digit local number fallback
   * @returns {Promise<object|null>} Authoritative student object or null
   */
  async getStudent(rawFrom, phone10 = null) {
    const cleanFrom = this.normalizeWhatsAppPhone(rawFrom);
    if (!cleanFrom && !phone10) return null;

    const cacheKey = cleanFrom || phone10;

    // Check fast memory cache
    const cached = this.studentMemoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      try {
        const localList = googleSheetService.readLocalStudents();
        const localStudent = localList.find(ls => 
          googleSheetService.phonesMatch(ls.phone, cached.student.phone) || 
          googleSheetService.phonesMatch(ls.phone, cleanFrom) ||
          (phone10 && googleSheetService.phonesMatch(ls.phone, phone10))
        );
        if (localStudent && localStudent.progressSeconds !== undefined) {
          cached.student.progressSeconds = Number(localStudent.progressSeconds || 0);
          cached.student.currentModule = Number(localStudent.currentModule || cached.student.currentModule || 1);
          cached.student.completedModules = localStudent.completedModules || cached.student.completedModules || [];
        }
      } catch (_) {}
      return cached.student;
    }

    // 1. Direct query to AWS RDS PostgreSQL
    try {
      console.log(`[BackendStudentSync] Direct AWS RDS query for student: raw=${cleanFrom}, phone10=${phone10}`);
      const normRaw = cleanFrom;
      const targetPhone10 = phone10 || (cleanFrom.length >= 10 ? cleanFrom.slice(-10) : cleanFrom);

      const sql = `
        SELECT 
          r.registration_id,
          r.full_name,
          r.country_code,
          r.phone_number,
          r.email,
          r.city,
          r.profession,
          r.language,
          r.registered_at,
          c.course_id,
          COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS course_name,
          COALESCE(p.payment_id, 0) AS payment_id,
          COALESCE(p.status, 'Pending') AS payment_status,
          p.updated_at AS payment_updated_at,
          COALESCE(e.enrollment_id, 0) AS enrollment_id,
          COALESCE(e.enrollment_status, 'Pending') AS enrollment_status
        FROM public.wa_registrations r
        LEFT JOIN public.wa_payments p ON p.registration_id = r.registration_id
        LEFT JOIN public.wa_courses c ON c.course_id = p.course_id
        LEFT JOIN public.wa_enrollments e ON e.payment_id = p.payment_id
        WHERE 
          REPLACE(r.country_code, '+', '') || r.phone_number = $1 OR
          '+' || REPLACE(r.country_code, '+', '') || r.phone_number = $2 OR
          r.phone_number = $3 OR
          (LENGTH($3) >= 8 AND r.phone_number LIKE '%' || $3)
        ORDER BY (CASE WHEN p.status = 'Paid' THEN 1 ELSE 2 END), p.updated_at DESC NULLS LAST, r.registered_at DESC
        LIMIT 1;
      `;

      const result = await db.query(sql, [normRaw, '+' + normRaw, targetPhone10]);

      if (result && result.rowCount > 0) {
        const s = result.rows[0];
        const isFr = s.language === 'fr';
        const isPaid = (s.payment_status === 'Paid');

        // Check if student has existing module progress in local storage
        let localModule = 1;
        let localProgress = 0;
        let localCompleted = [];
        try {
          const localList = googleSheetService.readLocalStudents();
          const localStudent = localList.find(ls => 
            googleSheetService.phonesMatch(ls.phone, s.phone_number) || 
            googleSheetService.phonesMatch(ls.phone, cleanFrom)
          );
          if (localStudent) {
            localModule = localStudent.currentModule || 1;
            localProgress = localStudent.progressSeconds || 0;
            localCompleted = localStudent.completedModules || [];
          }
        } catch (_) {}

        const authoritativeStudent = {
          registrationId: s.registration_id,
          name: s.full_name || 'Student',
          phone: s.phone_number,
          countryCode: s.country_code,
          course: s.course_name,
          paymentStatus: isPaid ? 'yes' : 'no',
          rawPaymentStatus: s.payment_status,
          enrollmentStatus: s.enrollment_status,
          language: isFr ? 'français' : 'english',
          languageCode: s.language || 'en',
          registeredAt: s.registered_at,
          currentModule: Math.max(1, Math.min(6, Number(localModule || 1))),
          progressSeconds: Number(localProgress || 0),
          completedModules: Array.isArray(localCompleted) ? localCompleted : []
        };

        this.studentMemoryCache.set(cacheKey, {
          student: authoritativeStudent,
          expiresAt: Date.now() + this.cacheTtlMs
        });

        console.log(`[BackendStudentSync] ✅ Found authoritative student in AWS RDS: ${authoritativeStudent.name} (Lang: ${authoritativeStudent.languageCode}, Payment: ${authoritativeStudent.rawPaymentStatus}, Enrolment: ${authoritativeStudent.enrollmentStatus})`);
        return authoritativeStudent;
      } else {
        console.log(`[BackendStudentSync] Student ${cleanFrom} not found in AWS RDS. Unregistered user.`);
        this.studentMemoryCache.set(cacheKey, { student: null, expiresAt: Date.now() + 10000 });
        return null;
      }
    } catch (dbErr) {
      console.warn(`[BackendStudentSync DB Warning] Direct RDS query error: ${dbErr.message}. Trying backend API.`);
    }

    try {
      const endpoint = `${this.backendBaseUrl}/internal/students/by-phone`;
      console.log(`[BackendStudentSync] Querying Common Backend for student: raw=${cleanFrom}, phone10=${phone10}`);

      const response = await axios.get(endpoint, {
        params: {
          raw_phone: cleanFrom,
          phone: phone10 || undefined
        },
        headers: {
          'x-service-key': this.internalServiceKey,
          'Accept': 'application/json'
        },
        timeout: 6000
      });

      if (response.data && response.data.success && response.data.student) {
        const s = response.data.student;
        const isFr = s.language === 'fr';
        const isPaid = (s.payment_status === 'Paid');

        // Check if student has existing module progress in local storage
        let localModule = 1;
        let localProgress = 0;
        let localCompleted = [];
        try {
          const localList = googleSheetService.readLocalStudents();
          const localStudent = localList.find(ls => 
            googleSheetService.phonesMatch(ls.phone, s.phone_number) || 
            googleSheetService.phonesMatch(ls.phone, cleanFrom)
          );
          if (localStudent) {
            localModule = localStudent.currentModule || 1;
            localProgress = localStudent.progressSeconds || 0;
            localCompleted = localStudent.completedModules || [];
          }
        } catch (_) {}

        const authoritativeStudent = {
          registrationId: s.registration_id,
          name: s.full_name || 'Student',
          phone: s.phone_number,
          countryCode: s.country_code,
          course: s.course_name,
          paymentStatus: isPaid ? 'yes' : 'no',
          rawPaymentStatus: s.payment_status,
          enrollmentStatus: s.enrollment_status,
          language: isFr ? 'français' : 'english',
          languageCode: s.language || 'en',
          registeredAt: s.registered_at,
          currentModule: Math.max(1, Math.min(6, Number(localModule || 1))),
          progressSeconds: Number(localProgress || 0),
          completedModules: Array.isArray(localCompleted) ? localCompleted : []
        };

        // Update memory cache
        this.studentMemoryCache.set(cacheKey, {
          student: authoritativeStudent,
          expiresAt: Date.now() + this.cacheTtlMs
        });

        // Mirror to local student store for local DRM and offline modules continuity
        try {
          googleSheetService.upsertLocalStudent({
            phone: s.phone_number,
            name: s.full_name,
            course: s.course_name,
            paymentStatus: isPaid ? 'yes' : 'no',
            language: isFr ? 'français' : 'english',
            languageCode: s.language,
            currentModule: authoritativeStudent.currentModule,
            progressSeconds: authoritativeStudent.progressSeconds,
            completedModules: authoritativeStudent.completedModules
          });
        } catch (_) {}

        console.log(`[BackendStudentSync] ✅ Found authoritative student: ${authoritativeStudent.name} (Lang: ${authoritativeStudent.languageCode}, Payment: ${authoritativeStudent.rawPaymentStatus}, Enrolment: ${authoritativeStudent.enrollmentStatus})`);
        return authoritativeStudent;
      }

      return null;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.log(`[BackendStudentSync] Student ${cleanFrom} not found in PostgreSQL. Unregistered user.`);
        this.studentMemoryCache.set(cacheKey, { student: null, expiresAt: Date.now() + 10000 });
        return null;
      }

      console.warn(`[BackendStudentSync Warning] Backend API request failed (${err.message}). Safe fallback handling.`);
      // If backend is down or unreachable, return null safely - NEVER grant false eligibility
      return null;
    }
  }

  /**
   * Process Registration Event from Common Backend
   * Ensures idempotency: events with same eventId or registrationId are never duplicated
   * 
   * @param {object} eventPayload 
   * @returns {{ success: boolean, duplicate: boolean, message: string }}
   */
  processRegistrationEvent(eventPayload) {
    const eventKey = eventPayload?.eventId || `reg_${eventPayload?.registrationId || eventPayload?.registration_id || eventPayload?.phone}`;
    
    if (this.processedEvents.has(eventKey)) {
      console.log(`[RegistrationEvent] Event ${eventKey} already processed. Dropping duplicate.`);
      return {
        success: true,
        duplicate: true,
        message: 'Duplicate event ignored'
      };
    }

    this.processedEvents.add(eventKey);

    // Keep event set bounded
    if (this.processedEvents.size > 10000) {
      const it = this.processedEvents.values();
      for (let i = 0; i < 2000; i++) this.processedEvents.delete(it.next().value);
    }

    // Invalidate student cache
    if (eventPayload?.phone) {
      this.clearCache(eventPayload.phone);
    }

    return {
      success: true,
      duplicate: false,
      message: 'Registration event ingested successfully'
    };
  }

  /**
   * Update student watch progress and immediately clear cache for real-time resume
   */
  updateProgress(rawPhone, updates = {}) {
    this.studentMemoryCache.clear();
    return googleSheetService.updateProgress(rawPhone, updates);
  }
}

module.exports = new BackendStudentService();
