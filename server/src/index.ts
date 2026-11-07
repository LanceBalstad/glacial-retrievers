
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import pg from "pg";
import { DOG_PHOTO_URL_SQL, registerDogImageRoutes } from "./dogImages.js";
import { registerDogShareRoutes } from "./dogShare.js";
import { registerDocumentRoutes } from "./documents.js";

dotenv.config();
// The Firebase project and allowed admin email are shared with the frontend,
// so reuse the root .env values instead of duplicating them here.
dotenv.config({ path: new URL("../../.env", import.meta.url) });

const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
const allowedAdminEmail = process.env.VITE_ALLOWED_ADMIN_EMAIL?.trim().toLowerCase();

if (!firebaseProjectId || !allowedAdminEmail) {
  console.warn(
    "VITE_FIREBASE_PROJECT_ID or VITE_ALLOWED_ADMIN_EMAIL is missing; admin API routes will reject all requests.",
  );
}

// Verifying ID tokens only needs the project id, not a service account.
const firebaseAdminAuth = firebaseProjectId
  ? getAuth(initializeApp({ projectId: firebaseProjectId }))
  : null;

const app = express();
// Behind Firebase Hosting + Cloud Run: use X-Forwarded-For / -Proto / -Host so
// req.ip is the visitor's IP (signing certificates) and share links use https.
app.set("trust proxy", true);
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Requires a Firebase ID token (Authorization: Bearer <token>) belonging to the
// configured admin email.
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token || !firebaseAdminAuth || !allowedAdminEmail) {
    res.status(401).json({ error: "Admin sign-in required." });
    return;
  }

  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(token);

    if (decoded.email?.trim().toLowerCase() !== allowedAdminEmail) {
      res.status(403).json({ error: "This account is not allowed to use the admin tools." });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: "Your admin session has expired. Please sign in again." });
  }
};

app.use(cors({ origin: "http://localhost:5173" }));
// Room for the signature image (/api/sign/:token) and resized dog photos
// (/api/admin/dogs/:id/image), which are sent as base64 data URLs.
app.use(express.json({ limit: "2mb" }));
app.use("/api/admin", requireAdmin);

