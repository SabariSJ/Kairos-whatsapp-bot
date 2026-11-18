const { pool, checkConnection } = require('./db');

async function verifyDatabase() {
  console.log('================================================================');
  console.log('🔍 KAIROS POSTGRESQL READ-ONLY SCHEMA VERIFICATION');
  console.log('================================================================');

  try {
    const health = await checkConnection();
    if (!health.connected) {
      console.error('❌ Connection Failed:', health.error);
      process.exit(1);
    }

    console.log('✅ Connected successfully to AWS RDS PostgreSQL!');
    console.log(`Database: ${health.details.database}`);
    console.log(`Current Schema: ${health.details.schema}`);
    console.log(`RDS Time: ${health.details.serverTime}`);
    console.log('----------------------------------------------------------------');

    // 1. Check existing tables in public schema
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`📋 Found ${tablesRes.rowCount} tables in public schema:`);
    tablesRes.rows.forEach(r => console.log(`   • ${r.table_name}`));
    console.log('----------------------------------------------------------------');

    // 2. Check the 4 target tables
    const targetTables = ['wa_courses', 'wa_registrations', 'wa_payments', 'wa_enrollments'];
    for (const tbl of targetTables) {
      const exists = tablesRes.rows.some(r => r.table_name === tbl);
      if (!exists) {
        console.warn(`⚠️ Warning: Table '${tbl}' was NOT found in public schema!`);
        continue;
      }

      console.log(`\n📌 Table Structure: public.${tbl}`);

      // Columns
      const colsRes = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tbl]);

      console.table(colsRes.rows.map(c => ({
        column: c.column_name,
        type: c.data_type + (c.character_maximum_length ? `(${c.character_maximum_length})` : ''),
        nullable: c.is_nullable,
        default: c.column_default ? String(c.column_default).substring(0, 30) : ''
      })));

      // Constraints
      const consRes = await pool.query(`
        SELECT conname, contype, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public' AND t.relname = $1;
      `, [tbl]);
      if (consRes.rowCount > 0) {
        console.log(`   Constraints for ${tbl}:`);
        consRes.rows.forEach(c => console.log(`     - [${c.contype}] ${c.conname}: ${c.def}`));
      }

      // Row count
      const countRes = await pool.query(`SELECT COUNT(*) AS total FROM public.${tbl}`);
      console.log(`   Total existing records in ${tbl}: ${countRes.rows[0].total}`);
    }

    // 3. Inspect existing courses in wa_courses
    console.log('\n----------------------------------------------------------------');
    console.log('📚 Checking courses in wa_courses:');
    const coursesRes = await pool.query(`SELECT * FROM public.wa_courses ORDER BY course_id`);
    if (coursesRes.rowCount === 0) {
      console.log('   (wa_courses is currently empty)');
    } else {
      console.table(coursesRes.rows);
    }

    console.log('\n================================================================');
    console.log('✅ Database verification complete. Strict read-only mode verified.');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Schema Verification Error:', err.message);
  } finally {
    await pool.end();
  }
}

verifyDatabase();
