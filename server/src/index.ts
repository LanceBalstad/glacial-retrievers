
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

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