registerDocumentRoutes(app, pool);
registerDogImageRoutes(app, pool);
registerDogShareRoutes(app, pool);

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS time"
    );

    res.json({
      status: "ok",
      ...result.rows[0],
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.get("/api/dog-breeds", async (_req, res) => {
  try {
    const result = await pool.query<{ id: number; breed: string }>(
      `SELECT DISTINCT b.id, b.breed
       FROM dog_breeds b
       JOIN dogs d ON d.breed_id = b.id
       JOIN dog_status s ON s.id = d.status_id
       WHERE s.status = 'available'
       ORDER BY b.breed`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load available dog breeds:", error);
    res.status(500).json({ error: "Failed to load available dog breeds" });
  }
});

app.get("/api/dogs", async (req, res) => {
  const breedIdParam = req.query.breedId;
  const sexParam = req.query.sex;
  const ageParam = req.query.age;

  if (
    (breedIdParam !== undefined && typeof breedIdParam !== "string") ||
    (sexParam !== undefined && typeof sexParam !== "string") ||
    (ageParam !== undefined && typeof ageParam !== "string")
  ) {
    res.status(400).json({ error: "Each filter must be provided once" });
    return;
  }

  const breedId =
    typeof breedIdParam === "string" && /^\d+$/.test(breedIdParam)
      ? Number(breedIdParam)
      : null;
  const sex = typeof sexParam === "string" ? sexParam : null;
  const age = typeof ageParam === "string" ? ageParam : null;

  if (
    (breedIdParam !== undefined && (breedId === null || breedId < 1)) ||
    (sex !== null && sex !== "M" && sex !== "F") ||
    (age !== null && age !== "puppy" && age !== "adult")
  ) {
    res.status(400).json({ error: "One or more filters are invalid" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT
         d.id,
         d.name,
         b.id AS breed_id,
         b.breed,
         to_char(d.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
         d.sex,
         ${DOG_PHOTO_URL_SQL} AS photo_url,
         d.price,
         d.description
       FROM dogs d
       JOIN dog_breeds b ON b.id = d.breed_id
       JOIN dog_status s ON s.id = d.status_id
       LEFT JOIN public.dog_images di ON di.dog_id = d.id
       WHERE s.status = 'available'
         AND ($1::integer IS NULL OR b.id = $1)
         AND ($2::char IS NULL OR d.sex = $2)
         AND (
           $3::text IS NULL
           OR (
             $3 = 'puppy'
             AND d.date_of_birth > CURRENT_DATE - INTERVAL '1 year'
             AND d.date_of_birth <= CURRENT_DATE
           )
           OR (
             $3 = 'adult'
             AND d.date_of_birth <= CURRENT_DATE - INTERVAL '1 year'
           )
         )
       ORDER BY d.created_at DESC, d.id DESC`,
      [breedId, sex, age],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load available dogs:", error);
    res.status(500).json({ error: "Failed to load available dogs" });
  }
});

const normalizeDogPayload = (body: unknown) => {
  if (!body || typeof body !== "object") {
    throw new Error("Dog payload must be an object.");
  }

  const record = body as Record<string, unknown>;

  const breedId = Number(record.breed_id);
  const statusId = Number(record.status_id);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const sexValue =
    record.sex === "M" || record.sex === "F" ? record.sex : null;

  if (!Number.isInteger(breedId) || breedId <= 0) {
    throw new Error("breed_id must be a positive integer.");
  }

  if (!Number.isInteger(statusId) || statusId <= 0) {
    throw new Error("status_id must be a positive integer.");
  }

  const dateOfBirth =
    record.date_of_birth === null || record.date_of_birth === undefined || record.date_of_birth === ""
      ? null
      : String(record.date_of_birth).trim();

  const priceValue: number | null =
    record.price === null || record.price === undefined || record.price === ""
      ? null
      : Number(record.price);

  if (priceValue !== null && !Number.isFinite(priceValue)) {
    throw new Error("price must be a valid number or empty value.");
  }

  const description =
    record.description === null || record.description === undefined
      ? null
      : String(record.description).trim();

  return {
    breed_id: breedId,
    status_id: statusId,
    name: name || null,
    date_of_birth: dateOfBirth,
    sex: sexValue,
    price: priceValue,
    description: description || null,
  };
};

app.get("/api/admin/dog-statuses", async (_req, res) => {
  try {
    const result = await pool.query<{ id: number; status: string }>(
      "SELECT id, status FROM public.dog_status ORDER BY id",
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load dog statuses:", error);
    res.status(500).json({ error: "Failed to load dog statuses" });
  }
});

// Every breed, for the admin dog form. The public /api/dog-breeds only lists
// breeds that currently have an available dog.
app.get("/api/admin/dog-breeds", async (_req, res) => {
  try {
    const result = await pool.query<{ id: number; breed: string }>(
      "SELECT id, breed FROM public.dog_breeds ORDER BY breed",
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load all dog breeds:", error);
    res.status(500).json({ error: "Failed to load dog breeds" });
  }
});

const MAX_BREED_LENGTH = 100;

// Adds a breed typed by the admin, or returns the existing one if the name
// already exists (ignoring case and extra spaces).
app.post("/api/admin/dog-breeds", async (req, res) => {
  const breed =
    typeof req.body?.breed === "string" ? req.body.breed.trim().replace(/\s+/g, " ") : "";

  if (!breed) {
    res.status(400).json({ error: "Please enter a breed name." });
    return;
  }

  if (breed.length > MAX_BREED_LENGTH) {
    res.status(400).json({ error: `Breed names must be ${MAX_BREED_LENGTH} characters or fewer.` });
    return;
  }

  const findBreed = async () =>
    (
      await pool.query<{ id: number; breed: string }>(
        "SELECT id, breed FROM public.dog_breeds WHERE lower(breed) = lower($1)",
        [breed],
      )
    ).rows[0];

  try {
    const existing = await findBreed();

    if (existing) {
      res.json(existing);
      return;
    }

    // id is an identity column, so Postgres assigns it.
    const created = await pool.query<{ id: number; breed: string }>(
      "INSERT INTO public.dog_breeds (breed) VALUES ($1) RETURNING id, breed",
      [breed],
    );

    res.status(201).json(created.rows[0]);
  } catch (error) {
    // Unique violation: the same breed was added at the same moment.
    if ((error as { code?: string }).code === "23505") {
      const existing = await findBreed().catch(() => undefined);
      if (existing) {
        res.json(existing);
        return;
      }
    }

    console.error("Failed to add dog breed:", error);
    res.status(500).json({ error: "Could not add the breed." });
  }
});

// dogs.breed_id is NOT NULL with ON DELETE RESTRICT, so a breed can only be
// deleted once no dog uses it.
app.delete("/api/admin/dog-breeds/:id", async (req, res) => {
  const breedId = Number(req.params.id);

  if (!Number.isInteger(breedId) || breedId <= 0) {
    res.status(400).json({ error: "Breed id is invalid." });
    return;
  }

  const inUseMessage = (count: number) =>
    `${count} ${count === 1 ? "dog is" : "dogs are"} this breed. Change ${
      count === 1 ? "its" : "their"
    } breed before deleting it.`;

  try {
    const usage = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.dogs WHERE breed_id = $1",
      [breedId],
    );
    const dogCount = usage.rows[0]?.count ?? 0;

    if (dogCount > 0) {
      res.status(409).json({ error: inUseMessage(dogCount) });
      return;
    }

    const result = await pool.query(
      "DELETE FROM public.dog_breeds WHERE id = $1 RETURNING id",
      [breedId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Breed not found." });
      return;
    }

    res.json({ success: true, id: breedId });
  } catch (error) {
    // A dog was given this breed at the same moment: ON DELETE RESTRICT raises
    // 23001 (restrict_violation); 23503 covers a plain foreign key.
    const code = (error as { code?: string }).code;
    if (code === "23001" || code === "23503") {
      res.status(409).json({ error: "A dog uses this breed. Change its breed before deleting it." });
      return;
    }

    console.error("Failed to delete dog breed:", error);
    res.status(500).json({ error: "Could not delete the breed." });
  }
});

app.get("/api/admin/dogs", async (_req, res) => {
  try {
    await markPickedUpDogsSold();
    const result = await pool.query(
      `SELECT
         d.id,
         d.breed_id,
         d.status_id,
         d.name,
         to_char(d.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
         d.sex,
         ${DOG_PHOTO_URL_SQL} AS photo_url,
         d.price,
         d.description,
         d.created_at,
         d.updated_at,
         b.breed,
         s.status
       FROM public.dogs d
       LEFT JOIN public.dog_breeds b ON b.id = d.breed_id
       LEFT JOIN public.dog_status s ON s.id = d.status_id
       LEFT JOIN public.dog_images di ON di.dog_id = d.id
       ORDER BY d.created_at DESC, d.id DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load admin dogs:", error);
    res.status(500).json({ error: "Failed to load dogs" });
  }
});

app.get("/api/events", requireAdmin, async (_req, res) => {
  try {
    await markPickedUpDogsSold();
    const result = await pool.query(
      `SELECT
         e.id,
         e.first_name,
         e.last_name,
         e.phone,
         e.email,
         to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(e.end_date, 'YYYY-MM-DD') AS end_date,
         e.details,
         e.created_at,
         e.updated_at,
         et.name AS event_type,
         es.name AS event_status,
         e.dog_id,
         d.name AS dog_name,
         b.breed AS dog_breed,
         ds.status AS dog_status
       FROM public.events e
       JOIN public.event_types et ON et.id = e.event_type_id
       JOIN public.event_status es ON es.id = e.event_status_id
       LEFT JOIN public.dogs d ON d.id = e.dog_id
       LEFT JOIN public.dog_breeds b ON b.id = d.breed_id
       LEFT JOIN public.dog_status ds ON ds.id = d.status_id
       ORDER BY e.created_at DESC, e.id DESC`,
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        details: row.details ?? {},
      })),
    );
  } catch (error) {
    console.error("Failed to load events:", error);
    res.status(500).json({ error: "Failed to load events" });
  }
});

app.patch("/api/events/:id/status", requireAdmin, async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    const requestedStatus =
      typeof req.body?.status === "string"
        ? req.body.status.trim().toLowerCase()
        : "";

    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ error: "A valid event id is required." });
      return;
    }

    if (!"requested,confirmed,completed,canceled".split(",").includes(requestedStatus)) {
      res.status(400).json({
        error: "status must be one of: requested, confirmed, completed, canceled.",
      });
      return;
    }

    const statusResult = await pool.query<{ id: number }>(
      "SELECT id FROM public.event_status WHERE name = $1",
      [requestedStatus],
    );

    const statusId = statusResult.rows[0]?.id;

    if (statusId === undefined) {
      res.status(400).json({ error: "Unknown event status." });
      return;
    }

    // Dates are optional so the admin can adjust them when marking a booking
    // (the dates agreed on the phone may differ from the inquiry).
    const isISODate = (value: unknown): value is string =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

    const hasStartDate = req.body?.start_date !== undefined;
    const hasEndDate = req.body?.end_date !== undefined;
    const startDate = req.body?.start_date;
    const endDate = req.body?.end_date;

    // null clears the date (used when undoing a scheduled dog pickup).
    if (hasStartDate && startDate !== null && !isISODate(startDate)) {
      res.status(400).json({ error: "start_date must be YYYY-MM-DD or null." });
      return;
    }

    if (hasEndDate && endDate !== null && !isISODate(endDate)) {
      res.status(400).json({ error: "end_date must be YYYY-MM-DD or null." });
      return;
    }

    if (isISODate(startDate) && isISODate(endDate) && endDate < startDate) {
      res.status(400).json({ error: "end_date cannot be before start_date." });
      return;
    }

    const result = await pool.query(
      `UPDATE public.events
       SET event_status_id = $1,
           start_date = CASE WHEN $3 THEN $4::date ELSE start_date END,
           end_date = CASE WHEN $5 THEN $6::date ELSE end_date END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, dog_id`,
      [
        statusId,
        eventId,
        hasStartDate,
        hasStartDate ? startDate : null,
        hasEndDate,
        hasEndDate ? endDate : null,
      ],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    // Booked / Not booked / Done on a dog inquiry moves the dog's status with it,
    // unless the admin chose to keep the dog as it is (e.g. "Keep reserved").
    if (req.body?.keep_dog_status !== true) {
      await syncDogStatus(result.rows[0].dog_id);
    }

    res.json({ id: result.rows[0].id });
  } catch (error) {
    console.error("Failed to update event status:", error);
    res.status(500).json({ error: "Failed to update event status" });
  }
});

