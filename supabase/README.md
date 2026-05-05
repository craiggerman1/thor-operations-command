# TOC Supabase Security Notes

This folder contains SQL migrations for Thor Operations Command.

Apply migrations from Supabase SQL Editor until the Supabase SQL tool is available in Codex.

Current security model:

- Users sign in through Supabase Auth.
- TOC API routes verify the signed-in user and role before returning data.
- Server routes use the service role key only on the server.
- Browser code must not use the service role key.
- Public table access should be blocked with Row Level Security and server-only policies.

