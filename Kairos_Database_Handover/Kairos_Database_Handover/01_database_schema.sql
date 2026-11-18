1.-- Table: public.wa_courses

-- DROP TABLE IF EXISTS public.wa_courses;

CREATE TABLE IF NOT EXISTS public.wa_courses
(
    course_id bigserial NOT NULL,
    course_name character varying(150) COLLATE pg_catalog."default" NOT NULL,
    language character varying(2) COLLATE pg_catalog."default" NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    CONSTRAINT wa_courses_pkey PRIMARY KEY (course_id),
    CONSTRAINT wa_courses_language_check CHECK (language::text = ANY (ARRAY['en'::character varying, 'fr'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wa_courses
    OWNER to postgres;




2.-- Table: public.wa_enrollments

-- DROP TABLE IF EXISTS public.wa_enrollments;

CREATE TABLE IF NOT EXISTS public.wa_enrollments
(
    enrollment_id bigserial NOT NULL,
    registration_id bigint NOT NULL,
    course_id bigint NOT NULL,
    payment_id bigint NOT NULL,
    course_start_date date,
    enrollment_status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'Pending'::character varying,
    enrolled_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wa_enrollments_pkey PRIMARY KEY (enrollment_id),
    CONSTRAINT uq_wa_enrollment_payment UNIQUE (payment_id),
    CONSTRAINT uq_wa_enrollment_registration_course UNIQUE (registration_id, course_id),
    CONSTRAINT wa_enrollments_course_id_fkey FOREIGN KEY (course_id)
        REFERENCES public.wa_courses (course_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT wa_enrollments_payment_id_fkey FOREIGN KEY (payment_id)
        REFERENCES public.wa_payments (payment_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT wa_enrollments_registration_id_fkey FOREIGN KEY (registration_id)
        REFERENCES public.wa_registrations (registration_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wa_enrollments
    OWNER to postgres;



3.-- Table: public.wa_payments

-- DROP TABLE IF EXISTS public.wa_payments;

CREATE TABLE IF NOT EXISTS public.wa_payments
(
    payment_id bigserial NOT NULL,
    registration_id bigint NOT NULL,
    course_id bigint NOT NULL,
    status character varying(20) COLLATE pg_catalog."default" NOT NULL DEFAULT 'Pending'::character varying,
    updated_by character varying(100) COLLATE pg_catalog."default",
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wa_payments_pkey PRIMARY KEY (payment_id),
    CONSTRAINT uq_wa_payment_registration_course UNIQUE (registration_id, course_id),
    CONSTRAINT wa_payments_course_id_fkey FOREIGN KEY (course_id)
        REFERENCES public.wa_courses (course_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT wa_payments_registration_id_fkey FOREIGN KEY (registration_id)
        REFERENCES public.wa_registrations (registration_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT wa_payments_status_check CHECK (status::text = ANY (ARRAY['Pending'::character varying, 'Contacted'::character varying, 'Confirmed'::character varying, 'Paid'::character varying, 'Cancelled'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wa_payments
    OWNER to postgres;



4.-- Table: public.wa_registrations

-- DROP TABLE IF EXISTS public.wa_registrations;

CREATE TABLE IF NOT EXISTS public.wa_registrations
(
    registration_id bigserial NOT NULL,
    full_name character varying(150) COLLATE pg_catalog."default" NOT NULL,
    country_code character varying(10) COLLATE pg_catalog."default" NOT NULL,
    phone_number character varying(20) COLLATE pg_catalog."default" NOT NULL,
    email character varying(150) COLLATE pg_catalog."default" NOT NULL,
    city character varying(100) COLLATE pg_catalog."default" NOT NULL,
    profession character varying(100) COLLATE pg_catalog."default" NOT NULL,
    language character varying(2) COLLATE pg_catalog."default" NOT NULL,
    registered_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wa_registrations_pkey PRIMARY KEY (registration_id),
    CONSTRAINT uq_wa_registrations_phone UNIQUE (country_code, phone_number),
    CONSTRAINT wa_registrations_language_check CHECK (language::text = ANY (ARRAY['en'::character varying, 'fr'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.wa_registrations
    OWNER to postgres;