// events.dog_id is only meaningful for interested_in_dog; every other type stores null.
const parseDogId = (eventType: string, value: unknown): number | null => {
  if (eventType !== "interested_in_dog" || value === null || value === undefined || value === "") {
    return null;
  }

  const dogId = Number(value);

  if (!Number.isInteger(dogId) || dogId <= 0) {
    throw new Error("dog_id must be a positive integer.");
  }

  return dogId;
};

const assertDogExists = async (dogId: number | null) => {
  if (dogId === null) {
    return;
  }

  const result = await pool.query("SELECT 1 FROM public.dogs WHERE id = $1", [dogId]);

  if (result.rowCount === 0) {
    throw new Error("The selected dog no longer exists.");
  }
};

/*
 * Dog status follows the dog's interested_in_dog events:
 *   - completed with a pickup date, or confirmed with a pickup date
 *     that has passed                                              -> sold
 *   - requested (new inquiry) or confirmed (pickup booked)         -> reserved
 *   - otherwise (canceled / "Not booked", or no inquiries)         -> available
 * A booked pickup stays "reserved" until its date has passed. Rather than a
 * cron job, markPickedUpDogsSold() applies that whenever dogs or events are read.
 */
const syncDogStatus = async (dogId: number | null) => {
  if (dogId === null) {
    return;
  }

  await pool.query(
    `WITH derived AS (
       SELECT CASE
         WHEN bool_or(
           -- Done only means sold when a pickup was actually scheduled.
           (es.name = 'completed' AND e.start_date IS NOT NULL)
           OR (es.name = 'confirmed' AND e.start_date < CURRENT_DATE)
         ) THEN 'sold'
         WHEN bool_or(es.name IN ('requested', 'confirmed')) THEN 'reserved'
         ELSE 'available'
       END AS status
       FROM public.events e
       JOIN public.event_types et ON et.id = e.event_type_id
       JOIN public.event_status es ON es.id = e.event_status_id
       WHERE e.dog_id = $1 AND et.name = 'interested_in_dog'
     )
     UPDATE public.dogs d
     SET status_id = ds.id,
         updated_at = NOW()
     FROM derived
     JOIN public.dog_status ds ON ds.status = derived.status
     WHERE d.id = $1 AND d.status_id IS DISTINCT FROM ds.id`,
    [dogId],
  );
};

