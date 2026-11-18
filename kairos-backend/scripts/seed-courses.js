const { pool } = require('../src/config/db');

async function seedCourses() {
  console.log('--- Checking wa_courses table ---');
  try {
    const existing = await pool.query('SELECT COUNT(*) AS total FROM public.wa_courses');
    if (parseInt(existing.rows[0].total, 10) > 0) {
      console.log(`wa_courses already contains ${existing.rows[0].total} records. Skipping seed.`);
      return;
    }

    console.log('Seeding initial official English and French courses into wa_courses...');
    const result = await pool.query(`
      INSERT INTO public.wa_courses (course_name, language, is_active)
      VALUES 
        ('Business Success Class', 'en', true),
        ('Cours de Réussite Commerciale', 'fr', true)
      RETURNING *;
    `);

    console.log(`Successfully seeded ${result.rowCount} courses:`);
    console.table(result.rows);
  } catch (err) {
    console.error('Error seeding courses:', err.message);
  } finally {
    await pool.end();
  }
}

seedCourses();
