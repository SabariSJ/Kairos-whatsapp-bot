/**
 * ==============================================================================================
 * 🚀 KAIROS ACADEMY - GOOGLE APPS SCRIPT FOR WHATSAPP BOT & STUDENT CRM (v2.0)
 * ==============================================================================================
 * Matches your sheet columns:
 * Col A: s.no
 * Col B: name
 * Col C: number
 * Col D: course
 * Col E: payment status
 * Col F: language
 * Col G: start date
 * 
 * Auto-added DRM video progress columns:
 * Col H: current module
 * Col I: progress seconds
 * Col J: completed modules
 * Col K: last updated
 * ==============================================================================================
 * ⚠️ CRITICAL SETUP STEP FOR PUBLIC ACCESS:
 * In Apps Script:
 * 1. Click "Deploy" > "Manage deployments".
 * 2. Click the Pencil (Edit) icon ✏️.
 * 3. Set "Who has access" to: "Anyone"  <-- MUST BE 'Anyone' (NOT 'Only myself')
 * 4. Under Version, select "New version".
 * 5. Click "Deploy".
 * ==============================================================================================
 */

function normalizePhone(phone) {
  if (!phone) return "";
  var digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function phonesMatch(phoneA, phoneB) {
  if (!phoneA || !phoneB) return false;
  var digA = String(phoneA).replace(/\D/g, "");
  var digB = String(phoneB).replace(/\D/g, "");
  if (!digA || !digB) return false;
  if (digA === digB) return true;
  var normA = digA.length >= 10 ? digA.slice(-10) : digA;
  var normB = digB.length >= 10 ? digB.slice(-10) : digB;
  return normA === normB || digA.indexOf(normB) !== -1 || digB.indexOf(normA) !== -1;
}

function isPaymentYes(val) {
  if (!val) return false;
  var str = String(val).trim().toLowerCase();
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

function getColumnIndex(headers, possibleNames, defaultIndex) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim().toLowerCase();
    for (var j = 0; j < possibleNames.length; j++) {
      var target = possibleNames[j].toLowerCase();
      if (h === target || h.indexOf(target) !== -1) {
        return i;
      }
    }
  }
  return defaultIndex;
}

function ensureTrackingColumns(sheet, headers) {
  var neededHeaders = [
    { name: "current module", col: 8 },
    { name: "progress seconds", col: 9 },
    { name: "completed modules", col: 10 },
    { name: "last updated", col: 11 }
  ];

  for (var k = 0; k < neededHeaders.length; k++) {
    var found = false;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || "").trim().toLowerCase() === neededHeaders[k].name) {
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.getRange(1, neededHeaders[k].col).setValue(neededHeaders[k].name);
    }
  }
}

/**
 * Universal Request Handler (Handles both GET and POST)
 */
