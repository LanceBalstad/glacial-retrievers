-- Dog photos are now uploaded and stored in dog_images (create_dog_images_table.sql),
-- so the old pasted-link column is no longer used by the app. Optional; run once:
--   psql "$DATABASE_URL" -f server/sql/drop_dogs_image_url.sql
ALTER TABLE public.dogs DROP COLUMN IF EXISTS image_url;
