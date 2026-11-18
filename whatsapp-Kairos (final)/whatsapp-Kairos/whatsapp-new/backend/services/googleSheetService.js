const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRd0Q04T_1K7DP2IrPcKfumWYTO5OX8spM6RYUPixBAJLVwqPWWTJeAtvf2R2X6doS_w/exec";

/**
 * Check if payment status represents a paid/completed status
 * Handles: yes, Yes, YES, paid, PAID, true, y, oui, done, success, completed
 */
function isPaymentYes(val) {
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  return (
    str === "yes" ||
    str === "y" ||
    str === "paid" ||
    str === "pay" ||
    str === "oui" ||
    str === "true" ||
    str === "1" ||
    str === "done" ||
    str === "success" ||
    str === "completed"
  );
}

/**
 * Check if language represents French / Français:
 * Handles: 'f', 'F', 'french', 'French', 'français', 'Français', 'francais', 'Francais', 'fr', 'FR'
 */
function isFrench(val) {
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  return (
    str === "f" ||
    str === "fr" ||
    str.startsWith("fr") ||
    str.includes("franc") ||
    str.includes("franç")
  );
}

function normalizeLanguage(val) {
  return isFrench(val) ? "français" : "english";
}

/**
 * High-concurrency queue to limit outgoing requests to Google Apps Script.
 * Prevents exceeding Google's hard limit of 30 concurrent executions.
 */
class ConcurrencyQueue {
  constructor(maxConcurrency = 10) {
    this.maxConcurrency = maxConcurrency;
    this.currentRunning = 0;
    this.queue = [];
  }

  async run(taskFn) {
    if (this.currentRunning < this.maxConcurrency) {
      this.currentRunning++;
      try {
        return await taskFn();
      } finally {
        this.currentRunning--;
        this.next();
      }
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
    });
  }

  next() {
    if (this.queue.length > 0 && this.currentRunning < this.maxConcurrency) {
      const { taskFn, resolve, reject } = this.queue.shift();
      this.currentRunning++;
      taskFn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.currentRunning--;
          this.next();
        });
    }
  }
}

/**
 * Service to synchronize Student Records with Google Sheets via:
 * 1. Google Apps Script Web App (Real-time bi-directional sync)
 * 2. Direct Google Sheet Public Export (Instant fallback if Apps Script has permission gate)
 * 3. Local JSON persistent store (data/students.json)
 */
class GoogleSheetService {
  constructor() {
    this.scriptUrl = process.env.GOOGLE_SHEET_SCRIPT_URL || DEFAULT_SCRIPT_URL;
    this.sheetUrl = process.env.GOOGLE_SHEET_URL || "";
    this.localStorePath = path.join(__dirname, "..", "data", "students.json");
    this.studentMemoryCache = new Map();
    this.cacheTtlMs = 30000; // 30-second TTL for high-concurrency 100+ users
    this.requestQueue = new ConcurrencyQueue(10); // Safely caps concurrent outgoing requests to Google Apps Script to 10
    this.pendingStudents = null;
    this.writeDebounceTimer = null;
    this.initLocalStore();
  }

  /**
   * Clear in-memory cache for a student or all students
   */
  clearCache(rawPhone) {
    if (rawPhone) {
      const phone = this.normalizePhone(rawPhone);
      this.studentMemoryCache.delete(phone);
    } else {
      this.studentMemoryCache.clear();
    }
  }

