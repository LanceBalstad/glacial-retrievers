# Copilot Instructions for Glacial Retrievers

## Project overview
This project is a React + TypeScript frontend backed by an Express + PostgreSQL API. The app is split into a public-facing site and a separate admin area with Firebase Google auth gating.

## Folder layout
- `src/` — React app source
  - `components/` — reusable UI pieces like header, footer, cards, icons
  - `layouts/` — app-shell layouts
  - `lib/` — Firebase and shared libraries
  - `pages/` — route-based pages
    - `home/`, `about/`, `boarding/`, `training/`, `allDogs/`, etc.
    - `adminLogin/`, `adminHome/`, `adminDogs/` — admin-only flows
  - `routing/` — browser router configuration
- `server/` — Express backend
  - `src/index.ts` — API routes and DB access
  - `sql/` — SQL schema and table setup scripts
- `public/` — static public assets
- `firebase.json` — Firebase hosting config
- `vite.config.ts` — Vite config
- `package.json` — frontend scripts
- `server/package.json` — server scripts

## Main app patterns
- Use React functional components with TypeScript.
- Keep page-scoped styles in the same page folder when possible (for example: `adminHome.css`, `adminDogs.css`). Avoid reusing styling from unrelated pages.
- Route-based pages live in `src/pages/*` and are wired through `src/routing/router.tsx`.
- Admin login should check Firebase auth and verify `VITE_ALLOWED_ADMIN_EMAIL` before allowing access.
- Admin users should be redirected to `/admin/home`; the /admin route is an admin section, not the public site home.

## Admin flow
- `src/pages/adminLogin/adminLogin.tsx` handles Google login and redirects authorized admin users.
- `src/pages/adminHome/adminHome.tsx` is the dashboard with pending/confirmed events and calendar functionality.
- `src/pages/adminDogs/adminDogs.tsx` is the dedicated admins-only dog management page.
- `src/components/header/header.tsx` conditionally shows admin navigation when the signed-in user is the allowed admin.

## Backend and data
- The Express app in `server/src/index.ts` exposes event and dog APIs.
- Event data is stored in `public.events` using fields such as `first_name`, `last_name`, `phone`, `email`, `start_date`, `end_date`, and `details`.
- Event creation and status updates use `/api/events` and `/api/events/:id/status`.
- Dog management uses `/api/admin/dogs`, `/api/admin/dogs/:id`, and status/breed lookups.
- Keep database expectations aligned with `server/sql/create_events_table.sql` and the current API contract.

## Environment and config
- Frontend environment variables are read with `import.meta.env`.
- Firebase-related config should be present for admin auth.
- The app expects the admin email to match the configured allowed admin email.
- Use the existing Vite env naming conventions instead of inventing new ones.

## Common commands
- Frontend build: `npm run build`
- Frontend dev server: `npm run dev`
- Backend server: `cd server && npm run dev` (or the project’s server-specific script)

## Coding guidance
- Prefer existing project conventions over ad hoc new patterns.
- Preserve the split between public pages and admin pages.
- When editing admin pages, keep CSS local and specific to that page.
- When changing event schema expectations, check both the server API and SQL schema before assuming the DB contract.
- Keep TypeScript types explicit where API payloads are involved.
- Avoid adding unrelated global styles when a page-local stylesheet is enough.

## Helpful rule of thumb
If a change affects the site experience, start in the relevant page under `src/pages/`; if it affects data access or event creation, check `server/src/index.ts` and the SQL schema before editing the frontend.
