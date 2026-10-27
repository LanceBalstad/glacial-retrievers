# AGENTS.md

## Purpose
This repository is a React + TypeScript frontend with an Express + PostgreSQL backend. Keep changes aligned with the public site/admin split and the Firebase-admin auth flow.

## Required project awareness
- Frontend app lives in `src/`.
- Backend app lives in `server/`.
- Public pages and admin pages are intentionally separate.
- Admin authentication is handled with Firebase and should only allow the configured admin email from `VITE_ALLOWED_ADMIN_EMAIL`.
- Event data is created and modified through the backend API in `server/src/index.ts`.
- Keep schema assumptions aligned with `server/sql/create_events_table.sql` and existing API contracts.

## Rules for edits
- Prefer local CSS for each page instead of global style reuse.
- Keep admin pages in `src/pages/admin*` and separate from public pages under `src/pages/*`.
- Do not move admin logic into public pages or public logic into admin pages.
- If a change affects events, check the backend contract before editing frontend payloads.
- Use existing naming and Vite environment patterns; do not invent new env variables or config conventions.
- Keep TypeScript explicit around request/response payloads.

## Before making changes
- Check the relevant route/page file first.
- If changing API behavior, inspect `server/src/index.ts` and any SQL schema files that affect the data model.
- If changing admin behavior, confirm Firebase auth and admin redirect flows remain correct.

## Validation
- Build the frontend after meaningful changes with `npm run build`.
- If backend API logic changed, verify the route and SQL contract still match.
- Avoid mock-only fixes; validate against the actual app behavior where possible.

## High-priority conventions
- Public home and admin home are different experiences.
- `/admin/home` is the admin dashboard landing page.
- `/admin/dogs` is the dedicated admin dog-management page.
- Admin header navigation should be limited to admin-appropriate pages when the signed-in user is the allowed admin.
- Keep event status and event type values consistent with the backend.
