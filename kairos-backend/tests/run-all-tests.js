/**
 * KAIROS BACKEND - AUTOMATED INTEGRATION & SECURITY TEST RUNNER
 * Tests all 15 required business, API, and security scenarios
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('../src/app');
const { pool } = require('../src/config/db');

const TEST_PORT = 5009;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Test tracking variables
let server;
let paymentToken = '';
let reportToken = '';
let testRegEnglishId = null;
let testRegFrenchId = null;

const results = [];

function recordResult(testNumber, name, passed, details = '') {
  results.push({ testNumber, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Test ${testNumber.toString().padStart(2, '0')}] ${name}`);
  if (details) {
    console.log(`   └─ ${details}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING KAIROS PHASE 2 INTEGRATION & SECURITY TEST SUITE');
  console.log('================================================================\n');

  try {
    // Start test server
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, '127.0.0.1', resolve);
    });

    // --------------------------------------------------------------------------
    // Test 1: Database Connectivity
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/health/db`);
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.database === 'connected';
      recordResult(1, 'Database Connectivity Health Check', passed, `Status: ${res.status}, DB: ${body.database}`);
    }

    // --------------------------------------------------------------------------
    // Test 2: English Registration API
    // --------------------------------------------------------------------------
    {
      const payload = {
        fullName: '[TEST] John Smith',
        countryCode: '+999',
        phoneNumber: '9990001111',
        email: `test.john.${Date.now()}@kairostest.com`,
        city: 'Chennai',
        profession: 'Student',
        language: 'en'
      };

      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      const passed = res.status === 201 && body.success === true && body.registration.language === 'en';
      if (passed) {
        testRegEnglishId = body.registration.registrationId;
      }
      recordResult(2, 'English Registration API (wa_registrations)', passed, `Status: ${res.status}, ID: ${testRegEnglishId}`);
    }

    // --------------------------------------------------------------------------
    // Test 3: French Registration API
    // --------------------------------------------------------------------------
    {
      const payload = {
        fullName: '[TEST] Pierre Martin',
        countryCode: '+999',
        phoneNumber: '9990002222',
        email: `test.pierre.${Date.now()}@kairostest.com`,
        city: 'Abidjan',
        profession: 'Planning to start a business',
        language: 'fr'
      };

      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      const passed = res.status === 201 && body.success === true && body.registration.language === 'fr';
      if (passed) {
        testRegFrenchId = body.registration.registrationId;
      }
      recordResult(3, 'French Registration API (wa_registrations)', passed, `Status: ${res.status}, ID: ${testRegFrenchId}`);
    }

    // --------------------------------------------------------------------------
    // Test 4: Invalid Language Rejection
    // --------------------------------------------------------------------------
    {
      const payload = {
        fullName: '[TEST] Invalid User',
        countryCode: '+999',
        phoneNumber: '9990003333',
        email: `test.invalid.${Date.now()}@kairostest.com`,
        city: 'Madrid',
        profession: 'Other',
        language: 'es' // Invalid language
      };

      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      const passed = res.status === 400 && body.success === false && body.error.includes("Invalid language");
      recordResult(4, "Invalid Language Rejection (rejects non 'en'/'fr')", passed, `Status: ${res.status}, Error: ${body.error}`);
    }

    // --------------------------------------------------------------------------
    // Test 5: Duplicate Phone Number Rejection
    // --------------------------------------------------------------------------
    {
      // Attempt to register with the same phone as Test 2
      const duplicatePayload = {
        fullName: '[TEST] Duplicate Phone Attempt',
        countryCode: '+999',
        phoneNumber: '9990001111', // same phone as Test 2
        email: `test.dup.${Date.now()}@kairostest.com`,
        city: 'Delhi',
        profession: 'Student',
        language: 'en'
      };

      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatePayload)
      });
      const body = await res.json();
      const passed = res.status === 409 && body.success === false && body.errorType === 'DUPLICATE_PHONE';
      recordResult(5, 'Duplicate Phone Number Rejection (uq_wa_registrations_phone)', passed, `Status: ${res.status}, Type: ${body.errorType}`);
    }

    // --------------------------------------------------------------------------
    // Test 6: Course API for English
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/courses?language=en`);
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.courses.every(c => c.language === 'en');
      recordResult(6, 'Course API for English (wa_courses where lang=en)', passed, `Courses found: ${body.count}`);
    }

    // --------------------------------------------------------------------------
    // Test 7: Course API for French
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/courses?language=fr`);
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.courses.every(c => c.language === 'fr');
      recordResult(7, 'Course API for French (wa_courses where lang=fr)', passed, `Courses found: ${body.count}`);
    }

    // --------------------------------------------------------------------------
    // Test 8: Payment Staff Login
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@sprout.app',
          password: 'sprout'
        })
      });
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.user.role === 'payment_staff' && !!body.token;
      if (passed) {
        paymentToken = body.token;
      }
      recordResult(8, 'Payment Staff Login & JWT Generation', passed, `Role: ${body.user?.role}`);
    }

    // --------------------------------------------------------------------------
    // Test 9: Report Staff Login
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'data@sprout.app',
          password: 'sprout'
        })
      });
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.user.role === 'report_staff' && !!body.token;
      if (passed) {
        reportToken = body.token;
      }
      recordResult(9, 'Report Staff Login & JWT Generation', passed, `Role: ${body.user?.role}`);
    }

    // --------------------------------------------------------------------------
    // Test 10: RBAC: Payment Staff CANNOT Access Report Endpoints
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/staff/reports/summary`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const body = await res.json();
      const passed = res.status === 403 && body.success === false && body.error.includes('Forbidden');
      recordResult(10, 'RBAC: Payment Staff Blocked from Report Endpoints', passed, `Status: ${res.status} Forbidden`);
    }

    // --------------------------------------------------------------------------
    // Test 11: RBAC: Report Staff CANNOT Update Payment Status
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments/1/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${reportToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Paid' })
      });
      const body = await res.json();
      const passed = res.status === 403 && body.success === false && body.error.includes('Forbidden');
      recordResult(11, 'RBAC: Report Staff Blocked from Payment Update Endpoints', passed, `Status: ${res.status} Forbidden`);
    }

    // --------------------------------------------------------------------------
    // Test 12: Both Staff Roles Can Retrieve Permitted Records
    // --------------------------------------------------------------------------
    {
      // Payment staff retrieves payments list
      const payRes = await fetch(`${BASE_URL}/api/staff/payments?language=all`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const payBody = await payRes.json();

      // Report staff retrieves report summary
      const repRes = await fetch(`${BASE_URL}/api/staff/reports/summary?language=all`, {
        headers: { 'Authorization': `Bearer ${reportToken}` }
      });
      const repBody = await repRes.json();

      const passed = payRes.status === 200 && payBody.success === true && repRes.status === 200 && repBody.success === true;
      recordResult(12, 'Permitted Data Retrieval for Both Staff Roles', passed, `Payments: ${payBody.count}, Report Total: ${repBody.report?.kpis?.total}`);
    }

    // --------------------------------------------------------------------------
    // Test 13: Payment Status Update
    // --------------------------------------------------------------------------
    {
      // Update English student payment to 'Contacted'
      const res = await fetch(`${BASE_URL}/api/staff/payments/${testRegEnglishId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${paymentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Contacted' })
      });
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && body.payment.status === 'Contacted';
      recordResult(13, "Payment Status Update (Pending -> Contacted)", passed, `Updated Status: ${body.payment?.status}`);
    }

    // --------------------------------------------------------------------------
    // Test 14: Enrolment Activation After 'Paid' Status
    // --------------------------------------------------------------------------
    {
      // Update English student payment to 'Paid'
      const res = await fetch(`${BASE_URL}/api/staff/payments/${testRegEnglishId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${paymentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Paid' })
      });
      const body = await res.json();
      const passed = res.status === 200 && 
                     body.success === true && 
                     body.payment.status === 'Paid' && 
                     body.enrollment !== null && 
                     body.enrollment.status === 'Active';
      recordResult(14, 'Transactional Enrolment Activation on Paid (wa_enrollments)', passed, `Enrollment ID: ${body.enrollment?.enrollmentId}, Status: ${body.enrollment?.status}`);
    }

    // --------------------------------------------------------------------------
    // Test 15: Language Filters: all, en and fr
    // --------------------------------------------------------------------------
    {
      const resAll = await fetch(`${BASE_URL}/api/staff/payments?language=all`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const bodyAll = await resAll.json();

      const resEn = await fetch(`${BASE_URL}/api/staff/payments?language=en`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const bodyEn = await resEn.json();

      const resFr = await fetch(`${BASE_URL}/api/staff/payments?language=fr`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const bodyFr = await resFr.json();

      const allValid = resAll.status === 200 && resEn.status === 200 && resFr.status === 200;
      const enOnly = bodyEn.payments.every(p => p.language === 'en');
      const frOnly = bodyFr.payments.every(p => p.language === 'fr');
      const countMatch = bodyAll.count >= (bodyEn.count + bodyFr.count);

      const passed = allValid && enOnly && frOnly && countMatch;
      recordResult(15, 'Language Filters: all, en, and fr Verification', passed, `All: ${bodyAll.count}, EN: ${bodyEn.count}, FR: ${bodyFr.count}`);
    }

    // --------------------------------------------------------------------------
    // Summary
    // --------------------------------------------------------------------------
    console.log('\n================================================================');
    const totalPassed = results.filter(r => r.passed).length;
    console.log(`🏁 TEST SUITE FINISHED: ${totalPassed}/${results.length} PASSED`);
    console.log('================================================================');

    if (totalPassed === results.length) {
      console.log('🎉 ALL 15 PHASE 2 ACCEPTANCE TESTS PASSED SUCCESSFULLY!\n');
    } else {
      console.error('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.\n');
    }

  } catch (err) {
    console.error('💥 Test Suite Fatal Exception:', err);
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
  }
}

runTests();
