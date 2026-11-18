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
 * Syllabus information for the 6 course modules in perfect order
 */
const COURSE_SYLLABUS = [
  { module: 1, title: "Module 1: Orientation & Core Fundamentals", duration: "18 mins" },
  { module: 2, title: "Module 2: Practical Skills & Strategy", duration: "24 mins" },
  { module: 3, title: "Module 3: Tools, Workflows & Implementation", duration: "22 mins" },
  { module: 4, title: "Module 4: Real-World Case Studies & Troubleshooting", duration: "28 mins" },
  { module: 5, title: "Module 5: Capstone Project & Best Practices", duration: "32 mins" },
  { module: 6, title: "Module 6: Final Assessment & Certification", duration: "20 mins" }
];

const COURSE_SYLLABUS_FR = [
  { module: 1, title: "Module 1 : Orientation et Fondamentaux", duration: "18 min" },
  { module: 2, title: "Module 2 : Compétences pratiques et Stratégie", duration: "24 min" },
  { module: 3, title: "Module 3 : Outils, Processus et Mise en œuvre", duration: "22 min" },
  { module: 4, title: "Module 4 : Études de cas réels et Solutions", duration: "28 min" },
  { module: 5, title: "Module 5 : Projet de synthèse et Bonnes pratiques", duration: "32 min" },
  { module: 6, title: "Module 6 : Évaluation finale et Certification", duration: "20 min" }
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

  // Fetch student status from Authoritative Common Backend (AWS RDS PostgreSQL)
  let student = await backendStudentService.getStudent(from, phone10);
  if (!student) {
    // Legacy Google Sheet fallback if student not yet migrated
    student = await googleSheetService.getStudent(phone10);
  }

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
  if (!isPaidStudent || isOnboardingAction) {
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
      if (!recheckedStudent) {
        recheckedStudent = await googleSheetService.getStudent(phone10);
      }
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
          url: getPosterUrl("kairos_english.mp4"),
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
          type: "text",
          text: "Welcome to Kairos – Your favorite teacher."
        },
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
            ? `🎓 *Présentation du cours de Réussite Commerciale*\n\nNotre formation comprend 6 modules complets :\n\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\n✨ Complétez les 6 modules sur WhatsApp pour obtenir votre certificat officiel !`
            : `🎓 *Certified Business Success Class Overview*\n\nOur complete course includes 6 comprehensive modules:\n\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\n✨ Complete all 6 modules on WhatsApp to earn your verified certificate!`
        },
        {
          type: "button",
          body: isFr ? "Choisissez votre langue pour commencer :" : "Pick your language to start:",
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
        body: "Pick your language\nChoisissez votre langue",
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
  // =========================================================================
  if (!isPaid) {
    console.log(`[ChatbotEngine] Scenario B: Unpaid student (${student.name}, +${phone10}, Lang: ${userLang})`);

    // Handle "Do Payment" button click
    if (buttonId === "do_payment" || clean.includes("payment") || clean.includes("pay") || clean.includes("payer")) {
      if (isFr) {
        return [
          {
            type: "text",
            text: `💳 *Options de paiement pour ${student.name}*\n\n📚 *Cours inscrit :* ${courseName}\n💵 *Tarif :* 29 $ USD (ou équivalent local)\n\n*Modes de paiement :*\n1. Mobile Money / Wave / Orange Money : +91 96295 31891\n2. Paiement par carte en ligne : https://reg-feandsme-sprout.web.app/pay\n\n_Après avoir effectué le paiement, cliquez sur 'Vérifier paiement' ci-dessous pour débloquer votre salle de classe !_`
          },
          {
            type: "button",
            header: "Vérification du paiement",
            body: "Avez-vous complété votre paiement ?",
            buttons: [
              { id: "check_payment", title: "✅ Vérifier paiement" },
              { id: "contact_support", title: "📞 Assistance" },
              { id: "course_details", title: "📋 Détails du cours" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "text",
          text: `💳 *Course Payment Options for ${student.name}*\n\n📚 *Enrolled Course:* ${courseName}\n💵 *Fee:* $29 USD (or local currency equivalent)\n\n*Payment Methods:*\n1. Mobile Money / PhonePe / GPay: +91 96295 31891\n2. Online Card Payment: https://english-form.web.app/pay\n\n_After completing payment, click 'Check Payment' below to instantly unlock your classroom!_`
        },
        {
          type: "button",
          header: "Payment Verification",
          body: "Have you completed your payment?",
          buttons: [
            { id: "check_payment", title: "✅ Check Payment" },
            { id: "contact_support", title: "📞 Contact Support" },
            { id: "course_details", title: "📋 Course Details" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // Handle "Check Payment" button click
    if (buttonId === "check_payment" || clean.includes("check payment") || clean.includes("i have paid") || clean.includes("vérifier paiement") || clean.includes("j'ai payé")) {
      let rechecked = await backendStudentService.getStudent(from, phone10);
      if (!rechecked) {
        rechecked = await googleSheetService.getStudent(phone10);
      }
      if (rechecked && rechecked.paymentStatus === "yes") {
        return buildPaidStudentMenu(rechecked, from, serverBase, userLang);
      }

      if (isFr) {
        return [
          {
            type: "text",
            text: `⏳ *Vérification du paiement en cours*\n\nNous vérifions actuellement votre paiement pour le *+${phone10}* dans notre fichier Google Sheets.\n\nSi vous avez effectué le transfert, veuillez patienter un instant ou contacter notre équipe d'assistance.`
          },
          {
            type: "button",
            header: "Paiement & Support",
            body: "Choisissez une option :",
            buttons: [
              { id: "do_payment", title: "💳 Payer" },
              { id: "contact_support", title: "📞 Assistance" },
              { id: "course_details", title: "📋 Détails" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "text",
          text: `⏳ *Payment Verification Pending*\n\nWe are currently verifying your payment for *+${phone10}* in our Google Sheet records.\n\nIf you have completed the transfer, please allow a few moments for bank reconciliation or share your receipt with our support team.`
        },
        {
          type: "button",
          header: "Support & Payment",
          body: "Choose an option below:",
          buttons: [
            { id: "do_payment", title: "💳 Do Payment" },
            { id: "contact_support", title: "📞 Contact Support" },
            { id: "course_details", title: "📋 Course Details" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // Handle "Course Details" button click
    if (buttonId === "course_details" || clean.includes("course details") || clean.includes("curriculum") || clean.includes("détails")) {
      const syllabus = isFr ? COURSE_SYLLABUS_FR : COURSE_SYLLABUS;
      if (isFr) {
        return [
          {
            type: "text",
            text: `📋 *Détails du cours : ${courseName}*\n\n👤 *Étudiant :* ${student.name}\n🔒 *Statut :* En attente de paiement\n\n*Programme des cours (6 Modules) :*\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\nDébloquez l'accès aux 6 modules vidéo DRM, au lecteur interactif et à votre certificat dès réception du paiement.`
          },
          {
            type: "button",
            header: "Prêt(e) à commencer ?",
            body: "Veuillez effectuer le paiement pour accéder aux cours :",
            buttons: [
              { id: "do_payment", title: "💳 Payer" },
              { id: "contact_support", title: "📞 Assistance" }
            ],
            footer: "Kairos"
          }
        ];
      }

      return [
        {
          type: "text",
          text: `📋 *Course Details: ${courseName}*\n\n👤 *Student:* ${student.name}\n🔒 *Status:* Awaiting Payment\n\n*Curriculum Outline (6 Modules):*\n${syllabus.map(m => `• *${m.title}* (${m.duration})`).join("\n")}\n\nUnlock all 6 DRM video modules, interactive player access, quizzes, and your certificate upon payment completion.`
        },
        {
          type: "button",
          header: "Ready to Continue?",
          body: "Please complete your payment to start learning:",
          buttons: [
            { id: "do_payment", title: "💳 Do Payment" },
            { id: "contact_support", title: "📞 Contact Support" }
          ],
          footer: "Kairos"
        }
      ];
    }

    // Handle "Contact Support"
    if (buttonId === "contact_support" || clean.includes("support") || clean.includes("assistance") || clean.includes("help")) {
      if (isFr) {
        return [
          {
            type: "text",
            text: `📞 *Assistance Kairos Academy*\n\nBonjour *${student.name}* !\nNotre équipe est disponible 24/7 pour vous aider avec votre paiement ou inscription :\n\n• WhatsApp : +91 96295 31891\n• Email : support@kairos-academy.org\n\nRépondez avec *Bonjour* pour revenir au menu.`
          }
        ];
      }

      return [
        {
          type: "text",
          text: `📞 *Student Support Helpline*\n\nHello *${student.name}*!\nOur team is ready to assist you with payment confirmation or enrollment:\n\n• WhatsApp Support: +91 96295 31891\n• Email: admissions@kairos-academy.org\n\nReply with *Hi* to return to the course menu.`
        }
      ];
    }

    // Default response for Scenario B: Classroom Access Locked + Prompt for Payment
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
      phone: phone10,
      name: studentName,
      course: courseName,
      module: currentMod,
      progressSeconds: progressSec,
      language: isFr ? "fr" : "en"
    });

    const classroomUrl = `${serverBase}/classroom/${sessionData.sessionId}`;

    const resumeLine = progressSec > 0
      ? (isFr ? `▶️ Reprise du Module ${currentMod} à : ${progressTime}` : `▶️ Resuming Module ${currentMod} from: ${progressTime}`)
      : (isFr ? `▶️ Démarrage du Module ${currentMod} à : 00:00` : `▶️ Starting Module ${currentMod} from: 00:00`);

    const headerTitle = getCourseHeaderTitle(currentMod, student.course, userLang);

    const bodyText = isFr
      ? `Bonjour ${studentName} !\n\nVotre salle de classe pour le ${courseName} - Module ${currentMod} est prête.\n\n${resumeLine}\n\nAppuyez sur le bouton ci-dessous pour démarrer votre cours :`
      : `Hello ${studentName}!\n\nYour ${courseName} - Module ${currentMod} classroom is ready.\n\n${resumeLine}\n\nTap the button below to start your class:`;

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
      phone: phone10,
      name: student.name,
      course: courseName,
      module: currentMod,
      progressSeconds: 0,
      language: isFr ? "fr" : "en"
    });

    const classroomUrl = `${serverBase}/classroom/${sessionData.sessionId}?reset=1`;
    const headerTitle = getCourseHeaderTitle(currentMod, student.course, userLang);
    const bodyText = isFr
      ? `Bonjour ${student.name} !\n\nVotre salle de classe pour le ${courseName} - Module ${currentMod} est prête.\n\n▶️ Démarrage du Module ${currentMod} à : 00:00\n\nAppuyez sur le bouton ci-dessous pour démarrer votre cours :`
      : `Hello ${student.name}!\n\nYour ${courseName} - Module ${currentMod} classroom is ready.\n\n▶️ Starting Module ${currentMod} from: 00:00\n\nTap the button below to start your class:`;

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
    const completedCount = (student.completedModules || []).length;
    const progressPercent = Math.round((completedCount / 6) * 100);
    const syllabus = isFr ? COURSE_SYLLABUS_FR : COURSE_SYLLABUS;

    const progressCard = isFr
      ? `📋 *${courseName} - Progression de la formation*\n\n` +
        `👤 *Étudiant :* ${student.name}\n` +
        `📍 *Leçon actuelle :* Module ${currentMod} sur 6\n` +
        `⏱️ *Temps enregistré :* ${progressTime}\n` +
        `📊 *Progression globale :* ${completedCount}/6 modules terminés (${progressPercent}%)\n\n` +
        `*Modules du programme :*\n` +
        syllabus.map(m => {
          const isDone = (student.completedModules || []).includes(m.module);
          const isCurrent = m.module === currentMod;
          const icon = isDone ? "✅" : isCurrent ? "▶️" : "🔒";
          return `${icon} ${m.title} (${m.duration})`;
        }).join("\n")
      : `📋 *${courseName} - Curriculum Status*\n\n` +
        `👤 *Student:* ${student.name}\n` +
        `📍 *Current Lesson:* Module ${currentMod} of 6\n` +
        `⏱️ *Saved Progress:* ${progressTime}\n` +
        `📊 *Overall Progress:* ${completedCount}/6 Modules Completed (${progressPercent}%)\n\n` +
        `*Curriculum Modules:*\n` +
        syllabus.map(m => {
          const isDone = (student.completedModules || []).includes(m.module);
          const isCurrent = m.module === currentMod;
          const icon = isDone ? "✅" : isCurrent ? "▶️" : "🔒";
          return `${icon} ${m.title} (${m.duration})`;
        }).join("\n");

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
 * Build the Scenario B Unpaid Student Message
 */
function buildUnpaidStudentMenu(student, from, serverBase, lang = "en") {
  const isFr = lang === "fr";
  const courseName = getCourseName(student.course, lang);

  if (isFr) {
    return [
      {
        type: "text",
        text: `🔒 *Accès au cours verrouillé*\n\nBonjour *${student.name}* ! Vous êtes inscrit(e) à *${courseName}*.\n\n⚠️ *Veuillez effectuer le paiement pour continuer vos cours.*\n\nDès que votre paiement sera vérifié dans Google Sheets, vos cours vidéo seront instantanément accessibles.`
      },
      {
        type: "button",
        header: "Accès au cours",
        body: "Choisissez une action ci-dessous pour continuer :",
        buttons: [
          { id: "do_payment", title: "💳 Payer" },
          { id: "contact_support", title: "📞 Assistance" },
          { id: "course_details", title: "📋 Détails" }
        ],
        footer: "Kairos"
      }
    ];
  }

  return [
    {
      type: "text",
      text: `🔒 *Classroom Access Locked*\n\nHello *${student.name}*! You are registered for *${courseName}*.\n\n⚠️ *Please do payment to continue courses.*\n\nOnce your payment is verified in Google Sheets, your video lessons will be instantly accessible.`
    },
    {
      type: "button",
      header: "Course Access",
      body: "Choose an action below to proceed:",
      buttons: [
        { id: "do_payment", title: "💳 Do Payment" },
        { id: "contact_support", title: "📞 Contact Support" },
        { id: "course_details", title: "📋 Course Details" }
      ],
      footer: "Kairos"
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