  /**
   * Normalize recipient phone number to the last 10 digits
   * e.g. "+91 96295-31891" -> "9629531891"
   */
  normalizePhone(phone) {
    if (!phone) return "";
    const digits = String(phone).replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  /**
   * Check if two phone numbers match (handles country codes, leading zeros, formatting)
   */
  phonesMatch(phoneA, phoneB) {
    if (!phoneA || !phoneB) return false;
    const digA = String(phoneA).replace(/\D/g, "");
    const digB = String(phoneB).replace(/\D/g, "");
    if (!digA || !digB) return false;
    if (digA === digB) return true;
    const normA = digA.length >= 10 ? digA.slice(-10) : digA;
    const normB = digB.length >= 10 ? digB.slice(-10) : digB;
    return normA === normB || digA.endsWith(normB) || digB.endsWith(normA);
  }

  /**
   * Check if language string represents French / Français
   */
  isFrench(val) {
    return isFrench(val);
  }

  normalizeLanguage(val) {
    return normalizeLanguage(val);
  }

  getLanguageCode(val) {
    return isFrench(val) ? "fr" : "en";
  }

  /**
   * Extract Google Spreadsheet ID from a standard URL if provided
   */
  extractSheetId(url) {
    if (!url) return null;
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Initialize local students JSON file if absent
   */
  initLocalStore() {
    try {
      const dir = path.dirname(this.localStorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.localStorePath)) {
        fs.writeFileSync(this.localStorePath, "[]", "utf8");
      }
    } catch (err) {
      console.error("[GoogleSheetService] Error initializing local store:", err.message);
    }
  }

  /**
   * Read all students from local JSON store
   */
  readLocalStudents() {
    if (this.pendingStudents) return this.pendingStudents;
    try {
      this.initLocalStore();
      const content = fs.readFileSync(this.localStorePath, "utf8");
      this.pendingStudents = JSON.parse(content || "[]");
      return this.pendingStudents;
    } catch (err) {
      console.error("[GoogleSheetService] Failed to read local store:", err.message);
      return [];
    }
  }

  /**
   * Save all students to local JSON store asynchronously with debouncing (non-blocking for 100+ concurrent users)
   */
  saveLocalStudents(students) {
    this.pendingStudents = students;
    if (this.writeDebounceTimer) return;
    this.writeDebounceTimer = setTimeout(() => {
      this.writeDebounceTimer = null;
      try {
        this.initLocalStore();
        fs.writeFile(this.localStorePath, JSON.stringify(this.pendingStudents, null, 2), "utf8", (err) => {
          if (err) console.error("[GoogleSheetService] Async save error:", err.message);
        });
      } catch (err) {
        console.error("[GoogleSheetService] Failed to save local store:", err.message);
      }
    }, 1000);
  }

  /**
   * Query direct Google Sheet CSV export if public URL/ID is provided
   */
  async fetchFromDirectSheetCsv(phone) {
    const rawUrl = process.env.GOOGLE_SHEET_URL || this.sheetUrl;
    const sheetId = this.extractSheetId(rawUrl) || process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return null;

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      console.log(`[GoogleSheetSync] Querying direct Google Sheet CSV for student: ${phone}`);
      const response = await axios.get(csvUrl, { timeout: 6000 });
      if (!response.data || typeof response.data !== "string") return null;

      // Parse CSV rows
      const lines = response.data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return null;

      // Extract headers
      const headers = lines[0].split(",").map(h => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
      const colName = headers.findIndex(h => h.includes("name"));
      const colPhone = headers.findIndex(h => h.includes("number") || h.includes("phone") || h.includes("mobile"));
      const colCourse = headers.findIndex(h => h.includes("course"));
      const colPay = headers.findIndex(h => h.includes("payment"));
      const colLang = headers.findIndex(h => h.includes("language") || h.includes("lang"));
      const colModule = headers.findIndex(h => h.includes("current module") || h.includes("module"));
      const colProgress = headers.findIndex(h => h.includes("progress"));

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",").map(c => c.replace(/^["']|["']$/g, "").trim());
        const rowPhone = colPhone !== -1 ? row[colPhone] : "";
        if (this.phonesMatch(rowPhone, phone)) {
          const rowPay = colPay !== -1 ? row[colPay] : "";
          const rowLang = colLang !== -1 ? row[colLang] : "";
          const isPaid = isPaymentYes(rowPay);
          const isFr = this.isFrench(rowLang);
          const studentObj = {
            name: colName !== -1 && row[colName] ? row[colName] : "Student",
            phone: this.normalizePhone(rowPhone || phone),
            course: colCourse !== -1 && row[colCourse] ? row[colCourse] : (isFr ? "Cours de Réussite Commerciale" : "Business Success Class"),
            paymentStatus: isPaid ? "yes" : "no",
            language: isFr ? "français" : "english",
            languageCode: isFr ? "fr" : "en",
            currentModule: colModule !== -1 && !isNaN(row[colModule]) ? Number(row[colModule]) : 1,
            progressSeconds: colProgress !== -1 && !isNaN(row[colProgress]) ? Number(row[colProgress]) : 0,
            completedModules: []
          };
          this.upsertLocalStudent(studentObj);
          console.log(`[GoogleSheetSync CSV] Found student: ${studentObj.name} (Payment: ${studentObj.paymentStatus}, Lang: ${studentObj.language})`);
          return studentObj;
        }
      }
    } catch (csvErr) {
      // Non-critical, continue to next fallback
    }
    return null;
  }

  /**
   * Fetch a student record by phone number in REAL TIME
   * Checks Google Apps Script ➡️ Direct Sheet CSV ➡️ Local database
   * 
   * @param {string} rawPhone Incoming phone number
   * @returns {Promise<{name: string, phone: string, course: string, paymentStatus: string, progressSeconds: number, currentModule: number, completedModules: Array<number>}|null>}
   */
  async getStudent(rawPhone) {
    const phone = this.normalizePhone(rawPhone);
    if (!phone) return null;

    // 0. High-Speed In-Memory Cache (30s TTL) - Protects Google Apps Script from 100+ concurrent message spikes
    const cached = this.studentMemoryCache.get(phone);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.student;
    }

    const scriptUrl = process.env.GOOGLE_SHEET_SCRIPT_URL || this.scriptUrl;

    // 1. Attempt Google Apps Script request in real time
    if (scriptUrl && scriptUrl.startsWith("http")) {
      try {
        console.log(`[GoogleSheetSync] Querying Google Apps Script for student: ${phone}`);
        
        // Query via concurrency queue (max 10 concurrent requests to Google Apps Script)
        let response = await this.requestQueue.run(async () => {
          try {
            return await axios.post(
              scriptUrl,
              { action: "getStudent", phone: phone },
              { headers: { "Content-Type": "application/json" }, timeout: 8000, maxRedirects: 5 }
            );
          } catch (postErr) {
            return await axios.get(scriptUrl, {
              params: { action: "getStudent", phone: phone },
              timeout: 8000,
              maxRedirects: 5
            });
          }
        });

        if (typeof response.data === "string" && response.data.trim().startsWith("<")) {
          console.warn("[GoogleSheetSync Warning] Google Apps Script returned a Google Login page. Please ensure in Apps Script deployment: 'Who has access' is set to 'Anyone' (NOT 'Only myself'). Using direct sheet / local fallback.");
        } else if (response.data && response.data.success && response.data.student) {
          const s = response.data.student;
          const isPaid = isPaymentYes(s.paymentStatus);
          const isFr = this.isFrench(s.language);
          const formatted = {
            name: s.name || "Student",
            phone: this.normalizePhone(s.phone || phone),
            course: s.course || (isFr ? "Cours de Réussite Commerciale" : "Business Success Class"),
            paymentStatus: isPaid ? "yes" : "no",
            language: isFr ? "français" : "english",
            languageCode: isFr ? "fr" : "en",
            progressSeconds: Number(s.progressSeconds || 0),
            currentModule: Math.max(1, Math.min(6, Number(s.currentModule || 1))),
            completedModules: Array.isArray(s.completedModules)
              ? s.completedModules.map(Number)
              : typeof s.completedModules === "string" && s.completedModules.trim()
                ? s.completedModules.split(",").map(m => Number(m.trim())).filter(n => !isNaN(n))
                : []
          };

          // Cache update locally & in-memory
          this.upsertLocalStudent(formatted);
          this.studentMemoryCache.set(phone, {
            student: formatted,
            expiresAt: Date.now() + this.cacheTtlMs
          });
          console.log(`[GoogleSheetSync] Real-time student verified from Google Sheet: ${formatted.name} (Payment: ${formatted.paymentStatus}, Lang: ${formatted.language})`);
          return formatted;
        } else if (response.data && response.data.success === false) {
          console.log(`[GoogleSheetSync] Student ${phone} is NOT in Google Sheet. Unregistered user.`);
          this.studentMemoryCache.set(phone, {
            student: null,
            expiresAt: Date.now() + 15000
          });
          return null;
        }
      } catch (err) {
        console.warn(`[GoogleSheetSync Warning] Google Apps Script request failed (${err.message}).`);
      }
    }

    // 2. Attempt Direct Public Sheet CSV if configured
    const csvStudent = await this.fetchFromDirectSheetCsv(phone);
    if (csvStudent) {
      return csvStudent;
    }

    // Student not found anywhere in Google Sheet -> return null for Unregistered Flow
    return null;
  }

  /**
   * Update student watch duration and module completion in real time
   * 
   * @param {string} rawPhone 
   * @param {object} updates { progressSeconds, currentModule, completedModules, paymentStatus }
   */
  async updateProgress(rawPhone, updates = {}) {
    const phone = this.normalizePhone(rawPhone);
    if (!phone) return null;

    // 1. Invalidate/update memory cache immediately so next read is instant
    const cached = this.studentMemoryCache.get(phone);
    if (cached && cached.student) {
      Object.assign(cached.student, updates);
      cached.expiresAt = Date.now() + this.cacheTtlMs;
    } else {
      this.studentMemoryCache.delete(phone);
    }

    // 2. Update local cache immediately
    const updatedLocal = this.upsertLocalStudent({ phone, ...updates });

    // 3. Dispatch to Google Apps Script asynchronously via concurrency queue
    const scriptUrl = process.env.GOOGLE_SHEET_SCRIPT_URL || this.scriptUrl;
    if (scriptUrl && scriptUrl.startsWith("http")) {
      const payload = {
        action: "updateProgress",
        phone: phone,
        progressSeconds: updates.progressSeconds,
        currentModule: updates.currentModule,
        completedModules: updates.completedModules ? updates.completedModules.join(",") : undefined,
        paymentStatus: updates.paymentStatus
      };

      this.requestQueue.run(async () => {
        try {
          await axios.post(scriptUrl, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 6000,
            maxRedirects: 5
          });
          console.log(`[GoogleSheetSync] Real-time progress updated in Google Sheet for ${phone}`);
        } catch (err) {
          try {
            await axios.get(scriptUrl, {
              params: payload,
              timeout: 6000,
              maxRedirects: 5
            });
            console.log(`[GoogleSheetSync GET Fallback] Progress updated for ${phone}`);
          } catch (getErr) {
            console.warn(`[GoogleSheetSync Warning] Failed to update Google Sheet: ${err.message}. Local store updated.`);
          }
        }
      });
    }

    return updatedLocal;
  }

