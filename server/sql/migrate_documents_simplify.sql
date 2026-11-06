-- Simplified Documents: brings tables created by the first version of
-- create_documents_tables.sql in line with the current one. Run once:
--   psql "$DATABASE_URL" -f server/sql/migrate_documents_simplify.sql
-- Existing templates and signing requests (including signed PDFs) are kept.

BEGIN;

-- Templates no longer store field settings; checkboxes are read from the PDF.
ALTER TABLE public.document_templates DROP COLUMN IF EXISTS fields;

-- Requests point at a document type instead of a specific template, so
-- replacing or deleting a PDF never breaks existing requests.
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS document_type_id integer
    REFERENCES public.document_types(id) ON DELETE RESTRICT;

UPDATE public.document_requests r
SET document_type_id = t.document_type_id
FROM public.document_templates t
WHERE t.id = r.template_id
  AND r.document_type_id IS NULL;

ALTER TABLE public.document_requests ALTER COLUMN document_type_id SET NOT NULL;

-- No longer collected: the link only needs the document type and customer name.
ALTER TABLE public.document_requests
  DROP COLUMN IF EXISTS template_id,
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS recipient_email,
  DROP COLUMN IF EXISTS prefilled;

COMMIT;
