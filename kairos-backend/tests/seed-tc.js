const { pool } = require('../src/config/db');

async function main() {
  const r = await pool.query("SELECT registration_id FROM wa_registrations WHERE phone_number = '9876599992';");
  if (r.rows.length > 0) {
    const regId = r.rows[0].registration_id;
    await pool.query("UPDATE wa_payments SET status = 'Paid' WHERE registration_id = $1;", [regId]);
    const payRes = await pool.query("SELECT payment_id FROM wa_payments WHERE registration_id = $1;", [regId]);
    const payId = payRes.rows[0].payment_id;
    await pool.query("DELETE FROM wa_enrollments WHERE registration_id = $1;", [regId]);
    await pool.query("INSERT INTO wa_enrollments (registration_id, course_id, payment_id, enrollment_status) VALUES ($1, 1, $2, 'Cancelled');", [regId, payId]);
    console.log("Seeded Paid + Cancelled for regId:", regId, "payId:", payId);
  }

  const r2 = await pool.query("SELECT registration_id FROM wa_registrations WHERE phone_number = '9876599991';");
  if (r2.rows.length > 0) {
    const regId2 = r2.rows[0].registration_id;
    await pool.query("UPDATE wa_payments SET status = 'Paid' WHERE registration_id = $1;", [regId2]);
    const payRes2 = await pool.query("SELECT payment_id FROM wa_payments WHERE registration_id = $1;", [regId2]);
    const payId2 = payRes2.rows[0].payment_id;
    await pool.query("DELETE FROM wa_enrollments WHERE registration_id = $1;", [regId2]);
    await pool.query("INSERT INTO wa_enrollments (registration_id, course_id, payment_id, enrollment_status) VALUES ($1, 1, $2, 'Inactive');", [regId2, payId2]);
    console.log("Seeded Paid + Inactive for regId2:", regId2, "payId2:", payId2);
  }

  await pool.end();
}
main().catch(console.error);
