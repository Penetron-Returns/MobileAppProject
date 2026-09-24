import type { Context } from 'hono';
import type { z } from 'zod';

import { AppError } from './errors';

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', 'Invalid request body', { issues: issues(result.error) });
  }
  return result.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', 'Invalid query parameters', { issues: issues(result.error) });
  }
  return result.data;
}

export function parseParam(c: Context, name: string, schema: z.ZodType<string>): string {
  const result = schema.safeParse(c.req.param(name));
  if (!result.success) throw new AppError('VALIDATION_FAILED', `Invalid path parameter ${name}`);
  return result.data;
}