function handleRequest(data) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var action = data.action;
    var targetPhone = normalizePhone(data.phone || data.number);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var values = sheet.getDataRange().getValues();
    if (values.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Sheet is empty"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var headers = values[0];
    ensureTrackingColumns(sheet, headers);

    var colSno = getColumnIndex(headers, ["s.no", "sno", "id"], 0);              // Col A
    var colName = getColumnIndex(headers, ["name", "student name"], 1);           // Col B
    var colPhone = getColumnIndex(headers, ["number", "phone", "mobile"], 2);     // Col C
    var colCourse = getColumnIndex(headers, ["course", "courses"], 3);            // Col D
    var colPay = getColumnIndex(headers, ["payment status", "payment"], 4);       // Col E
    var colLang = getColumnIndex(headers, ["language", "lang"], 5);               // Col F
    var colStartDate = getColumnIndex(headers, ["start date", "date"], 6);        // Col G
    var colModule = getColumnIndex(headers, ["current module", "module"], 7);     // Col H
    var colProgress = getColumnIndex(headers, ["progress seconds", "progress"], 8);// Col I
    var colCompleted = getColumnIndex(headers, ["completed modules"], 9);         // Col J
    var colUpdated = getColumnIndex(headers, ["last updated", "updated"], 10);    // Col K

    // 1. ACTION: getStudent
    if (action === "getStudent") {
      for (var i = 1; i < values.length; i++) {
        var rawRowPhone = values[i][colPhone];
        if (phonesMatch(rawRowPhone, targetPhone)) {
          var isPaid = isPaymentYes(values[i][colPay]);

          var student = {
            sno: values[i][colSno] || i,
            name: String(values[i][colName] || "Student").trim(),
            phone: normalizePhone(rawRowPhone) || targetPhone,
            course: String(values[i][colCourse] || "Business Success").trim(),
            paymentStatus: isPaid ? "yes" : "no",
            language: String(values[i][colLang] || "english").trim().toLowerCase(),
            startDate: values[i][colStartDate] ? String(values[i][colStartDate]) : "",
            currentModule: Number(values[i][colModule] || 1),
            progressSeconds: Number(values[i][colProgress] || 0),
            completedModules: values[i][colCompleted]
              ? String(values[i][colCompleted]).split(",").map(Number).filter(function(n) { return !isNaN(n); })
              : []
          };

          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            student: student
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        student: null,
        message: "Student not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ACTION: getAllStudents / list
    if (action === "getAllStudents" || action === "list") {
      var all = [];
      for (var i = 1; i < values.length; i++) {
        all.push({
          row: i + 1,
          sno: values[i][colSno] || i,
          name: String(values[i][colName] || "").trim(),
          phone: String(values[i][colPhone] || "").trim(),
          normalizedPhone: normalizePhone(values[i][colPhone]),
          course: String(values[i][colCourse] || "").trim(),
          paymentStatus: isPaymentYes(values[i][colPay]) ? "yes" : "no",
          rawPaymentStatus: String(values[i][colPay] || "").trim(),
          language: String(values[i][colLang] || "english").trim().toLowerCase()
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        total: all.length,
        students: all
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. ACTION: updateProgress
    if (action === "updateProgress") {
      var foundRowIndex = -1;
      for (var i = 1; i < values.length; i++) {
        if (phonesMatch(values[i][colPhone], targetPhone)) {
          foundRowIndex = i + 1;
          break;
        }
      }

      var nowTimestamp = new Date().toISOString();

      if (foundRowIndex > 0) {
        if (data.progressSeconds !== undefined) {
          sheet.getRange(foundRowIndex, colProgress + 1).setValue(Number(data.progressSeconds));
        }
        if (data.currentModule !== undefined) {
          sheet.getRange(foundRowIndex, colModule + 1).setValue(Number(data.currentModule));
        }
        if (data.completedModules !== undefined) {
          sheet.getRange(foundRowIndex, colCompleted + 1).setValue(String(data.completedModules));
        }
        if (data.paymentStatus !== undefined) {
          sheet.getRange(foundRowIndex, colPay + 1).setValue(String(data.paymentStatus).toLowerCase());
        }
        if (data.language !== undefined) {
          sheet.getRange(foundRowIndex, colLang + 1).setValue(String(data.language));
        }
        sheet.getRange(foundRowIndex, colUpdated + 1).setValue(nowTimestamp);
      } else {
        var newSno = values.length;
        sheet.appendRow([
          newSno,
          data.name || "Student",
          targetPhone,
          data.course || "Business Success",
          (String(data.paymentStatus || "no").toLowerCase() === "yes") ? "yes" : "no",
          data.language || "english",
          data.startDate || nowTimestamp.split("T")[0],
          Number(data.currentModule || 1),
          Number(data.progressSeconds || 0),
          data.completedModules || "",
          nowTimestamp
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Student progress synchronized successfully"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Default status if no action specified
    return ContentService.createTextOutput(JSON.stringify({
      status: "online",
      service: "Kairos WhatsApp Bot Google Apps Script CRM",
      sheetName: sheet.getName(),
      totalStudentsRegistered: Math.max(0, values.length - 1),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handle HTTP GET (Supports browser test & query parameters: ?action=getStudent&phone=9500406150)
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return handleRequest(params);
}

/**
 * Handle HTTP POST (Supports JSON payloads)
 */
function doPost(e) {
  var data = {};
  if (e && e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }
  } else if (e && e.parameter) {
    data = e.parameter;
  }
  return handleRequest(data);
}
