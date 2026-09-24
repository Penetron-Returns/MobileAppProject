// STUB — WS-B implements the Svix-verified Clerk webhook. Mounted at /webhooks/clerk.
import { Hono } from 'hono';

import type { AppEnv } from '../types';

export const clerkWebhookRoutes = new Hono<AppEnv>();
