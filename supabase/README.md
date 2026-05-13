# TOC Supabase Security Notes

This folder contains SQL migrations for Thor Operations Command.

Apply migrations from Supabase SQL Editor until the Supabase SQL tool is available in Codex.

Current security model:

- Users sign in through Supabase Auth.
- TOC API routes verify the signed-in user and role before returning data.
- Server routes use the service role key only on the server.
- Browser code must not use the service role key.
- Public table access should be blocked with Row Level Security and server-only policies.

Data API grant rule:

- New public-schema tables must include explicit grants.
- Default TOC posture is service-role-only table access through server API routes.
- Do not grant `anon` access to TOC operational tables.
- Only grant `authenticated` table access when a table is intentionally accessed directly from browser Supabase clients and has matching RLS policies.
- Keep RLS enabled on every table in the exposed `public` schema.
