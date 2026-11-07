import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import { DOG_PHOTO_URL_SQL } from "./dogImages.js";

/*
 * Public dog pages and Facebook sharing.
 *
 * - GET /api/dogs/:id: one dog for the public dog page (/dogs/:id).
 * - GET /share/dogs/:id: the link the admin "Post" button gives Facebook.
 *   Facebook's preview crawler doesn't run JavaScript, so it gets a small HTML
 *   page with Open Graph tags (name, details, photo). Everyone else is
 *   redirected to the normal dog page.
 *
 * In production, /api/** and /share/** must be routed to this server
 * (firebase.json rewrites), the same as the rest of the API.
 */

interface PublicDog {
  id: number;
  name: string | null;
  breed: string | null;
  status: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  sex: "M" | "F" | null;
  price: string | null;
  description: string | null;
  photo_url: string | null;
}

// Link-preview crawlers (Facebook first; the rest get nice previews for free).
const PREVIEW_CRAWLER =
  /facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|whatsapp|discordbot|telegrambot|pinterest|skypeuripreview|applebot/i;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const ageText = (dateOfBirth: string | null) => {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  if (!year || !month || !day) return null;
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  if (birth > today) return null;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years === 0) return months <= 1 ? (months === 1 ? "1 month old" : "Under 1 month old") : `${months} months old`;
  return years === 1 ? "1 year old" : `${years} years old`;
};

const priceText = (price: string | null) => {
  const value = price === null ? NaN : Number(price);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
    : null;
};

// The public origin as the visitor sees it (Firebase Hosting forwards the host).
const publicOrigin = (req: Request) => {
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost:3000";
  const protocol = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0]?.trim() || "https";
  return `${protocol}://${host.split(",")[0]?.trim()}`;
};

export const registerDogShareRoutes = (app: Express, pool: Pool) => {
  const loadDog = async (id: number) => {
    const result = await pool.query<PublicDog>(
      `SELECT d.id, d.name, b.breed, s.status,
              to_char(d.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              d.sex, d.price, d.description,
              ${DOG_PHOTO_URL_SQL} AS photo_url
       FROM public.dogs d
       LEFT JOIN public.dog_breeds b ON b.id = d.breed_id
       LEFT JOIN public.dog_status s ON s.id = d.status_id
       LEFT JOIN public.dog_images di ON di.dog_id = d.id
       WHERE d.id = $1`,
      [id],
    );
    return result.rows[0];
  };

  app.get("/api/dogs/:id", async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: "Dog not found." });
      return;
    }
    try {
      const dog = await loadDog(id);
      if (!dog) {
        res.status(404).json({ error: "Dog not found." });
        return;
      }
      res.json(dog);
    } catch (error) {
      console.error("Failed to load dog:", error);
      res.status(500).json({ error: "Could not load this dog." });
    }
  });

  app.get("/share/dogs/:id", async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const dogPage = id === null ? "/all-dogs" : `/dogs/${id}`;

    // People go straight to the dog page; only preview crawlers get the tags.
    if (id === null || !PREVIEW_CRAWLER.test(req.get("user-agent") ?? "")) {
      res.redirect(302, dogPage);
      return;
    }

    try {
      const dog = await loadDog(id);
      if (!dog) {
        res.redirect(302, "/all-dogs");
        return;
      }

      const origin = publicOrigin(req);
      const title = [dog.name, dog.breed].filter(Boolean).join(" · ") || "Meet this dog";
      const facts = [
        dog.sex === "M" ? "Male" : dog.sex === "F" ? "Female" : null,
        ageText(dog.date_of_birth),
        priceText(dog.price),
        dog.status === "available" ? "Available now" : dog.status === "reserved" ? "Reserved" : null,
      ].filter(Boolean);
      const description = [facts.join(" · "), dog.description?.trim()].filter(Boolean).join(". ").slice(0, 300);

      const tags = [
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="Glacial Retrievers">`,
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(description || "A dog from Glacial Retrievers.")}">`,
        // og:url stays on this share link so Facebook doesn't re-scrape the app page (no tags there).
        `<meta property="og:url" content="${escapeHtml(`${origin}/share/dogs/${dog.id}`)}">`,
        dog.photo_url ? `<meta property="og:image" content="${escapeHtml(`${origin}${dog.photo_url}`)}">` : "",
        dog.photo_url ? `<meta property="og:image:type" content="image/jpeg">` : "",
        `<meta name="twitter:card" content="${dog.photo_url ? "summary_large_image" : "summary"}">`,
      ]
        .filter(Boolean)
        .join("\n    ");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)} | Glacial Retrievers</title>
    ${tags}
  </head>
  <body>
    <p><a href="${dogPage}">${escapeHtml(title)} at Glacial Retrievers</a></p>
  </body>
</html>`);
    } catch (error) {
      console.error("Failed to build share page:", error);
      res.redirect(302, dogPage);
    }
  });
};
