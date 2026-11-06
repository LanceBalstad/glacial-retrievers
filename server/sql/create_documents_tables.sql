-- Admin Documents: one signable PDF per document type and per-customer signing requests.
-- Run once on a new database: psql "$DATABASE_URL" -f server/sql/create_documents_tables.sql
-- (An existing database from the first version needs migrate_documents_simplify.sql instead.)
-- Lookup tables follow the same pattern as event_types / event_status / dog_status.

/* ---------- Lookup tables ---------- */

CREATE TABLE IF NOT EXISTS public.document_types (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE
);

INSERT INTO public.document_types (name)
VALUES ('training'), ('breeding')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.document_request_status (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE
);

INSERT INTO public.document_request_status (name)
VALUES ('sent'), ('viewed'), ('signed'), ('voided')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.document_signed_via (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE
);

INSERT INTO public.document_signed_via (name)
VALUES ('link'), ('upload')
ON CONFLICT (name) DO NOTHING;

/* ---------- Templates: the current PDF for each document type ---------- */

CREATE TABLE IF NOT EXISTS public.document_templates (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type_id integer NOT NULL UNIQUE
    REFERENCES public.document_types(id) ON DELETE RESTRICT,
  name varchar(200) NOT NULL,
  -- Paragraphs + checkboxes + signature box + date field. The checkboxes and
  -- signature box are read from the PDF itself when it's signed.
  pdf bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

/* ---------- Signing requests ---------- */

CREATE TABLE IF NOT EXISTS public.document_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Signed with whatever PDF is current for this type when the customer signs.
  document_type_id integer NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
  recipient_name varchar(200) NOT NULL,
  -- Unguessable key in the signing link (/sign/<token>).
  token varchar(64) NOT NULL UNIQUE,
  status_id integer NOT NULL REFERENCES public.document_request_status(id) ON DELETE RESTRICT,
  -- Checkbox items the customer confirmed, { "<field name>": "<label>" }.
  answers jsonb,
  signer_name varchar(200),
  signer_ip varchar(100),
  signer_user_agent text,
  -- How it was signed; null until signed.
  signed_via_id integer REFERENCES public.document_signed_via(id) ON DELETE RESTRICT,
  signed_pdf bytea,
  signed_pdf_sha256 char(64),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  viewed_at timestamptz,
  signed_at timestamptz
);

CREATE INDEX IF NOT EXISTS document_requests_created_at_idx
  ON public.document_requests (created_at DESC);