// Reserves the dog only if it is still available, so two people can't claim
// the same dog. Returns false when the dog is gone or already taken.
const reserveAvailableDog = async (dogId: number) => {
  const result = await pool.query(
    `UPDATE public.dogs d
     SET status_id = (SELECT id FROM public.dog_status WHERE status = 'reserved'),
         updated_at = NOW()
     WHERE d.id = $1
       AND d.status_id = (SELECT id FROM public.dog_status WHERE status = 'available')`,
    [dogId],
  );

  return result.rowCount === 1;
};

// Reserved dogs whose booked pickup date has passed become sold.
const markPickedUpDogsSold = async () => {
  await pool.query(
    `UPDATE public.dogs d
     SET status_id = (SELECT id FROM public.dog_status WHERE status = 'sold'),
         updated_at = NOW()
     WHERE d.status_id = (SELECT id FROM public.dog_status WHERE status = 'reserved')
       AND EXISTS (
         SELECT 1
         FROM public.events e
         JOIN public.event_types et ON et.id = e.event_type_id
         JOIN public.event_status es ON es.id = e.event_status_id
         WHERE e.dog_id = d.id
           AND et.name = 'interested_in_dog'
           AND es.name = 'confirmed'
           AND e.start_date < CURRENT_DATE
       )`,
  );
};

