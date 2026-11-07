import type { Express, Request, Response } from "express";
import type { Pool } from "pg";

/*
 * Dog photos stored in Postgres (table dog_images, see
 * server/sql/create_dog_images_table.sql). The admin Dogs page resizes the
 * photo in the browser and uploads a full-size and a card-size JPEG; this
 * module saves them and serves them publicly.
 *
 * Upload/delete live under /api/admin (requireAdmin in index.ts). Serving is
 * public because the dog pages are public.
 */

// SQL expression for a dog's photo URL (needs "LEFT JOIN dog_images di").
// The version changes on every upload, so cached copies can be kept forever.
export const DOG_PHOTO_URL_SQL = `CASE WHEN di.dog_id IS NULL THEN NULL
  ELSE '/api/dogs/' || d.id || '/image?v=' || floor(extract(epoch FROM di.updated_at))::bigint END`;

// After base64 decoding; the browser targets well under these.
const MAX_FULL_BYTES = 700 * 1024;
const MAX_CARD_BYTES = 200 * 1024;

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Accepts "data:image/jpeg;base64,…" and checks the bytes really are a JPEG.
const decodeJpeg = (value: unknown, maxBytes: number, label: string) => {
  const prefix = "data:image/jpeg;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) {
    throw new Error(`The ${label} image is missing or isn’t a JPEG.`);
  }
  const bytes = Buffer.from(value.slice(prefix.length), "base64");
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error(`The ${label} image isn’t a valid JPEG.`);
  }
  if (bytes.length > maxBytes) {
    throw new Error("That photo is too large. Please try a different photo.");
  }
  return bytes;
};

export const registerDogImageRoutes = (app: Express, pool: Pool) => {
  const sendError = (res: Response, status: number, error: string) => res.status(status).json({ error });

  // Body: { full: dataURL, card: dataURL } (JPEG). Replaces any existing photo.
  app.put("/api/admin/dogs/:id/image", async (req: Request, res: Response) => {
    const dogId = parseId(req.params.id);
    if (dogId === null) {
      sendError(res, 400, "Dog id is invalid.");
      return;
    }

    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const full = decodeJpeg(body.full, MAX_FULL_BYTES, "full-size");
      const card = decodeJpeg(body.card, MAX_CARD_BYTES, "card");

      const result = await pool.query<{ photo_url: string }>(
        `WITH saved AS (
           INSERT INTO public.dog_images (dog_id, content_type, full_image, card_image, updated_at)
           SELECT d.id, 'image/jpeg', $2, $3, NOW() FROM public.dogs d WHERE d.id = $1
           ON CONFLICT (dog_id) DO UPDATE
             SET full_image = EXCLUDED.full_image, card_image = EXCLUDED.card_image,
                 content_type = EXCLUDED.content_type, updated_at = NOW()
           RETURNING dog_id, updated_at
         )
         SELECT '/api/dogs/' || dog_id || '/image?v=' || floor(extract(epoch FROM updated_at))::bigint AS photo_url
         FROM saved`,
        [dogId, full, card],
      );

      const photoUrl = result.rows[0]?.photo_url;
      if (!photoUrl) {
        sendError(res, 404, "Dog not found.");
        return;
      }
      res.json({ photo_url: photoUrl });
    } catch (error) {
      console.error("Failed to save dog photo:", error);
      sendError(res, 400, error instanceof Error ? error.message : "Could not save the photo.");
    }
  });

  app.delete("/api/admin/dogs/:id/image", async (req: Request, res: Response) => {
    const dogId = parseId(req.params.id);
    if (dogId === null) {
      sendError(res, 400, "Dog id is invalid.");
      return;
    }
    try {
      await pool.query("DELETE FROM public.dog_images WHERE dog_id = $1", [dogId]);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete dog photo:", error);
      sendError(res, 500, "Could not remove the photo.");
    }
  });

  // Public. ?size=card for the dog cards, anything else for full size.
  app.get("/api/dogs/:id/image", async (req: Request, res: Response) => {
    const dogId = parseId(req.params.id);
    if (dogId === null) {
      res.status(404).end();
      return;
    }
    try {
      const column = req.query.size === "card" ? "card_image" : "full_image";
      const result = await pool.query<{ content_type: string; bytes: Buffer }>(
        `SELECT content_type, ${column} AS bytes FROM public.dog_images WHERE dog_id = $1`,
        [dogId],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", row.content_type);
      // URLs carry ?v=<upload time>, so a new upload gets a new URL and
      // browsers / Firebase Hosting can keep this copy indefinitely.
      res.setHeader(
        "Cache-Control",
        req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=300",
      );
      res.send(row.bytes);
    } catch (error) {
      console.error("Failed to load dog photo:", error);
      res.status(500).end();
    }
  });
};
