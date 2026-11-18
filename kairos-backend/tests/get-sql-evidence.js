const { query } = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function getEvidence() {
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
        c.course_name,
        p.payment_id,
        p.status,
        p.updated_at
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p
        ON p.registration_id = r.registration_id
    LEFT JOIN public.wa_courses c
        ON c.course_id = p.course_id
    WHERE r.full_name LIKE '[PHASE4 TEST]%'
    ORDER BY r.registration_id ASC;
  `;

  const res = await query(sql);
  console.log('Query executed successfully. Rows found:', res.rowCount);
  console.table(res.rows);

  const outPath = path.join(__dirname, 'phase4-sql-evidence.json');
  fs.writeFileSync(outPath, JSON.stringify(res.rows, null, 2), 'utf8');
  console.log(`Saved evidence to: ${outPath}`);

  console.log('\n--- Active Enrolment Records for Phase 4 ---');
  const enrSql = `
    SELECT
        e.enrollment_id,
        e.registration_id,
        e.course_id,
        e.payment_id,
        e.course_start_date,
        e.enrollment_status,
        e.enrolled_at,
        c.course_name,
        r.full_name
    FROM public.wa_enrollments e
    JOIN public.wa_registrations r ON r.registration_id = e.registration_id
    JOIN public.wa_courses c ON c.course_id = e.course_id
    WHERE r.full_name LIKE '[PHASE4 TEST]%';
  `;
  const enrRes = await query(enrSql);
  console.table(enrRes.rows);
  const enrOutPath = path.join(__dirname, 'phase4-enrollments-evidence.json');
  fs.writeFileSync(enrOutPath, JSON.stringify(enrRes.rows, null, 2), 'utf8');
  console.log(`Saved enrollment evidence to: ${enrOutPath}`);

  process.exit(0);
}

getEvidence().catch(err => {
  console.error(err);
  process.exit(1);
});
