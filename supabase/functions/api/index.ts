// Supabase Edge Function entry for the whole API (Deno runtime).
// Public URL: https://<project-ref>.supabase.co/functions/v1/api/<route>
// The app itself lives in backend/src and is runtime-agnostic (Hono + Web APIs + node: builtins).
// Keep npm versions in ./deno.json in sync with backend/package.json.
import { Hono } from 'hono';

import { createApp } from '../../../backend/src/app.ts';

// Supabase routes /functions/v1/api/* here with the path starting at /api.
const server = new Hono().route('/api', createApp());

Deno.serve(server.fetch);