const normalizeEventPayload = (body: unknown) => {
  if (!body || typeof body !== "object") {
    throw new Error("Event payload must be an object.");
  }

  const record = body as Record<string, unknown>;
  const eventType =
    typeof record.event_type === "string"
      ? record.event_type.trim().toLowerCase()
      : "";

  if (
    ![
      "gun_dog_training",
      "house_training",
      "basic_obedience_training",
      "interested_in_dog",
      "dog_boarding",
      "general",
    ].includes(eventType)
  ) {
    throw new Error(
      "event_type must be one of: gun_dog_training, house_training, basic_obedience_training, interested_in_dog, dog_boarding, general.",
    );
  }

  const startDate =
    typeof record.start_date === "string" ? record.start_date.trim() : "";

  // Dog interest has no date until the admin schedules a pickup.
  if (!startDate && eventType !== "interested_in_dog") {
    throw new Error("start_date is required.");
  }

  const rawEndDate =
    record.end_date === null || record.end_date === undefined
      ? null
      : typeof record.end_date === "string"
        ? record.end_date.trim()
        : "";

  const endDate = rawEndDate && rawEndDate !== "" ? rawEndDate : null;

  const details =
    record.details === undefined || record.details === null
      ? {}
      : record.details;

  if (typeof details !== "object" || Array.isArray(details)) {
    throw new Error("details must be an object.");
  }

  const dogId = parseDogId(eventType, record.dog_id);

  if (eventType === "interested_in_dog" && dogId === null) {
    throw new Error("dog_id is required for interested_in_dog.");
  }

  return {
    event_type: eventType,
    dog_id: dogId,
    // Public submissions are always inquiries; only the admin can confirm them.
    event_status: "requested",
    start_date: startDate || null,
    end_date: endDate,
    details,
  };
};

