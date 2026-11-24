const path = require("path");
const fs = require("fs");
const googleSheetService = require("./googleSheetService");
const drmService = require("./drmService");
const whatsappService = require("./whatsappService");
const conversationState = require("../utils/conversationState");
const backendStudentService = require("./backendStudentService");

/**
 * Format seconds into MM:SS format
 */
function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Resolve public media URL for posters, videos, and images
 */
function getPosterUrl(filename = "class_img_english.jpeg") {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_BASE_URL || "https://kairos-whatsapp-bot-cy5w.onrender.com";
  return `${baseUrl}/media/${filename}`;
}

/**
 * Format student name with proper Title Case
 */
function formatStudentName(name) {
  if (!name) return "Student";
  const trimmed = String(name).trim();
  return trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Format course name cleanly based on language
 */
function getCourseName(course, lang = "en") {
  const isFr = lang === "fr" || (typeof lang === "string" && (lang.toLowerCase().startsWith("fr") || lang.toLowerCase() === "f"));
  const str = String(course || "").trim();
  const lower = str.toLowerCase();

  // 1. SME Financial Empowerment & Formalization Program (NEFA)
  if (
    lower.includes("sme") ||
    lower.includes("financial empowerment") ||
    lower.includes("formalization") ||
    lower.includes("formalisation") ||
    lower.includes("autonomisation") ||
    lower.includes("pme") ||
    lower.includes("fe and sme") ||
    lower.includes("fe & sme") ||
    lower.includes("feandsme")
  ) {
    return isFr
      ? "Programme d'Autonomisation Financière et de Formalisation des PME"
      : "SME Financial Empowerment & Formalization Program";
  }

  // 2. Business Success Class
  if (
    !str ||
    lower.includes("business success") ||
    lower.includes("business sucess") ||
    lower.includes("réussite") ||
    lower.includes("reussite") ||
    lower.includes("commerce") ||
    lower.includes("commerciale")
  ) {
    return isFr
      ? "Cours de Réussite Commerciale"
      : "Business Success Class";
  }

  // 3. Fallback for custom course names
  if (isFr) {
    if (lower.startsWith("cours de") || lower.startsWith("programme d'") || lower.startsWith("programme de")) {
      return str;
    }
    return `Programme ${str}`;
  }

  if (lower.includes("class") || lower.includes("program") || lower.includes("course")) {
    return str;
  }
  return `${str} Class`;
}

/**
 * Format a clean, concise header title under 60 chars for WhatsApp interactive buttons
 */
function getCourseHeaderTitle(currentMod, course, lang = "en") {
  const isFr = lang === "fr" || (typeof lang === "string" && (lang.toLowerCase().startsWith("fr") || lang.toLowerCase() === "f"));
  const str = String(course || "").trim();
  const lower = str.toLowerCase();

  if (
    lower.includes("sme") ||
    lower.includes("financial empowerment") ||
    lower.includes("formalization") ||
    lower.includes("formalisation") ||
    lower.includes("autonomisation") ||
    lower.includes("pme") ||
    lower.includes("fe and sme") ||
    lower.includes("fe & sme") ||
    lower.includes("feandsme")
  ) {
    return isFr
      ? `🎬 Module ${currentMod} : Autonomisation des PME`
      : `🎬 Module ${currentMod}: SME Financial Empowerment`;
  }

  if (
    !str ||
    lower.includes("business success") ||
    lower.includes("business sucess") ||
    lower.includes("réussite") ||
    lower.includes("reussite")
  ) {
    return isFr
      ? `🎬 Module ${currentMod} : Réussite Commerciale`
      : `🎬 Module ${currentMod}: Business Success Class`;
  }

  const shortCourse = str.length > 30 ? str.slice(0, 27) + "..." : str;
  return `🎬 Module ${currentMod}: ${shortCourse}`;
}

/**
 * Syllabus information for the 6 course units in Module 1 in perfect order
 */
const COURSE_SYLLABUS = [
  { module: 1, unit: 1, title: "Unit 1: Market Research & Idea Validation", duration: "05:14" },
  { module: 1, unit: 2, title: "Unit 2: Financial Literacy & Cash Flow", duration: "04:02" },
  { module: 1, unit: 3, title: "Unit 3: Customer Acquisition & Sales Strategy", duration: "04:12" },
  { module: 1, unit: 4, title: "Unit 4: Digital Marketing & WhatsApp Growth", duration: "05:54" },
  { module: 1, unit: 5, title: "Unit 5: Operations & Inventory Management", duration: "05:18" },
  { module: 1, unit: 6, title: "Unit 6: Scaling & Business Growth", duration: "04:52" }
];

const COURSE_SYLLABUS_FR = [
  { module: 1, unit: 1, title: "Unité 1 : Étude de Marché et Validation d'Idée", duration: "05:16" },
  { module: 1, unit: 2, title: "Unité 2 : Gestion Financière et Flux de Trésorerie", duration: "04:00" },
  { module: 1, unit: 3, title: "Unité 3 : Stratégie de Vente et Acquisition Client", duration: "04:22" },
  { module: 1, unit: 4, title: "Unité 4 : Marketing Digital et Croissance WhatsApp", duration: "06:14" },
  { module: 1, unit: 5, title: "Unité 5 : Gestion des Opérations et des Stocks", duration: "05:12" },
  { module: 1, unit: 6, title: "Unité 6 : Stratégies de Croissance et Expansion", duration: "05:04" }
];

/**
 * Main Chatbot Engine & Access Control Router
 * Handles Scenario A (Unregistered), Scenario B (Unpaid), Scenario C (Paid)
 * 
 * @param {string} from WhatsApp sender phone number
 * @param {string} userMessage Raw text message
 * @param {string|null} buttonId Interactive button ID if clicked
 * @param {string} messageId Meta incoming message ID
 * @returns {Promise<Array<object>>} Sequence of messages to dispatch
 */
async function processMessage(from, userMessage = "", buttonId = null, messageId = null) {
  const text = (userMessage || "").trim();
  const clean = text.toLowerCase();
  const phone10 = googleSheetService.normalizePhone(from);
  const serverBase = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_BASE_URL || "https://kairos-whatsapp-bot-cy5w.onrender.com";

  console.log(`[ChatbotEngine] Processing message from +${from} (Phone10: ${phone10}) | Input: "${text}" | Button: ${buttonId || "none"}`);

  // Fetch or initialize persistent conversation state
  const session = conversationState.getConversationState(phone10) || {};
  let userLang = session.language || "en";
  let unregStep = session.unregisteredStep || "IDLE";

  // Check language hints from current input
  if (buttonId === "lang_en" || clean === "english" || clean === "en") {
    userLang = "en";
  } else if (buttonId === "lang_fr" || clean === "français" || clean === "francais" || clean === "fr" || clean === "french") {
    userLang = "fr";
  } else if (clean.includes("j'accepte") || clean.includes("soumis") || clean.includes("bonjour")) {
    userLang = "fr";
  }

  // Fetch student status from Authoritative Database (AWS RDS PostgreSQL)
  let student = await backendStudentService.getStudent(from, phone10);

  // If student is registered, authoritative language from PostgreSQL is the single source of truth
  if (student && (student.languageCode || student.language)) {
    userLang = (student.languageCode === "fr" || googleSheetService.isFrench(student.language)) ? "fr" : "en";
  }

  const isPaidStudent = student && student.paymentStatus === "yes";

  // Check if incoming message is an onboarding interaction
  const isOnboardingAction =
    buttonId === "lang_en" ||
    buttonId === "lang_fr" ||
    buttonId === "accept_intro" ||
    buttonId === "agree" ||
    buttonId === "accept_register" ||
    buttonId === "sub_accept" ||
    buttonId === "reg_submitted" ||
    buttonId === "form_submitted" ||
    buttonId === "check_reg" ||
    buttonId === "lang_picker" ||
    clean === "english" ||
    clean === "en" ||
    clean === "français" ||
    clean === "francais" ||
    clean === "fr" ||
    clean === "french" ||
    clean === "i accept" ||
    clean === "j'accepte" ||
    clean === "accept" ||
    clean === "accepte" ||
    clean.includes("submitted") ||
    clean.includes("soumis");

  // =========================================================================
  // SCENARIO A: ONBOARDING & INTRODUCTORY FLOW (English & French)
  // Perfectly matches user screenshots:
  // Step 1: Greeting & Language Picker ([English], [Français])
  // Step 2: Poster + "Take the introductory course for free..." ([I accept])
  // Step 3: Video + "Would you like to register for our course?" ([I accept])
  // Step 4: Registration form link + ([Submitted ✅])
  // =========================================================================
  if (!student || isOnboardingAction) {
    console.log(`[ChatbotEngine] Onboarding flow active (+${from}, Phone10: ${phone10}, Step: ${unregStep}, Lang: ${userLang})`);

    // --- STEP 5: REGISTRATION SUBMITTED CHECK ---
    // User taps "Submitted ✅" or "Soumis ✅"
    if (
      buttonId === "reg_submitted" ||
      buttonId === "form_submitted" ||
      buttonId === "check_reg" ||
      clean.includes("submitted") ||
      clean.includes("soumis") ||
      clean.includes("i registered") ||
      clean.includes("i have registered") ||
      clean.includes("je suis inscrit")
    ) {
      let recheckedStudent = await backendStudentService.getStudent(from, phone10);
      if (recheckedStudent) {
        conversationState.updateConversationState(phone10, { unregisteredStep: "IDLE", language: userLang });
        return processStudentAccess(recheckedStudent, from, clean, buttonId, serverBase, userLang);
      }

      if (userLang === "fr") {
        return [
          {
            type: "text",
            text: `⏳ *Vérification de l'inscription...*\n\nNous n'avons pas encore reçu votre inscription pour le *+${phone10}* dans notre base de données.\n\nSi vous venez de soumettre le formulaire, veuillez patienter 30 secondes et appuyer à nouveau sur *Soumis ✅* ci-dessous !\n\nLien du formulaire :\n👉 https://fer-form.web.app`
          },
          {
            type: "button",
            body: "Avez-vous complété le formulaire d'inscription ?",
            buttons: [
              { id: "reg_submitted", title: "Soumis ✅" },
              { id: "lang_picker", title: "🌐 Langue / Lang" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "text",
          text: `⏳ *Checking Registration...*\n\nWe haven't received your registration record yet for *+${phone10}* in our database.\n\nIf you just submitted the form, please wait 30 seconds and tap *Submitted ✅* again below!\n\nForm link:\n👉 https://english-form.web.app`
        },
        {
          type: "button",
          body: "Have you completed the registration form?",
          buttons: [
            { id: "reg_submitted", title: "Submitted ✅" },
            { id: "lang_picker", title: "🌐 Language" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // --- STEP 4: REGISTRATION FORM OFFER ---
    // User taps "I accept" / "J'accepte" on "Would you like to register for our course?"
    if (
      buttonId === "accept_register" ||
      buttonId === "sub_accept" ||
      (unregStep === "WATCHING_FREE_INTRO" && (
        clean === "i accept" || clean === "j'accepte" || clean === "accept" || clean === "accepte" || clean === "yes" || clean === "oui" || clean.includes("register") || clean.includes("inscri")
      ))
    ) {
      const isFr = userLang === "fr" || clean.includes("j'accepte") || clean.includes("inscri");
      const lang = isFr ? "fr" : "en";
      conversationState.updateConversationState(phone10, { language: lang, unregisteredStep: "AWAITING_REGISTRATION" });

      if (isFr) {
        return [
          {
            type: "button",
            body: "Super ! Veuillez remplir le formulaire d'inscription pour vous inscrire à notre cours :\n\n👉 https://fer-form.web.app\n\nUne fois soumis, revenez ici et appuyez ci-dessous !",
            buttons: [
              { id: "reg_submitted", title: "Soumis ✅" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "button",
          body: "Great! Please fill out the registration form to enroll in our course:\n\n👉 https://english-form.web.app\n\nOnce submitted, return here and tap below!",
          buttons: [
            { id: "reg_submitted", title: "Submitted ✅" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // Handle "done" after watching free video
    if (unregStep === "WATCHING_FREE_INTRO" && (clean === "done" || clean === "fait" || clean === "vu" || clean === "next")) {
      const isFr = userLang === "fr";
      return [
        {
          type: "button",
          body: isFr ? "Souhaitez-vous vous inscrire à notre cours ?" : "Would you like to register for our course?",
          buttons: [
            { id: "accept_register", title: isFr ? "J'accepte" : "I accept" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // --- STEP 3: FREE INTRO VIDEO & REGISTER PROMPT ---
    // User taps "I accept" / "J'accepte" on "Take the introductory course for free..."
    if (
      buttonId === "accept_intro" ||
      buttonId === "agree" ||
      unregStep === "INTRO_OFFERED" ||
      clean === "i accept" ||
      clean === "j'accepte" ||
      clean === "accept" ||
      clean === "accepte" ||
      clean === "yes" ||
      clean === "oui" ||
      clean === "ok" ||
      clean === "d'accord"
    ) {
      const isFr = userLang === "fr" || clean.includes("j'accepte") || clean.includes("oui") || clean.includes("d'accord");
      const lang = isFr ? "fr" : "en";
      conversationState.updateConversationState(phone10, { language: lang, unregisteredStep: "WATCHING_FREE_INTRO" });

      if (isFr) {
        return [
          {
            type: "video",
            url: getPosterUrl("french.mp4"),
            caption: "Commencer gratuitement"
          },
          {
            type: "button",
            body: "Souhaitez-vous vous inscrire à notre cours ?",
            buttons: [
              { id: "accept_register", title: "J'accepte" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "video",
          url: getPosterUrl("english_promo.mp4"),
          caption: "Start for free"
        },
        {
          type: "button",
          body: "Would you like to register for our course?",
          buttons: [
            { id: "accept_register", title: "I accept" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // --- STEP 2: LANGUAGE SELECTED (English or Français) ---
    // User taps "English" or "Français"
    if (
      buttonId === "lang_en" ||
      buttonId === "lang_fr" ||
      clean === "english" ||
      clean === "en" ||
      clean === "français" ||
      clean === "francais" ||
      clean === "fr" ||
      clean === "french"
    ) {
      const isFr = buttonId === "lang_fr" || clean === "français" || clean === "francais" || clean === "fr" || clean === "french";
      const lang = isFr ? "fr" : "en";
      conversationState.updateConversationState(phone10, { language: lang, unregisteredStep: "INTRO_OFFERED" });

      if (isFr) {
        return [
          {
            type: "text",
            text: "Bienvenue sur Kairos – Votre professeur préféré."
          },
          {
            type: "image",
            url: getPosterUrl("programme_poster.jpg"),
            caption: "Bienvenue sur Kairos – Votre professeur préféré."
          },
          {
            type: "button",
            body: "Suivez gratuitement le cours d'introduction et commencez votre parcours vers la réussite commerciale.",
            buttons: [
              { id: "accept_intro", title: "J'accepte" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "image",
          url: getPosterUrl("programme_poster_english.jpg"),
          caption: "Welcome to Kairos - Your favorite teacher."
        },
        {
          type: "button",
          body: "Take the introductory course for free and start your journey to business success.",
          buttons: [
            { id: "accept_intro", title: "I accept" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // Course info shortcut for unregistered users
    if (buttonId === "course_info" || clean.includes("course info") || clean.includes("syllabus")) {
      const isFr = userLang === "fr";
      const syllabus = isFr ? COURSE_SYLLABUS_FR : COURSE_SYLLABUS;
      return [
        {
          type: "text",
          text: isFr
            ? `🎓 *Présentation du cours de Réussite Commerciale - Module 1*\n\nNotre formation comprend 6 unités vidéo complètes :\n\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\n✨ Complétez les 6 unités sur WhatsApp pour obtenir votre certificat officiel !`
            : `🎓 *Certified Business Success Class Overview - Module 1*\n\nOur complete course includes 6 comprehensive video units:\n\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\n✨ Complete all 6 units on WhatsApp to earn your verified certificate!`
        },
        {
          type: "button",
          body: isFr ? "Veuillez sélectionner votre langue :" : "Please select your language:",
          buttons: [
            { id: "lang_en", title: "English" },
            { id: "lang_fr", title: "Français" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // --- STEP 1: INITIAL GREETING & LANGUAGE PICKER (Matches Screenshot 1 Exactly) ---
    // Triggered by "hi", "hello", "bonjour", "start", or any initial message
    conversationState.updateConversationState(phone10, { unregisteredStep: "AWAITING_LANG" });
    return [
      {
        type: "text",
        text: "Welcome to Kairos\nBienvenue sur Kairos"
      },
      {
        type: "button",
        body: "Please select your language\nVeuillez sélectionner votre langue",
        buttons: [
          { id: "lang_en", title: "English" },
          { id: "lang_fr", title: "Français" }
        ],
        footer: "Kairos"
      }
    ];
  }

  // Handle Registered Students (Scenario B or Scenario C)
  return processStudentAccess(student, from, clean, buttonId, serverBase, userLang);
}

/**
 * Handle Registered Student Logic (Scenario B: Unpaid vs Scenario C: Paid)
 */
async function processStudentAccess(student, from, clean, buttonId, serverBase, lang = "en") {
  const phone10 = student.phone;
  const isPaid = student.paymentStatus === "yes";
  const userLang = (student.language && googleSheetService.isFrench(student.language))
    ? "fr"
    : (lang === "fr" || googleSheetService.isFrench(lang)) ? "fr" : "en";
  const isFr = userLang === "fr";
  const courseName = getCourseName(student.course, userLang);

  // =========================================================================
  // SCENARIO B: REGISTERED BUT UNPAID STUDENT (paymentStatus !== 'yes')
  // Show only the "Classroom Access Locked" message alone - no next steps/buttons
  // =========================================================================
  if (!isPaid) {
    console.log(`[ChatbotEngine] Scenario B: Unpaid student (${student.name}, +${phone10}, Lang: ${userLang})`);
    return buildUnpaidStudentMenu(student, from, serverBase, userLang);
  }

  // =========================================================================
  // SCENARIO C: PAID STUDENT (paymentStatus === 'yes')
  // Matches User Screenshots 1, 2, 3, 4 with DRM Protection
  // =========================================================================
  console.log(`[ChatbotEngine] Scenario C: Paid student active (${student.name}, Module ${student.currentModule}, Progress: ${student.progressSeconds}s, Lang: ${userLang})`);

  const currentMod = Math.max(1, Math.min(6, student.currentModule || 1));
  const progressSec = student.progressSeconds || 0;
  const progressTime = formatTime(progressSec);

  // Action: [▶️ Start Class] / [▶️ Commencer]
  if (
    buttonId === "start_class" ||
    clean === "start class" ||
    clean === "resume" ||
    clean === "start" ||
    clean === "class" ||
    clean === "open" ||
    clean === "attend" ||
    clean.includes("commencer") ||
    clean.includes("continuer")
  ) {
    const studentName = formatStudentName(student.name);

    // Generate secure DRM session bound to student
    const sessionData = drmService.createSession({
      phone: from || phone10,
      name: studentName,
      course: courseName,
      module: currentMod,
      progressSeconds: progressSec,
      language: isFr ? "fr" : "en"
    });

    const classroomUrl = `${serverBase}/classroom/${sessionData.sessionId}`;

    const unitsList = isFr
      ? `📚 Unités du Module 1 :\n• Unité 1 : Étude de Marché et Validation d'Idée\n• Unité 2 : Gestion Financière et Flux de Trésorerie\n• Unité 3 : Stratégie de Vente et Acquisition Client\n• Unité 4 : Marketing Digital et Croissance WhatsApp\n• Unité 5 : Gestion des Opérations et des Stocks\n• Unité 6 : Stratégies de Croissance et Expansion`
      : `📚 Module 1 Units:\n• Unit 1: Market Research & Idea Validation\n• Unit 2: Financial Literacy & Cash Flow\n• Unit 3: Customer Acquisition & Sales Strategy\n• Unit 4: Digital Marketing & WhatsApp Growth\n• Unit 5: Operations & Inventory Management\n• Unit 6: Scaling & Business Growth`;

    const resumeLine = progressSec > 0
      ? (isFr ? `▶️ Reprise du Module ${currentMod} à : ${progressTime}` : `▶️ Resuming Module ${currentMod} from: ${progressTime}`)
      : (isFr ? `▶️ Démarrage du Module ${currentMod} à : 00:00` : `▶️ Starting Module ${currentMod} from: 00:00`);

    const headerTitle = getCourseHeaderTitle(currentMod, student.course, userLang);

    const bodyText = isFr
      ? `Bonjour ${studentName} !\n\nVotre salle de classe pour le ${courseName} - Module ${currentMod} est prête.\n\n${unitsList}\n\n${resumeLine}\n\nAppuyez sur le bouton ci-dessous pour démarrer votre cours :`
      : `Hello ${studentName}!\n\nYour ${courseName} - Module ${currentMod} classroom is ready.\n\n${unitsList}\n\n${resumeLine}\n\nTap the button below to start your class:`;

    const buttonLabel = isFr ? `▶️ Ouvrir Module ${currentMod}` : `▶️ Open Module ${currentMod}`;

    return [
      {
        type: "cta_url",
        header: headerTitle,
        body: bodyText,
        buttonText: buttonLabel,
        url: classroomUrl,
        footer: "Kairos"
      }
    ];
  }

  // Action: [🔄 Start from 00:00] / [🔄 Depuis 00:00]
  if (
    buttonId === "start_fresh" ||
    clean.includes("00:00") ||
    clean.includes("start from 00:00") ||
    clean.includes("restart module") ||
    clean.includes("recommencer") ||
    clean.includes("depuis 00:00")
  ) {
    // Reset watch progress to 0 in Google Sheets & local cache
    await googleSheetService.updateProgress(phone10, {
      progressSeconds: 0,
      currentModule: currentMod
    });

    const sessionData = drmService.createSession({
      phone: from || phone10,
      name: student.name,
      course: courseName,
      module: currentMod,
      progressSeconds: 0,
      language: isFr ? "fr" : "en"
    });

    const classroomUrl = `${serverBase}/classroom/${sessionData.sessionId}?reset=1`;
    const headerTitle = getCourseHeaderTitle(currentMod, student.course, userLang);
    const bodyText = isFr
      ? `Bonjour ${student.name} !\n\nVotre salle de classe pour le ${courseName} - Module ${currentMod} est prête.\n\n${unitsList}\n\n▶️ Démarrage du Module ${currentMod} à : 00:00\n\nAppuyez sur le bouton ci-dessous pour démarrer votre cours :`
      : `Hello ${student.name}!\n\nYour ${courseName} - Module ${currentMod} classroom is ready.\n\n${unitsList}\n\n▶️ Starting Module ${currentMod} from: 00:00\n\nTap the button below to start your class:`;

    const buttonLabel = isFr ? `▶️ Ouvrir Module ${currentMod}` : `▶️ Open Module ${currentMod}`;

    return [
      {
        type: "cta_url",
        header: headerTitle,
        body: bodyText,
        buttonText: buttonLabel,
        url: classroomUrl,
        footer: "Kairos"
      }
    ];
  }

  // Action: [📋 Course Details] / [📋 Détails du cours]
  if (buttonId === "course_details" || clean.includes("course details") || clean.includes("progress") || clean.includes("détails")) {
    const progressCard = isFr
      ? `📋 *Détails du cours*\n\n` +
        `👤 *Étudiant :* ${student.name}\n` +
        `📚 *Formation :* ${courseName}\n` +
        `📍 *Leçon actuelle :* Module ${currentMod} sur 6\n` +
        `⏱️ *Temps enregistré :* ${progressTime}`
      : `📋 *Course Details*\n\n` +
        `👤 *Student:* ${student.name}\n` +
        `📚 *Topic:* ${courseName}\n` +
        `📍 *Current Lesson:* Module ${currentMod} of 6\n` +
        `⏱️ *Saved Progress:* ${progressTime}`;

    const btnStart = isFr ? "▶️ Commencer" : "▶️ Start Class";
    const btnFresh = isFr ? "🔄 Depuis 00:00" : "🔄 Start from 00:00";
    const btnSupport = isFr ? "📞 Assistance" : "📞 Support";

    return [
      {
        type: "text",
        text: progressCard
      },
      {
        type: "button",
        header: `Module ${currentMod}`,
        body: isFr ? `Prêt(e) à suivre votre cours pour le Module ${currentMod} ?` : `Ready to attend your class for Module ${currentMod}?`,
        buttons: [
          { id: "start_class", title: btnStart },
          { id: "start_fresh", title: btnFresh },
          { id: "contact_support", title: btnSupport }
        ],
        footer: "Kairos"
      }
    ];
  }

  // Action: [📞 Contact Support]
  if (buttonId === "contact_support" || clean.includes("support") || clean.includes("assistance")) {
    if (isFr) {
      return [
        {
          type: "text",
          text: `📞 *Support Étudiant Kairos*\n\nBonjour *${student.name}* !\nNos conseillers académiques sont à votre disposition 24/7 :\n\n• WhatsApp : +91 96295 31891\n• Email : academics@kairos-academy.org\n\nEnvoyez *Bonjour* à tout moment pour obtenir le lien de votre classe.`
        }
      ];
    }

    return [
      {
        type: "text",
        text: `📞 *Student Support Line*\n\nHello *${student.name}*!\nOur academic advisors and technical support are here 24/7:\n\n• WhatsApp: +91 96295 31891\n• Email: academics@kairos-academy.org\n\nReply *Hi* anytime to get your classroom link.`
      }
    ];
  }

  // Default Display for Scenario C (Paid Student) - Matches Screenshot 1
  return buildPaidStudentMenu(student, from, serverBase, userLang);
}

/**
 * Build the Scenario B Unpaid Student Message (Single locked notification, no next steps)
 */
function buildUnpaidStudentMenu(student, from, serverBase, lang = "en") {
  const isFr = lang === "fr";
  const courseName = getCourseName(student.course, lang);

  if (isFr) {
    return [
      {
        type: "text",
        text: `🔒 *Accès au cours verrouillé*\n\nBonjour *${student.name}* ! Vous êtes inscrit(e) à *${courseName}*.\n\n⚠️ *Veuillez effectuer le paiement pour continuer vos cours.*\n\nDès que votre paiement sera validé par notre équipe de paiement, vos cours vidéo seront instantanément accessibles.`
      }
    ];
  }

  return [
    {
      type: "text",
      text: `🔒 *Classroom Access Locked*\n\nHello *${student.name}*! You are registered for *${courseName}*.\n\n⚠️ *Please do payment to continue courses.*\n\nOnce your payment is verified by our payment staff, your video lessons will be instantly accessible.`
    }
  ];
}

/**
 * Build the Scenario C Paid Student Welcome & Access Menu
 * Matches User Screenshot 1 Exactly
 */
function buildPaidStudentMenu(student, from, serverBase, lang = "en") {
  const isFr = lang === "fr";
  const studentName = formatStudentName(student.name);
  const courseName = getCourseName(student.course, lang);
  const posterFilename = isFr ? "class_img_french.jpeg" : "class_img_english.jpeg";
  const posterUrl = getPosterUrl(posterFilename);

  const greetingBody = isFr
    ? `👋 Bonjour ${studentName} !\n\nC'est Kairos - Votre enseignant préféré. Commençons votre ${courseName}. Bon apprentissage !`
    : `👋 Hello ${studentName}!\n\nThis is Kairos - Your Favourite Teacher. Lets start your ${courseName}. Wish you a Happy Learning`;

  const btnStart = isFr ? "▶️ Commencer" : "▶️ Start Class";
  const btnFresh = isFr ? "🔄 Depuis 00:00" : "🔄 Start from 00:00";
  const btnDetails = isFr ? "📋 Détails" : "📋 Course Details";

  return [
    {
      type: "button",
      header: {
        type: "image",
        image: {
          link: posterUrl
        }
      },
      body: greetingBody,
      buttons: [
        { id: "start_class", title: btnStart },
        { id: "start_fresh", title: btnFresh },
        { id: "course_details", title: btnDetails }
      ],
      footer: "Kairos"
    }
  ];
}

module.exports = {
  processMessage,
  formatTime,
  getCourseName,
  getCourseHeaderTitle,
  COURSE_SYLLABUS,
  COURSE_SYLLABUS_FR
};
