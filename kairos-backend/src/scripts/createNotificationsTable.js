const { query } = require('../config/db');

async function migrate() {
  console.log('📦 Creating wa_notifications table in AWS RDS PostgreSQL...');
  const sql = `
    CREATE TABLE IF NOT EXISTS public.wa_notifications (
      notification_id BIGSERIAL PRIMARY KEY,
      payment_id BIGINT NOT NULL,
      registration_id BIGINT NOT NULL,
      phone_e164 VARCHAR(30) NOT NULL,
      template_name VARCHAR(100) NOT NULL,
      language VARCHAR(10) NOT NULL DEFAULT 'en',
      consent_status VARCHAR(30) NOT NULL DEFAULT 'opted_in',
      status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      meta_message_id VARCHAR(255) NULL,
      error_message TEXT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_wa_notifications_payment FOREIGN KEY (payment_id) REFERENCES public.wa_payments(payment_id) ON DELETE CASCADE,
      CONSTRAINT fk_wa_notifications_registration FOREIGN KEY (registration_id) REFERENCES public.wa_registrations(registration_id) ON DELETE CASCADE,
      CONSTRAINT uq_wa_notifications_payment UNIQUE (payment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_wa_notifications_meta_msg_id ON public.wa_notifications (meta_message_id);
    CREATE INDEX IF NOT EXISTS idx_wa_notifications_status ON public.wa_notifications (status);
    CREATE INDEX IF NOT EXISTS idx_wa_notifications_reg_id ON public.wa_notifications (registration_id);
  `;

  await query(sql);
  console.log('✅ wa_notifications table and indexes created successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