app.post("/api/events", async (req, res) => {
  try {
    const payload = normalizeEventPayload(req.body);

    const eventTypeResult = await pool.query<{ id: number }>(
      "SELECT id FROM public.event_types WHERE name = $1",
      [payload.event_type],
    );

    const eventTypeId = eventTypeResult.rows[0]?.id;

    if (eventTypeId === undefined) {
      res.status(400).json({ error: "Unknown event type." });
      return;
    }

    const eventStatusResult = await pool.query<{ id: number }>(
      "SELECT id FROM public.event_status WHERE name = $1",
      [payload.event_status],
    );

    const eventStatusId = eventStatusResult.rows[0]?.id;

    if (eventStatusId === undefined) {
      res.status(400).json({ error: "Unknown event status." });
      return;
    }

    const details = payload.details as Record<string, unknown>;
    const firstName =
      typeof details.owner_first_name === "string"
        ? details.owner_first_name.trim()
        : typeof details.first_name === "string"
          ? details.first_name.trim()
          : "Guest";

    const lastName =
      typeof details.owner_last_name === "string"
        ? details.owner_last_name.trim()
        : typeof details.last_name === "string"
          ? details.last_name.trim()
          : "Customer";

    const phone =
      typeof details.owner_phone === "string"
        ? details.owner_phone.trim()
        : typeof details.phone === "string"
          ? details.phone.trim()
          : "";

    const email =
      typeof details.owner_email === "string"
        ? details.owner_email.trim()
        : typeof details.email === "string"
          ? details.email.trim()
          : "";

    const normalizedPhone = phone.trim() || null;
    const normalizedEmail = email || null;

    if (!firstName || !lastName || !normalizedEmail) {
      throw new Error("first_name, last_name, and email are required for each event.");
    }

    // Interest reserves the dog. The conditional update means only one person
    // can claim an available dog.
    if (payload.dog_id !== null && !(await reserveAvailableDog(payload.dog_id))) {
      res.status(409).json({
        error: "Sorry, this dog is no longer available. Please call us to ask about other dogs.",
      });
      return;
    }

    let result;

    try {
      result = await pool.query(
      `INSERT INTO public.events (
         dog_id,
         event_type_id,
         event_status_id,
         first_name,
         last_name,
         phone,
         email,
         start_date,
         end_date,
         details,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10::jsonb, NOW(), NOW())
       RETURNING *`,
      [
        payload.dog_id,
        eventTypeId,
        eventStatusId,
        firstName,
        lastName,
        normalizedPhone,
        normalizedEmail,
        payload.start_date,
        payload.end_date ?? null,
        JSON.stringify(payload.details),
      ],
      );
    } catch (insertError) {
      // Release the reservation; with no inquiry saved the dog goes back to available.
      await syncDogStatus(payload.dog_id);
      throw insertError;
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create event.";
    console.error("Failed to create event:", error);
    res.status(400).json({ error: message });
  }
});

// Calendar entries the admin adds or edits by hand. Bookings come in by phone,
// so only a name is required; email and phone are optional here.
const normalizeAdminEventBody = (body: unknown) => {
  if (!body || typeof body !== "object") {
    throw new Error("Event payload must be an object.");
  }

  const record = body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const isISODate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  const eventType = text(record.event_type).toLowerCase();

  if (
    ![
      "gun_dog_training",
      "house_training",
      "basic_obedience_training",
      "interested_in_dog",
      "dog_boarding",
    ].includes(eventType)
  ) {
    throw new Error(
      "event_type must be one of: gun_dog_training, house_training, basic_obedience_training, interested_in_dog, dog_boarding.",
    );
  }

  const firstName = text(record.first_name);
  const lastName = text(record.last_name);

  if (!firstName || !lastName) {
    throw new Error("first_name and last_name are required.");
  }

  const startDate = text(record.start_date);

  if (!isISODate(startDate)) {
    throw new Error("start_date is required (YYYY-MM-DD).");
  }

  const rawEndDate = text(record.end_date);

  if (rawEndDate && !isISODate(rawEndDate)) {
    throw new Error("end_date must be YYYY-MM-DD.");
  }

  // Only boarding spans several days.
  const endDate = eventType === "dog_boarding" ? rawEndDate || startDate : null;

  if (endDate && endDate < startDate) {
    throw new Error("end_date cannot be before start_date.");
  }

  const details =
    record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : {};

  const phone = text(record.phone) || null;
  const email = text(record.email) || null;

  return {
    eventType,
    dogId: parseDogId(eventType, record.dog_id),
    firstName,
    lastName,
    phone,
    email,
    startDate,
    endDate,
    // Keep the owner_* detail keys in sync with the columns; the admin UI reads both.
    details: {
      ...details,
      owner_first_name: firstName,
      owner_last_name: lastName,
      owner_phone: phone ?? "",
      owner_email: email ?? "",
    },
  };
};

const lookupId = async (table: "event_types" | "event_status", name: string) => {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM public.${table} WHERE name = $1`,
    [name],
  );
  return result.rows[0]?.id;
};

app.post("/api/admin/events", async (req, res) => {
  try {
    const event = normalizeAdminEventBody(req.body);
    await assertDogExists(event.dogId);
    const eventTypeId = await lookupId("event_types", event.eventType);
    const confirmedStatusId = await lookupId("event_status", "confirmed");

    if (eventTypeId === undefined || confirmedStatusId === undefined) {
      res.status(400).json({ error: "Unknown event type or status." });
      return;
    }

    // A new pickup claims its dog, but only if it is still available.
    if (event.dogId !== null && !(await reserveAvailableDog(event.dogId))) {
      res.status(409).json({
        error: "That dog is no longer available. Please choose another dog.",
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO public.events (
         event_type_id, event_status_id, first_name, last_name, phone, email,
         start_date, end_date, details, dog_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::jsonb, $10, NOW(), NOW())
       RETURNING id`,
      [
        eventTypeId,
        confirmedStatusId,
        event.firstName,
        event.lastName,
        event.phone,
        event.email,
        event.startDate,
        event.endDate,
        JSON.stringify(event.details),
        event.dogId,
      ],
    ).catch(async (insertError: unknown) => {
      // Release the dog claimed above; no pickup was saved.
      await syncDogStatus(event.dogId);
      throw insertError;
    });

    // A pickup the admin adds is booked, so its dog is reserved (sold once the date passes).
    await syncDogStatus(event.dogId);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to add calendar event:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not add the event.",
    });
  }
});

