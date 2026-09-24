// STUB — WS-B implements the public web-booking comparator API. Mounted at /public behind idempotency().
import { Hono } from 'hono';

import type { AppEnv } from '../types';

export const publicRoutes = new Hono<AppEnv>();
