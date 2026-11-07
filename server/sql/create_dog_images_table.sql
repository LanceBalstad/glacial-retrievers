-- Dog photos uploaded from the admin Dogs page, stored in Postgres.
-- Run once: psql "$DATABASE_URL" -f server/sql/create_dog_images_table.sql
--
-- One photo per dog, saved in two sizes that the browser makes before upload
-- (full ~1600px for large views, card ~640px for the dog cards). The older
-- dogs.image_url column still works for pasted links; an uploaded photo wins.

CREATE TABLE IF NOT EXISTS public.dog_images (
  dog_id integer PRIMARY KEY REFERENCES public.dogs(id) ON DELETE CASCADE,
  content_type varchar(50) NOT NULL,
  full_image bytea NOT NULL,
  card_image bytea NOT NULL,
  -- Changes on every upload; used in the image URL so browsers fetch the new photo.
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