app.put("/api/admin/events/:id", async (req, res) => {
  try {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ error: "A valid event id is required." });
      return;
    }

    const event = normalizeAdminEventBody(req.body);
    await assertDogExists(event.dogId);
    const eventTypeId = await lookupId("event_types", event.eventType);

    if (eventTypeId === undefined) {
      res.status(400).json({ error: "Unknown event type." });
      return;
    }

    const previous = await pool.query<{ dog_id: number | null }>(
      "SELECT dog_id FROM public.events WHERE id = $1",
      [eventId],
    );

    const previousRow = previous.rows[0];

    if (!previousRow) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    const previousDogId = previousRow.dog_id;
    const isNewDog = event.dogId !== null && event.dogId !== previousDogId;

    // Switching to a different dog claims it, but only if it is still available.
    if (isNewDog && !(await reserveAvailableDog(event.dogId as number))) {
      res.status(409).json({
        error: "That dog is no longer available. Please choose another dog.",
      });
      return;
    }

    // Status is left as-is; it is changed through PATCH /api/events/:id/status.
    const result = await pool.query(
      `UPDATE public.events
       SET event_type_id = $1,
           first_name = $2,
           last_name = $3,
           phone = $4,
           email = $5,
           start_date = $6::date,
           end_date = $7::date,
           details = $8::jsonb,
           dog_id = $10,
           updated_at = NOW()
       WHERE id = $9
       RETURNING id`,
      [
        eventTypeId,
        event.firstName,
        event.lastName,
        event.phone,
        event.email,
        event.startDate,
        event.endDate,
        JSON.stringify(event.details),
        eventId,
        event.dogId,
      ],
    ).catch(async (updateError: unknown) => {
      // Release the dog claimed above; it isn't linked to anything.
      if (isNewDog) {
        await syncDogStatus(event.dogId);
      }
      throw updateError;
    });

    if (result.rowCount === 0) {
      if (isNewDog) {
        await syncDogStatus(event.dogId);
      }
      res.status(404).json({ error: "Event not found." });
      return;
    }

    // The new dog follows this pickup (reserved, or sold once the date passes);
    // the previous dog goes back to available if nothing else holds it.
    await syncDogStatus(event.dogId);
    if (previousDogId !== event.dogId) {
      await syncDogStatus(previousDogId);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update calendar event:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not update the event.",
    });
  }
});

