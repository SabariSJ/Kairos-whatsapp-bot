const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('../src/app');
const { pool } = require('../src/config/db');

const TEST_PORT = 5012;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('🚀 KAIROS PHASE 2 & 3 END-TO-END INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  let server;
  let paymentToken = '';
  let reportToken = '';
  let testEnglishRegId = null;
  let testFrenchRegId = null;
  let allPassed = true;

  try {
    server = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, '127.0.0.1', () => resolve(s));
    });

    // 1. Authenticate Payment Staff
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'payment@sprout.com', password: 'sprout123' }),
      });
      const data = await res.json();
      if (res.status === 200 && data.success && data.user.role === 'payment_staff') {
        paymentToken = data.token;
        console.log('✅ TEST 1: Payment Staff Authentication -> PASS (Token Issued, Role: payment_staff)');
      } else {
        console.error('❌ TEST 1: Payment Staff Authentication -> FAIL', data);
        allPassed = false;
      }
    }

    // 2. Authenticate Report Staff
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'report@sprout.com', password: 'sprout123' }),
      });
      const data = await res.json();
      if (res.status === 200 && data.success && data.user.role === 'report_staff') {
        reportToken = data.token;
        console.log('✅ TEST 2: Report Staff Authentication -> PASS (Token Issued, Role: report_staff)');
      } else {
        console.error('❌ TEST 2: Report Staff Authentication -> FAIL', data);
        allPassed = false;
      }
    }

    // 3. Register Test English Student
    {
      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: '[PORTAL TEST] Alice Smith',
          countryCode: '+44',
          phoneNumber: '7700900123',
          email: `alice.test.${Date.now()}@sprout.app`,
          city: 'London',
          profession: 'Student',
          language: 'en',
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data.success) {
        testEnglishRegId = data.registration.registrationId;
        console.log(`✅ TEST 3: English Student Registration -> PASS (ID: ${testEnglishRegId})`);
      } else {
        console.error('❌ TEST 3: English Student Registration -> FAIL', data);
        allPassed = false;
      }
    }

    // 4. Register Test French Student
    {
      const res = await fetch(`${BASE_URL}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: '[PORTAL TEST] Michel Blanc',
          countryCode: '+33',
          phoneNumber: '612345678',
          email: `michel.test.${Date.now()}@sprout.app`,
          city: 'Paris',
          profession: 'Planning to start a business',
          language: 'fr',
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data.success) {
        testFrenchRegId = data.registration.registrationId;
        console.log(`✅ TEST 4: French Student Registration -> PASS (ID: ${testFrenchRegId})`);
      } else {
        console.error('❌ TEST 4: French Student Registration -> FAIL', data);
        allPassed = false;
      }
    }

    // 5. Payment Staff: Retrieve All Payments & Verify Both Languages Present
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments?language=all`, {
        headers: { Authorization: `Bearer ${paymentToken}` },
      });
      const data = await res.json();
      const hasEn = data.payments.some((p) => p.language === 'en');
      const hasFr = data.payments.some((p) => p.language === 'fr');
      if (res.status === 200 && hasEn && hasFr) {
        console.log(`✅ TEST 5: Payment Dashboard 'All' Filter -> PASS (Contains both EN and FR records, Total: ${data.count})`);
      } else {
        console.error('❌ TEST 5: Payment Dashboard All Filter -> FAIL', data);
        allPassed = false;
      }
    }

    // 6. Payment Staff: Verify English Only Filter
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments?language=en`, {
        headers: { Authorization: `Bearer ${paymentToken}` },
      });
      const data = await res.json();
      const allEnglish = data.payments.every((p) => p.language === 'en');
      if (res.status === 200 && allEnglish && data.count > 0) {
        console.log(`✅ TEST 6: Payment Dashboard 'English' Filter -> PASS (Count: ${data.count}, 100% English)`);
      } else {
        console.error('❌ TEST 6: Payment Dashboard English Filter -> FAIL', data);
        allPassed = false;
      }
    }

    // 7. Payment Staff: Verify French Only Filter
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments?language=fr`, {
        headers: { Authorization: `Bearer ${paymentToken}` },
      });
      const data = await res.json();
      const allFrench = data.payments.every((p) => p.language === 'fr');
      if (res.status === 200 && allFrench && data.count > 0) {
        console.log(`✅ TEST 7: Payment Dashboard 'French' Filter -> PASS (Count: ${data.count}, 100% French)`);
      } else {
        console.error('❌ TEST 7: Payment Dashboard French Filter -> FAIL', data);
        allPassed = false;
      }
    }

    // 8. Payment Staff: Status Update (Pending -> Paid) & Transactional Enrollment Activation
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments/${testEnglishRegId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${paymentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Paid' }),
      });
      const data = await res.json();
      if (
        res.status === 200 &&
        data.payment?.status === 'Paid' &&
        data.enrollment?.status === 'Active'
      ) {
        console.log(`✅ TEST 8: Payment Status Update to 'Paid' & Enrollment Activation -> PASS (Enrollment ID: ${data.enrollment.enrollmentId})`);
      } else {
        console.error('❌ TEST 8: Payment Status Update -> FAIL', data);
        allPassed = false;
      }
    }

    // 9. Report Staff: Retrieve Summary Analytics
    {
      const res = await fetch(`${BASE_URL}/api/staff/reports/summary?language=all`, {
        headers: { Authorization: `Bearer ${reportToken}` },
      });
      const data = await res.json();
      if (
        res.status === 200 &&
        data.report?.kpis?.total >= 2 &&
        data.report?.professionBreakdown.length > 0 &&
        data.report?.dailyTrend.length > 0
      ) {
        console.log(`✅ TEST 9: Report Dashboard Summary Analytics -> PASS (Total: ${data.report.kpis.total}, Paid: ${data.report.statusCounts.Paid})`);
      } else {
        console.error('❌ TEST 9: Report Dashboard Summary Analytics -> FAIL', data);
        allPassed = false;
      }
    }

    // 10. Report Staff: Retrieve Export Records
    {
      const res = await fetch(`${BASE_URL}/api/staff/reports/records?language=all`, {
        headers: { Authorization: `Bearer ${reportToken}` },
      });
      const data = await res.json();
      if (res.status === 200 && data.records?.length >= 2) {
        console.log(`✅ TEST 10: Report Staff Exportable Records -> PASS (Records count: ${data.count})`);
      } else {
        console.error('❌ TEST 10: Report Staff Exportable Records -> FAIL', data);
        allPassed = false;
      }
    }

    // 11. Security RBAC: Payment Staff Denied From Reports
    {
      const res = await fetch(`${BASE_URL}/api/staff/reports/summary`, {
        headers: { Authorization: `Bearer ${paymentToken}` },
      });
      if (res.status === 403) {
        console.log('✅ TEST 11: Security RBAC: Payment Staff Blocked From Report Endpoints -> PASS (HTTP 403 Forbidden)');
      } else {
        console.error('❌ TEST 11: Security RBAC -> FAIL (Expected 403, got ' + res.status + ')');
        allPassed = false;
      }
    }

    // 12. Security RBAC: Report Staff Denied From Updating Payments
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments/${testFrenchRegId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${reportToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Paid' }),
      });
      if (res.status === 403) {
        console.log('✅ TEST 12: Security RBAC: Report Staff Blocked From Updating Payments -> PASS (HTTP 403 Forbidden)');
      } else {
        console.error('❌ TEST 12: Security RBAC -> FAIL (Expected 403, got ' + res.status + ')');
        allPassed = false;
      }
    }

    console.log('\n================================================================');
    if (allPassed) {
      console.log('🎉 ALL 12 INTEGRATION & SECURITY TESTS PASSED PERFECTLY!');
    } else {
      console.error('❌ SOME TESTS FAILED.');
    }
    console.log('================================================================\n');
  } catch (err) {
    console.error('Fatal Test Exception:', err);
    allPassed = false;
  } finally {
    if (server) server.close();
    await pool.end();
  }

  process.exit(allPassed ? 0 : 1);
}

runEndToEndVerification();
