import { handle } from 'hono/vercel';

import { createApp } from '../src/app';

// Single Vercel function; vercel.json rewrites every path here.
const app = createApp();
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