app.post("/api/admin/dogs", async (req, res) => {
  try {
    const payload = normalizeDogPayload(req.body);

    const result = await pool.query(
      `INSERT INTO public.dogs (
         breed_id,
         status_id,
         name,
         date_of_birth,
         sex,
         price,
         description,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        payload.breed_id,
        payload.status_id,
        payload.name,
        payload.date_of_birth,
        payload.sex,
        payload.price,
        payload.description,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create dog.";
    console.error("Failed to create dog:", error);
    res.status(400).json({ error: message });
  }
});

app.put("/api/admin/dogs/:id", async (req, res) => {
  try {
    const dogId = Number(req.params.id);

    if (!Number.isInteger(dogId) || dogId <= 0) {
      res.status(400).json({ error: "Dog id is invalid." });
      return;
    }

    const payload = normalizeDogPayload(req.body);

    // Changing the status of a dog someone is buying needs ?force=true, after
    // the admin has seen who is waiting on it. Open inquiries and upcoming
    // pickups mean the dog should be "reserved", so setting reserved never warns.
    if (req.query.force !== "true") {
      const current = await pool.query<{ status_id: number; new_status: string | null }>(
        `SELECT d.status_id,
                (SELECT status FROM public.dog_status WHERE id = $2) AS new_status
         FROM public.dogs d
         WHERE d.id = $1`,
        [dogId, payload.status_id],
      );
      const currentStatusId = current.rows[0]?.status_id;
      const isChangingAwayFromBooking =
        currentStatusId !== undefined &&
        currentStatusId !== payload.status_id &&
        current.rows[0]?.new_status !== "reserved";

      if (isChangingAwayFromBooking) {
        const appointments = await loadDogAppointments(dogId);

        if (appointments.length > 0) {
          res.status(409).json({
            error: "This dog has open inquiries or pickups.",
            appointments,
          });
          return;
        }
      }
    }

    const result = await pool.query(
      `UPDATE public.dogs
       SET breed_id = $1,
           status_id = $2,
           name = $3,
           date_of_birth = $4,
           sex = $5,
           price = $6,
           description = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING id`,
      [
        payload.breed_id,
        payload.status_id,
        payload.name,
        payload.date_of_birth,
        payload.sex,
        payload.price,
        payload.description,
        dogId,
      ],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Dog not found." });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update dog.";
    console.error("Failed to update dog:", error);
    res.status(400).json({ error: message });
  }
});

interface DogAppointment {
  event_id: number;
  first_name: string | null;
  last_name: string | null;
  event_status: "requested" | "confirmed";
  start_date: string | null; // YYYY-MM-DD; null while still an unscheduled inquiry
}

// Open interest in a dog: new inquiries and pickups that haven't happened yet.
const loadDogAppointments = async (dogId: number) => {
  const result = await pool.query<DogAppointment>(
    `SELECT
       e.id AS event_id,
       e.first_name,
       e.last_name,
       es.name AS event_status,
       to_char(e.start_date, 'YYYY-MM-DD') AS start_date
     FROM public.events e
     JOIN public.event_types et ON et.id = e.event_type_id
     JOIN public.event_status es ON es.id = e.event_status_id
     WHERE e.dog_id = $1
       AND et.name = 'interested_in_dog'
       AND (
         es.name = 'requested'
         OR (es.name = 'confirmed' AND (e.start_date IS NULL OR e.start_date >= CURRENT_DATE))
       )
     ORDER BY e.start_date NULLS LAST, e.created_at`,
    [dogId],
  );

  return result.rows;
};

app.get("/api/admin/dogs/:id/appointments", async (req, res) => {
  const dogId = Number(req.params.id);

  if (!Number.isInteger(dogId) || dogId <= 0) {
    res.status(400).json({ error: "Dog id is invalid." });
    return;
  }

  try {
    res.json(await loadDogAppointments(dogId));
  } catch (error) {
    console.error("Failed to load dog appointments:", error);
    res.status(500).json({ error: "Could not check this dog's appointments." });
  }
});

// A dog with open inquiries/pickups is only deleted with ?force=true. Those
// bookings stay; their details are relabeled "<name> (deleted)" and dog_id is
// cleared by the ON DELETE SET NULL foreign key.
app.delete("/api/admin/dogs/:id", async (req, res) => {
  const dogId = Number(req.params.id);

  if (!Number.isInteger(dogId) || dogId <= 0) {
    res.status(400).json({ error: "Dog id is invalid." });
    return;
  }

  const client = await pool.connect();

  try {
    if (req.query.force !== "true") {
      const appointments = await loadDogAppointments(dogId);

      if (appointments.length > 0) {
        res.status(409).json({
          error: "This dog has open inquiries or pickups.",
          appointments,
        });
        return;
      }
    }

    await client.query("BEGIN");

    // Keep a readable label on every event that referenced this dog.
    await client.query(
      `UPDATE public.events e
       SET details = COALESCE(e.details, '{}'::jsonb) || jsonb_build_object(
             'dog_name', COALESCE(NULLIF(d.name, ''), 'Unnamed dog') || ' (deleted)',
             'dog_breed', COALESCE(b.breed, e.details->>'dog_breed', '')
           ),
           updated_at = NOW()
       FROM public.dogs d
       LEFT JOIN public.dog_breeds b ON b.id = d.breed_id
       WHERE d.id = $1 AND e.dog_id = d.id`,
      [dogId],
    );

    const result = await client.query(
      "DELETE FROM public.dogs WHERE id = $1 RETURNING id",
      [dogId],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Dog not found." });
      return;
    }

    await client.query("COMMIT");
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to delete dog:", error);
    res.status(500).json({ error: "Could not delete dog." });
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
