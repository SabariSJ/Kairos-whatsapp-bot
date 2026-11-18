const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('../src/app');
const { pool } = require('../src/config/db');

const TEST_PORT = 5011;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runStaffVerification() {
  console.log('================================================================');
  console.log('🔒 VERIFYING PHASE 2 STAFF ACCOUNT CONFIGURATION & PERMISSIONS');
  console.log('================================================================\n');

  let server;
  let paymentToken = '';
  let reportToken = '';
  let allPassed = true;

  try {
    server = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, '127.0.0.1', () => resolve(s));
    });

    // 1. Test Payment Staff Login
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'payment@sprout.com', password: 'sprout123' })
      });
      const data = await res.json();
      const ok = res.status === 200 && data.success && data.user?.role === 'payment_staff' && !!data.token;
      if (ok) {
        paymentToken = data.token;
        console.log('✅ PASS: Payment Staff Login (payment@sprout.com) -> HTTP 200, role: payment_staff');
      } else {
        console.error('❌ FAIL: Payment Staff Login failed', res.status, data);
        allPassed = false;
      }
    }

    // 2. Test Report Staff Login
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'report@sprout.com', password: 'sprout123' })
      });
      const data = await res.json();
      const ok = res.status === 200 && data.success && data.user?.role === 'report_staff' && !!data.token;
      if (ok) {
        reportToken = data.token;
        console.log('✅ PASS: Report Staff Login (report@sprout.com) -> HTTP 200, role: report_staff');
      } else {
        console.error('❌ FAIL: Report Staff Login failed', res.status, data);
        allPassed = false;
      }
    }

    // 3. Test Invalid Password
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'payment@sprout.com', password: 'wrongpassword' })
      });
      const ok = res.status === 401;
      console.log(`${ok ? '✅ PASS' : '❌ FAIL'}: Invalid Password Rejection -> HTTP ${res.status}`);
      if (!ok) allPassed = false;
    }

    // 4. Test Invalid Email
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@sprout.com', password: 'sprout123' })
      });
      const ok = res.status === 401;
      console.log(`${ok ? '✅ PASS' : '❌ FAIL'}: Unknown Email Rejection -> HTTP ${res.status}`);
      if (!ok) allPassed = false;
    }

    // 5. Test Payment Staff Permissions
    {
      // Allowed: GET /api/staff/payments
      const resPay = await fetch(`${BASE_URL}/api/staff/payments?language=all`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const okPay = resPay.status === 200;
      console.log(`${okPay ? '✅ PASS' : '❌ FAIL'}: Payment Staff Allowed /api/staff/payments -> HTTP ${resPay.status}`);
      if (!okPay) allPassed = false;

      // Denied: GET /api/staff/reports/summary (Expected: 403 Forbidden)
      const resRep = await fetch(`${BASE_URL}/api/staff/reports/summary?language=all`, {
        headers: { 'Authorization': `Bearer ${paymentToken}` }
      });
      const okRep = resRep.status === 403;
      console.log(`${okRep ? '✅ PASS' : '❌ FAIL'}: Payment Staff Denied /api/staff/reports -> HTTP ${resRep.status} Forbidden`);
      if (!okRep) allPassed = false;
    }

    // 6. Test Report Staff Permissions
    {
      // Allowed: GET /api/staff/reports/summary
      const resRep = await fetch(`${BASE_URL}/api/staff/reports/summary?language=all`, {
        headers: { 'Authorization': `Bearer ${reportToken}` }
      });
      const okRep = resRep.status === 200;
      console.log(`${okRep ? '✅ PASS' : '❌ FAIL'}: Report Staff Allowed /api/staff/reports -> HTTP ${resRep.status}`);
      if (!okRep) allPassed = false;

      // Denied: GET /api/staff/payments (Expected: 403 Forbidden)
      const resPay = await fetch(`${BASE_URL}/api/staff/payments?language=all`, {
        headers: { 'Authorization': `Bearer ${reportToken}` }
      });
      const okPay = resPay.status === 403;
      console.log(`${okPay ? '✅ PASS' : '❌ FAIL'}: Report Staff Denied /api/staff/payments -> HTTP ${resPay.status} Forbidden`);
      if (!okPay) allPassed = false;

      // Denied: PATCH /api/staff/payments/1/status (Expected: 403 Forbidden)
      const resPatch = await fetch(`${BASE_URL}/api/staff/payments/1/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${reportToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Paid' })
      });
      const okPatch = resPatch.status === 403;
      console.log(`${okPatch ? '✅ PASS' : '❌ FAIL'}: Report Staff Denied Updating Payments -> HTTP ${resPatch.status} Forbidden`);
      if (!okPatch) allPassed = false;
    }

    // 7. Test Unauthenticated Access
    {
      const res = await fetch(`${BASE_URL}/api/staff/payments`);
      const ok = res.status === 401;
      console.log(`${ok ? '✅ PASS' : '❌ FAIL'}: Unauthenticated Request Denied -> HTTP ${res.status} Unauthorized`);
      if (!ok) allPassed = false;
    }

    console.log('\n================================================================');
    if (allPassed) {
      console.log('🎉 ALL STAFF ACCOUNT AND PERMISSION TESTS PASSED!');
    } else {
      console.error('❌ SOME TESTS FAILED.');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal Test Error:', err);
    allPassed = false;
  } finally {
    if (server) server.close();
    await pool.end();
  }

  process.exit(allPassed ? 0 : 1);
}

runStaffVerification();