  /**
   * Upsert a student record in the local JSON cache
   */
  upsertLocalStudent(studentData) {
    if (!studentData || !studentData.phone) return null;
    const phone = this.normalizePhone(studentData.phone);
    const students = this.readLocalStudents();

    const idx = students.findIndex(s => this.phonesMatch(s.phone, phone));
    let updated;

    if (idx !== -1) {
      const existing = students[idx];
      const rawLang = studentData.language !== undefined ? studentData.language : (existing.language || "english");
      const isFr = this.isFrench(rawLang);
      updated = {
        ...existing,
        ...studentData,
        phone: phone,
        language: isFr ? "français" : "english",
        languageCode: isFr ? "fr" : "en",
        paymentStatus: isPaymentYes(studentData.paymentStatus !== undefined ? studentData.paymentStatus : existing.paymentStatus) ? "yes" : "no",
        lastUpdated: new Date().toISOString()
      };
      students[idx] = updated;
    } else {
      const isFr = this.isFrench(studentData.language);
      updated = {
        phone: phone,
        name: studentData.name || "Student",
        course: studentData.course || (isFr ? "Cours de Réussite Commerciale" : "Business Success Class"),
        paymentStatus: isPaymentYes(studentData.paymentStatus) ? "yes" : "no",
        language: isFr ? "français" : "english",
        languageCode: isFr ? "fr" : "en",
        currentModule: studentData.currentModule || 1,
        progressSeconds: studentData.progressSeconds || 0,
        completedModules: studentData.completedModules || [],
        lastUpdated: new Date().toISOString()
      };
      students.push(updated);
    }

    this.saveLocalStudents(students);
    return updated;
  }
}

module.exports = new GoogleSheetService();
