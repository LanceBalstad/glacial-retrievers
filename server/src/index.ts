
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const app = express();
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

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
         d.date_of_birth,
         d.sex,
         d.image_url,
         d.price,
         d.description
       FROM dogs d
       JOIN dog_breeds b ON b.id = d.breed_id
       JOIN dog_status s ON s.id = d.status_id
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

  const imageUrl =
    record.image_url === null || record.image_url === undefined || record.image_url === ""
      ? null
      : String(record.image_url).trim();

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
    image_url: imageUrl,
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

app.get("/api/admin/dogs", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         d.id,
         d.breed_id,
         d.status_id,
         d.name,
         d.date_of_birth,
         d.sex,
         d.image_url,
         d.price,
         d.description,
         d.created_at,
         d.updated_at,
         b.breed,
         s.status
       FROM public.dogs d
       LEFT JOIN public.dog_breeds b ON b.id = d.breed_id
       LEFT JOIN public.dog_status s ON s.id = d.status_id
       ORDER BY d.created_at DESC, d.id DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to load admin dogs:", error);
    res.status(500).json({ error: "Failed to load dogs" });
  }
});

app.get("/api/events", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         e.id,
         e.first_name,
         e.last_name,
         e.phone,
         e.email,
         e.start_date,
         e.end_date,
         e.details,
         e.created_at,
         e.updated_at,
         et.name AS event_type,
         es.name AS event_status
       FROM public.events e
       JOIN public.event_types et ON et.id = e.event_type_id
       JOIN public.event_status es ON es.id = e.event_status_id
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

app.patch("/api/events/:id/status", async (req, res) => {
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

    const result = await pool.query(
      `UPDATE public.events
       SET event_status_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [statusId, eventId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update event status:", error);
    res.status(500).json({ error: "Failed to update event status" });
  }
});

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

  const rawStatus =
    typeof record.event_status === "string"
      ? record.event_status
      : typeof record.status === "string"
        ? record.status
        : "requested";

  const eventStatus = rawStatus.trim().toLowerCase();

  if (!"requested,confirmed,completed,canceled".split(",").includes(eventStatus)) {
    throw new Error(
      "event_status must be one of: requested, confirmed, completed, canceled.",
    );
  }

  const startDate =
    typeof record.start_date === "string" ? record.start_date.trim() : "";

  if (!startDate) {
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

  return {
    event_type: eventType,
    event_status: eventStatus,
    start_date: startDate,
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

    const normalizedPhone = phone.trim();
    const normalizedEmail = email || null;

    if (!firstName || !lastName || !normalizedPhone) {
      throw new Error("first_name, last_name, and phone are required for each event.");
    }

    const result = await pool.query(
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
        null,
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

    res.status(201).json(result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create event.";
    console.error("Failed to create event:", error);
    res.status(400).json({ error: message });
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
         image_url,
         price,
         description,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        payload.breed_id,
        payload.status_id,
        payload.name,
        payload.date_of_birth,
        payload.sex,
        payload.image_url,
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

    const result = await pool.query(
      `UPDATE public.dogs
       SET breed_id = $1,
           status_id = $2,
           name = $3,
           date_of_birth = $4,
           sex = $5,
           image_url = $6,
           price = $7,
           description = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payload.breed_id,
        payload.status_id,
        payload.name,
        payload.date_of_birth,
        payload.sex,
        payload.image_url,
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

app.delete("/api/admin/dogs/:id", async (req, res) => {
  try {
    const dogId = Number(req.params.id);

    if (!Number.isInteger(dogId) || dogId <= 0) {
      res.status(400).json({ error: "Dog id is invalid." });
      return;
    }

    const result = await pool.query(
      "DELETE FROM public.dogs WHERE id = $1 RETURNING id",
      [dogId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Dog not found." });
      return;
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error("Failed to delete dog:", error);
    res.status(500).json({ error: "Could not delete dog." });
  }
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
